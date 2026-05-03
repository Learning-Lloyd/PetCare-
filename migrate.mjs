import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function q(connection, sql, args = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, args, (err, results) => (err ? reject(err) : resolve(results)))
  })
}

function end(connection) {
  return new Promise((resolve, reject) => {
    connection.end((err) => (err ? reject(err) : resolve()))
  })
}

async function main() {
  const connection = mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME || "petcare_db",
    multipleStatements: true,
  })

  await q(
    connection,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  const migrationsDir = path.join(__dirname, "migrations")
  let files
  try {
    files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort()
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error("Missing migrations/ folder. Create it and add .sql files (e.g. 002_add_visits.sql).")
      await end(connection)
      process.exit(1)
    }
    throw e
  }

  const appliedRows = await q(connection, "SELECT filename FROM schema_migrations")
  const applied = new Set(appliedRows.map((r) => r.filename))

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip (already applied)  ${file}`)
      continue
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8")
    await q(connection, sql)
    await q(connection, "INSERT INTO schema_migrations (filename) VALUES (?)", [file])
    console.log(`applied  ${file}`)
  }

  await end(connection)
  console.log("migrate: done")
}

main().catch(async (e) => {
  console.error(e)
  process.exit(1)
})
