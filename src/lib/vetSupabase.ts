import { supabase } from '@/lib/supabaseClient';
import { generateSlotsFromSettings, normalizeTime } from '@/lib/bookingSlots';
import { throwOnError } from '@/lib/supabaseHelpers';

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getShare(vetId: string, petId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('pet_vet_shares')
    .select('*')
    .eq('vet_user_id', vetId)
    .eq('pet_id', petId)
    .maybeSingle();
  throwOnError(error);
  return (data as Record<string, unknown> | null) ?? null;
}

async function slotTakenByOther(
  vetId: string,
  dateStr: string,
  timeNorm: string,
  excludeApptId: string,
): Promise<boolean> {
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id,status,appt_date,appt_time,proposed_appt_date,proposed_appt_time,vet_user_id')
    .eq('vet_user_id', vetId);
  throwOnError(error);
  for (const a of appts || []) {
    if (String(a.id) === excludeApptId) continue;
    const st = String(a.status);
    if (st === 'Pending' || st === 'Confirmed') {
      if (String(a.appt_date).slice(0, 10) === dateStr && normalizeTime(String(a.appt_time)) === timeNorm) {
        return true;
      }
    }
    if (st === 'Rescheduled' && a.proposed_appt_date && a.proposed_appt_time) {
      if (
        String(a.proposed_appt_date).slice(0, 10) === dateStr &&
        normalizeTime(String(a.proposed_appt_time)) === timeNorm
      ) {
        return true;
      }
    }
  }
  return false;
}

async function loadVetBookingSettingsRow(vetId: string): Promise<{
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
}> {
  const { data, error } = await supabase.from('vet_booking_settings').select('*').eq('vet_user_id', vetId).maybeSingle();
  throwOnError(error);
  if (!data) {
    return { dayStart: '09:00:00', dayEnd: '17:00:00', slotMinutes: 30 };
  }
  return {
    dayStart: String(data.day_start ?? '09:00:00'),
    dayEnd: String(data.day_end ?? '17:00:00'),
    slotMinutes: Number(data.slot_minutes) || 30,
  };
}

async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: string | null,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail != null ? String(detail).slice(0, 4000) : null,
  });
  throwOnError(error);
}

async function pushNotification(userId: string, title: string, message: string, notifType = 'info'): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title: String(title).slice(0, 200),
    message: String(message).slice(0, 4000),
    notif_type: notifType,
  });
  throwOnError(error);
}

export interface VetOverview {
  assignedPetsCount: number;
  upcomingVaccinations: number;
  pendingCheckups: number;
  recentMedicalUpdates: number;
  pendingBookingRequests?: number;
}

export async function fetchVetOverview(vetId: string): Promise<VetOverview> {
  const { data: shares, error: e1 } = await supabase.from('pet_vet_shares').select('pet_id').eq('vet_user_id', vetId);
  throwOnError(e1);
  const petIds = (shares || []).map((s) => String(s.pet_id));
  const assignedPetsCount = petIds.length;
  let upcomingVaccinations = 0;
  let pendingCheckups = 0;
  let recentMedicalUpdates = 0;
  const today = ymdToday();
  if (petIds.length) {
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const end = in30.toISOString().slice(0, 10);
    const { data: vaxRows } = await supabase
      .from('vaccinations')
      .select('id,status,next_due_date')
      .in('pet_id', petIds)
      .eq('status', 'Pending');
    upcomingVaccinations = (vaxRows || []).filter((v) => {
      const nd = v.next_due_date ? String(v.next_due_date).slice(0, 10) : '';
      return nd && nd <= end;
    }).length;

    const { data: apptRows } = await supabase
      .from('appointments')
      .select('id,status,appt_date')
      .in('pet_id', petIds);
    pendingCheckups = (apptRows || []).filter((a) => {
      const st = String(a.status);
      const d = a.appt_date ? String(a.appt_date).slice(0, 10) : '';
      return st === 'Pending' || (st === 'Confirmed' && d >= today);
    }).length;

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString();
    const { data: hrRows } = await supabase
      .from('health_records')
      .select('id,created_at')
      .in('pet_id', petIds)
      .gte('created_at', sinceIso);
    recentMedicalUpdates = hrRows?.length ?? 0;
  }
  const { data: bookRows, error: e2 } = await supabase
    .from('appointments')
    .select('id')
    .eq('vet_user_id', vetId)
    .eq('status', 'Pending');
  throwOnError(e2);
  const pendingBookingRequests = bookRows?.length ?? 0;
  return {
    assignedPetsCount,
    upcomingVaccinations,
    pendingCheckups,
    recentMedicalUpdates,
    pendingBookingRequests,
  };
}

export interface VetPetCard {
  id: string;
  name: string;
  type: string;
  breed: string;
  age: number;
  healthSummary: string;
  photo?: string;
  allowMedicalNotes: boolean;
  ownerName?: string;
}

export async function fetchVetPets(vetId: string, q: string): Promise<VetPetCard[]> {
  const { data: shares, error: e1 } = await supabase.from('pet_vet_shares').select('*').eq('vet_user_id', vetId);
  throwOnError(e1);
  if (!shares?.length) return [];
  const petIds = shares.map((s) => String(s.pet_id));
  const { data: pets, error: e2 } = await supabase.from('pets').select('*').in('id', petIds);
  throwOnError(e2);
  const ownerIds = [...new Set((pets || []).map((p) => String(p.user_id)).filter(Boolean))];
  const { data: owners } = await supabase.from('users').select('id,name').in('id', ownerIds);
  const ownerMap = Object.fromEntries((owners || []).map((u) => [String(u.id), String(u.name ?? '')]));
  const shareMap = Object.fromEntries(shares.map((s) => [String(s.pet_id), s]));
  const ql = q.trim().toLowerCase();
  const out: VetPetCard[] = [];
  for (const p of pets || []) {
    const name = String(p.name ?? '');
    const breed = String(p.breed ?? '');
    const ptype = String(p.pet_type || p.species || 'Other');
    if (ql) {
      if (!name.toLowerCase().includes(ql) && !breed.toLowerCase().includes(ql) && !ptype.toLowerCase().includes(ql)) {
        continue;
      }
    }
    const sh = shareMap[String(p.id)] as Record<string, unknown> | undefined;
    const nextV = p.next_vaccine;
    const hc = String(p.health_condition || '').trim();
    let needsAttention = false;
    if (hc && hc.toLowerCase() !== 'healthy') needsAttention = true;
    if (String(p.status || '') === 'Observational') needsAttention = true;
    if (nextVaccineDateIsPast(nextV)) needsAttention = true;
    out.push({
      id: String(p.id),
      name,
      type: ptype,
      breed,
      age: p.age_years != null ? Number(p.age_years) : 0,
      healthSummary: needsAttention ? 'Needs Attention' : 'Healthy',
      photo: p.photo_url ? String(p.photo_url) : undefined,
      allowMedicalNotes: Boolean(sh?.allow_medical_notes),
      ownerName: ownerMap[String(p.user_id)] || '',
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function nextVaccineDateIsPast(nextV: unknown): boolean {
  if (!nextV) return false;
  const d = new Date(String(nextV));
  return !Number.isNaN(d.getTime()) && d < new Date();
}

export interface VetHealthRec {
  id: string;
  type: string;
  date: string;
  notes: string;
  createdAt: string;
}

export async function fetchVetHealthRecords(
  vetId: string,
  petId: string,
  recordFrom?: string,
  recordTo?: string,
): Promise<VetHealthRec[]> {
  const share = await getShare(vetId, petId);
  if (!share) throw new Error('Pet not found or not shared with you.');
  let q = supabase
    .from('health_records')
    .select('*')
    .eq('pet_id', petId)
    .order('record_date', { ascending: false });
  if (recordFrom) q = q.gte('record_date', recordFrom);
  if (recordTo) q = q.lte('record_date', recordTo);
  const { data, error } = await q;
  throwOnError(error);
  return (data || []).map((r) => ({
    id: String(r.id),
    type: String(r.record_type || 'Check-up'),
    date: String(r.record_date).slice(0, 10),
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export interface VetVaxRow {
  id: string;
  petId: string;
  petName: string;
  vaccineName: string;
  date: string;
  nextDueDate?: string | null;
  status: string;
  notes?: string;
}

export async function fetchVetUpcomingVaccinations(vetId: string): Promise<VetVaxRow[]> {
  const { data: shares } = await supabase.from('pet_vet_shares').select('pet_id').eq('vet_user_id', vetId);
  const petIds = (shares || []).map((s) => String(s.pet_id));
  if (!petIds.length) return [];
  const end = new Date();
  end.setDate(end.getDate() + 30);
  const endStr = end.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('vaccinations')
    .select('*')
    .in('pet_id', petIds)
    .eq('status', 'Pending')
    .not('next_due_date', 'is', null)
    .lte('next_due_date', endStr);
  throwOnError(error);
  return (data || []).map(mapVax);
}

export async function fetchVetPetVaccinations(vetId: string, petId: string): Promise<VetVaxRow[]> {
  const share = await getShare(vetId, petId);
  if (!share) throw new Error('Not allowed for this pet.');
  const { data, error } = await supabase
    .from('vaccinations')
    .select('*')
    .eq('pet_id', petId)
    .order('date_given', { ascending: false });
  throwOnError(error);
  return (data || []).map(mapVax);
}

function mapVax(r: Record<string, unknown>): VetVaxRow {
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: String(r.pet_name),
    vaccineName: String(r.vaccine_name),
    date: String(r.date_given).slice(0, 10),
    nextDueDate: r.next_due_date ? String(r.next_due_date).slice(0, 10) : null,
    status: r.status === 'Done' || r.status === 'Pending' ? String(r.status) : 'Pending',
    notes: r.notes ? String(r.notes) : undefined,
  };
}

export interface VetNoteRow {
  id: string;
  noteKind: string;
  body: string;
  createdAt: string;
  vetName: string;
}

export async function fetchVetNotesForPet(vetId: string, petId: string): Promise<VetNoteRow[]> {
  const share = await getShare(vetId, petId);
  if (!share) throw new Error('Pet not found or not shared with you.');
  const { data: notes, error: e1 } = await supabase
    .from('vet_health_notes')
    .select('*')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });
  throwOnError(e1);
  const vetIds = [...new Set((notes || []).map((n) => String(n.vet_user_id)))];
  const { data: vets } = await supabase.from('users').select('id,name').in('id', vetIds);
  const vetNames = Object.fromEntries((vets || []).map((v) => [String(v.id), String(v.name ?? '')]));
  return (notes || []).map((n) => ({
    id: String(n.id),
    noteKind: String(n.note_kind),
    body: String(n.body),
    createdAt: String(n.created_at),
    vetName: vetNames[String(n.vet_user_id)] || 'Vet',
  }));
}

export interface VetApptRow {
  id: string;
  petId?: string;
  petName: string;
  ownerName: string;
  ownerEmail: string;
  reason: string;
  date: string;
  time: string;
  proposedDate?: string;
  proposedTime?: string;
  notes?: string;
  vetNotes?: string;
  status: string;
  vetUserId?: string;
  approvedAt?: string;
}

export async function fetchVetAppointments(vetId: string): Promise<VetApptRow[]> {
  const { data: shares } = await supabase.from('pet_vet_shares').select('pet_id').eq('vet_user_id', vetId);
  const sharedPetIds = (shares || []).map((s) => s.pet_id);
  const { data: byVet, error: e1 } = await supabase
    .from('appointments')
    .select('*')
    .eq('vet_user_id', vetId)
    .order('appt_date', { ascending: true })
    .limit(300);
  throwOnError(e1);
  let unassigned: Record<string, unknown>[] = [];
  if (sharedPetIds.length) {
    const { data: u, error: e2 } = await supabase
      .from('appointments')
      .select('*')
      .is('vet_user_id', null)
      .in('pet_id', sharedPetIds)
      .order('appt_date', { ascending: true })
      .limit(300);
    throwOnError(e2);
    unassigned = (u || []) as Record<string, unknown>[];
  }
  const merged = new Map<string, Record<string, unknown>>();
  for (const a of [...(byVet || []), ...unassigned]) merged.set(String((a as Record<string, unknown>).id), a as Record<string, unknown>);
  const filtered = [...merged.values()].sort(
    (x, y) => String(x.appt_date).localeCompare(String(y.appt_date)) || String(x.appt_time).localeCompare(String(y.appt_time)),
  );
  const petIds = [...new Set(filtered.map((a) => String(a.pet_id)))];
  const { data: pets } = await supabase.from('pets').select('id,name,user_id').in('id', petIds);
  const petMap = Object.fromEntries((pets || []).map((p) => [String(p.id), p]));
  const ownerIds = [...new Set((pets || []).map((p) => String(p.user_id)))];
  const { data: owners } = await supabase.from('users').select('id,name,email').in('id', ownerIds);
  const ownerMap = Object.fromEntries((owners || []).map((u) => [String(u.id), u]));

  return filtered.map((r) => {
    const pet = petMap[String(r.pet_id)] as Record<string, unknown> | undefined;
    const owner = pet ? ownerMap[String(pet.user_id)] : undefined;
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(pet?.name || r.pet_name),
      ownerName: owner ? String((owner as Record<string, unknown>).name || '') : '',
      ownerEmail: owner ? String((owner as Record<string, unknown>).email || '') : '',
      reason: String(r.reason),
      date: String(r.appt_date).slice(0, 10),
      time: normalizeTime(String(r.appt_time)),
      proposedDate: r.proposed_appt_date ? String(r.proposed_appt_date).slice(0, 10) : undefined,
      proposedTime: r.proposed_appt_time ? normalizeTime(String(r.proposed_appt_time)) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
      vetNotes: r.vet_notes ? String(r.vet_notes) : undefined,
      status: String(r.status),
      vetUserId: r.vet_user_id != null ? String(r.vet_user_id) : undefined,
      approvedAt: r.approved_at ? String(r.approved_at) : undefined,
    };
  });
}

export async function fetchVetBookingSettings(
  vetId: string,
): Promise<{ dayStart: string; dayEnd: string; slotMinutes: number }> {
  const row = await loadVetBookingSettingsRow(vetId);
  return {
    dayStart: normalizeTime(row.dayStart),
    dayEnd: normalizeTime(row.dayEnd),
    slotMinutes: row.slotMinutes,
  };
}

export async function saveVetBookingSettings(
  vetId: string,
  draft: { dayStart: string; dayEnd: string; slotMinutes: number },
): Promise<void> {
  const dayStart = normalizeTime(draft.dayStart);
  const dayEnd = normalizeTime(draft.dayEnd);
  let slotMinutes = Number(draft.slotMinutes);
  if (!Number.isFinite(slotMinutes)) slotMinutes = 30;
  slotMinutes = Math.min(120, Math.max(15, Math.round(slotMinutes)));
  const slots = generateSlotsFromSettings(`${dayStart}:00`, `${dayEnd}:00`, slotMinutes);
  if (!slots.length) throw new Error('dayEnd must be after dayStart with at least one slot.');
  const { error } = await supabase.from('vet_booking_settings').upsert(
    {
      vet_user_id: vetId,
      day_start: `${dayStart}:00`,
      day_end: `${dayEnd}:00`,
      slot_minutes: slotMinutes,
    },
    { onConflict: 'vet_user_id' },
  );
  throwOnError(error);
  await logAudit(vetId, 'update', 'vet_booking_settings', vetId, `hours ${dayStart}-${dayEnd} every ${slotMinutes}m`);
}

export async function postVetNote(vetId: string, petId: string, noteKind: string, body: string): Promise<void> {
  const share = await getShare(vetId, petId);
  if (!share) throw new Error('Pet not found or not shared with you.');
  const { error } = await supabase.from('vet_health_notes').insert({
    pet_id: petId,
    vet_user_id: vetId,
    note_kind: noteKind,
    body,
  });
  throwOnError(error);
}

export async function patchVetVaccination(
  vetId: string,
  vetName: string,
  vaxId: string,
  body: { status?: 'Done' | 'Pending'; remarks?: string | null; notesAppend?: boolean },
): Promise<void> {
  const { data: row, error: e1 } = await supabase.from('vaccinations').select('id,pet_id,notes').eq('id', vaxId).maybeSingle();
  throwOnError(e1);
  if (!row) throw new Error('Vaccination not found.');
  const petId = String(row.pet_id);
  const share = await getShare(vetId, petId);
  if (!share) throw new Error('Not allowed for this pet.');
  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.remarks != null) {
    const remarks = String(body.remarks).trim();
    const prev = row.notes != null ? String(row.notes) : '';
    if (body.notesAppend) {
      const line = `[Vet ${vetName}] ${remarks}`;
      updates.notes = prev ? `${prev}\n${line}` : line;
    } else {
      updates.notes = remarks || null;
    }
  }
  if (!Object.keys(updates).length) throw new Error('Nothing to update.');
  const { error: e2 } = await supabase.from('vaccinations').update(updates).eq('id', vaxId);
  throwOnError(e2);
  await logAudit(
    vetId,
    'vaccination_update',
    'vaccination',
    vaxId,
    JSON.stringify({ petId, status: body.status, remarks: body.remarks }),
  );
}

export async function patchVetAppointment(
  vetId: string,
  _vetName: string,
  id: string,
  reqBody: Record<string, unknown>,
): Promise<void> {
  const action = String(reqBody.action || '').toLowerCase();
  const { data: a, error: e1 } = await supabase.from('appointments').select('*').eq('id', id).maybeSingle();
  throwOnError(e1);
  if (!a) throw new Error('Appointment not found or not assigned to you.');

  const { data: petRow } = await supabase.from('pets').select('id,user_id,name').eq('id', a.pet_id).maybeSingle();
  const ownerFromPet = petRow?.user_id != null ? String(petRow.user_id) : '';
  const ownerId = a.owner_user_id != null ? String(a.owner_user_id) : ownerFromPet;
  const petLabel = (petRow?.name as string) || String(a.pet_name || '');
  const vetNotesIn = String(reqBody.vetNotes || '').trim() || null;

  const canAccess =
    String(a.vet_user_id) === vetId ||
    (a.vet_user_id == null && (await getShare(vetId, String(a.pet_id))) != null);
  if (!canAccess) throw new Error('Appointment not found or not assigned to you.');

  if (action === 'accept') {
    if (String(a.status) !== 'Pending') throw new Error('Only pending requests can be accepted.');
    if (a.vet_user_id && String(a.vet_user_id) !== String(vetId)) throw new Error('Not your booking.');
    if (!a.vet_user_id) {
      await supabase.from('appointments').update({ vet_user_id: vetId }).eq('id', id);
    }
    const d = String(a.appt_date).slice(0, 10);
    const t = normalizeTime(String(a.appt_time));
    if (await slotTakenByOther(vetId, d, t, id)) throw new Error('That slot is no longer available.');
    const { error: e2 } = await supabase
      .from('appointments')
      .update({ status: 'Confirmed', vet_user_id: vetId, approved_at: new Date().toISOString() })
      .eq('id', id);
    throwOnError(e2);
    if (ownerId) {
      await pushNotification(
        ownerId,
        'Appointment confirmed',
        `${petLabel}: your visit on ${d} at ${t} is confirmed.`,
        'success',
      );
    }
    await logAudit(vetId, 'accept', 'appointment', id, `Confirmed ${d} ${t}`);
  } else if (action === 'reject') {
    if (String(a.status) !== 'Pending' && String(a.status) !== 'Rescheduled') {
      throw new Error('Nothing to reject for this appointment.');
    }
    const { error: e3 } = await supabase
      .from('appointments')
      .update({
        status: 'Rejected',
        proposed_appt_date: null,
        proposed_appt_time: null,
        approved_at: null,
      })
      .eq('id', id);
    throwOnError(e3);
    if (ownerId) {
      await pushNotification(ownerId, 'Appointment update', `Your booking for ${petLabel} was declined.`, 'warning');
    }
    await logAudit(vetId, 'reject', 'appointment', id, 'Rejected');
  } else if (action === 'reschedule') {
    const pd = String(reqBody.proposedDate || '').trim();
    const pt = normalizeTime(String(reqBody.proposedTime || '').trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pd) || !pt) {
      throw new Error('proposedDate (YYYY-MM-DD) and proposedTime are required.');
    }
    const st = String(a.status);
    if (st !== 'Pending' && st !== 'Confirmed') {
      throw new Error('Can only suggest a new time for pending or confirmed visits.');
    }
    const vidStr = a.vet_user_id ? String(a.vet_user_id) : String(vetId);
    if (a.vet_user_id && String(a.vet_user_id) !== String(vetId)) throw new Error('Not your booking.');
    const { dayStart, dayEnd, slotMinutes } = await loadVetBookingSettingsRow(vidStr);
    const allowed = new Set(generateSlotsFromSettings(dayStart, dayEnd, slotMinutes));
    if (!allowed.has(pt)) throw new Error('Proposed time is outside your published slot grid.');
    if (await slotTakenByOther(vidStr, pd, pt, id)) throw new Error('That slot is already booked.');
    if (!a.vet_user_id) {
      await supabase.from('appointments').update({ vet_user_id: vetId }).eq('id', id);
    }
    const { error: e4 } = await supabase
      .from('appointments')
      .update({ proposed_appt_date: pd, proposed_appt_time: pt, status: 'Rescheduled' })
      .eq('id', id);
    throwOnError(e4);
    if (ownerId) {
      await pushNotification(
        ownerId,
        'New time suggested',
        `${petLabel}: your vet suggests ${pd} at ${pt}. Open Schedule to accept or decline.`,
        'info',
      );
    }
    await logAudit(vetId, 'reschedule', 'appointment', id, `Proposed ${pd} ${pt}`);
  } else if (action === 'complete') {
    if (String(a.status) !== 'Confirmed') throw new Error('Only confirmed visits can be marked complete.');
    const d = String(a.appt_date).slice(0, 10);
    const today = ymdToday();
    if (d > today) throw new Error('Cannot complete a visit before its date.');
    const mergedNotes = vetNotesIn != null ? vetNotesIn : (a.vet_notes as string | null);
    const { error: e5 } = await supabase.from('appointments').update({ status: 'Completed', vet_notes: mergedNotes }).eq('id', id);
    throwOnError(e5);
    if (ownerId) {
      await pushNotification(ownerId, 'Visit completed', `${petLabel}: your appointment was marked completed.`, 'success');
    }
    await logAudit(vetId, 'complete', 'appointment', id, 'Completed');
  } else if (action === 'missed') {
    if (String(a.status) !== 'Confirmed') throw new Error('Only confirmed visits can be marked missed.');
    const d = String(a.appt_date).slice(0, 10);
    const today = ymdToday();
    if (d > today) throw new Error('Cannot mark missed before the appointment date.');
    const mergedNotesMissed = vetNotesIn != null ? vetNotesIn : (a.vet_notes as string | null);
    const { error: e6 } = await supabase.from('appointments').update({ status: 'Missed', vet_notes: mergedNotesMissed }).eq('id', id);
    throwOnError(e6);
    if (ownerId) {
      await pushNotification(
        ownerId,
        'Missed appointment',
        `${petLabel}: the visit was marked as missed (no-show).`,
        'warning',
      );
    }
    await logAudit(vetId, 'missed', 'appointment', id, 'Missed');
  } else if (action === 'notes') {
    if (!vetNotesIn) throw new Error('vetNotes is required.');
    const { error: e7 } = await supabase.from('appointments').update({ vet_notes: vetNotesIn }).eq('id', id);
    throwOnError(e7);
    await logAudit(vetId, 'notes', 'appointment', id, 'Updated vet notes');
  } else {
    throw new Error('Unknown action. Use accept, reject, reschedule, complete, missed, or notes.');
  }
}

/** Vet top bar: DB notifications + derived vaccination / appointment alerts (mirrors vet API). */
export async function fetchVetAlerts(vetId: string): Promise<{ id: string; title: string; message: string; type: string }[]> {
  const { data: nRows, error: e1 } = await supabase
    .from('notifications')
    .select('id,title,message,notif_type,created_at')
    .eq('user_id', vetId)
    .order('created_at', { ascending: false })
    .limit(25);
  throwOnError(e1);
  const alerts: { id: string; title: string; message: string; type: string }[] = (nRows || []).map((n) => ({
    id: `db-${n.id}`,
    title: String(n.title),
    message: String(n.message),
    type: String(n.notif_type || 'info'),
  }));
  const { data: shares } = await supabase.from('pet_vet_shares').select('pet_id').eq('vet_user_id', vetId);
  const petIds = (shares || []).map((s) => String(s.pet_id));
  if (!petIds.length) return alerts;
  const today = ymdToday();
  const { data: missed } = await supabase
    .from('vaccinations')
    .select('id,pet_name,vaccine_name,next_due_date,pet_id')
    .in('pet_id', petIds)
    .eq('status', 'Pending')
    .not('next_due_date', 'is', null)
    .lt('next_due_date', today);
  for (const m of missed || []) {
    alerts.push({
      id: `mv-${m.id}`,
      title: 'Missed vaccination due date',
      message: `${m.pet_name} — ${m.vaccine_name} was due ${m.next_due_date}`,
      type: 'warning',
    });
  }
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const end = in14.toISOString().slice(0, 10);
  const { data: upcoming } = await supabase
    .from('vaccinations')
    .select('id,pet_name,vaccine_name,next_due_date')
    .in('pet_id', petIds)
    .eq('status', 'Pending')
    .not('next_due_date', 'is', null)
    .gte('next_due_date', today)
    .lte('next_due_date', end);
  for (const u of upcoming || []) {
    alerts.push({
      id: `uv-${u.id}`,
      title: 'Upcoming vaccination',
      message: `${u.pet_name} — ${u.vaccine_name} due ${u.next_due_date}`,
      type: 'info',
    });
  }
  const { data: overdueAppt } = await supabase
    .from('appointments')
    .select('id,pet_name,reason,appt_date,pet_id')
    .in('pet_id', petIds)
    .in('status', ['Pending', 'Confirmed'])
    .lt('appt_date', today);
  for (const a of overdueAppt || []) {
    alerts.push({
      id: `oa-${a.id}`,
      title: 'Overdue appointment',
      message: `${a.pet_name} — ${a.reason} (${a.appt_date})`,
      type: 'warning',
    });
  }
  return alerts;
}

export async function computeVetSlotsForDate(vetId: string, dateStr: string): Promise<string[]> {
  const { dayStart, dayEnd, slotMinutes } = await loadVetBookingSettingsRow(vetId);
  const allSlots = generateSlotsFromSettings(dayStart, dayEnd, slotMinutes);
  const taken = new Set<string>();
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id,status,appt_date,appt_time,proposed_appt_date,proposed_appt_time')
    .eq('vet_user_id', vetId);
  throwOnError(error);
  for (const a of appts || []) {
    const st = String(a.status);
    if (st === 'Pending' || st === 'Confirmed') {
      if (String(a.appt_date).slice(0, 10) === dateStr) taken.add(normalizeTime(String(a.appt_time)));
    }
    if (st === 'Rescheduled' && a.proposed_appt_date && a.proposed_appt_time) {
      if (String(a.proposed_appt_date).slice(0, 10) === dateStr) {
        taken.add(normalizeTime(String(a.proposed_appt_time)));
      }
    }
  }
  return allSlots.filter((s) => !taken.has(s));
}
