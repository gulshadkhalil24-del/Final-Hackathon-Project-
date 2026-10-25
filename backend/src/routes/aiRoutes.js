const express = require('express');
const prisma = require('../config/db');
const { authGuard } = require('../middleware/authGuard');

const router = express.Router();

/* ============ Guardrails ============ */
// ~20 requests per user per hour; every call logged in ai_logs.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 20;

async function rateLimited(userId) {
  const since = new Date(Date.now() - WINDOW_MS);
  const count = await prisma.aiLog.count({ where: { userId, createdAt: { gte: since } } });
  return count >= MAX_PER_HOUR;
}

async function logAi(userId, role, prompt, tool, response, started) {
  try {
    await prisma.aiLog.create({
      data: { userId, userRole: role, prompt, toolCalled: tool, response, latencyMs: Date.now() - started },
    });
  } catch { /* never fail the answer because of logging */ }
}

/* ============ Grounded tools (same services + RBAC as the REST API) ============ */
const tools = {
  async get_headcount({ department } = {}, scopeDeptId) {
    const where = { status: { in: ['ACTIVE', 'PROBATION'] } };
    if (scopeDeptId) where.departmentId = scopeDeptId;
    if (department) {
      const dept = await prisma.department.findFirst({ where: { name: { contains: department } } });
      if (dept) {
        where.departmentId = dept.id;
        return { department: dept.name, activeCount: await prisma.employee.count({ where }) };
      }
    }
    const total = await prisma.employee.count({ where });
    return department ? { department, activeCount: 0 } : { totalActive: total };
  },

  async get_attendance_summary(scopeDeptId) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStr = today.slice(0, 7);
    const empWhere = { status: { in: ['ACTIVE', 'PROBATION'] }, ...(scopeDeptId ? { departmentId: scopeDeptId } : {}) };
    const headcount = await prisma.employee.count({ where: empWhere });
    const ids = (await prisma.employee.findMany({ where: empWhere, select: { id: true } })).map((e) => e.id);
    if (!ids.length) return { attendanceRate: '0%', month: monthStr, activeHeadcount: 0 };

    const setting = await prisma.setting.findFirst();
    let weekend = [0, 6];
    try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }
    const holidays = (await prisma.publicHoliday.findMany({ where: { date: { startsWith: monthStr } } })).map((h) => h.date);

    const [y, m] = monthStr.split('-').map(Number);
    const daysSoFar = Array.from({ length: Number(today.slice(8)) }, (_, i) => i + 1)
      .filter((d) => !weekend.includes(new Date(y, m - 1, d).getDay()) && !holidays.includes(`${monthStr}-${String(d).padStart(2, '0')}`)).length;
    const expected = Math.max(1, headcount * (daysSoFar || 1));

    const onLeave = await prisma.leaveRequest.aggregate({
      where: { status: 'APPROVED', startDate: { startsWith: monthStr }, employeeId: { in: ids } },
      _sum: { workingDaysCount: true },
    });
    const present = await prisma.attendance.count({ where: { date: { startsWith: monthStr }, status: { in: ['PRESENT', 'LATE'] }, employeeId: { in: ids } } });
    const half = await prisma.attendance.count({ where: { date: { startsWith: monthStr }, status: 'HALF_DAY', employeeId: { in: ids } } });

    const denom = Math.max(1, expected - (onLeave._sum.workingDaysCount || 0));
    const rate = Math.min(100, Math.round(((present + 0.5 * half) / denom) * 100));
    return { attendanceRate: `${rate}%`, activeHeadcount: headcount, month: monthStr };
  },

  async get_late_comers(scopeDeptId) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStr = today.slice(0, 7);
    const where = { date: { startsWith: monthStr }, status: 'LATE' };
    const lates = await prisma.attendance.findMany({ where, include: { employee: { include: { department: true } } } });
    const filtered = scopeDeptId ? lates.filter((a) => a.employee.departmentId === scopeDeptId) : lates;
    const map = new Map();
    for (const a of filtered) {
      const entry = map.get(a.employeeId) || { name: `${a.employee.firstName} ${a.employee.lastName}`, count: 0 };
      entry.count++;
      map.set(a.employeeId, entry);
    }
    return { month: monthStr, lateComers: [...map.values()].sort((a, b) => b.count - a.count) };
  },

  async get_leave_summary(scopeDeptId) {
    const today = new Date().toISOString().slice(0, 10);
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
      include: { employee: { include: { department: true } }, leaveType: true },
    });
    const filtered = scopeDeptId ? leaves.filter((l) => l.employee.departmentId === scopeDeptId) : leaves;
    return {
      today,
      countOnLeave: filtered.length,
      employees: filtered.map((l) => ({ name: `${l.employee.firstName} ${l.employee.lastName}`, type: l.leaveType.name, reason: l.reason })),
    };
  },

  async get_my_leave_balance(employeeId) {
    if (!employeeId) return { error: 'No employee profile linked.' };
    const types = await prisma.leaveType.findMany();
    const approved = await prisma.leaveRequest.findMany({ where: { employeeId, status: 'APPROVED' } });
    return types.map((lt) => {
      const used = approved.filter((l) => l.leaveTypeId === lt.id).reduce((s, l) => s + l.workingDaysCount, 0);
      const unlimited = lt.yearlyQuota <= 0;
      return { type: lt.name, quota: lt.yearlyQuota, used, remaining: unlimited ? 'Unlimited' : Math.max(0, lt.yearlyQuota - used) };
    });
  },

  async get_payroll_summary(role) {
    if (role === 'EMPLOYEE') return { denied: 'Employees cannot view company payroll data.' };
    const run = await prisma.payrollRun.findFirst({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    if (!run) return { message: 'No payroll runs created yet.' };
    return { month: `${run.year}-${String(run.month).padStart(2, '0')}`, status: run.status.toLowerCase(), totalGross: run.totalGross, totalNet: run.totalNet };
  },

  async search_employees(query) {
    return prisma.employee.findMany({
      where: { OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }, { employeeCode: { contains: query } }] },
      select: { employeeCode: true, firstName: true, lastName: true, status: true },
      take: 10,
    });
  },
};

/* ============ Policy Q&A (answers only from Section-3 rules) ============ */
async function policyAnswer(p) {
  const setting = await prisma.setting.findFirst();
  const start = setting?.officeStartTime || '09:00';
  const grace = setting?.graceMinutes ?? 15;
  const half = setting?.halfDayHours ?? 5;
  let weekend = [0, 6];
  try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekendNames = weekend.map((d) => names[d]).join(' + ');

  const types = await prisma.leaveType.findMany();
  const quotaLine = types.map((t) => `${t.name}: ${t.yearlyQuota > 0 ? t.yearlyQuota : 'unlimited'}`).join(', ');

  if (/(grace|late rule|kitni der|der se aane|how late)/i.test(p)) {
    return `Office starts at ${start}. You are marked **late** if you check in after ${start} + ${grace} minutes grace.`;
  }
  if (/(half.?day|aadha din)/i.test(p)) {
    return `If you work under **${half} hours** between check-in and check-out, the day counts as a **half day** (0.5 deductible day in payroll).`;
  }
  if (/(weekend|week end|hafta|saturday|sunday|chutti days)/i.test(p)) {
    return `The weekly weekend is **${weekendNames}**. Public holidays are also skipped when counting leave days.`;
  }
  if (/(tax|salery tax|salary tax|mazeed|mazeed tax)/i.test(p)) {
    return `Income tax uses the annual slab on gross × 12: 0% up to 600k · 5% to 1.2M · 30k + 15% to 2.4M · 210k + 25% to 3.6M · 510k + 35% above. The monthly payslip shows annual tax ÷ 12.`;
  }
  if (/(leave (type|quota|balance)s?|kitni leave|chutti|quotas?)/i.test(p)) {
    return `Yearly leave quotas: **${quotaLine}**. Working days only are counted (weekends and public holidays are skipped), and overlap or over-balance requests are rejected.`;
  }
  if (/(gross|salary structure|hra|medical|1\.5)/i.test(p)) {
    return `Gross salary = **1.5 × basic** (HRA 40% + medical 10%). Per-day rate = gross ÷ working days of the month; absent and unpaid days are deducted.`;
  }
  if (/(office location|radius|geofence|camera)/i.test(p)) {
    return `Camera check-ins are accepted only inside the office radius of **${setting?.radiusMeters ?? 150} m** (verified on the server with the Haversine formula) and when GPS accuracy is better than 100 m.`;
  }
  if (/(payroll|payslip)/i.test(p)) {
    return `HR prepares the monthly draft from attendance and leave; **only Admin can finalize and lock** it. After that, employees can download their payslip PDFs.`;
  }
  return null;
}

/* ============ POST /api/ai/chat (#19, #22) ============ */
router.post('/chat', authGuard, async (req, res) => {
  const started = Date.now();
  const message = String(req.body?.message || req.body?.prompt || '').trim();
  if (!message) return res.status(400).json({ success: false, error: 'Message is required.' });

  if (await rateLimited(req.user.id)) {
    return res.status(429).json({ success: false, error: 'AI request limit reached for this hour (about 20).' });
  }

  const p = message.toLowerCase();
  let tool = null;
  let reply = '';

  // RBAC refusal: employees cannot ask about colleague compensation
  if (req.user.role === 'EMPLOYEE' && /(salary|payroll|paisa|tankhwah|tankhua|kamai|compensation)/.test(p)) {
    if (!/(my|mera|meri|apna|apni|own|left|balance|payslip)/.test(p)) {
      tool = 'rbac_refusal';
      reply = "I can't share compensation data of other employees — company policy restricts salary details to Admin and HR. You can ask about your own payslip instead.";
      await logAi(req.user.id, req.user.role, message, tool, reply, started);
      return res.json({ success: true, reply, tool });
    }
  }

  // Department scoping for HR questions
  let scopeDeptId = null;
  if (req.user.role === 'EMPLOYEE' && req.user.employeeId) {
    const me = await prisma.employee.findUnique({ where: { id: req.user.employeeId } });
    scopeDeptId = me?.departmentId || null;
  }

  try {
    // Dispatch grounded tools
    if (/(late|der se| kitni der)/.test(p) && /(who|kaun|list|most|sab|names?|came)/.test(p)) {
      tool = 'get_late_comers';
      const data = await tools.get_late_comers(scopeDeptId);
      reply = data.lateComers.length === 0
        ? 'No one has been marked late this month. 🎉'
        : `Top late-comer this month: **${data.lateComers[0].name}** (${data.lateComers[0].count} times)${data.lateComers.length > 1 ? `, followed by ${data.lateComers.slice(1, 3).map((x) => `${x.name} (${x.count}×)`).join(', ')}` : ''}.`;
    } else if (/(headcount|how many (employee|staff|people)|kitne (employee|log)|active employees)/.test(p)) {
      tool = 'get_headcount';
      const deptMatch = /(engineering|marketing|human resources|hr dept|sales|finance)/.exec(p);
      const data = await tools.get_headcount({ department: deptMatch ? deptMatch[1] : null }, scopeDeptId && !deptMatch ? scopeDeptId : null);
      reply = data.department
        ? `There ${data.activeCount === 1 ? 'is' : 'are'} **${data.activeCount} active employee(s)** in **${data.department}**.`
        : `Total active headcount is **${data.totalActive} employees**.`;
    } else if (/(attendance rate|hazri|attendance summary)/.test(p)) {
      tool = 'get_attendance_summary';
      const data = await tools.get_attendance_summary(scopeDeptId);
      reply = `This month's attendance rate is **${data.attendanceRate}** (headcount ${data.activeHeadcount}).`;
    } else if (/(on leave (today)?|kaun chutti|kon chutti|leave today|who.s (on )?leave)/.test(p)) {
      tool = 'get_leave_summary';
      const data = await tools.get_leave_summary(scopeDeptId);
      reply = data.countOnLeave === 0
        ? 'Nobody is on approved leave today.'
        : `**${data.countOnLeave} employee(s) on approved leave today:**\n${data.employees.map((e) => `• ${e.name} — ${e.type}${e.reason ? ` (${e.reason})` : ''}`).join('\n')}`;
    } else if (/(my leave|leave balance|kitni .* bachi|meri leave|sick leave|casual leave|annual leave|balance)/.test(p)) {
      tool = 'get_my_leave_balance';
      const balances = await tools.get_my_leave_balance(req.user.employeeId);
      if (Array.isArray(balances)) {
        const wanted = /(sick|bimar|beemar)/.test(p) ? 'Sick' : /(casual)/.test(p) ? 'Casual' : /(annual)/.test(p) ? 'Annual' : null;
        if (wanted) {
          const b = balances.find((x) => x.type === wanted);
          reply = `You have **${b?.remaining} ${wanted} day(s) left** this year (used ${b?.used} of ${b?.quota}).`;
        } else {
          reply = `Your leave balance:\n${balances.map((b) => `• ${b.type}: ${b.remaining} left (used ${b.used} of ${b.quota})`).join('\n')}`;
        }
      } else {
        reply = 'I could not find an employee profile linked to your account.';
      }
    } else if (/(payroll summary|payroll cost|total payroll)/.test(p)) {
      tool = 'get_payroll_summary';
      const data = await tools.get_payroll_summary(req.user.role);
      reply = data.denied
        ? data.denied
        : data.message
          ? data.message
          : `Latest payroll run (${data.month}, ${data.status}): gross **PKR ${Math.round(data.totalGross).toLocaleString()}**, net **PKR ${Math.round(data.totalNet).toLocaleString()}**.`;
    } else if (/(find|search|lookup|dhundo|dhoondo).*(employee|person)/.test(p)) {
      tool = 'search_employees';
      const q = p.replace(/.*(find|search|lookup|dhundo|dhoondo)/, '').replace(/(employee|person|named|ka naam|ka).*/g, '').trim();
      const results = await tools.search_employees(q.slice(0, 30));
      reply = results.length
        ? `Found ${results.length}: ${results.map((r) => `${r.firstName} ${r.lastName} (${r.employeeCode}, ${String(r.status).toLowerCase()})`).join(', ')}`
        : 'No employees matched that search.';
    } else {
      // Policy Q&A
      const policy = await policyAnswer(p);
      if (policy) {
        tool = 'policy_qa';
        reply = policy;
      } else {
        tool = 'fallback';
        reply = `I answer from live company data and policy. Try:\n• "How many active employees do we have?"\n• "Who came late most often this month?"\n• "What is this month's attendance rate?"\n• "Who is on leave today?"\n• "How many sick leaves do I have left?"\n• "What is the grace period?"\n(Roman Urdu bhi chalta hai: "Mujhe kitni casual leaves bachi hain?")`;
      }
    }
  } catch (e) {
    reply = 'Something went wrong while reading the data. Please try again.';
  }

  await logAi(req.user.id, req.user.role, message, tool, reply, started);
  return res.json({ success: true, reply, tool });
});

/* ============ POST /api/ai/summarize (#20) - grounded in the same KPIs ============ */
router.post('/summarize', authGuard, requireAiRoles, async (req, res) => {
  const started = Date.now();
  if (await rateLimited(req.user.id)) {
    return res.status(429).json({ success: false, error: 'AI request limit reached for this hour.' });
  }
  try {
    const { scope, from, to, dept } = req.body;
    const bullets = [];

    if (scope === 'admin') {
      const employees = await prisma.employee.findMany({
        where: { status: { in: ['ACTIVE', 'PROBATION'] }, ...(dept && dept !== 'ALL' ? { departmentId: dept } : {}) },
        include: { salary: true, department: true },
      });
      const exited = await prisma.employee.count({ where: { status: 'EXITED' } });
      const avg = employees.length ? Math.round(employees.reduce((s, e) => s + (e.salary?.grossSalary || 0), 0) / employees.length) : 0;
      bullets.push(`Headcount stands at **${employees.length} active employees** across ${new Set(employees.map((e) => e.department?.name)).size} department(s).`);
      bullets.push(exited > 0 ? `Attrition to date: **${exited} exit(s)** — worth watching.` : `No exits recorded so far — attrition is at **0**.`);
      bullets.push(`Average gross salary is **PKR ${avg.toLocaleString()}** per month.`);
      const topDept = Object.entries(employees.reduce((a, e) => ({ ...a, [e.department?.name || '—']: (a[e.department?.name || '—'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
      if (topDept) bullets.push(`Largest department: **${topDept[0]}** with ${topDept[1]} employees.`);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const fromDate = String(from || today.slice(0, 8) + '01');
      const toDate = String(to || today);
      const employees = await prisma.employee.findMany({
        where: { status: { in: ['ACTIVE', 'PROBATION'] }, ...(dept && dept !== 'ALL' ? { departmentId: dept } : {}) },
        select: { id: true },
      });
      const ids = employees.map((e) => e.id);
      const records = await prisma.attendance.findMany({ where: { date: { gte: fromDate, lte: toDate }, employeeId: { in: ids } } });
      const pendingLeaves = await prisma.leaveRequest.count({ where: { status: 'PENDING', employeeId: { in: ids } } });
      const pendingCorr = await prisma.attendanceCorrection.count({ where: { status: 'PENDING', employeeId: { in: ids } } });
      const lates = records.filter((a) => a.status === 'LATE').length;
      const presentish = records.filter((a) => ['PRESENT', 'LATE', 'MISSING_CHECKOUT'].includes(a.status)).length + 0.5 * records.filter((a) => a.status === 'HALF_DAY').length;

      bullets.push(`**${employees.length} employees** recorded **${records.length} attendance day(s)** in the selected range.`);
      if (records.length) bullets.push(`**${lates} late arrival(s)** in this period${lates > 3 ? ' — the late-comer pattern needs attention.' : '.'}`);
      bullets.push(`**${pendingLeaves + pendingCorr} item(s) waiting for approval** (${pendingLeaves} leave, ${pendingCorr} corrections).`);
      if (records.length && employees.length) bullets.push(`Roughly **${Math.round((presentish / Math.max(1, records.length)) * 100)}%** of recorded days were full presence.`);
    }

    await logAi(req.user.id, req.user.role, `summarize:${scope}`, 'summarize', bullets.join(' | '), started);
    return res.json({ success: true, bullets, isAi: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function requireAiRoles(req, res, next) {
  if (!['ADMIN', 'HR'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Only Admin and HR can summarize dashboards.' });
  }
  next();
}

/* ============ POST /api/ai/smart-leave (#21) ============ */
router.post('/smart-leave', authGuard, async (req, res) => {
  const started = Date.now();
  if (await rateLimited(req.user.id)) {
    return res.status(429).json({ success: false, error: 'AI request limit reached for this hour.' });
  }

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Describe your leave in a sentence.' });

  const t = text.toLowerCase();

  // Leave type
  let typeName = 'Casual';
  if (/(sick|bimar|beemar|fever|bukhar|hospital|doctor)/.test(t)) typeName = 'Sick';
  else if (/(annual|vacation|leave)/.test(t) && /(annual|vacation)/.test(t)) typeName = 'Annual';
  else if (/(unpaid|bina pay|without pay)/.test(t)) typeName = 'Unpaid';
  const leaveType = (await prisma.leaveType.findMany()).find((lt) => lt.name.toLowerCase() === typeName.toLowerCase());

  // Dates
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  const nextWeekday = (dow) => {
    const d = new Date(today);
    let diff = (dow - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  };

  let start = null;
  let end = null;

  const explicit = /(\d{4}-\d{2}-\d{2})/.exec(text);
  const dm = /(\d{1,2})(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+(\d{1,2})(st|nd|rd|th)?)?/i.exec(text);
  if (explicit) {
    start = new Date(explicit[1]);
    end = start;
  } else if (dm) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = months.indexOf(dm[3].toLowerCase());
    start = new Date(today.getFullYear(), mIdx, Number(dm[1]));
    end = dm[5] ? new Date(today.getFullYear(), mIdx, Number(dm[5])) : start;
  } else if (/(next week|agle hafte|aglay hafte)/.test(t)) {
    start = nextWeekday(1);
    end = new Date(start); end.setDate(start.getDate() + 4);
  } else if (/(tomorrow|kal)/.test(t)) {
    start = addDays(1); end = start;
  } else if (/(today|aaj)/.test(t)) {
    start = new Date(today); end = start;
  } else {
    const wd = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|somwar|mangal|budh|jumeraat|juma|peer)/.exec(t);
    if (wd) {
      const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, peer: 5, juma: 5, somwar: 1, mangal: 2, budh: 3, jumeraat: 4 };
      start = nextWeekday(map[wd[1]]);
      end = start;
      if (/(and|aur|,|-|to)\s*(tuesday|wednesday|thursday|friday|saturday|monday|mangal|budh|jumeraat|juma)/.test(t)) {
        const rest = /(tuesday|wednesday|thursday|friday|saturday|monday|mangal|budh|jumeraat|juma)/.exec(t.slice(t.indexOf(wd[1]) + wd[1].length));
        if (rest) {
          const map2 = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, mangal: 2, budh: 3, jumeraat: 4, juma: 5 };
          end = nextWeekday(map2[rest[1]]);
          if (end < start) end = start;
        }
      }
    }
  }

  if (!start) {
    start = nextWeekday(1); // safest guess: next Monday
    end = new Date(start);
  }
  if (!end || end < start) end = start;

  // Reason
  let reason = text;
  const wedding = /(wedding|shadi|shaadi|marriage|nikah)/.exec(t);
  if (wedding) reason = `${wedding[1].toLowerCase() === wedding[1] ? 'Family' : 'Family'} wedding ceremony`;
  else if (/(sick|bimar|beemar|fever|bukhar)/.test(t)) reason = 'Not feeling well (sick leave)';
  else if (/(family|ghar|emergency)/.test(t)) reason = 'Family matter';
  else reason = text.charAt(0).toUpperCase() + text.slice(1);

  const parsed = {
    leaveTypeId: leaveType?.id || null,
    type: leaveType?.name || typeName,
    start: iso(start),
    end: iso(end),
    startDate: iso(start),
    endDate: iso(end),
    reason,
  };

  await logAi(req.user.id, req.user.role, text, 'smart_leave', JSON.stringify(parsed), started);
  return res.json({ success: true, ...parsed, isAi: true });
});

module.exports = router;
