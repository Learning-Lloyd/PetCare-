/**
 * Admin-only routes: user & pet management, system-wide data views, settings, reports.
 * @param {import('express').Application} app
 */
import bcrypt from "bcryptjs"

/** MySQL TINYINT as 0/1 or "0"/"1" — Boolean("0") is wrongly true in JavaScript. */
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

/** JSON body flags — only treat explicit trues as true. */
function bodyBool(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (v == null) return false
  const s = String(v).trim().toLowerCase()
  return s === "1" || s === "true"
}

export function registerAdminRoutes(app, { query, getUserFromAuthHeader }) {
  async function requireAdmin(req, res) {
    const user = await getUserFromAuthHeader(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return null
    }
    if (!user.isAdmin) {
      res.status(403).json({ error: "Admin access required." })
      return null
    }
    return user
  }

  async function getSetting(key, fallback = "") {
    const rows = await query("SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1", [key])
    if (!rows.length || rows[0].setting_value == null) return fallback
    return String(rows[0].setting_value)
  }

  async function setSetting(key, value) {
    await query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value],
    )
  }

  app.get("/api/admin/overview", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const daysBefore = Math.max(0, Math.min(30, Number.parseInt(await getSetting("reminder_days_before", "3"), 10) || 3))
      const countRows = await query(
        `SELECT
           (SELECT COUNT(*) FROM users) AS user_count,
           (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_user_count,
           (SELECT COUNT(*) FROM pets) AS pet_count,
           (SELECT COUNT(*) FROM health_records) AS health_record_count,
           (SELECT COUNT(*) FROM vaccinations) AS vaccination_count,
           (SELECT COUNT(*) FROM appointments) AS appointment_count,
           (SELECT COUNT(*) FROM reminders) AS reminder_count,
           (SELECT COUNT(*) FROM notifications) AS notification_count,
           (SELECT COUNT(*) FROM vaccinations
             WHERE status = 'Pending' AND next_due_date IS NOT NULL AND next_due_date < CURDATE()) AS missed_vaccination_count,
           (SELECT COUNT(*) FROM reminders
             WHERE completed = 0 AND reminder_date < CURDATE()) AS overdue_reminder_count,
           (SELECT COUNT(*) FROM feeding_schedules WHERE completed = 0) AS incomplete_feeding_count,
           (SELECT COUNT(*) FROM reminders
             WHERE completed = 0
               AND reminder_date IS NOT NULL
               AND reminder_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
               AND reminder_date >= CURDATE()) AS upcoming_reminder_window_count`,
        [daysBefore],
      )
      const c = countRows[0] || {}
      res.json({
        userCount: Number(c.user_count) || 0,
        activeUserCount: Number(c.active_user_count) || 0,
        petCount: Number(c.pet_count) || 0,
        healthRecordCount: Number(c.health_record_count) || 0,
        vaccinationCount: Number(c.vaccination_count) || 0,
        appointmentCount: Number(c.appointment_count) || 0,
        reminderCount: Number(c.reminder_count) || 0,
        notificationCount: Number(c.notification_count) || 0,
        missedVaccinationCount: Number(c.missed_vaccination_count) || 0,
        overdueReminderCount: Number(c.overdue_reminder_count) || 0,
        incompleteFeedingCount: Number(c.incomplete_feeding_count) || 0,
        upcomingReminderWindowCount: Number(c.upcoming_reminder_window_count) || 0,
        reminderDaysBefore: daysBefore,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Overview failed." })
    }
  })

  app.get("/api/admin/users", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT u.id, u.email, u.name, u.is_admin, u.is_active, u.is_vet, u.vet_license_id, u.created_at,
                (SELECT COUNT(*) FROM pets p WHERE p.user_id = u.id) AS pet_count
         FROM users u
         ORDER BY u.created_at DESC`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          email: r.email,
          name: r.name,
          isAdmin: mysqlTinynBool(r.is_admin),
          isVet: mysqlTinynBool(r.is_vet),
          vetLicenseId: r.vet_license_id ? String(r.vet_license_id) : undefined,
          isActive: mysqlTinynBool(r.is_active),
          petCount: Number(r.pet_count) || 0,
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list users." })
    }
  })

  app.post("/api/admin/users", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const name = String(req.body?.name || "").trim()
      const email = String(req.body?.email || "").trim().toLowerCase()
      const password = String(req.body?.password || "")
      let isAdmin = bodyBool(req.body?.isAdmin)
      let isVet = bodyBool(req.body?.isVet)
      const vetLicenseId = String(req.body?.vetLicenseId || "").trim() || null
      if (isVet && isAdmin) {
        return res.status(400).json({ error: "A user cannot be both administrator and veterinarian." })
      }
      if (isVet) isAdmin = false
      if (isAdmin) isVet = false
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
      const ins = await query(
        `INSERT INTO users (email, password_hash, name, is_admin, is_vet, vet_license_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [email, passwordHash, name, isAdmin ? 1 : 0, isVet ? 1 : 0, vetLicenseId],
      )
      const userId = Number(ins.insertId)
      const rows = await query(
        "SELECT id, email, name, is_admin, is_active, is_vet, vet_license_id, created_at FROM users WHERE id = ? LIMIT 1",
        [userId],
      )
      const r = rows[0]
      res.status(201).json({
        id: String(r.id),
        email: r.email,
        name: r.name,
        isAdmin: mysqlTinynBool(r.is_admin),
        isVet: mysqlTinynBool(r.is_vet),
        vetLicenseId: r.vet_license_id ? String(r.vet_license_id) : undefined,
        isActive: mysqlTinynBool(r.is_active),
        createdAt: r.created_at,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not create user." })
    }
  })

  app.patch("/api/admin/users/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const targetId = String(req.params.id || "").trim()
      if (!targetId) return res.status(400).json({ error: "Invalid user id." })

      const rows = await query(
        "SELECT id, email, name, is_admin, is_active, is_vet, vet_license_id FROM users WHERE id = ? LIMIT 1",
        [targetId],
      )
      if (!rows.length) return res.status(404).json({ error: "User not found." })
      const existing = rows[0]

      const name = req.body?.name != null ? String(req.body.name).trim() : null
      const email = req.body?.email != null ? String(req.body.email).trim().toLowerCase() : null
      if (name !== null && !name) {
        return res.status(400).json({ error: "Name cannot be empty." })
      }
      if (email !== null && !email) {
        return res.status(400).json({ error: "Email cannot be empty." })
      }
      let isAdmin = mysqlTinynBool(existing.is_admin) ? 1 : 0
      if (req.body?.isAdmin !== undefined) isAdmin = bodyBool(req.body.isAdmin) ? 1 : 0
      let isVet = mysqlTinynBool(existing.is_vet) ? 1 : 0
      if (req.body?.isVet !== undefined) isVet = bodyBool(req.body.isVet) ? 1 : 0
      let vetLicenseId = existing.vet_license_id
      if (req.body?.vetLicenseId !== undefined) {
        vetLicenseId = String(req.body.vetLicenseId || "").trim() || null
      }
      let isActive = mysqlTinynBool(existing.is_active) ? 1 : 0
      if (req.body?.isActive !== undefined) isActive = bodyBool(req.body.isActive) ? 1 : 0

      if (isVet && isAdmin) {
        return res.status(400).json({ error: "A user cannot be both administrator and veterinarian." })
      }
      if (isVet) isAdmin = 0
      if (isAdmin) isVet = 0

      if (targetId === String(admin.id)) {
        if (isAdmin === 0) {
          return res.status(400).json({ error: "You cannot remove your own admin role while logged in." })
        }
        if (isActive === 0) {
          return res.status(400).json({ error: "You cannot deactivate your own account while logged in." })
        }
      }

      if (email && email !== existing.email) {
        const clash = await query("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1", [email, targetId])
        if (clash.length) return res.status(409).json({ error: "That email is already in use." })
      }

      await query(
        `UPDATE users SET
           name = COALESCE(?, name),
           email = COALESCE(?, email),
           is_admin = ?,
           is_vet = ?,
           vet_license_id = ?,
           is_active = ?
         WHERE id = ?`,
        [name || null, email || null, isAdmin, isVet, vetLicenseId, isActive, targetId],
      )

      const out = await query(
        "SELECT id, email, name, is_admin, is_active, is_vet, vet_license_id, created_at FROM users WHERE id = ? LIMIT 1",
        [targetId],
      )
      const r = out[0]
      res.json({
        id: String(r.id),
        email: r.email,
        name: r.name,
        isAdmin: mysqlTinynBool(r.is_admin),
        isVet: mysqlTinynBool(r.is_vet),
        vetLicenseId: r.vet_license_id ? String(r.vet_license_id) : undefined,
        isActive: mysqlTinynBool(r.is_active),
        createdAt: r.created_at,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not update user." })
    }
  })

  app.post("/api/admin/users/:id/reset-password", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const targetId = String(req.params.id || "").trim()
      const newPassword = String(req.body?.newPassword || "")
      if (!targetId) return res.status(400).json({ error: "Invalid user id." })
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters." })
      }
      const rows = await query("SELECT id FROM users WHERE id = ? LIMIT 1", [targetId])
      if (!rows.length) return res.status(404).json({ error: "User not found." })
      const hash = await bcrypt.hash(newPassword, 10)
      await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, targetId])
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not reset password." })
    }
  })

  app.get("/api/admin/pets", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT p.id, p.user_id, p.name, p.pet_type, p.species, p.breed, p.age_years, p.weight_kg,
                p.health_condition, p.status, p.created_at,
                u.email AS owner_email, u.name AS owner_name
         FROM pets p
         LEFT JOIN users u ON u.id = p.user_id
         ORDER BY p.created_at DESC`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          userId: r.user_id != null ? String(r.user_id) : "",
          name: r.name,
          type: r.pet_type || r.species || "Other",
          breed: r.breed || "",
          age: r.age_years != null ? Number(r.age_years) : 0,
          weight: r.weight_kg != null ? Number(r.weight_kg) : 0,
          healthCondition: r.health_condition || undefined,
          status: r.status || "Active",
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list pets." })
    }
  })

  app.patch("/api/admin/pets/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const petId = String(req.params.id || "").trim()
      if (!petId) return res.status(400).json({ error: "Invalid pet id." })
      const existing = await query(
        `SELECT id, user_id, name, pet_type, species, breed, age_years, weight_kg, health_condition, status
         FROM pets WHERE id = ? LIMIT 1`,
        [petId],
      )
      if (!existing.length) return res.status(404).json({ error: "Pet not found." })
      const cur = existing[0]

      const name = req.body?.name != null ? String(req.body.name).trim() : cur.name
      const type = req.body?.type != null ? String(req.body.type).trim() : cur.pet_type || cur.species || "Dog"
      const breed = req.body?.breed != null ? String(req.body.breed).trim() : cur.breed || ""
      const age = req.body?.age != null ? Number(req.body.age) : cur.age_years
      const weight = req.body?.weight != null ? Number(req.body.weight) : cur.weight_kg
      const healthCondition =
        req.body?.healthCondition !== undefined
          ? String(req.body.healthCondition || "").trim() || null
          : cur.health_condition
      const status = req.body?.status != null ? String(req.body.status).trim() : cur.status || "Active"

      if (!name || !breed) {
        return res.status(400).json({ error: "Name and breed are required." })
      }

      await query(
        `UPDATE pets SET name = ?, pet_type = ?, breed = ?, age_years = ?, weight_kg = ?,
            health_condition = ?, status = ?, species = ?
         WHERE id = ?`,
        [
          name,
          type,
          breed,
          Number.isFinite(age) ? age : 0,
          Number.isFinite(weight) ? weight : 0,
          healthCondition,
          status,
          type,
          petId,
        ],
      )

      const rows = await query(
        `SELECT p.id, p.user_id, p.name, p.pet_type, p.species, p.breed, p.age_years, p.weight_kg,
                p.health_condition, p.status, p.created_at,
                u.email AS owner_email, u.name AS owner_name
         FROM pets p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.id = ? LIMIT 1`,
        [petId],
      )
      const r = rows[0]
      res.json({
        id: String(r.id),
        userId: r.user_id != null ? String(r.user_id) : "",
        name: r.name,
        type: r.pet_type || r.species || "Other",
        breed: r.breed || "",
        age: r.age_years != null ? Number(r.age_years) : 0,
        weight: r.weight_kg != null ? Number(r.weight_kg) : 0,
        healthCondition: r.health_condition || undefined,
        status: r.status || "Active",
        ownerEmail: r.owner_email || "",
        ownerName: r.owner_name || "",
        createdAt: r.created_at,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not update pet." })
    }
  })

  app.get("/api/admin/health-records", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT h.id, h.pet_id, h.title, h.notes, h.attachments_json, h.record_date, h.created_at, h.record_type, h.pet_name,
                p.name AS pet_display_name, u.email AS owner_email, u.name AS owner_name
         FROM health_records h
         INNER JOIN pets p ON h.pet_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         ORDER BY h.record_date DESC, h.id DESC
         LIMIT 500`,
      )
      res.json(
        rows.map((r) => {
          let attachments = []
          const raw = r.attachments_json
          if (raw != null) {
            if (Array.isArray(raw)) attachments = raw.map(String).filter(Boolean)
            else if (typeof raw === "string") {
              try {
                const p = JSON.parse(raw)
                attachments = Array.isArray(p) ? p.map(String).filter(Boolean) : []
              } catch {
                attachments = []
              }
            }
          }
          return {
            id: String(r.id),
            petId: String(r.pet_id),
            petName: r.pet_name || r.pet_display_name || "",
            ownerEmail: r.owner_email || "",
            ownerName: r.owner_name || "",
            type: r.record_type || "Check-up",
            date: r.record_date,
            notes: r.notes || "",
            attachments,
            createdAt: r.created_at,
          }
        }),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list health records." })
    }
  })

  app.get("/api/admin/vaccinations", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT v.id, v.pet_id, v.pet_name, v.vaccine_name, v.date_given, v.next_due_date, v.status, v.notes,
                u.email AS owner_email, u.name AS owner_name
         FROM vaccinations v
         INNER JOIN pets p ON v.pet_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         ORDER BY v.date_given DESC`,
      )
      const today = new Date().toISOString().slice(0, 10)
      res.json(
        rows.map((r) => {
          const overdue =
            r.status === "Pending" &&
            r.next_due_date != null &&
            String(r.next_due_date).slice(0, 10) < today
          return {
            id: String(r.id),
            petId: String(r.pet_id),
            petName: r.pet_name,
            vaccineName: r.vaccine_name,
            date: r.date_given,
            nextDueDate: r.next_due_date || null,
            status: r.status === "Done" || r.status === "Pending" ? r.status : "Pending",
            notes: r.notes || undefined,
            ownerEmail: r.owner_email || "",
            ownerName: r.owner_name || "",
            missed: overdue,
          }
        }),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list vaccinations." })
    }
  })

  app.get("/api/admin/feeding-schedules", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT f.*, u.email AS owner_email, u.name AS owner_name
         FROM feeding_schedules f
         INNER JOIN pets p ON f.pet_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         ORDER BY f.pet_name, f.time_of_day`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_name,
          time: r.time_of_day,
          portionSize: r.portion_size,
          foodType: r.food_type,
          completed: Boolean(r.completed),
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
          missed: !r.completed,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list feeding schedules." })
    }
  })

  app.get("/api/admin/exercises", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT e.*, u.email AS owner_email, u.name AS owner_name
         FROM exercise_logs e
         INNER JOIN pets p ON e.pet_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         ORDER BY e.log_date DESC, e.id DESC
         LIMIT 500`,
      )
      const today = new Date().toISOString().slice(0, 10)
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_name,
          type: r.exercise_type,
          duration: Number(r.duration_minutes),
          caloriesBurned: r.calories_burned != null ? Number(r.calories_burned) : undefined,
          date: r.log_date,
          notes: r.notes || undefined,
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
          stale: String(r.log_date).slice(0, 10) < today,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list exercises." })
    }
  })

  app.get("/api/admin/appointments", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT a.*, u.email AS owner_email, u.name AS owner_name
         FROM appointments a
         INNER JOIN pets p ON a.pet_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         ORDER BY a.appt_date ASC, a.appt_time ASC`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_name,
          reason: r.reason,
          date: r.appt_date,
          time: r.appt_time,
          notes: r.notes || undefined,
          status: r.status,
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list appointments." })
    }
  })

  app.get("/api/admin/reminders", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT r.*, u.email AS owner_email, u.name AS owner_name
         FROM reminders r
         INNER JOIN users u ON r.user_id = u.id
         ORDER BY r.reminder_date ASC, r.id ASC`,
      )
      const today = new Date().toISOString().slice(0, 10)
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          petId: r.pet_id != null ? String(r.pet_id) : undefined,
          petName: r.pet_name || undefined,
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
          type: r.reminder_type,
          title: r.title,
          date: r.reminder_date,
          time: r.reminder_time || undefined,
          priority: r.priority,
          completed: Boolean(r.completed),
          description: r.description || undefined,
          overdue: !r.completed && String(r.reminder_date).slice(0, 10) < today,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list reminders." })
    }
  })

  app.patch("/api/admin/reminders/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const id = String(req.params.id || "").trim()
      const title = req.body?.title != null ? String(req.body.title).trim() : null
      const reminderDate = req.body?.date != null ? String(req.body.date).trim() : null
      const completed = req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : null
      const description = req.body?.description != null ? String(req.body.description).trim() || null : null

      const sets = []
      const args = []
      if (title) {
        sets.push("title = ?")
        args.push(title)
      }
      if (reminderDate) {
        sets.push("reminder_date = ?")
        args.push(reminderDate)
      }
      if (completed !== null) {
        sets.push("completed = ?")
        args.push(completed)
      }
      if (description !== undefined && req.body?.description !== undefined) {
        sets.push("description = ?")
        args.push(description)
      }
      if (!sets.length) {
        return res.status(400).json({ error: "No fields to update." })
      }
      args.push(id)
      const result = await query(`UPDATE reminders SET ${sets.join(", ")} WHERE id = ?`, args)
      const affected = Number(result.affectedRows ?? result.changedRows ?? 0)
      if (!affected) return res.status(404).json({ error: "Reminder not found." })
      const rows = await query(`SELECT r.*, u.email AS owner_email, u.name AS owner_name
        FROM reminders r INNER JOIN users u ON r.user_id = u.id WHERE r.id = ? LIMIT 1`, [id])
      const r = rows[0]
      const today = new Date().toISOString().slice(0, 10)
      res.json({
        id: String(r.id),
        userId: String(r.user_id),
        petId: r.pet_id != null ? String(r.pet_id) : undefined,
        petName: r.pet_name || undefined,
        ownerEmail: r.owner_email || "",
        ownerName: r.owner_name || "",
        type: r.reminder_type,
        title: r.title,
        date: r.reminder_date,
        time: r.reminder_time || undefined,
        priority: r.priority,
        completed: Boolean(r.completed),
        description: r.description || undefined,
        overdue: !r.completed && String(r.reminder_date).slice(0, 10) < today,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not update reminder." })
    }
  })

  app.delete("/api/admin/reminders/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const id = String(req.params.id || "").trim()
      const result = await query("DELETE FROM reminders WHERE id = ?", [id])
      const affected = Number(result.affectedRows ?? 0)
      if (!affected) return res.status(404).json({ error: "Reminder not found." })
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not delete reminder." })
    }
  })

  app.get("/api/admin/notifications", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rows = await query(
        `SELECT n.*, u.email AS owner_email, u.name AS owner_name
         FROM notifications n
         INNER JOIN users u ON n.user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 200`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          ownerEmail: r.owner_email || "",
          ownerName: r.owner_name || "",
          title: r.title,
          message: r.message,
          type: r.notif_type || "info",
          read: Boolean(r.is_read),
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list notifications." })
    }
  })

  app.get("/api/admin/settings", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const reminderDaysBefore = Math.max(
        0,
        Math.min(30, Number.parseInt(await getSetting("reminder_days_before", "3"), 10) || 3),
      )
      res.json({ reminderDaysBefore })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load settings." })
    }
  })

  app.patch("/api/admin/settings", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const raw = Number(req.body?.reminderDaysBefore)
      if (!Number.isFinite(raw)) {
        return res.status(400).json({ error: "reminderDaysBefore must be a number (0–30)." })
      }
      const reminderDaysBefore = Math.max(0, Math.min(30, Math.round(raw)))
      await setSetting("reminder_days_before", String(reminderDaysBefore))
      res.json({ reminderDaysBefore })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not save settings." })
    }
  })

  app.get("/api/admin/reports/summary", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const rawStart = String(req.query.startDate || "").trim()
      const rawEnd = String(req.query.endDate || "").trim()
      const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s)

      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const fmtDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

      const startDate = isIsoDate(rawStart) ? rawStart : fmtDate(defaultStart)
      const endDate = isIsoDate(rawEnd) ? rawEnd : fmtDate(defaultEnd)

      if (startDate > endDate) {
        return res.status(400).json({ error: "startDate must be <= endDate (YYYY-MM-DD)." })
      }

      // endExclusive = endDate + 1 day, to make endDate inclusive.
      const end = new Date(`${endDate}T00:00:00`)
      if (Number.isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid endDate. Expected YYYY-MM-DD." })
      }
      end.setDate(end.getDate() + 1)
      const endExclusive = fmtDate(end)

      const range = [startDate, endExclusive]
      const rows = await query(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?) AS new_users,
           (SELECT COUNT(*) FROM pets WHERE created_at >= ? AND created_at < ?) AS new_pets,
           (SELECT COUNT(*) FROM health_records WHERE record_date >= ? AND record_date < ?) AS health_records,
           (SELECT COUNT(*) FROM vaccinations WHERE date_given >= ? AND date_given < ?) AS vaccinations_given,
           (SELECT COUNT(*) FROM exercise_logs WHERE log_date >= ? AND log_date < ?) AS exercise_logs,
           (SELECT COUNT(*) FROM reminders WHERE reminder_date >= ? AND reminder_date < ?) AS reminders_due,
           (SELECT COUNT(*) FROM appointments WHERE appt_date >= ? AND appt_date < ?) AS appointments,
           (SELECT COUNT(*) FROM notifications WHERE created_at >= ? AND created_at < ?) AS notifications,
           (SELECT COUNT(*) FROM audit_log WHERE created_at >= ? AND created_at < ?) AS audit_events`,
        [...range, ...range, ...range, ...range, ...range, ...range, ...range, ...range, ...range],
      )
      const r = rows[0] || {}
      const missed = await query(
        `SELECT COUNT(*) AS c FROM vaccinations
         WHERE status = 'Pending' AND next_due_date IS NOT NULL AND next_due_date < CURDATE()`,
      )
      res.json({
        period: "range",
        startDate,
        endDate,
        newUsers: Number(r.new_users) || 0,
        newPets: Number(r.new_pets) || 0,
        healthRecords: Number(r.health_records) || 0,
        vaccinationsGiven: Number(r.vaccinations_given) || 0,
        exerciseLogs: Number(r.exercise_logs) || 0,
        remindersDue: Number(r.reminders_due) || 0,
        appointments: Number(r.appointments) || 0,
        notifications: Number(r.notifications) || 0,
        auditEvents: Number(r.audit_events) || 0,
        missedVaccinations: Number(missed[0]?.c) || 0,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Report failed." })
    }
  })

  app.get("/api/admin/reports/transaction-history", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const limit = Math.max(1, Math.min(500, Number.parseInt(String(req.query.limit || "100"), 10) || 100))
      const rows = await query(
        `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at,
                u.email AS user_email, u.name AS user_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT ?`,
        [limit],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          userEmail: r.user_email || "",
          userName: r.user_name || "",
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id ? String(r.entity_id) : "",
          detail: r.detail || "",
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load transaction history." })
    }
  })

  app.get("/api/admin/reports/activity-logs", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const limit = Math.max(1, Math.min(500, Number.parseInt(String(req.query.limit || "100"), 10) || 100))
      const rows = await query(
        `SELECT a.id, a.user_id, a.activity_type, a.title, a.description, a.pet_name, a.occurred_at,
                u.email AS user_email, u.name AS user_name
         FROM activities a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.occurred_at DESC
         LIMIT ?`,
        [limit],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          userEmail: r.user_email || "",
          userName: r.user_name || "",
          type: r.activity_type,
          title: r.title,
          description: r.description || "",
          petName: r.pet_name || "",
          occurredAt: r.occurred_at,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load activity logs." })
    }
  })

  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res)
      if (!admin) return
      const targetId = String(req.params.id || "").trim()
      if (!targetId) {
        return res.status(400).json({ error: "Invalid user id." })
      }
      if (targetId === String(admin.id)) {
        return res.status(400).json({ error: "You cannot delete your own account while logged in." })
      }
      const rows = await query("SELECT id FROM users WHERE id = ? LIMIT 1", [targetId])
      if (!rows.length) {
        return res.status(404).json({ error: "User not found." })
      }
      await query("DELETE FROM users WHERE id = ?", [targetId])
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not delete user." })
    }
  })
}
