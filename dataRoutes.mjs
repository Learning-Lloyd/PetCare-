/**
 * Authenticated CRUD for PetCare (pets, records, schedule, etc.)
 * @param {import('express').Application} app
 */
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { generateSlotsFromSettings, normalizeTime } from "./bookingUtils.mjs"

export function registerDataRoutes(app, { query, getUserFromAuthHeader }) {
  async function requireUser(req, res) {
    const user = await getUserFromAuthHeader(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return null
    }
    return user
  }

  async function assertPetOwner(petId, userId) {
    const rows = await query("SELECT id, name FROM pets WHERE id = ? AND user_id = ? LIMIT 1", [
      petId,
      userId,
    ])
    return rows[0] || null
  }

  async function pushNotification(userId, title, message, notifType = "info") {
    await query(`INSERT INTO notifications (user_id, title, message, notif_type) VALUES (?, ?, ?, ?)`, [
      userId,
      String(title).slice(0, 200),
      String(message).slice(0, 4000),
      notifType,
    ])
  }

  async function isVetUser(vetId) {
    const rows = await query(
      `SELECT id FROM users WHERE id = ? AND is_vet = 1 AND (is_active IS NULL OR is_active = 1) LIMIT 1`,
      [vetId],
    )
    return rows[0] || null
  }

  /** Returns true if (vet, date, time) is blocked by another appointment. */
  async function slotTakenByOther(vetId, dateStr, timeNorm, excludeApptId) {
    if (!vetId || !dateStr || !timeNorm) return false
    const ex = excludeApptId != null && excludeApptId !== "" ? String(excludeApptId) : "0"
    const rows = await query(
      `SELECT id FROM appointments
       WHERE vet_user_id = ?
         AND id <> ?
         AND (
           (status IN ('Pending','Confirmed') AND appt_date = ? AND appt_time = ?)
           OR (status = 'Rescheduled' AND proposed_appt_date = ? AND proposed_appt_time = ?)
         )
       LIMIT 1`,
      [vetId, ex, dateStr, timeNorm, dateStr, timeNorm],
    )
    return rows.length > 0
  }

  async function loadVetBookingSettings(vetId) {
    const rows = await query(`SELECT day_start, day_end, slot_minutes FROM vet_booking_settings WHERE vet_user_id = ? LIMIT 1`, [
      vetId,
    ])
    if (rows.length) {
      const r = rows[0]
      return {
        dayStart: r.day_start,
        dayEnd: r.day_end,
        slotMinutes: Number(r.slot_minutes) || 30,
      }
    }
    return { dayStart: "09:00:00", dayEnd: "17:00:00", slotMinutes: 30 }
  }

  async function logActivity(userId, activityType, title, description, petName) {
    await query(
      `INSERT INTO activities (user_id, activity_type, title, description, pet_name, occurred_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [userId, activityType, title, description, petName],
    )
  }

  function escapeXml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;")
  }

  function stableHueFromString(s) {
    const h = crypto.createHash("sha256").update(String(s || ""), "utf8").digest()
    return h[0] % 360
  }

  function generatedPetSvg({ name, type }) {
    const n = String(name || "Pet")
    const t = String(type || "Other")
    const hue = stableHueFromString(`${t}:${n}`)
    const bg = `hsl(${hue} 70% 92%)`
    const accent = `hsl(${hue} 55% 46%)`
    const ink = "rgba(26,32,44,0.85)"

    const label = `${t} • ${n}`
    const safeLabel = escapeXml(label)

    // Simple, friendly icon per type (pure SVG, no external fetch).
    const icon =
      t.toLowerCase() === "dog"
        ? `<path d="M116 130c-18-34-55-54-78-60-10-3-18 6-15 16 9 33 19 82 13 105-4 16 8 30 25 30h20c20 0 36-12 45-28" fill="#C48A5A"/>
           <path d="M396 130c18-34 55-54 78-60 10-3 18 6 15 16-9 33-19 82-13 105 4 16-8 30-25 30h-20c-20 0-36-12-45-28" fill="#C48A5A"/>
           <path d="M256 74c-92 0-166 60-166 146 0 107 65 174 166 174s166-67 166-174c0-86-74-146-166-146z" fill="#E6B07A"/>
           <ellipse cx="194" cy="230" rx="18" ry="22" fill="${ink}"/>
           <ellipse cx="318" cy="230" rx="18" ry="22" fill="${ink}"/>
           <path d="M256 264c-20 0-38 11-38 27 0 18 18 34 38 34s38-16 38-34c0-16-18-27-38-27z" fill="${ink}"/>
           <path d="M184 312c20 24 44 38 72 38s52-14 72-38" fill="none" stroke="${ink}" stroke-opacity="0.45" stroke-width="12" stroke-linecap="round"/>`
        : t.toLowerCase() === "cat"
          ? `<path d="M256 86c-82 0-150 56-150 136 0 102 58 172 150 172s150-70 150-172c0-80-68-136-150-136z" fill="#D8B07A"/>
             <path d="M160 112l-42 52c18-6 34-6 48 0l-6-52z" fill="#C7925A"/>
             <path d="M352 112l42 52c-18-6-34-6-48 0l6-52z" fill="#C7925A"/>
             <ellipse cx="206" cy="230" rx="16" ry="20" fill="${ink}"/>
             <ellipse cx="306" cy="230" rx="16" ry="20" fill="${ink}"/>
             <path d="M256 258c-14 0-26 8-26 18 0 12 12 22 26 22s26-10 26-22c0-10-12-18-26-18z" fill="${ink}"/>
             <path d="M196 292c18 16 38 24 60 24s42-8 60-24" fill="none" stroke="${ink}" stroke-opacity="0.45" stroke-width="10" stroke-linecap="round"/>
             <path d="M170 256h-34m34 18h-30m202-18h34m-34 18h30" stroke="${ink}" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round"/>`
          : t.toLowerCase() === "bird"
            ? `<path d="M256 120c-74 0-134 52-134 128 0 92 58 152 134 152s134-60 134-152c0-76-60-128-134-128z" fill="#9CC7E8"/>
               <path d="M188 268c34 32 102 32 136 0-8 46-44 76-68 82-24-6-60-36-68-82z" fill="${accent}" opacity="0.9"/>
               <circle cx="214" cy="230" r="14" fill="${ink}"/>
               <circle cx="298" cy="230" r="14" fill="${ink}"/>
               <path d="M256 248l-22 18 22 14 22-14-22-18z" fill="#F2B90C"/>`
            : t.toLowerCase() === "rabbit"
              ? `<path d="M256 120c-74 0-134 52-134 128 0 92 58 152 134 152s134-60 134-152c0-76-60-128-134-128z" fill="#E9D7EE"/>
                 <path d="M200 74c-26 12-42 58-28 86 18-10 38-10 56 0 6-34-4-76-28-86z" fill="#D8B9DE"/>
                 <path d="M312 74c26 12 42 58 28 86-18-10-38-10-56 0-6-34 4-76 28-86z" fill="#D8B9DE"/>
                 <circle cx="214" cy="236" r="14" fill="${ink}"/>
                 <circle cx="298" cy="236" r="14" fill="${ink}"/>
                 <path d="M256 260c-16 0-30 9-30 22 0 14 14 26 30 26s30-12 30-26c0-13-14-22-30-22z" fill="${ink}" opacity="0.85"/>`
              : `<path d="M256 120c-74 0-134 52-134 128 0 92 58 152 134 152s134-60 134-152c0-76-60-128-134-128z" fill="#DDE7F2"/>
                 <circle cx="214" cy="236" r="14" fill="${ink}"/>
                 <circle cx="298" cy="236" r="14" fill="${ink}"/>
                 <path d="M256 270c-18 0-34 10-34 24 0 16 16 30 34 30s34-14 34-30c0-14-16-24-34-24z" fill="${ink}" opacity="0.75"/>`

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeXml(label)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="white"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(30,60,90,0.14)"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="84" fill="url(#g)"/>
  <circle cx="256" cy="286" r="160" fill="${accent}" opacity="0.12"/>
  <g filter="url(#s)">
    ${icon}
  </g>
  <g>
    <rect x="96" y="404" width="320" height="56" rx="18" fill="rgba(255,255,255,0.75)" stroke="rgba(214,227,240,0.9)"/>
    <text x="256" y="440" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="16" fill="rgba(26,32,44,0.78)">${safeLabel}</text>
  </g>
</svg>`
  }

  function rowToPet(row) {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      name: row.name,
      type: row.pet_type || row.species || "Other",
      breed: row.breed || "",
      age: row.age_years != null ? Number(row.age_years) : 0,
      weight: row.weight_kg != null ? Number(row.weight_kg) : 0,
      healthCondition: row.health_condition || undefined,
      status: row.status || "Active",
      photo: row.photo_url || `/api/pets/${row.id}/photo.svg`,
      lastCheckup: row.last_checkup || null,
      nextVaccine: row.next_vaccine || null,
      createdAt: row.created_at,
    }
  }

  async function savePetPhotoFromDataUrl({ userId, petId, dataUrl }) {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""))
    if (!m) {
      const err = new Error("Invalid image payload. Please upload an image file.")
      err.statusCode = 400
      throw err
    }
    const mime = m[1].toLowerCase()
    const base64 = m[2]
    const buf = Buffer.from(base64, "base64")
    if (!buf.length) {
      const err = new Error("Empty image payload.")
      err.statusCode = 400
      throw err
    }
    // ~6MB cap after base64 decode (keeps things responsive in json uploads).
    if (buf.length > 6 * 1024 * 1024) {
      const err = new Error("Image too large. Please use a smaller photo (max ~6MB).")
      err.statusCode = 413
      throw err
    }

    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg"

    const fileName = `pet-${petId}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`
    const relDir = path.join("uploads", "pets", String(userId))
    const absDir = path.join(process.cwd(), relDir)
    await fs.mkdir(absDir, { recursive: true })
    const absPath = path.join(absDir, fileName)
    await fs.writeFile(absPath, buf)

    const urlPath = `/${relDir.replaceAll(path.sep, "/")}/${fileName}`
    return urlPath
  }

  function parseAttachmentsJson(raw) {
    if (raw == null) return []
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw)
        return Array.isArray(p) ? p.map(String).filter(Boolean) : []
      } catch {
        return []
      }
    }
    return []
  }

  const HEALTH_RECORD_ATTACHMENT_MIMES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  }

  async function saveHealthRecordAttachmentsFromDataUrls({ userId, petId, dataUrls }) {
    if (!Array.isArray(dataUrls) || !dataUrls.length) return []
    const maxFiles = 5
    const maxBytes = 5 * 1024 * 1024
    const out = []
    for (const dataUrl of dataUrls.slice(0, maxFiles)) {
      const m = /^data:([\w/.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""))
      if (!m) continue
      const mime = m[1].toLowerCase().split(";")[0].trim()
      const ext = HEALTH_RECORD_ATTACHMENT_MIMES[mime]
      if (!ext) continue
      const buf = Buffer.from(m[2], "base64")
      if (!buf.length || buf.length > maxBytes) continue
      const fileName = `hr-${petId}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`
      const relDir = path.join("uploads", "health-records", String(userId), String(petId))
      const absDir = path.join(process.cwd(), relDir)
      await fs.mkdir(absDir, { recursive: true })
      const absPath = path.join(absDir, fileName)
      await fs.writeFile(absPath, buf)
      out.push(`/${relDir.replaceAll(path.sep, "/")}/${fileName}`)
    }
    return out
  }

  function rowToHealthRecord(row) {
    return {
      id: String(row.id),
      petId: String(row.pet_id),
      petName: row.pet_name || "",
      type: row.record_type || "Check-up",
      date: row.record_date,
      notes: row.notes || "",
      attachments: parseAttachmentsJson(row.attachments_json),
      createdAt: row.created_at,
    }
  }

  function rowToVaccination(row) {
    return {
      id: String(row.id),
      petId: String(row.pet_id),
      petName: row.pet_name,
      vaccineName: row.vaccine_name,
      date: row.date_given,
      nextDueDate: row.next_due_date || null,
      status: row.status === "Done" || row.status === "Pending" ? row.status : "Pending",
      notes: row.notes || undefined,
    }
  }

  function rowToFeeding(row) {
    let days = []
    if (row.days_json != null) {
      try {
        days = typeof row.days_json === "string" ? JSON.parse(row.days_json) : row.days_json
      } catch {
        days = []
      }
    }
    return {
      id: String(row.id),
      petId: String(row.pet_id),
      petName: row.pet_name,
      time: row.time_of_day,
      portionSize: row.portion_size,
      foodType: row.food_type,
      completed: Boolean(row.completed),
      days: Array.isArray(days) ? days : [],
    }
  }

  function rowToExercise(row) {
    return {
      id: String(row.id),
      petId: String(row.pet_id),
      petName: row.pet_name,
      type: row.exercise_type,
      duration: Number(row.duration_minutes),
      caloriesBurned: row.calories_burned != null ? Number(row.calories_burned) : undefined,
      date: row.log_date,
      notes: row.notes || undefined,
    }
  }

  function rowToReminder(row) {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      petId: row.pet_id != null ? String(row.pet_id) : undefined,
      petName: row.pet_name || undefined,
      type: row.reminder_type,
      title: row.title,
      date: row.reminder_date,
      time: row.reminder_time || undefined,
      priority: row.priority,
      completed: Boolean(row.completed),
      description: row.description || undefined,
    }
  }

  function rowToAppointment(row) {
    return {
      id: String(row.id),
      petId: String(row.pet_id),
      petName: row.pet_name,
      vetId: row.vet_user_id != null ? String(row.vet_user_id) : undefined,
      vetName: row.vet_name || undefined,
      ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : undefined,
      reason: row.reason,
      date: row.appt_date,
      time: normalizeTime(row.appt_time),
      proposedDate: row.proposed_appt_date || undefined,
      proposedTime: row.proposed_appt_time ? normalizeTime(row.proposed_appt_time) : undefined,
      notes: row.notes || undefined,
      vetNotes: row.vet_notes || undefined,
      status: row.status,
    }
  }

  function rowToActivity(row) {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: row.activity_type,
      title: row.title,
      description: row.description,
      petName: row.pet_name,
      timestamp: row.occurred_at,
    }
  }

  function rowToNotification(row) {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      title: row.title,
      message: row.message,
      type: row.notif_type || "info",
      read: Boolean(row.is_read),
      createdAt: row.created_at,
    }
  }

  app.get("/api/pets", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT id, user_id, name, species, pet_type, breed, age_years, weight_kg, health_condition,
                status, photo_url, last_checkup, next_vaccine, birthdate, created_at
         FROM pets WHERE user_id = ? ORDER BY created_at DESC`,
        [user.id],
      )
      res.json(rows.map(rowToPet))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/pets", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const name = String(req.body?.name || "").trim()
      const type = String(req.body?.type || "Dog").trim()
      const breed = String(req.body?.breed || "").trim()
      const age = Number(req.body?.age)
      const weight = Number(req.body?.weight)
      const healthCondition = String(req.body?.healthCondition || "").trim() || null
      if (!name || !breed) {
        return res.status(400).json({ error: "Name and breed are required." })
      }
      const insResult = await query(
        `INSERT INTO pets (user_id, name, pet_type, breed, age_years, weight_kg, health_condition, status, species)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
        [user.id, name, type, breed, Number.isFinite(age) ? age : 0, Number.isFinite(weight) ? weight : 0, healthCondition, type],
      )
      const id = Number(insResult.insertId)
      const rows = await query(
        `SELECT id, user_id, name, species, pet_type, breed, age_years, weight_kg, health_condition,
                status, photo_url, last_checkup, next_vaccine, birthdate, created_at
         FROM pets WHERE id = ? LIMIT 1`,
        [id],
      )
      await logActivity(user.id, "health_record", `Added pet ${name}`, "New companion registered in your sanctuary.", name)
      res.status(201).json(rowToPet(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/pets/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const pet = await assertPetOwner(req.params.id, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const name = String(req.body?.name ?? "").trim()
      const type = String(req.body?.type ?? "").trim()
      const breed = String(req.body?.breed ?? "").trim()
      const age = Number(req.body?.age)
      const weight = Number(req.body?.weight)
      const healthCondition = String(req.body?.healthCondition || "").trim() || null
      if (!name || !breed) {
        return res.status(400).json({ error: "Name and breed are required." })
      }
      await query(
        `UPDATE pets SET name = ?, pet_type = ?, breed = ?, age_years = ?, weight_kg = ?, health_condition = ?, species = ?
         WHERE id = ? AND user_id = ?`,
        [
          name,
          type || "Dog",
          breed,
          Number.isFinite(age) ? age : 0,
          Number.isFinite(weight) ? weight : 0,
          healthCondition,
          type || "Dog",
          req.params.id,
          user.id,
        ],
      )
      const rows = await query(
        `SELECT id, user_id, name, species, pet_type, breed, age_years, weight_kg, health_condition,
                status, photo_url, last_checkup, next_vaccine, birthdate, created_at
         FROM pets WHERE id = ? LIMIT 1`,
        [req.params.id],
      )
      res.json(rowToPet(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  // Save a pet photo and persist it to pets.photo_url.
  app.post("/api/pets/:id/photo", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.params.id || "")
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })

      const photoUrl = await savePetPhotoFromDataUrl({
        userId: user.id,
        petId,
        dataUrl: req.body?.dataUrl,
      })

      await query(`UPDATE pets SET photo_url = ? WHERE id = ? AND user_id = ?`, [photoUrl, petId, user.id])
      const rows = await query(
        `SELECT id, user_id, name, species, pet_type, breed, age_years, weight_kg, health_condition,
                status, photo_url, last_checkup, next_vaccine, birthdate, created_at
         FROM pets WHERE id = ? LIMIT 1`,
        [petId],
      )
      res.json(rowToPet(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(e.statusCode || 500).json({ error: e.message })
    }
  })

  // Generated SVG fallback when no uploaded photo exists.
  app.get("/api/pets/:id/photo.svg", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.params.id || "")
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).send("Not found")

      const rows = await query(
        `SELECT id, name, pet_type, species FROM pets WHERE id = ? AND user_id = ? LIMIT 1`,
        [petId, user.id],
      )
      if (!rows.length) return res.status(404).send("Not found")
      const row = rows[0]
      const svg = generatedPetSvg({ name: row.name, type: row.pet_type || row.species || "Other" })
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8")
      // Cache a bit; changes only when name/type changes.
      res.setHeader("Cache-Control", "private, max-age=3600")
      res.status(200).send(svg)
    } catch (e) {
      console.error(e)
      res.status(500).send("Error")
    }
  })

  app.delete("/api/pets/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const pet = await assertPetOwner(req.params.id, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      await query("DELETE FROM pets WHERE id = ? AND user_id = ?", [req.params.id, user.id])
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  // Owner: share pet access with a veterinarian (by vet account email).
  app.get("/api/pets/:id/vet-shares", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const pet = await assertPetOwner(req.params.id, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const rows = await query(
        `SELECT s.id, s.vet_user_id, s.allow_medical_notes, s.created_at,
                u.email AS vet_email, u.name AS vet_name, u.vet_license_id AS vet_license_id
         FROM pet_vet_shares s
         INNER JOIN users u ON u.id = s.vet_user_id
         WHERE s.pet_id = ?
         ORDER BY s.created_at DESC`,
        [req.params.id],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          vetUserId: String(r.vet_user_id),
          vetEmail: r.vet_email,
          vetName: r.vet_name,
          vetLicenseId: r.vet_license_id || undefined,
          allowMedicalNotes: Boolean(r.allow_medical_notes),
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
      res.status(status).json({ error: e.code === "ER_NO_SUCH_TABLE" ? "Run npm run migrate to enable vet sharing." : e.message })
    }
  })

  app.post("/api/pets/:id/vet-shares", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.params.id || "")
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const vetEmail = String(req.body?.vetEmail || "")
        .trim()
        .toLowerCase()
      const allowMedicalNotes = req.body?.allowMedicalNotes !== false
      if (!vetEmail) {
        return res.status(400).json({ error: "vetEmail is required." })
      }
      const vets = await query(
        `SELECT id, email, name FROM users WHERE email = ? AND is_vet = 1 AND (is_active IS NULL OR is_active = 1) LIMIT 1`,
        [vetEmail],
      )
      if (!vets.length) {
        return res.status(404).json({ error: "No active veterinarian account with that email." })
      }
      const vetId = vets[0].id
      if (String(vetId) === String(user.id)) {
        return res.status(400).json({ error: "You cannot share a pet with your own account." })
      }
      await query(
        `INSERT INTO pet_vet_shares (pet_id, owner_user_id, vet_user_id, allow_medical_notes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE allow_medical_notes = VALUES(allow_medical_notes)`,
        [petId, user.id, vetId, allowMedicalNotes ? 1 : 0],
      )
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES (?, 'pet_share_vet', 'pet', ?, ?)`,
        [user.id, petId, JSON.stringify({ vetEmail, allowMedicalNotes })],
      )
      const rows = await query(
        `SELECT s.id, s.vet_user_id, s.allow_medical_notes, s.created_at,
                u.email AS vet_email, u.name AS vet_name, u.vet_license_id AS vet_license_id
         FROM pet_vet_shares s
         INNER JOIN users u ON u.id = s.vet_user_id
         WHERE s.pet_id = ? AND s.vet_user_id = ? LIMIT 1`,
        [petId, vetId],
      )
      const r = rows[0]
      res.status(201).json({
        id: String(r.id),
        vetUserId: String(r.vet_user_id),
        vetEmail: r.vet_email,
        vetName: r.vet_name,
        vetLicenseId: r.vet_license_id || undefined,
        allowMedicalNotes: Boolean(r.allow_medical_notes),
        createdAt: r.created_at,
      })
    } catch (e) {
      console.error(e)
      const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
      res.status(status).json({ error: e.code === "ER_NO_SUCH_TABLE" ? "Run npm run migrate to enable vet sharing." : e.message })
    }
  })

  app.delete("/api/pets/:id/vet-shares/:vetUserId", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.params.id || "")
      const vetUserId = String(req.params.vetUserId || "")
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const result = await query(
        `DELETE FROM pet_vet_shares WHERE pet_id = ? AND owner_user_id = ? AND vet_user_id = ?`,
        [petId, user.id, vetUserId],
      )
      const n = Number(result.affectedRows ?? 0)
      if (!n) return res.status(404).json({ error: "Share not found." })
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES (?, 'pet_unshare_vet', 'pet', ?, ?)`,
        [user.id, petId, JSON.stringify({ vetUserId })],
      )
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
      res.status(status).json({ error: e.code === "ER_NO_SUCH_TABLE" ? "Run npm run migrate." : e.message })
    }
  })

  // Owner: read clinical notes veterinarians recorded for this pet.
  app.get("/api/pets/:id/vet-health-notes", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.params.id || "")
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const rows = await query(
        `SELECT n.id, n.pet_id, n.vet_user_id, n.note_kind, n.body, n.created_at, u.name AS vet_name
         FROM vet_health_notes n
         INNER JOIN users u ON u.id = n.vet_user_id
         WHERE n.pet_id = ?
         ORDER BY n.created_at DESC`,
        [petId],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          vetUserId: String(r.vet_user_id),
          vetName: r.vet_name,
          noteKind: r.note_kind,
          body: r.body,
          createdAt: r.created_at,
        })),
      )
    } catch (e) {
      console.error(e)
      const status = e.code === "ER_NO_SUCH_TABLE" ? 503 : 500
      res.status(status).json({
        error:
          e.code === "ER_NO_SUCH_TABLE" ? "Run npm run migrate to enable vet health notes." : e.message,
      })
    }
  })

  app.get("/api/health-records", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT h.id, h.pet_id, h.title, h.notes, h.attachments_json, h.record_date, h.created_at, h.record_type, h.pet_name
         FROM health_records h
         INNER JOIN pets p ON h.pet_id = p.id
         WHERE p.user_id = ?
         ORDER BY h.record_date DESC, h.id DESC`,
        [user.id],
      )
      res.json(rows.map(rowToHealthRecord))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/health-records", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.body?.petId || "")
      const recordType = String(req.body?.recordType || "Check-up").trim()
      const recordDate = String(req.body?.date || "").trim()
      const notes = String(req.body?.notes || "").trim()
      if (!petId || !recordDate) {
        return res.status(400).json({ error: "petId and date are required." })
      }
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const attachmentInputs = Array.isArray(req.body?.attachments) ? req.body.attachments : []
      const attachmentUrls = await saveHealthRecordAttachmentsFromDataUrls({
        userId: user.id,
        petId,
        dataUrls: attachmentInputs,
      })
      const attachmentsJson = attachmentUrls.length ? JSON.stringify(attachmentUrls) : null
      const title = `${recordType} — ${pet.name}`
      const insResult = await query(
        `INSERT INTO health_records (pet_id, title, notes, attachments_json, record_date, record_type, pet_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [petId, title, notes || null, attachmentsJson, recordDate, recordType, pet.name],
      )
      const id = Number(insResult.insertId)
      const rows = await query(
        `SELECT id, pet_id, title, notes, attachments_json, record_date, created_at, record_type, pet_name
         FROM health_records WHERE id = ? LIMIT 1`,
        [id],
      )
      await logActivity(
        user.id,
        "health_record",
        `Health record for ${pet.name}`,
        notes || recordType,
        pet.name,
      )
      res.status(201).json(rowToHealthRecord(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/vaccinations", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT v.id, v.pet_id, v.pet_name, v.vaccine_name, v.date_given, v.next_due_date, v.status, v.notes
         FROM vaccinations v
         INNER JOIN pets p ON v.pet_id = p.id
         WHERE p.user_id = ?
         ORDER BY v.date_given DESC`,
        [user.id],
      )
      res.json(rows.map(rowToVaccination))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/vaccinations", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.body?.petId || "")
      const vaccineName = String(req.body?.vaccineName || "").trim()
      const dateGiven = String(req.body?.date || "").trim()
      const nextDue = String(req.body?.nextDueDate || "").trim() || null
      const notes = String(req.body?.notes || "").trim() || null
      const status = req.body?.status === "Done" ? "Done" : "Pending"
      if (!petId || !vaccineName || !dateGiven) {
        return res.status(400).json({ error: "petId, vaccineName, and date are required." })
      }
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const insResult = await query(
        `INSERT INTO vaccinations (pet_id, pet_name, vaccine_name, date_given, next_due_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [petId, pet.name, vaccineName, dateGiven, nextDue, status, notes],
      )
      const id = Number(insResult.insertId)
      const rows = await query(
        `SELECT id, pet_id, pet_name, vaccine_name, date_given, next_due_date, status, notes FROM vaccinations WHERE id = ?`,
        [id],
      )
      await logActivity(user.id, "vaccination", `${vaccineName} logged`, "Vaccination recorded.", pet.name)
      res.status(201).json(rowToVaccination(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/vaccinations/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const status = req.body?.status === "Done" ? "Done" : "Pending"
      const result = await query(
        `UPDATE vaccinations v
         INNER JOIN pets p ON v.pet_id = p.id
         SET v.status = ?
         WHERE v.id = ? AND p.user_id = ?`,
        [status, req.params.id, user.id],
      )
      const affected = Number(result.affectedRows ?? result.changedRows ?? 0)
      if (!affected) return res.status(404).json({ error: "Not found." })
      const rows = await query(`SELECT * FROM vaccinations WHERE id = ? LIMIT 1`, [req.params.id])
      res.json(rowToVaccination(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/feeding-schedules", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT f.* FROM feeding_schedules f
         INNER JOIN pets p ON f.pet_id = p.id WHERE p.user_id = ? ORDER BY f.time_of_day`,
        [user.id],
      )
      res.json(rows.map(rowToFeeding))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/feeding-schedules/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const completed = req.body?.completed ? 1 : 0
      const result = await query(
        `UPDATE feeding_schedules f
         INNER JOIN pets p ON f.pet_id = p.id
         SET f.completed = ?
         WHERE f.id = ? AND p.user_id = ?`,
        [completed, req.params.id, user.id],
      )
      const affected = Number(result.affectedRows ?? result.changedRows ?? 0)
      if (!affected) return res.status(404).json({ error: "Not found." })
      const rows = await query(`SELECT * FROM feeding_schedules WHERE id = ?`, [req.params.id])
      res.json(rowToFeeding(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/feeding-schedules", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.body?.petId || "")
      const time = String(req.body?.time || "").trim()
      const portionSize = String(req.body?.portionSize || "").trim()
      const foodType = String(req.body?.foodType || "").trim()
      const days = Array.isArray(req.body?.days) ? req.body.days : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      if (!petId || !time || !portionSize || !foodType) {
        return res.status(400).json({ error: "petId, time, portionSize, and foodType are required." })
      }
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const insResult = await query(
        `INSERT INTO feeding_schedules (pet_id, pet_name, time_of_day, portion_size, food_type, completed, days_json)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [petId, pet.name, time, portionSize, foodType, JSON.stringify(days)],
      )
      const id = Number(insResult.insertId)
      const rows = await query(`SELECT * FROM feeding_schedules WHERE id = ?`, [id])
      await logActivity(user.id, "feeding", `Feeding schedule for ${pet.name}`, `${time} — ${foodType}`, pet.name)
      res.status(201).json(rowToFeeding(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/exercises", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT e.* FROM exercise_logs e
         INNER JOIN pets p ON e.pet_id = p.id WHERE p.user_id = ? ORDER BY e.log_date DESC, e.id DESC`,
        [user.id],
      )
      res.json(rows.map(rowToExercise))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/exercises", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.body?.petId || "")
      const exerciseType = String(req.body?.type || "Walk").trim()
      const duration = Number(req.body?.duration)
      const calories = req.body?.caloriesBurned != null ? Number(req.body.caloriesBurned) : null
      const logDate = String(req.body?.date || "").trim()
      const notes = String(req.body?.notes || "").trim() || null
      if (!petId || !logDate || !Number.isFinite(duration)) {
        return res.status(400).json({ error: "petId, date, and duration are required." })
      }
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const insResult = await query(
        `INSERT INTO exercise_logs (pet_id, pet_name, exercise_type, duration_minutes, calories_burned, log_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [petId, pet.name, exerciseType, duration, calories, logDate, notes],
      )
      const id = Number(insResult.insertId)
      const rows = await query(`SELECT * FROM exercise_logs WHERE id = ?`, [id])
      await logActivity(user.id, "exercise", `${exerciseType} for ${pet.name}`, `${duration} minutes logged.`, pet.name)
      res.status(201).json(rowToExercise(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/reminders", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT * FROM reminders WHERE user_id = ? ORDER BY reminder_date ASC, id ASC`,
        [user.id],
      )
      res.json(rows.map(rowToReminder))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/reminders", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const title = String(req.body?.title || "").trim()
      const reminderType = String(req.body?.type || "Medication").trim()
      const reminderDate = String(req.body?.date || "").trim()
      const reminderTime = String(req.body?.time || "").trim() || null
      const priority = String(req.body?.priority || "Routine").trim()
      const description = String(req.body?.description || "").trim() || null
      let petId = req.body?.petId != null && req.body.petId !== "" ? String(req.body.petId) : null
      let petName = null
      if (petId) {
        const pet = await assertPetOwner(petId, user.id)
        if (!pet) return res.status(404).json({ error: "Pet not found." })
        petName = pet.name
      }
      if (!title || !reminderDate) {
        return res.status(400).json({ error: "title and date are required." })
      }
      const insResult = await query(
        `INSERT INTO reminders (user_id, pet_id, pet_name, reminder_type, title, reminder_date, reminder_time, priority, completed, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [user.id, petId, petName, reminderType, title, reminderDate, reminderTime, priority, description],
      )
      const id = Number(insResult.insertId)
      const rows = await query(`SELECT * FROM reminders WHERE id = ?`, [id])
      res.status(201).json(rowToReminder(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/reminders/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const completed = Boolean(req.body?.completed)
      const result = await query(`UPDATE reminders SET completed = ? WHERE id = ? AND user_id = ?`, [
        completed ? 1 : 0,
        req.params.id,
        user.id,
      ])
      const affected = Number(result.affectedRows ?? result.changedRows ?? 0)
      if (!affected) return res.status(404).json({ error: "Not found." })
      const rows = await query(`SELECT * FROM reminders WHERE id = ?`, [req.params.id])
      res.json(rowToReminder(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/vets", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT id, name, email, avatar_url, vet_license_id FROM users
         WHERE is_vet = 1 AND (is_active IS NULL OR is_active = 1)
         ORDER BY name ASC`,
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          name: r.name,
          email: r.email,
          avatar: r.avatar_url || undefined,
          vetLicenseId: r.vet_license_id ? String(r.vet_license_id) : undefined,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list veterinarians." })
    }
  })

  app.get("/api/vets/:vetId/slots", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const vetId = String(req.params.vetId || "")
      const dateStr = String(req.query.date || "").trim()
      if (!vetId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: "vetId and query date=YYYY-MM-DD are required." })
      }
      if (!(await isVetUser(vetId))) {
        return res.status(404).json({ error: "Veterinarian not found." })
      }
      const { dayStart, dayEnd, slotMinutes } = await loadVetBookingSettings(vetId)
      const allSlots = generateSlotsFromSettings(dayStart, dayEnd, slotMinutes)
      const available = []
      for (const slot of allSlots) {
        const taken = await slotTakenByOther(vetId, dateStr, slot, null)
        if (!taken) available.push(slot)
      }
      res.json({ date: dateStr, vetId, slotMinutes, slots: available })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load slots." })
    }
  })

  app.get("/api/appointments", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT a.*, v.name AS vet_name
         FROM appointments a
         INNER JOIN pets p ON a.pet_id = p.id
         LEFT JOIN users v ON v.id = a.vet_user_id
         WHERE p.user_id = ? ORDER BY a.appt_date ASC, a.appt_time ASC`,
        [user.id],
      )
      res.json(rows.map(rowToAppointment))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.post("/api/appointments", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const petId = String(req.body?.petId || "")
      const vetId = String(req.body?.vetId || "")
      const reason = String(req.body?.reason || "").trim()
      const apptDate = String(req.body?.date || "").trim()
      const apptTimeRaw = String(req.body?.time || "").trim()
      const apptTime = normalizeTime(apptTimeRaw)
      const notes = String(req.body?.notes || "").trim() || null
      if (!petId || !vetId || !reason || !apptDate || !apptTime) {
        return res.status(400).json({ error: "petId, vetId, reason, date, and time are required." })
      }
      if (!(await isVetUser(vetId))) {
        return res.status(404).json({ error: "Veterinarian not found." })
      }
      const pet = await assertPetOwner(petId, user.id)
      if (!pet) return res.status(404).json({ error: "Pet not found." })
      const { dayStart, dayEnd, slotMinutes } = await loadVetBookingSettings(vetId)
      const allowed = new Set(generateSlotsFromSettings(dayStart, dayEnd, slotMinutes))
      if (!allowed.has(apptTime)) {
        return res.status(400).json({ error: "Selected time is outside this vet's bookable slots." })
      }
      if (await slotTakenByOther(vetId, apptDate, apptTime, null)) {
        return res.status(409).json({ error: "That time slot was just taken. Pick another slot." })
      }
      const insResult = await query(
        `INSERT INTO appointments (pet_id, vet_user_id, owner_user_id, pet_name, reason, appt_date, appt_time, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [petId, vetId, user.id, pet.name, reason, apptDate, apptTime, notes],
      )
      const id = Number(insResult.insertId)
      const rows = await query(
        `SELECT a.*, v.name AS vet_name FROM appointments a
         LEFT JOIN users v ON v.id = a.vet_user_id WHERE a.id = ? LIMIT 1`,
        [id],
      )
      await logActivity(user.id, "appointment", `Booking request: ${reason}`, `${apptDate} ${apptTime}`, pet.name)
      await pushNotification(
        vetId,
        "New appointment request",
        `${user.name} requested ${apptDate} ${apptTime} for ${pet.name} (${reason}).`,
        "info",
      )
      await pushNotification(
        user.id,
        "Booking submitted",
        `Request sent to the vet for ${pet.name} on ${apptDate} at ${apptTime} (pending approval).`,
        "info",
      )
      res.status(201).json(rowToAppointment(rows[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const id = String(req.params.id || "")
      const rows = await query(
        `SELECT a.* FROM appointments a
         INNER JOIN pets p ON a.pet_id = p.id
         WHERE a.id = ? AND p.user_id = ? LIMIT 1`,
        [id, user.id],
      )
      if (!rows.length) return res.status(404).json({ error: "Appointment not found." })
      const st = String(rows[0].status || "")
      if (st !== "Pending") {
        return res.status(400).json({ error: "Only pending requests can be cancelled by the owner." })
      }
      await query(`DELETE FROM appointments WHERE id = ?`, [id])
      res.status(204).end()
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const id = String(req.params.id || "")
      const accept = Boolean(req.body?.acceptProposed)
      const rows = await query(
        `SELECT a.* FROM appointments a
         INNER JOIN pets p ON a.pet_id = p.id
         WHERE a.id = ? AND p.user_id = ? LIMIT 1`,
        [id, user.id],
      )
      if (!rows.length) return res.status(404).json({ error: "Appointment not found." })
      const a = rows[0]
      if (String(a.status) !== "Rescheduled") {
        return res.status(400).json({ error: "No reschedule proposal is waiting on this appointment." })
      }
      const pd = a.proposed_appt_date ? String(a.proposed_appt_date).slice(0, 10) : ""
      const pt = a.proposed_appt_time ? normalizeTime(a.proposed_appt_time) : ""
      if (!pd || !pt) {
        return res.status(400).json({ error: "Missing proposed date/time from veterinarian." })
      }
      if (accept) {
        if (a.vet_user_id && (await slotTakenByOther(String(a.vet_user_id), pd, pt, id))) {
          return res.status(409).json({ error: "That slot is no longer available. Contact your vet." })
        }
        await query(
          `UPDATE appointments SET appt_date = ?, appt_time = ?, proposed_appt_date = NULL, proposed_appt_time = NULL, status = 'Confirmed' WHERE id = ?`,
          [pd, pt, id],
        )
        if (a.vet_user_id) {
          await pushNotification(
            String(a.vet_user_id),
            "Reschedule accepted",
            `${user.name} accepted the new time ${pd} ${pt} for ${a.pet_name}.`,
            "success",
          )
        }
        await pushNotification(
          user.id,
          "Appointment confirmed",
          `${a.pet_name}: your visit is confirmed for ${pd} at ${pt}.`,
          "success",
        )
      } else {
        await query(
          `UPDATE appointments SET proposed_appt_date = NULL, proposed_appt_time = NULL, status = 'Rejected' WHERE id = ?`,
          [id],
        )
        if (a.vet_user_id) {
          await pushNotification(
            String(a.vet_user_id),
            "Reschedule declined",
            `${user.name} declined the proposed new time for ${a.pet_name}.`,
            "warning",
          )
        }
        await pushNotification(
          user.id,
          "Appointment update",
          `You declined the new time for ${a.pet_name}. This booking is closed.`,
          "info",
        )
      }
      const out = await query(
        `SELECT a.*, v.name AS vet_name FROM appointments a
         LEFT JOIN users v ON v.id = a.vet_user_id WHERE a.id = ? LIMIT 1`,
        [id],
      )
      res.json(rowToAppointment(out[0]))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/activities", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT * FROM activities WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 50`,
        [user.id],
      )
      res.json(rows.map(rowToActivity))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/api/notifications", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const rows = await query(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
        [user.id],
      )
      res.json(rows.map(rowToNotification))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      await query(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [
        req.params.id,
        user.id,
      ])
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })
}
