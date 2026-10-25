// HCM Lite Backend - Mathematical & Business Logic Utilities

// weekendDays accepts either JS day numbers ([0,6] = Sun,Sat) or day names (['Saturday','Sunday']).
function calculateWorkingDays(startDate, endDate, weekendDays = [0, 6], publicHolidays = []) {
  if (!startDate || !endDate) return 0;

  const [y1, m1, d1] = startDate.split('T')[0].split('-').map(Number);
  const [y2, m2, d2] = endDate.split('T')[0].split('-').map(Number);

  const start = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const end = new Date(y2, m2 - 1, d2, 12, 0, 0);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const normWeekend = weekendDays.map((d) => (typeof d === 'number' ? d : dayNames.indexOf(String(d))));
  let workingDays = 0;
  const cur = new Date(start);

  while (cur <= end) {
    const isoDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;

    if (!normWeekend.includes(cur.getDay()) && !publicHolidays.includes(isoDate)) {
      workingDays++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return workingDays;
}

function calculateAnnualTax(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  }
  if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  }
  if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  }
  return 510000 + (annualGross - 3600000) * 0.35;
}

function computeEmployeePayroll({
  basicSalary,
  totalWorkingDaysInMonth = 22,
  absentDays = 0,
  unpaidLeaveDays = 0,
  halfDays = 0,
  lateCount = 0,
  proratedDays = null,
}) {
  const basic = Number(basicSalary) || 0;
  const hra = Math.round(basic * 0.40);
  const medical = Math.round(basic * 0.10);
  const fullGross = basic + hra + medical; // Gross = 1.5 * Basic

  const effectiveWorkingDays = (proratedDays !== null && proratedDays < totalWorkingDaysInMonth)
    ? proratedDays
    : totalWorkingDaysInMonth;

  const proratedRatio = totalWorkingDaysInMonth > 0 ? (effectiveWorkingDays / totalWorkingDaysInMonth) : 1;
  const monthlyGross = Math.round(fullGross * proratedRatio);
  const dailyRate = totalWorkingDaysInMonth > 0 ? (monthlyGross / totalWorkingDaysInMonth) : 0;

  // Bonus rule: 3 lates = 0.5 day deduction
  const latePenaltyDays = Math.floor(lateCount / 3) * 0.5;

  const deductibleDays = absentDays + unpaidLeaveDays + (0.5 * halfDays) + latePenaltyDays;
  const attendanceDeduction = Math.round(deductibleDays * dailyRate);

  const annualizedGross = monthlyGross * 12;
  const annualTax = calculateAnnualTax(annualizedGross);
  const monthlyTax = Math.round(annualTax / 12);

  const netSalary = Math.max(0, monthlyGross - attendanceDeduction - monthlyTax);

  return {
    basic: Math.round(basic * proratedRatio),
    hra: Math.round(hra * proratedRatio),
    medical: Math.round(medical * proratedRatio),
    gross: monthlyGross,
    dailyRate: Math.round(dailyRate * 100) / 100,
    workingDays: totalWorkingDaysInMonth,
    effectiveWorkingDays,
    absentDays,
    halfDays,
    unpaidLeaveDays,
    lateCount,
    latePenaltyDays,
    deductibleDays,
    attendanceDeduction,
    annualizedGross,
    annualTax: Math.round(annualTax),
    monthlyTax,
    netSalary,
  };
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

module.exports = {
  calculateWorkingDays,
  calculateAnnualTax,
  computeEmployeePayroll,
  calculateHaversineDistance,
};
