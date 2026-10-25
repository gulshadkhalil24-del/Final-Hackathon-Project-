# HCM Lite — Viva Preparation Guide

## 1. Ek line mein project kya hai?

**HCM Lite** ek web-based Human Capital Management (HR) system hai — 3 roles (Admin, HR, Employee), 9 modules, 25 functionalities — jismein ek AI assistant bhi hai jo **real data** se jawab deta hai. System **empty start** hota hai: koi dummy data nahi, sab kuch app ke andar banta hai.

---

## 2. Tech Stack — KYA use kiya + KYON

### Frontend

| Technology | Kya hai | Kyon choose kiya |
|---|---|---|
| **React 19** | UI library (components + hooks) | Industry standard, reusable components, fast rendering. Role-based menus different components se bante hain |
| **Vite** | Build/dev tool | Webpack se 10x fast, instant HMR (hot reload) — dev speed ke liye |
| **React Router** | Client-side routing | SPA mein login/dashboard/payroll pages ke liye — page reload ke bina navigation |
| **Tailwind CSS** | Utility-first CSS | Fast styling, consistent design system. Humne custom `brand` tokens banaye (neon purple `#b026ff`) — poori theme ek jagah se control hoti hai |
| **Recharts** | Charts library | React ke liye bana hua — dashboards (bar/line/pie) + payroll donut chart |
| **lucide-react** | Icons | Lightweight, consistent SVG icons |

### Backend

| Technology | Kya hai | Kyon choose kiya |
|---|---|---|
| **Node.js + Express 5** | REST API server | JavaScript ka ecosystem, async I/O — ek hi language (JS) frontend + backend |
| **Prisma ORM** | Database toolkit | Type-safe queries, schema se models milte hain, SQL likhne ki zaroorat nahi, migrations easy |
| **SQLite** | Database (file-based) | **Zero setup** — koi server install nahi karna, `dev.db` ek file hai. Judge ke machine pe 2 minute mein chal jata hai. (Production mein PostgreSQL/MySQL swap ho sakta hai — Prisma wajah se sirf provider change hota hai) |
| **JWT (jsonwebtoken)** | Authentication tokens | Stateless auth — server ko session store nahi rakhna parta. Har request mein token header se aata hai |
| **bcrypt** | Password hashing | Plain passwords kabhi store nahi hote — 10 rounds ka hash. Login pe compare hota hai |
| **PDFKit** | PDF generation | Payslips server pe generate hote hain (client-side nahi — data manipulation impossible) |
| **Multer** | File upload | CSV import ke liye multipart form data handle karta hai |
| **Vitest + Supertest** | Testing | In-process integration tests — 21 tests poore API flow cover karte hain |

---

## 3. Architecture (kaise jura hua hai)

```
Browser (React SPA)
    │  fetch() + JWT Bearer header
    ▼
Vite dev proxy (/api → :5000)
    │
    ▼
Express REST API (backend/src/routes/)
    │  har route pe: authGuard → requireRole → data-scope check
    ▼
Business logic (routes + utils/calculations.js)
    │  rules: grace time, tax slabs, quotas, Haversine geofence
    ▼
Prisma ORM ──► SQLite (dev.db)
```

**Frontend kabhi directly database ko nahi dekhta** — sab kuch API se. AI assistant bhi same API services use karta hai.

### Database models (17 total — main ones):
- `User` (login: email, passwordHash, role, mustChangePassword)
- `Employee` + `SalaryStructure` (gross = 1.5 × basic)
- `Attendance` (unique per employee+date — isliye duplicate check-in 409 deta hai)
- `LeaveRequest` + `LeaveType` (quota, isPaid)
- `PayrollRun` + `Payslip` (ek month per run, FINALIZED lock)
- `AttendanceCorrection`, `Announcement`, `Notification`
- `AuditLog` (actor, action, before/after JSON), `AiLog` (guardrails ke liye)

---

## 4. Roles & Security (RBAC) — viva ka favourite topic!

| Role | Kya kar sakta hai | Kya NAHI kar sakta |
|---|---|---|
| **Admin** | Company setup, org data, HR logins, **payroll finalize (lock)**, audit log | Payroll edit after finalize |
| **HR** | Employees + CSV, salary, attendance board, leave approvals, payroll **draft** | Finalize nahi kar sakta, audit log nahi dekh sakta, settings change nahi |
| **Employee** | Check in/out, leave apply, own payslip PDF, own profile | Kisi aur ka data/salary NAHI dekh sakta |

**Important point:** Security sirf UI (button hide) pe nahi hai — **har API request pe server role + data-scope check karta hai**. Employee token se doosray employee ki API call karoge to 403 milega. AI assistant bhi same guard use karta hai — employee se "Sara ki salary kya hai?" poocho to AI refuse karta hai.

---

## 5. Business Rules (brief Section 3 se)

1. **Attendance:** Server time stamp karta hai (client ka time nahi). 09:00 + 15 min grace ke baad **LATE**. Under 5 hours = **HALF_DAY**. Ek employee ka ek din mein ek record — doosri check-in = **409 Conflict**.
2. **Leave:** Sirf **working days** count hote hain (weekend + holidays skip). Quotas: Annual 14, Sick 8, Casual 10, Unpaid unlimited. Overlap ya over-quota = **422 Unprocessable**.
3. **Payroll:** Gross = 1.5 × basic (HRA 40% + medical 10%). Per-day rate = gross ÷ working days. Deductions: absent + unpaid leave + 0.5 × half-days + ⌊lates÷3⌋ × 0.5 (late penalty). Tax: annual gross pe slab (0–600k: 0%, …above 3.6M: 35%). Joiners prorate hote hain. **Finalize ke baad month locked** — sirf Admin finalize kar sakta hai.
4. **Geofence (bonus):** Camera check-in ke liye Haversine formula se office distance nikalta hai; radius (150m) se bahar = reject; GPS accuracy > 100m = reject.

---

## 6. AI Assistant ka approach

- **Offline grounded engine** — koi paid API key zaroori nahi (demo kabhi fail nahi hota)
- **Tools:** `get_headcount`, `get_late_comers`, `get_attendance_summary`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`
- Har tool **wahi permission checks** use karta hai jo REST API karta hai (RBAC)
- **Policy Q&A** rules se: grace period, half-day, quotas, tax slabs, weekend
- **Smart leave:** "Need next Monday and Tuesday off for wedding" → JSON {type, start, end, reason} → form pre-fill → user confirm karta hai
- **Roman Urdu** samajhta hai: "Mujhe kitni casual leaves bachi hain?"
- **Guardrails:** ~20 requests/user/hour, har call `ai_logs` mein, jawab pe "AI-generated" label

---

## 7. Testing

`cd backend && npm test` → **21 integration tests** (Vitest + Supertest, in-process):
- First-run guard, weak password rejection
- RBAC negatives (HR cannot manage logins, employee scoped data)
- Temp-password flow, duplicate check-in 409
- Leave overlap/quota 422, CSV dry-run errors
- Payroll draft → recalculate (same id) → finalize lock → employee PDF download
- AI tool routing + salary refusal + policy Q&A

---

## 8. Expected Viva Questions + Jawab

**Q: Database kyun SQLite, MongoDB nahi?**
A: Hackathon requirement thi ke judge 10 minute mein chala sake. SQLite file-based hai — zero install. Data relational hai (employees↔attendance↔payroll joins), isliye relational DB sahi choice. Prisma ki wajah se production mein PostgreSQL sirf config change hai.

**Q: JWT vs session?**
A: JWT stateless hai — server pe session store nahi rakhta, scale karna easy. Token 7 din ka, har request pe `Authorization: Bearer` header.

**Q: Password kaise store hote hain?**
A: bcrypt hash (10 rounds) — kabhi plain text nahi. Employee ka temp password bhi hash hota hai, `mustChangePassword` flag se pehli login pe change zaroori.

**Q: Employee doosray ka payslip download kar sake?**
A: Nahi — PDF endpoint pe server check karta hai ki payslip ka employeeId == token ka employeeId, warna 403. Plus sirf FINALIZED run ke payslips employee ko milte hain.

**Q: AI kaise jawab deta hai database se?**
A: LLM directly DB query nahi karta. Backend mein deterministic tools hain jo Prisma se data lete hain (same RBAC checks ke saath), phir us data se answer banta hai. Isliye AI ka jawab hamesha dashboard se match karta hai.

**Q: Duplicate check-in kaise roka?**
A: Prisma schema mein `@@unique([employeeId, date])` — database level constraint. Race condition mein bhi DB reject karta hai → API 409.

**Q: Payroll kaise calculate hota hai?**
A: Har active employee ke liye: us month ki attendance se present/absent/half-days, approved unpaid leave, phir formula: deductions = (absent + unpaid + 0.5×halfDays + latePenalty) × dailyRate. Tax annual slab ka 1/12. Net = gross − deductions − tax.

**Q: Frontend/backend contract kaise maintain kiya?**
A: Backend serializers (`utils/serializers.js`) DB rows ko exact frontend shapes mein convert karte hain (lowercase statuses, `items` arrays). Integration tests isi contract ko lock karte hain.

**Q: Animations/accessibility?**
A: Sab CSS-based, `prefers-reduced-motion` respect karte hain (motion-sensitive users ke liye off). Focus-visible rings, ARIA labels, tabular-nums financial tables.

---

## 9. Demo credentials (agar demo data wala DB dikhana ho)

- Admin: `admin@acme.com` / `admin12345`
- HR: `hr@acme.com` / `hrpass12345`
- Employee: `ali@acme.com` / `emppass12345`

(Final zip ka DB khali hai — fresh setup ke liye, judge khud company banayega.)

---

## 10. 30-second elevator pitch (yaad kar lo!)

> "Humne HCM Lite banaya — ek complete HR system jismein attendance, leave, payroll aur dashboards hain, teen roles ke saath jinki security server pe enforce hoti hai. Database SQLite hai jo zero-setup deta hai, backend Express + Prisma, frontend React. Sab se khaas cheez: AI assistant jo live database se tool-calling ke zariye jawab deta hai — aur employee ki permissions ke andar hi rehta hai. System empty start hota hai, har number app ke real data se aata hai."
