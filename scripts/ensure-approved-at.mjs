import "dotenv/config"
import mysql from "mysql"

const c = mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME || "petcare_db",
  multipleStatements: true,
})

const sql = `
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'approved_at');
SET @q := IF(@exist = 0,
  'ALTER TABLE appointments ADD COLUMN approved_at DATETIME NULL AFTER created_at',
  'SELECT 1 AS skip');
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE appointments SET approved_at = created_at
WHERE approved_at IS NULL AND status IN ('Confirmed', 'Completed', 'Missed');
`

c.query(sql, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log("appointments.approved_at is present (added if it was missing).")
  c.end()
})
