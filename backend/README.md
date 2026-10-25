# HCM Lite — Backend API

Express 5 + Prisma + SQLite. One router per module (`src/routes/`), rules in services and `src/utils/calculations.js`, DB→frontend shapes in `src/utils/serializers.js`.

```bash
npm install
cp .env.example .env
npx prisma db push     # creates prisma/dev.db
npm run dev            # http://localhost:5000
npm test               # vitest + supertest (21 integration tests)
```

Module map: `setup` `auth` `org` (settings/departments/designations/leave-types/holidays) `users` `employees` (+`/api/me`) `attendance` `leave` `payroll` (+`/api/payslips`) `dashboard` `ai` `comms` (announcements/notifications/audit-logs).

Every endpoint behind `authGuard` re-checks role and data scope on the server: an Employee only ever reads rows with their own `employee_id` — the same guard applies to the AI tools.
