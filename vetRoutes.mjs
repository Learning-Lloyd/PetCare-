/**
 * Veterinarian-only API: assigned pets, medical read views, limited writes, audit trail.
 * @param {import('express').Application} app
 */
import { generateSlotsFromSettings, normalizeTime } from "./bookingUtils.mjs"

export function registerVetRoutes(app, { query, getUserFromAuthHeader }) {
  /** Same rules as server.mjs — session user flags can disagree with DB after role changes. */
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

  async function requireVet(req, res) {
    const user = await getUserFromAuthHeader(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return null
    }
    const flagRows = await query("SELECT is_vet FROM users WHERE id = ? LIMIT 1", [user.id])
    const isVetInDb = flagRows.length > 0 && mysqlTinynBool(flagRows[0].is_vet)
    if (!isVetInDb) {
      res.status(403).json({ error: "Veterinarian access required." })
      return null
    }
    return { ...user, isVet: true }
  }

  async function pushNotification(userId, title, message, notifType = "info") {
    await query(`INSERT INTO notifications (user_id, title, message, notif_type) VALUES (?, ?, ?, ?)`, [
      userId,
      String(title).slice(0, 200),
      String(message).slice(0, 4000),
      notifType,
    ])
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

  async function logAudit(userId, action, entityType, entityId, detail) {
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId != null ? String(entityId) : null, detail != null ? String(detail).slice(0, 4000) : null],
    )
  }

  async function getShare(vetId, petId) {
    const rows = await query(
      `SELECT id, pet_id, owner_user_id, vet_user_id, allow_medical_notes
       FROM pet_vet_shares WHERE vet_user_id = ? AND pet_id = ? LIMIT 1`,
      [vetId, petId],
    )
    return rows[0] || null
  }

  function rowToPetCard(row, share) {
    const nextV = row.next_vaccine
    const lastC = row.last_checkup
    let needsAttention = false
    const hc = String(row.health_condition || "").trim()
    if (hc && hc.toLowerCase() !== "healthy") needsAttention = true
    if (String(row.status || "") === "Observational") needsAttention = true
    if (row.next_vaccine) {
      const d = new Date(row.next_vaccine)
      if (!Number.isNaN(d.getTime()) && d < new Date()) needsAttention = true
    }
    return {
      id: String(row.id),
      name: row.name,
      type: row.pet_type || row.species || "Other",
      breed: row.breed || "",
      age: row.age_years != null ? Number(row.age_years) : 0,
      weight: row.weight_kg != null ? Number(row.weight_kg) : 0,
      healthCondition: row.health_condition || undefined,
      status: row.status || "Active",
      photo: row.photo_url || undefined,
      lastCheckup: lastC || null,
      nextVaccine: nextV || null,
      allowMedicalNotes: Boolean(share?.allow_medical_notes),
      healthSummary: needsAttention ? "Needs Attention" : "Healthy",
      ownerName: row.owner_name || "",
    }
  }

  app.get("/api/vet/overview", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const pidRows = await query(
        `SELECT pet_id FROM pet_vet_shares WHERE vet_user_id = ?`,
        [vet.id],
      )
      const petIds = pidRows.map((r) => r.pet_id)
      const assignedCount = petIds.length
      let upcomingVaccinations = 0
      let pendingCheckups = 0
      let recentMedicalUpdates = 0
      if (petIds.length) {
        const placeholders = petIds.map(() => "?").join(",")
        const vaxRows = await query(
          `SELECT COUNT(*) AS c FROM vaccinations
           WHERE pet_id IN (${placeholders})
             AND status = 'Pending'
             AND next_due_date IS NOT NULL
             AND next_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
          petIds,
        )
        upcomingVaccinations = Number(vaxRows[0]?.c) || 0

        const apptRows = await query(
          `SELECT COUNT(*) AS c FROM appointments
           WHERE pet_id IN (${placeholders})
             AND (
               status = 'Pending'
               OR (status = 'Confirmed' AND appt_date >= CURDATE())
             )`,
          petIds,
        )
        pendingCheckups = Number(apptRows[0]?.c) || 0

        const hrRows = await query(
          `SELECT COUNT(*) AS c FROM health_records
           WHERE pet_id IN (${placeholders}) AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 14 DAY)`,
          petIds,
        )
        recentMedicalUpdates = Number(hrRows[0]?.c) || 0
      }
      const bookNeed = await query(
        `SELECT COUNT(*) AS c FROM appointments WHERE vet_user_id = ? AND status = 'Pending'`,
        [vet.id],
      )
      const pendingBookingRequests = Number(bookNeed[0]?.c) || 0
      res.json({
        assignedPetsCount: assignedCount,
        upcomingVaccinations,
        pendingCheckups,
        recentMedicalUpdates,
        pendingBookingRequests,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Overview failed." })
    }
  })

  app.get("/api/vet/pets", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const q = String(req.query?.q || "").trim().toLowerCase()
      let sql = `
        SELECT p.id, p.user_id, p.name, p.species, p.pet_type, p.breed, p.age_years, p.weight_kg,
               p.health_condition, p.status, p.photo_url, p.last_checkup, p.next_vaccine, p.created_at,
               u.name AS owner_name, s.allow_medical_notes
        FROM pet_vet_shares s
        INNER JOIN pets p ON p.id = s.pet_id
        INNER JOIN users u ON u.id = p.user_id
        WHERE s.vet_user_id = ?
      `
      const args = [vet.id]
      if (q) {
        sql += ` AND (LOWER(p.name) LIKE ? OR LOWER(p.breed) LIKE ? OR LOWER(p.pet_type) LIKE ?)`
        const like = `%${q}%`
        args.push(like, like, like)
      }
      sql += ` ORDER BY p.name ASC`
      const rows = await query(sql, args)
      res.json(rows.map((row) => rowToPetCard(row, { allow_medical_notes: row.allow_medical_notes })))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not list pets." })
    }
  })

  app.get("/api/vet/pets/:id", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const petId = String(req.params.id || "")
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Pet not found or not shared with you." })
      const rows = await query(
        `SELECT p.id, p.user_id, p.name, p.species, p.pet_type, p.breed, p.age_years, p.weight_kg,
                p.health_condition, p.status, p.photo_url, p.last_checkup, p.next_vaccine, p.birthdate, p.created_at,
                u.name AS owner_name, u.email AS owner_email, s.allow_medical_notes
         FROM pet_vet_shares s
         INNER JOIN pets p ON p.id = s.pet_id
         INNER JOIN users u ON u.id = p.user_id
         WHERE s.vet_user_id = ? AND p.id = ? LIMIT 1`,
        [vet.id, petId],
      )
      if (!rows.length) return res.status(404).json({ error: "Not found." })
      const row = rows[0]
      res.json({
        ...rowToPetCard(row, share),
        ownerEmail: row.owner_email || "",
        birthdate: row.birthdate || null,
        allowMedicalNotes: Boolean(row.allow_medical_notes),
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load pet." })
    }
  })

  app.get("/api/vet/pets/:id/health-records", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const petId = String(req.params.id || "")
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Pet not found or not shared with you." })
      const from = String(req.query?.from || "").trim()
      const to = String(req.query?.to || "").trim()
      let sql = `
        SELECT h.id, h.pet_id, h.title, h.notes, h.attachments_json, h.record_date, h.created_at, h.record_type, h.pet_name
        FROM health_records h WHERE h.pet_id = ?
      `
      const args = [petId]
      if (from && to) {
        sql += ` AND h.record_date BETWEEN ? AND ?`
        args.push(from, to)
      } else if (from) {
        sql += ` AND h.record_date >= ?`
        args.push(from)
      } else if (to) {
        sql += ` AND h.record_date <= ?`
        args.push(to)
      }
      sql += ` ORDER BY h.record_date DESC, h.id DESC`
      const rows = await query(sql, args)
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
            petName: r.pet_name || "",
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
      res.status(500).json({ error: e.message || "Could not load records." })
    }
  })

  app.get("/api/vet/pets/:id/vaccinations", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const petId = String(req.params.id || "")
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Pet not found or not shared with you." })
      const rows = await query(
        `SELECT id, pet_id, pet_name, vaccine_name, date_given, next_due_date, status, notes
         FROM vaccinations WHERE pet_id = ? ORDER BY date_given DESC`,
        [petId],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_name,
          vaccineName: r.vaccine_name,
          date: r.date_given,
          nextDueDate: r.next_due_date || null,
          status: r.status === "Done" || r.status === "Pending" ? r.status : "Pending",
          notes: r.notes || undefined,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load vaccinations." })
    }
  })

  app.patch("/api/vet/vaccinations/:id", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const vaxId = String(req.params.id || "")
      const rows = await query(
        `SELECT v.id, v.pet_id FROM vaccinations v WHERE v.id = ? LIMIT 1`,
        [vaxId],
      )
      if (!rows.length) return res.status(404).json({ error: "Vaccination not found." })
      const petId = String(rows[0].pet_id)
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Not allowed for this pet." })

      const status = req.body?.status === "Done" ? "Done" : req.body?.status === "Pending" ? "Pending" : null
      const remarks = req.body?.remarks != null ? String(req.body.remarks).trim() : null
      const noteAppend = Boolean(req.body?.notesAppend)

      const sets = []
      const params = []
      if (status) {
        sets.push("status = ?")
        params.push(status)
      }
      if (remarks !== null) {
        if (noteAppend) {
          sets.push("notes = CONCAT(COALESCE(notes, ''), IF(COALESCE(notes,'')='','', CHAR(10)), ?)")
          params.push(`[Vet ${vet.name}] ${remarks}`)
        } else {
          sets.push("notes = ?")
          params.push(remarks || null)
        }
      }
      if (!sets.length) return res.status(400).json({ error: "Nothing to update." })

      params.push(vaxId)
      await query(`UPDATE vaccinations SET ${sets.join(", ")} WHERE id = ?`, params)

      const out = await query(`SELECT * FROM vaccinations WHERE id = ? LIMIT 1`, [vaxId])
      await logAudit(vet.id, "vaccination_update", "vaccination", vaxId, JSON.stringify({ petId, status, remarks }))
      const r = out[0]
      res.json({
        id: String(r.id),
        petId: String(r.pet_id),
        petName: r.pet_name,
        vaccineName: r.vaccine_name,
        date: r.date_given,
        nextDueDate: r.next_due_date || null,
        status: r.status === "Done" || r.status === "Pending" ? r.status : "Pending",
        notes: r.notes || undefined,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Update failed." })
    }
  })

  app.get("/api/vet/pets/:id/notes", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const petId = String(req.params.id || "")
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Pet not found or not shared with you." })
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
      res.status(500).json({ error: e.message || "Could not load notes." })
    }
  })

  app.post("/api/vet/pets/:id/notes", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const petId = String(req.params.id || "")
      const share = await getShare(vet.id, petId)
      if (!share) return res.status(404).json({ error: "Pet not found or not shared with you." })
      if (!share.allow_medical_notes) {
        return res.status(403).json({ error: "The owner has not allowed medical notes for this pet." })
      }
      const rawKind = String(req.body?.noteKind || "observation").toLowerCase()
      const noteKind = ["diagnosis", "observation", "recommendation"].includes(rawKind) ? rawKind : "observation"
      const body = String(req.body?.body || "").trim()
      if (!body) return res.status(400).json({ error: "Note body is required." })

      const ins = await query(
        `INSERT INTO vet_health_notes (pet_id, vet_user_id, note_kind, body) VALUES (?, ?, ?, ?)`,
        [petId, vet.id, noteKind, body],
      )
      const nid = ins.insertId
      await logAudit(vet.id, "vet_note_create", "vet_health_note", String(nid), JSON.stringify({ petId, noteKind }))
      const rows = await query(
        `SELECT n.id, n.pet_id, n.vet_user_id, n.note_kind, n.body, n.created_at, u.name AS vet_name
         FROM vet_health_notes n INNER JOIN users u ON u.id = n.vet_user_id WHERE n.id = ? LIMIT 1`,
        [nid],
      )
      const r = rows[0]
      res.status(201).json({
        id: String(r.id),
        petId: String(r.pet_id),
        vetUserId: String(r.vet_user_id),
        vetName: r.vet_name,
        noteKind: r.note_kind,
        body: r.body,
        createdAt: r.created_at,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not save note." })
    }
  })

  app.get("/api/vet/vaccinations/upcoming", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const rows = await query(
        `SELECT v.id, v.pet_id, v.pet_name, v.vaccine_name, v.date_given, v.next_due_date, v.status, v.notes, p.name AS pet_display_name
         FROM pet_vet_shares s
         INNER JOIN vaccinations v ON v.pet_id = s.pet_id
         INNER JOIN pets p ON p.id = v.pet_id
         WHERE s.vet_user_id = ?
           AND v.status = 'Pending'
           AND v.next_due_date IS NOT NULL
           AND v.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
         ORDER BY v.next_due_date ASC
         LIMIT 100`,
        [vet.id],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_display_name || r.pet_name,
          vaccineName: r.vaccine_name,
          date: r.date_given,
          nextDueDate: r.next_due_date || null,
          status: r.status,
          notes: r.notes || undefined,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load upcoming vaccinations." })
    }
  })

  app.get("/api/vet/booking-settings", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const s = await loadVetBookingSettings(vet.id)
      res.json({
        dayStart: normalizeTime(s.dayStart),
        dayEnd: normalizeTime(s.dayEnd),
        slotMinutes: s.slotMinutes,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load booking settings." })
    }
  })

  app.patch("/api/vet/booking-settings", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const dayStart = normalizeTime(String(req.body?.dayStart || "09:00"))
      const dayEnd = normalizeTime(String(req.body?.dayEnd || "17:00"))
      let slotMinutes = Number(req.body?.slotMinutes)
      if (!Number.isFinite(slotMinutes)) slotMinutes = 30
      slotMinutes = Math.min(120, Math.max(15, Math.round(slotMinutes)))
      const slots = generateSlotsFromSettings(`${dayStart}:00`, `${dayEnd}:00`, slotMinutes)
      if (!slots.length) {
        return res.status(400).json({ error: "dayEnd must be after dayStart with at least one slot." })
      }
      await query(
        `INSERT INTO vet_booking_settings (vet_user_id, day_start, day_end, slot_minutes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE day_start = VALUES(day_start), day_end = VALUES(day_end), slot_minutes = VALUES(slot_minutes)`,
        [vet.id, `${dayStart}:00`, `${dayEnd}:00`, slotMinutes],
      )
      await logAudit(vet.id, "update", "vet_booking_settings", vet.id, `hours ${dayStart}-${dayEnd} every ${slotMinutes}m`)
      res.json({ dayStart, dayEnd, slotMinutes })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not save booking settings." })
    }
  })

  app.get("/api/vet/appointments", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const rows = await query(
        `SELECT a.*, p.name AS pet_display_name, u.name AS owner_name, u.email AS owner_email
         FROM appointments a
         INNER JOIN pets p ON p.id = a.pet_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.vet_user_id = ?
            OR (a.vet_user_id IS NULL AND EXISTS (
              SELECT 1 FROM pet_vet_shares s WHERE s.pet_id = a.pet_id AND s.vet_user_id = ?
            ))
         ORDER BY a.appt_date ASC, a.appt_time ASC
         LIMIT 300`,
        [vet.id, vet.id],
      )
      res.json(
        rows.map((r) => ({
          id: String(r.id),
          petId: String(r.pet_id),
          petName: r.pet_display_name || r.pet_name,
          ownerName: r.owner_name || "",
          ownerEmail: r.owner_email || "",
          reason: r.reason,
          date: r.appt_date,
          time: normalizeTime(r.appt_time),
          proposedDate: r.proposed_appt_date || undefined,
          proposedTime: r.proposed_appt_time ? normalizeTime(r.proposed_appt_time) : undefined,
          notes: r.notes || undefined,
          vetNotes: r.vet_notes || undefined,
          status: r.status,
          vetUserId: r.vet_user_id != null ? String(r.vet_user_id) : undefined,
          approvedAt: r.approved_at || undefined,
        })),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not load appointments." })
    }
  })

  app.patch("/api/vet/appointments/:id", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const id = String(req.params.id || "")
      const action = String(req.body?.action || "").toLowerCase()
      const rows = await query(
        `SELECT a.*, COALESCE(a.owner_user_id, p.user_id) AS owner_user_id, p.name AS pet_display_name
         FROM appointments a
         INNER JOIN pets p ON p.id = a.pet_id
         WHERE a.id = ? AND (a.vet_user_id = ? OR (a.vet_user_id IS NULL AND EXISTS (
           SELECT 1 FROM pet_vet_shares s WHERE s.pet_id = a.pet_id AND s.vet_user_id = ?
         )))
         LIMIT 1`,
        [id, vet.id, vet.id],
      )
      if (!rows.length) {
        return res.status(404).json({ error: "Appointment not found or not assigned to you." })
      }
      const a = rows[0]
      const ownerId = a.owner_user_id != null ? String(a.owner_user_id) : ""
      const petLabel = a.pet_display_name || a.pet_name
      const vetNotesIn = String(req.body?.vetNotes || "").trim() || null

      if (action === "accept") {
        if (String(a.status) !== "Pending") {
          return res.status(400).json({ error: "Only pending requests can be accepted." })
        }
        if (a.vet_user_id && String(a.vet_user_id) !== String(vet.id)) {
          return res.status(403).json({ error: "Not your booking." })
        }
        if (!a.vet_user_id) {
          await query(`UPDATE appointments SET vet_user_id = ? WHERE id = ?`, [vet.id, id])
        }
        const vid = String(vet.id)
        const d = String(a.appt_date).slice(0, 10)
        const t = normalizeTime(a.appt_time)
        if (await slotTakenByOther(vid, d, t, id)) {
          return res.status(409).json({ error: "That slot is no longer available." })
        }
        await query(
          `UPDATE appointments SET status = 'Confirmed', vet_user_id = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [vet.id, id],
        )
        if (ownerId) {
          await pushNotification(
            ownerId,
            "Appointment confirmed",
            `${petLabel}: your visit on ${d} at ${t} is confirmed.`,
            "success",
          )
        }
        await logAudit(vet.id, "accept", "appointment", id, `Confirmed ${d} ${t}`)
      } else if (action === "reject") {
        if (String(a.status) !== "Pending" && String(a.status) !== "Rescheduled") {
          return res.status(400).json({ error: "Nothing to reject for this appointment." })
        }
        await query(
          `UPDATE appointments SET status = 'Rejected', proposed_appt_date = NULL, proposed_appt_time = NULL, approved_at = NULL WHERE id = ?`,
          [id],
        )
        if (ownerId) {
          await pushNotification(ownerId, "Appointment update", `Your booking for ${petLabel} was declined.`, "warning")
        }
        await logAudit(vet.id, "reject", "appointment", id, "Rejected")
      } else if (action === "reschedule") {
        const pd = String(req.body?.proposedDate || "").trim()
        const pt = normalizeTime(String(req.body?.proposedTime || "").trim())
        if (!/^\d{4}-\d{2}-\d{2}$/.test(pd) || !pt) {
          return res.status(400).json({ error: "proposedDate (YYYY-MM-DD) and proposedTime are required." })
        }
        const st = String(a.status)
        if (st !== "Pending" && st !== "Confirmed") {
          return res.status(400).json({ error: "Can only suggest a new time for pending or confirmed visits." })
        }
        const vid = a.vet_user_id ? String(a.vet_user_id) : String(vet.id)
        if (a.vet_user_id && String(a.vet_user_id) !== String(vet.id)) {
          return res.status(403).json({ error: "Not your booking." })
        }
        const { dayStart, dayEnd, slotMinutes } = await loadVetBookingSettings(vid)
        const allowed = new Set(generateSlotsFromSettings(dayStart, dayEnd, slotMinutes))
        if (!allowed.has(pt)) {
          return res.status(400).json({ error: "Proposed time is outside your published slot grid." })
        }
        if (await slotTakenByOther(vid, pd, pt, id)) {
          return res.status(409).json({ error: "That slot is already booked." })
        }
        if (!a.vet_user_id) {
          await query(`UPDATE appointments SET vet_user_id = ? WHERE id = ?`, [vet.id, id])
        }
        await query(
          `UPDATE appointments SET proposed_appt_date = ?, proposed_appt_time = ?, status = 'Rescheduled' WHERE id = ?`,
          [pd, pt, id],
        )
        if (ownerId) {
          await pushNotification(
            ownerId,
            "New time suggested",
            `${petLabel}: your vet suggests ${pd} at ${pt}. Open Schedule to accept or decline.`,
            "info",
          )
        }
        await logAudit(vet.id, "reschedule", "appointment", id, `Proposed ${pd} ${pt}`)
      } else if (action === "complete") {
        if (String(a.status) !== "Confirmed") {
          return res.status(400).json({ error: "Only confirmed visits can be marked complete." })
        }
        const d = String(a.appt_date).slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        if (d > today) {
          return res.status(400).json({ error: "Cannot complete a visit before its date." })
        }
        await query(`UPDATE appointments SET status = 'Completed', vet_notes = COALESCE(?, vet_notes) WHERE id = ?`, [
          vetNotesIn,
          id,
        ])
        if (ownerId) {
          await pushNotification(ownerId, "Visit completed", `${petLabel}: your appointment was marked completed.`, "success")
        }
        await logAudit(vet.id, "complete", "appointment", id, "Completed")
      } else if (action === "missed") {
        if (String(a.status) !== "Confirmed") {
          return res.status(400).json({ error: "Only confirmed visits can be marked missed." })
        }
        const d = String(a.appt_date).slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        if (d > today) {
          return res.status(400).json({ error: "Cannot mark missed before the appointment date." })
        }
        await query(`UPDATE appointments SET status = 'Missed', vet_notes = COALESCE(?, vet_notes) WHERE id = ?`, [
          vetNotesIn,
          id,
        ])
        if (ownerId) {
          await pushNotification(ownerId, "Missed appointment", `${petLabel}: the visit was marked as missed (no-show).`, "warning")
        }
        await logAudit(vet.id, "missed", "appointment", id, "Missed")
      } else if (action === "notes") {
        if (!vetNotesIn) {
          return res.status(400).json({ error: "vetNotes is required." })
        }
        await query(`UPDATE appointments SET vet_notes = ? WHERE id = ?`, [vetNotesIn, id])
        await logAudit(vet.id, "notes", "appointment", id, "Updated vet notes")
      } else {
        return res.status(400).json({ error: "Unknown action. Use accept, reject, reschedule, complete, missed, or notes." })
      }

      const out = await query(
        `SELECT a.*, p.name AS pet_display_name, u.name AS owner_name, u.email AS owner_email
         FROM appointments a
         INNER JOIN pets p ON p.id = a.pet_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.id = ? LIMIT 1`,
        [id],
      )
      const r = out[0]
      res.json({
        id: String(r.id),
        petId: String(r.pet_id),
        petName: r.pet_display_name || r.pet_name,
        ownerName: r.owner_name || "",
        ownerEmail: r.owner_email || "",
        reason: r.reason,
        date: r.appt_date,
        time: normalizeTime(r.appt_time),
        proposedDate: r.proposed_appt_date || undefined,
        proposedTime: r.proposed_appt_time ? normalizeTime(r.proposed_appt_time) : undefined,
        notes: r.notes || undefined,
        vetNotes: r.vet_notes || undefined,
        status: r.status,
        vetUserId: r.vet_user_id != null ? String(r.vet_user_id) : undefined,
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Could not update appointment." })
    }
  })

  app.get("/api/vet/notifications", async (req, res) => {
    try {
      const vet = await requireVet(req, res)
      if (!vet) return
      const nRows = await query(
        `SELECT id, title, message, notif_type, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`,
        [vet.id],
      )
      const alerts = nRows.map((n) => ({
        id: `db-${n.id}`,
        title: n.title,
        message: n.message,
        type: n.notif_type || "info",
        createdAt: n.created_at,
      }))
      const pidRows = await query(`SELECT pet_id FROM pet_vet_shares WHERE vet_user_id = ?`, [vet.id])
      const petIds = pidRows.map((r) => r.pet_id)
      if (petIds.length) {
        const ph = petIds.map(() => "?").join(",")
        const missed = await query(
          `SELECT v.id, v.pet_name, v.vaccine_name, v.next_due_date, p.name AS pet_name
           FROM vaccinations v
           INNER JOIN pets p ON p.id = v.pet_id
           WHERE v.pet_id IN (${ph})
             AND v.status = 'Pending'
             AND v.next_due_date IS NOT NULL
             AND v.next_due_date < CURDATE()`,
          petIds,
        )
        for (const m of missed) {
          alerts.push({
            id: `mv-${m.id}`,
            title: "Missed vaccination due date",
            message: `${m.pet_name} — ${m.vaccine_name} was due ${m.next_due_date}`,
            type: "warning",
            createdAt: new Date().toISOString(),
          })
        }
        const upcoming = await query(
          `SELECT v.id, v.pet_name, v.vaccine_name, v.next_due_date, p.name AS pet_name
           FROM vaccinations v
           INNER JOIN pets p ON p.id = v.pet_id
           WHERE v.pet_id IN (${ph})
             AND v.status = 'Pending'
             AND v.next_due_date IS NOT NULL
             AND v.next_due_date >= CURDATE()
             AND v.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)`,
          petIds,
        )
        for (const u of upcoming) {
          alerts.push({
            id: `uv-${u.id}`,
            title: "Upcoming vaccination",
            message: `${u.pet_name} — ${u.vaccine_name} due ${u.next_due_date}`,
            type: "info",
            createdAt: new Date().toISOString(),
          })
        }
        const overdueAppt = await query(
          `SELECT a.id, a.pet_name, a.reason, a.appt_date, p.name AS pet_name
           FROM appointments a
           INNER JOIN pets p ON p.id = a.pet_id
           WHERE a.pet_id IN (${ph})
             AND a.status IN ('Pending','Confirmed')
             AND a.appt_date < CURDATE()`,
          petIds,
        )
        for (const a of overdueAppt) {
          alerts.push({
            id: `oa-${a.id}`,
            title: "Missed checkup / appointment",
            message: `${a.pet_name} — ${a.reason} (${a.appt_date})`,
            type: "warning",
            createdAt: new Date().toISOString(),
          })
        }
      }
      res.json(alerts)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message || "Notifications failed." })
    }
  })
}
