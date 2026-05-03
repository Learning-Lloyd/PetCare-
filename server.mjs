import "dotenv/config"
import crypto from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import bcrypt from "bcryptjs"
import cors from "cors"
import express from "express"
import mysql from "mysql"
import { registerDataRoutes } from "./dataRoutes.mjs"
import { registerAdminRoutes } from "./adminRoutes.mjs"
import { registerVetRoutes } from "./vetRoutes.mjs"

const app = express()
const PORT = Number(process.env.PORT) || 3001
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME || "petcare_db",
  waitForConnections: true,
  connectionLimit: 10,
}

const pool = mysql.createPool(dbConfig)

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)))
  })
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}

/** MySQL TINYINT often arrives as 0/1 numbers or "0"/"1" strings — never use Boolean("0") (it is true in JS). */
function mysqlTinynBool(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === "bigint") return v === 1n
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(v)) return v.length > 0 && v[0] === 1
  if (v == null) return false
  const s = String(v).trim().toLowerCase()
  if (s === "0" || s === "false" || s === "") return false
  if (s === "1" || s === "true") return true
  const n = Number(v)
  return n === 1
}

function mapUserRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    avatar: row.avatar_url || undefined,
    bio: row.bio || undefined,
    isAdmin: mysqlTinynBool(row.is_admin),
    isVet: mysqlTinynBool(row.is_vet),
    vetLicenseId: row.vet_license_id ? String(row.vet_license_id) : undefined,
    isActive: row.is_active == null ? true : mysqlTinynBool(row.is_active),
    createdAt: row.created_at,
  }
}

async function createSession(userId) {
  const rawToken = crypto.randomBytes(32).toString("hex")
  const tokenSha = sha256Hex(rawToken)
  await query(
    `INSERT INTO auth_sessions (user_id, token_sha256, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
    [userId, tokenSha, SESSION_DAYS],
  )
  return rawToken
}

function sqlErrMessage(err) {
  if (err.code === "ER_NO_SUCH_TABLE") {
    return "Database tables are missing. In the app folder run: npm run migrate"
  }
  return err.message || String(err)
}

async function getUserFromAuthHeader(req) {
  const h = req.headers.authorization || ""
  const m = /^Bearer\s+(.+)$/i.exec(h)
  if (!m) return null
  const tokenSha = sha256Hex(m[1].trim())
  const rows = await query(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.bio, u.created_at, u.is_admin, u.is_active, u.is_vet, u.vet_license_id
     FROM users u
     INNER JOIN auth_sessions s ON s.user_id = u.id
     WHERE s.token_sha256 = ? AND s.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [tokenSha],
  )
  if (!rows.length) return null
  const row = rows[0]
  if (row.is_active != null && Number(row.is_active) === 0) return null
  return mapUserRow(row)
}

app.use(cors())
app.use(express.json({ limit: "15mb" }))

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

const publicDbInfo = () => ({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
})

app.get("/", (_req, res) => {
  res.json({
    message:
      "API for PetCare. This connects to the MySQL/MariaDB server that phpMyAdmin manages (check .env: DB_*).",
    ui: "Run npm run dev and open the Vite URL (e.g. http://localhost:5173/).",
    mysql: publicDbInfo(),
    try: "/api/health",
  })
})

app.get("/api/health", (_req, res) => {
  pool.query("SELECT 1 AS ok, DATABASE() AS current_db", (err, rows) => {
    if (err) {
      console.error(err)
      return res.status(500).json({
        ok: false,
        error: err.message,
        mysql: publicDbInfo(),
        hint:
          "Match DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env to the server you log into in phpMyAdmin.",
      })
    }
    res.json({
      ok: true,
      rows,
      mysql: publicDbInfo(),
    })
  })
})

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim()
    const email = String(req.body?.email || "").trim().toLowerCase()
    const password = String(req.body?.password || "")
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." })
    }
    const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [email])
    if (existing.length) {
      return res.status(409).json({ error: "An account with this email already exists." })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const result = await query(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      [email, passwordHash, name],
    )
    const userId = Number(result.insertId)
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(500).json({
        error: "Registration could not read new user id. Run npm run migrate and restart the API.",
      })
    }
    const sessionToken = await createSession(userId)
    const rows = await query(
      "SELECT id, email, name, avatar_url, bio, created_at, is_admin, is_active, is_vet, vet_license_id FROM users WHERE id = ? LIMIT 1",
      [userId],
    )
    res.status(201).json({
      user: mapUserRow(rows[0]),
      sessionToken,
    })
  } catch (e) {
    console.error(e)
    const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
    res.status(status).json({ error: sqlErrMessage(e) })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase()
    const password = String(req.body?.password || "")
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." })
    }
    const rows = await query(
      "SELECT id, email, name, avatar_url, bio, created_at, password_hash, is_admin, is_active, is_vet, vet_license_id FROM users WHERE email = ? LIMIT 1",
      [email],
    )
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid email or password." })
    }
    const row = rows[0]
    if (row.is_active != null && Number(row.is_active) === 0) {
      return res.status(403).json({ error: "This account has been deactivated. Contact an administrator." })
    }
    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." })
    }
    const sessionToken = await createSession(row.id)
    res.json({
      user: mapUserRow(row),
      sessionToken,
    })
  } catch (e) {
    console.error(e)
    const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
    res.status(status).json({ error: sqlErrMessage(e) })
  }
})

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getUserFromAuthHeader(req)
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired session." })
    }
    res.json({ user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || "Session check failed." })
  }
})

app.post("/api/auth/logout", async (req, res) => {
  try {
    const h = req.headers.authorization || ""
    const m = /^Bearer\s+(.+)$/i.exec(h)
    if (m) {
      const tokenSha = sha256Hex(m[1].trim())
      await query("DELETE FROM auth_sessions WHERE token_sha256 = ?", [tokenSha])
    }
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || "Logout failed." })
  }
})

registerDataRoutes(app, { query, getUserFromAuthHeader })
registerAdminRoutes(app, { query, getUserFromAuthHeader })
registerVetRoutes(app, { query, getUserFromAuthHeader })

app.listen(PORT, () => {
  console.log(
    `API ready at http://localhost:${PORT} → MySQL ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
  )
  console.log(
    "Data API mounted: /api/pets, /api/health-records, /api/vaccinations, /api/feeding-schedules, /api/exercises, /api/reminders, /api/appointments, /api/activities, /api/notifications",
  )
  console.log(
    "Admin API: overview, users CRUD, pets, schedules, reminders, notifications, settings, reports — see adminRoutes.mjs",
  )
  query("SELECT 1 FROM users LIMIT 1")
    .then(() => query("SELECT 1 FROM auth_sessions LIMIT 1"))
    .then(() => console.log("Auth tables OK: users, auth_sessions."))
    .catch((e) => {
      console.error("\n*** Fix: npm run migrate (auth tables missing) ***\n", e.message)
    })
})
