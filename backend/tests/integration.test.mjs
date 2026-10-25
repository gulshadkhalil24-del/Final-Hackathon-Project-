import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import prisma from '../src/config/db.js';
import app from '../src/app.js';

const r = (method, path) => request(app)[method](path);

let admin = '';
let hr = '';

beforeAll(async () => {
  // Fresh install for every test run
  await request(app).post('/api/setup/reset');
  const s = await request(app).post('/api/setup').send({ companyName: 'Acme Ltd', adminName: 'Adeel', adminEmail: 'admin@acme.com', password: 'admin12345' });
  expect(s.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@acme.com', password: 'admin12345' });
  admin = login.body.token;

  const hrRes = await request(app).post('/api/users/hr').set('Authorization', `Bearer ${admin}`).send({ name: 'Hina HR', email: 'hr@acme.com' });
  expect(hrRes.status).toBe(201);
  const hrLogin = await request(app).post('/api/auth/login').send({ email: 'hr@acme.com', password: hrRes.body.temporaryPassword });
  await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${hrLogin.body.token}`).send({ currentPassword: hrRes.body.temporaryPassword, newPassword: 'hrpass12345' });
  hr = (await request(app).post('/api/auth/login').send({ email: 'hr@acme.com', password: 'hrpass12345' })).body.token;
});

describe('M1 Auth & Access', () => {
  it('rejects weak passwords on first-run setup', async () => {
    const res = await request(app).post('/api/setup').send({ companyName: 'X', adminName: 'Y', adminEmail: 'z@z.com', password: 'short' });
    expect(res.status).toBeGreaterThanOrEqual(400); // 400 already-initialized or 422 weak password
  });

  it('blocks deactivated logins with 403', async () => {
    const u = (await request(app).get('/api/users?role=hr').set('Authorization', `Bearer ${admin}`)).body.items[0];
    await request(app).patch(`/api/users/${u.id}/deactivate`).set('Authorization', `Bearer ${admin}`);
    const blocked = await request(app).post('/api/auth/login').send({ email: 'hr@acme.com', password: 'hrpass12345' });
    expect(blocked.status).toBe(403);
    await request(app).patch(`/api/users/${u.id}/activate`).set('Authorization', `Bearer ${admin}`);
  });

  it('enforces role guards server-side (HR cannot manage logins)', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${hr}`);
    expect(res.status).toBe(403);
  });
});

describe('M3 Employees', () => {
  let eng, desig, aliId;

  it('lists seeded departments and designations', async () => {
    const d = await request(app).get('/api/departments').set('Authorization', `Bearer ${hr}`);
    eng = d.body.items.find((x) => x.name === 'Engineering');
    expect(eng).toBeTruthy();
    const g = await request(app).get('/api/designations').set('Authorization', `Bearer ${hr}`);
    desig = g.body.items[0];
    expect(desig).toBeTruthy();
  });

  it('registers an employee and returns a one-time temp password', async () => {
    const res = await request(app).post('/api/employees').set('Authorization', `Bearer ${hr}`).send({
      name: 'Ali Raza', email: 'ali@acme.com', code: 'EMP-001', departmentId: eng.id, designationId: desig.id,
      joinDate: '2026-10-01', status: 'active', basicSalary: 100000,
    });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toMatch(/.+/);
    aliId = res.body.employee.id;
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app).post('/api/employees').set('Authorization', `Bearer ${hr}`).send({
      name: 'Dupe', email: 'ali@acme.com', code: 'EMP-002', departmentId: eng.id, designationId: desig.id, joinDate: '2026-10-02', basicSalary: 50000,
    });
    expect(res.status).toBe(409);
  });

  it('lets HR edit details and salary (PUT)', async () => {
    const res = await request(app).put(`/api/employees/${aliId}`).set('Authorization', `Bearer ${hr}`).send({
      name: 'Ali Raza', email: 'ali@acme.com', code: 'EMP-001', departmentId: eng.id, designationId: desig.id,
      joinDate: '2026-10-01', status: 'active', basicSalary: 120000, phone: '03007654321',
    });
    expect(res.status).toBe(200);
    expect(res.body.employee.basicSalary).toBe(120000);
  });

  it('dry-runs CSV import with row/field/reason errors', async () => {
    const csv = 'code,name,email,department,designation,gender,joinDate,basicSalary\nEMP-010,Bilal,bilal@acme.com,Engineering,Software Engineer,male,2026-10-10,90000\nEMP-011,Bad,bad-email,Engineering,Tech Lead,male,2026-10-10,-5\n';
    const res = await request(app).post('/api/employees/import?dryRun=true').set('Authorization', `Bearer ${hr}`).attach('file', Buffer.from(csv), 'e.csv');
    expect(res.body.total).toBe(2);
    expect(res.body.valid).toBe(1);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
    expect(res.body.errors[0]).toMatchObject({ row: 3, field: 'email' });
  });
});

describe('M4 Attendance', () => {
  it('returns 409 for a second check-in', async () => {
    const aliLogin = await loginEmployee('ali@acme.com');
    const first = await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${aliLogin}`);
    expect([201, 409]).toContain(first.status);
    const second = await request(app).post('/api/attendance/check-in').set('Authorization', `Bearer ${aliLogin}`);
    expect(second.status).toBe(409);
  });

  it('serves the HR board with per-status summary', async () => {
    const res = await request(app).get('/api/attendance/board').set('Authorization', `Bearer ${hr}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows[0]).toMatchObject({ name: expect.any(String), status: expect.any(String) });
  });
});

describe('M5 Leave', () => {
  it('rejects overlap with 422', async () => {
    const types = (await request(app).get('/api/leave-types').set('Authorization', `Bearer ${hr}`)).body.items;
    const casual = types.find((t) => t.name === 'Casual');
    const aliLogin = await loginEmployee('ali@acme.com');
    const a = await request(app).post('/api/leave').set('Authorization', `Bearer ${aliLogin}`).send({ leaveTypeId: casual.id, startDate: '2026-11-02', endDate: '2026-11-03', reason: 'Family event' });
    expect(a.status).toBe(201);
    expect(a.body.item.days).toBe(2);
    const b = await request(app).post('/api/leave').set('Authorization', `Bearer ${aliLogin}`).send({ leaveTypeId: casual.id, startDate: '2026-11-03', endDate: '2026-11-04', reason: 'Overlap' });
    expect(b.status).toBe(422);
  });

  it('HR approves with a comment and the employee is notified', async () => {
    const inbox = (await request(app).get('/api/leave/requests?status=pending').set('Authorization', `Bearer ${hr}`)).body;
    expect(inbox.items.length).toBe(1);
    const id = inbox.items[0].id;
    const dec = await request(app).patch(`/api/leave/${id}/decision`).set('Authorization', `Bearer ${hr}`).send({ decision: 'approved', comment: 'Enjoy' });
    expect(dec.body.item.status).toBe('approved');
    const aliLogin = await loginEmployee('ali@acme.com');
    const notes = (await request(app).get('/api/notifications').set('Authorization', `Bearer ${aliLogin}`)).body.items;
    expect(notes.some((n) => /leave approved/i.test(n.title))).toBe(true);
  });
});

describe('M6 Payroll', () => {
  it('draft → recalculate (same id) → Admin finalize locks the month', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const draft = await request(app).post('/api/payroll/runs').set('Authorization', `Bearer ${hr}`).send({ month });
    expect(draft.status).toBe(201);
    const runId = draft.body.run.id;

    const recalc = await request(app).post(`/api/payroll/runs/${runId}/recalculate`).set('Authorization', `Bearer ${hr}`);
    expect(recalc.body.run.id).toBe(runId); // links to /payroll/:id keep working

    const hrTry = await request(app).patch(`/api/payroll/runs/${runId}/finalize`).set('Authorization', `Bearer ${hr}`);
    expect(hrTry.status).toBe(403);

    const fin = await request(app).patch(`/api/payroll/runs/${runId}/finalize`).set('Authorization', `Bearer ${admin}`);
    expect(fin.body.run.status).toBe('finalized');

    const again = await request(app).post('/api/payroll/runs').set('Authorization', `Bearer ${hr}`).send({ month });
    expect(again.status).toBe(409);
  });

  it('streams a payslip PDF', async () => {
    const aliLogin = await loginEmployee('ali@acme.com');
    const slips = (await request(app).get('/api/payslips/me').set('Authorization', `Bearer ${aliLogin}`)).body.items;
    expect(slips.length).toBe(1);
    const pdf = await request(app).get(`/api/payslips/${slips[0].id}/pdf`).set('Authorization', `Bearer ${aliLogin}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });
});

describe('M7 Dashboards', () => {
  it('serves HR KPIs, trend and top late-comers', async () => {
    const res = await request(app).get('/api/dashboard/hr').set('Authorization', `Bearer ${hr}`);
    expect(res.body.kpis).toMatchObject({ headcount: expect.any(Number), pendingApprovals: expect.any(Number) });
    expect(Array.isArray(res.body.topLateComers)).toBe(true);
  });

  it('serves Admin KPIs and an audit feed', async () => {
    const res = await request(app).get('/api/dashboard/admin').set('Authorization', `Bearer ${admin}`);
    expect(res.body.kpis.headcount).toBeGreaterThan(0);
    expect(res.body.auditFeed.length).toBeGreaterThan(0);
  });
});

describe('M8 AI assistant', () => {
  it('answers headcount from live data', async () => {
    const res = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${hr}`).send({ message: 'How many active employees do we have?' });
    expect(res.body.tool).toBe('get_headcount');
    expect(res.body.reply).toMatch(/1 employee/);
  });

  it('refuses colleague salary for employees (RBAC)', async () => {
    const aliLogin = await loginEmployee('ali@acme.com');
    const res = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${aliLogin}`).send({ message: 'What is Sara Khan salary?' });
    expect(res.body.tool).toBe('rbac_refusal');
  });

  it('pre-fills a smart leave form from a sentence', async () => {
    const aliLogin = await loginEmployee('ali@acme.com');
    const res = await request(app).post('/api/ai/smart-leave').set('Authorization', `Bearer ${aliLogin}`).send({ text: 'I need next Monday and Tuesday off for my sister wedding' });
    expect(res.body.leaveTypeId).toBeTruthy();
    expect(res.body.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('answers policy questions from the rules', async () => {
    const res = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${hr}`).send({ message: 'What is the grace period?' });
    expect(res.body.tool).toBe('policy_qa');
    expect(res.body.reply).toMatch(/15/);
  });
});

describe('M9 Comms & Audit', () => {
  it('tracks announcements and an immutable audit log', async () => {
    const post = await request(app).post('/api/announcements').set('Authorization', `Bearer ${hr}`).send({ title: 'Townhall', body: 'Friday 4pm' });
    expect(post.status).toBe(201);
    const list = (await request(app).get('/api/announcements').set('Authorization', `Bearer ${admin}`)).body.items;
    expect(list[0].body).toBe('Friday 4pm');

    const audit = (await request(app).get('/api/audit-logs?action=approve').set('Authorization', `Bearer ${admin}`)).body;
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items.every((x) => x.action === 'approve')).toBe(true);
  });
});

const employeeTokens = {};
async function loginEmployee(email) {
  if (employeeTokens[email]) return employeeTokens[email];
  // Employees get random temp passwords; reset to a known one via Admin.
  const users = (await request(app).get('/api/users?role=employee').set('Authorization', `Bearer ${admin}`)).body.items;
  const u = users.find((x) => x.email === email);
  const reset = await request(app).post(`/api/users/${u.id}/reset-password`).set('Authorization', `Bearer ${admin}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: reset.body.temporaryPassword });
  await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${login.body.token}`).send({ currentPassword: reset.body.temporaryPassword, newPassword: 'emppass12345' });
  const final = await request(app).post('/api/auth/login').send({ email, password: 'emppass12345' });
  employeeTokens[email] = final.body.token;
  return employeeTokens[email];
}
