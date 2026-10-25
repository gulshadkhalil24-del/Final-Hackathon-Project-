const express = require('express');
const cors = require('cors');
require('dotenv').config();

const setupRoutes = require('./routes/setupRoutes');
const authRoutes = require('./routes/authRoutes');
const orgRoutes = require('./routes/orgRoutes'); // settings, departments, designations, leave-types, holidays
const userRoutes = require('./routes/userRoutes'); // admin manages logins
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const aiRoutes = require('./routes/aiRoutes');
const commsRoutes = require('./routes/commsRoutes'); // announcements, notifications, audit-logs

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Routes across the 9 modules (paths match the frontend API contract)
app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', orgRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/me', employeeRoutes.me);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/payslips', payrollRoutes.payslips);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', commsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

module.exports = app;
