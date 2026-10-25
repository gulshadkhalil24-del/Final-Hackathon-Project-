# HCM Lite — AI-assisted Human Capital Management

**Saylani Hackathon · 24 October 2026 · Zaitoon Ashraf IT Park**

Neon-purple themed web HR system for **Admin, HR and Employee** roles: employees, attendance, leave, payroll with PDF payslips, dashboards, and an AI assistant that answers only from live data. The system **starts empty** — no dummy data; every number comes from what people do in the app.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite · Tailwind CSS · Recharts · lucide-react |
| Backend | Node.js · Express 5 · Prisma ORM |
| Database | SQLite (`dev.db`) — zero external DB to install |
| Auth | JWT + bcrypt, role & data-scope checked on the server for every request |
| Payslips | PDFKit (server-generated PDF) |
| AI | Offline grounded engine (deterministic tools + policy Q&A, Roman Urdu aware) — no API key needed |

## Run it (under 2 minutes)

```bash
# 1) Backend
cd backend
npm install
npx prisma db push        # creates dev.db
cp .env.example .env      # (or create .env with the values below)
npm run dev               # http://localhost:5000

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api → :5000)
```

`.env` for the backend (defaults work out of the box):

```env
PORT=5000
JWT_SECRET=hcm_lite_jwt_secret_saylani_hackathon_2026
```

On first open the app shows the **first-run setup**: create the company and the Admin account. Everything else is built from in-app actions. (Judges: `POST /api/setup/reset` wipes back to a fresh install.)

## 5-minute demo script

1. **Setup** → create company "Acme Ltd" and Admin (`admin@acme.com`).
2. **Admin → Logins** → create an HR login (temp password is shown once).
3. **Login as HR → Employees → Register employee** (temp password shown once) or **Import CSV** with *dry run* first — bad rows are listed with row + field + reason.
4. **Login as Employee** → change password → **Attendance → Check in** → later **Check out** (second check-in returns 409). Click a past day in the calendar to request a correction.
5. **Leave → Smart leave** → type `Need next Monday and Tuesday off for my sister's wedding` → the form pre-fills (type, dates, reason) → Submit. Overlap or over-quota returns 422.
6. **Login as HR → Leave requests** → approve with a comment. The employee gets a notification.
7. **HR → Payroll** → create the month draft (gross = 1.5 × basic, per-day deductions for absent/unpaid/half days, PK tax slabs, joiner proration) → **Admin → Finalize** (locks the month permanently).
8. **Employee → Payslips** → download the PDF.
9. **Dashboards** → HR/Admin/Employee KPIs, trends, top late-comers, gender & tenure — all computed server-side, filterable by date and department. Press **Summarize** for AI bullets.
10. **AI assistant** (bottom-right) → ask:
    - "How many active employees do we have?"
    - "Who came late most often this month?"
    - "Who is on leave today?"
    - "Mujhe kitni casual leaves bachi hain?" *(Roman Urdu works)*
    - As an Employee ask *"What is Sara's salary?"* → **refused by policy**.
11. **Admin → Audit log** → every create/update/approve/finalize with before/after JSON.

## The 25 functionalities

| # | Functionality | Admin | HR | Employee |
|---|---|:--:|:--:|:--:|
| 01 | First-run setup (company + Admin) | Manage | — | — |
| 02 | Login / logout / change password, role menus & dashboards | ✓ | ✓ | ✓ |
| 03 | Company settings (hours, grace, weekend, office geofence) | Manage | View | — |
| 04 | Departments, designations, leave types & quotas, holidays (full CRUD) | Manage | View | — |
| 05 | Create HR logins; deactivate / activate; reset password | Manage | — | — |
| 06 | Register employee (login created) + edit details & salary | View | Manage | Own phone/address |
| 07 | Directory with search/filters/paging; Employee 360 profile | All | All | Own |
| 08 | CSV import with dry-run report; CSV export | — | Manage | — |
| 09 | Web check-in / check-out (server-stamped time) | — | Own | Own |
| 10 | Attendance calendar (own) + daily attendance board | All | All | Own |
| 11 | Attendance corrections: request → HR approve/reject (applied to record) | View | Approve | Request |
| 12 | Apply / cancel leave; balance & history | — | Own | Own |
| 13 | Approve / reject leave with comment (+ notification) | View | Approve | — |
| 14 | Salary structure per employee (gross = 1.5 × basic) | View | Manage | — |
| 15 | Monthly payroll draft + recalculate | View | Manage | — |
| 16 | Finalize payroll (Admin-only lock; re-run rejected) | Lock | — | — |
| 17 | Payslips with PDF download | All | All | Own |
| 18 | Dashboards & KPIs with date + department filters | Company | HR | Personal |
| 19 | AI chat answering from live data (same RBAC as REST API) | All data | HR data | Own data |
| 20 | AI dashboard summary (grounded bullets) | ✓ | ✓ | — |
| 21 | Smart leave (sentence → pre-filled form) | — | Own | Own |
| 22 | Policy Q&A (grace, half-day, quotas, tax slabs, geofence) | ✓ | ✓ | ✓ |
| 23 | Announcements | Post | Post | Read |
| 24 | In-app notifications (leave decisions, payslip ready) | ✓ | ✓ | ✓ |
| 25 | Audit log (who/what/when + before/after), read-only | View | — | — |

**Bonus items implemented:** dark mode (purple night palette), AI understands Roman Urdu, late-penalty rule (3 lates = 0.5 deduction day, applied in payroll), server-side geofence verification ready for camera check-ins (`source: camera` + lat/lng + accuracy → Haversine check).

**Not implemented:** the optional mobile app and the in-browser camera capture UI (the backend rule engine for it is in place and tested).

## Business rules (enforced in services, not the UI)

- Office start 09:00 + 15 min grace → **late**; under 5 h between in/out → **half day**; one record per employee per day (second check-in = **409**).
- Leave counts **working days only** (skip weekends + public holidays); quotas annual 14 / sick 8 / casual 10 / unpaid unlimited; overlap or over-balance = **422**.
- Payroll: gross = 1.5 × basic (HRA 40 %, medical 10 %); per-day = gross ÷ working days; deduct absent + unpaid + 0.5 × half days + ⌊lates/3⌋ × 0.5; prorate joiners; tax slab on gross × 12 (0/5 %/15 %/25 %/35 %); finalized runs are locked.
- Employees can only ever read rows with their own `employee_id` — enforced on every endpoint including AI tools.

## Tests

```bash
cd backend
npm test        # vitest + supertest, 21 integration tests
```

Covers: first-run guard, RBAC negatives, temp-password flow, duplicate check-in 409, leave overlap/quota 422, CSV dry-run report, payroll draft → recalculate (same id) → finalize lock → employee PDF, dashboards, AI tool routing + salary refusal + policy Q&A + smart-leave parsing, audit trail.

## Project layout

```
backend/
  prisma/schema.prisma     # 17 models (users, employees, attendance, leave, payroll, audit, ai_logs…)
  src/routes/              # one router per module, mounted on the frontend contract
  src/utils/calculations.js# working days, tax slabs, payroll, Haversine
  src/utils/serializers.js # DB rows → exact frontend shapes (lowercase statuses)
  tests/integration.test.mjs
frontend/
  src/pages/               # Auth, Org, Employees, Attendance, Leave, Payroll, Dashboards, Comms
  src/components/          # UI kit, charts, check-in widget, AI chat/summary
  src/lib/                 # api client, auth context, hooks, formatting
```

Submit on [lms.saylaniit.com](https://lms.saylaniit.com/) — repository link + hosted link. Commit `.env.example` only; never real secrets.
