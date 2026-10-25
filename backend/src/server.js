const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`HCM Lite Backend API running on port ${PORT}`);
  console.log(`Connected to SQLite database: dev.db`);
});
