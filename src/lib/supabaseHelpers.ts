import type { User } from '@/types';
import type { PostgrestError, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { generateSlotsFromSettings, normalizeTime } from '@/lib/bookingSlots';

export function throwOnError(error: PostgrestError | null): void {
  if (error) throw new Error(error.message);
}

/** Same `{ data, error }` shape as `supabase.from().select()` for empty stubs in parallel loads. */
export function emptySupabaseRows<T extends Record<string, unknown> = Record<string, unknown>>(): {
  data: T[]
  error: PostgrestError | null
} {
  return { data: [], error: null };
}

export async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not signed in');
  return user.id;
}

export async function fetchProfileRow(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  throwOnError(error);
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Creates the `public.users` profile row after Auth signup.
 * `id` must match `auth.users.id` (uuid). Duplicate key (e.g. existing trigger insert) is ignored.
 */
export async function insertPublicUserProfileFromAuth(params: {
  id: string;
  email: string;
  name: string;
}): Promise<PostgrestError | null> {
  const id = String(params.id).trim();
  const emailNorm = params.email.trim().toLowerCase();
  const displayName = params.name.trim() || emailNorm.split('@')[0] || 'User';

  const { error } = await supabase.from('users').insert({
    id,
    email: emailNorm,
    name: displayName,
    is_admin: 0,
    is_vet: 0,
    is_active: 1,
  });

  if (!error) return null;
  if (error.code === '23505') return null;
  return error;
}

export function toAppUser(supa: SupabaseAuthUser, profile: Record<string, unknown> | null): User {
  const meta = (supa.user_metadata || {}) as Record<string, unknown>;
  const name =
    (profile?.name as string) ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    supa.email?.split('@')[0] ||
    'User';
  const createdAt = (profile?.created_at as string) || supa.created_at || new Date().toISOString();
  const activeRaw = profile?.is_active;
  const isActive = activeRaw == null ? true : Boolean(activeRaw);
  return {
    id: String(supa.id),
    name,
    email: supa.email || '',
    avatar: (profile?.avatar_url as string) || (meta.avatar_url as string) || undefined,
    bio: (profile?.bio as string) || undefined,
    createdAt,
    isAdmin: Boolean(profile?.is_admin),
    isVet: Boolean(profile?.is_vet),
    vetLicenseId: profile?.vet_license_id != null ? String(profile.vet_license_id) : undefined,
    isActive,
  };
}

function parseJsonArray(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mapPetRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: r.name,
    type: r.pet_type || r.species || 'Other',
    breed: r.breed ?? '',
    age: r.age_years != null ? Number(r.age_years) : 0,
    weight: r.weight_kg != null ? Number(r.weight_kg) : 0,
    healthCondition: r.health_condition || undefined,
    status: r.status || 'Active',
    photo: r.photo_url != null && String(r.photo_url).trim() !== '' ? String(r.photo_url) : undefined,
    lastCheckup: r.last_checkup ?? null,
    nextVaccine: r.next_vaccine ?? null,
    createdAt: r.created_at,
  };
}

export function mapHealthRecordRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: r.pet_name ?? '',
    type: r.record_type || 'Check-up',
    date: r.record_date,
    notes: r.notes ?? '',
    attachments: parseJsonArray(r.attachments_json),
    createdAt: r.created_at,
  };
}

export function mapVaccinationRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: r.pet_name,
    vaccineName: r.vaccine_name,
    date: r.date_given,
    nextDueDate: r.next_due_date || null,
    status: r.status === 'Done' || r.status === 'Pending' ? r.status : 'Pending',
    notes: r.notes || undefined,
  };
}

export function mapFeedingRow(r: Record<string, unknown>): Record<string, unknown> {
  let days: string[] = [];
  if (r.days_json != null) {
    try {
      days = typeof r.days_json === 'string' ? JSON.parse(r.days_json as string) : (r.days_json as string[]);
    } catch {
      days = [];
    }
  }
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: r.pet_name,
    time: r.time_of_day,
    portionSize: r.portion_size,
    foodType: r.food_type,
    completed: Boolean(r.completed),
    days: Array.isArray(days) ? days : [],
  };
}

export function mapExerciseRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: r.pet_name,
    type: r.exercise_type,
    duration: Number(r.duration_minutes),
    caloriesBurned: r.calories_burned != null ? Number(r.calories_burned) : undefined,
    date: r.log_date,
    notes: r.notes || undefined,
  };
}

export function mapReminderRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    petId: r.pet_id != null ? String(r.pet_id) : undefined,
    petName: r.pet_name || undefined,
    type: r.reminder_type,
    title: r.title,
    date: r.reminder_date,
    time: r.reminder_time || undefined,
    priority: r.priority,
    completed: Boolean(r.completed),
    description: r.description || undefined,
  };
}

export function mapAppointmentRow(r: Record<string, unknown>, vetName?: string): Record<string, unknown> {
  const vn = vetName ?? (r.vet_name as string | undefined);
  return {
    id: String(r.id),
    petId: String(r.pet_id),
    petName: r.pet_name,
    vetId: r.vet_user_id != null ? String(r.vet_user_id) : undefined,
    vetName: vn || undefined,
    reason: r.reason,
    date: r.appt_date,
    time: normalizeTime(String(r.appt_time)),
    proposedDate: r.proposed_appt_date || undefined,
    proposedTime: r.proposed_appt_time ? normalizeTime(String(r.proposed_appt_time)) : undefined,
    notes: r.notes || undefined,
    vetNotes: r.vet_notes || undefined,
    status: r.status,
  };
}

export function mapActivityRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    type: r.activity_type,
    title: r.title,
    description: r.description,
    petName: r.pet_name,
    timestamp: r.occurred_at,
  };
}

export function mapNotificationRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    title: r.title,
    message: r.message,
    type: r.notif_type || 'info',
    read: Boolean(r.is_read),
    createdAt: r.created_at,
  };
}

const DATA_URL_RE = /^data:([\w/.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export async function uploadDataUrlToStorage(
  bucket: string,
  objectPath: string,
  dataUrl: string,
): Promise<string | null> {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1].toLowerCase().split(';')[0].trim();
  const buf = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage.from(bucket).upload(objectPath, buf, {
    contentType: mime,
    upsert: true,
  });
  if (error) {
    console.warn('Storage upload failed:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadFileToStorage(bucket: string, objectPath: string, file: File): Promise<string | null> {
  const { error } = await supabase.storage.from(bucket).upload(objectPath, file, { upsert: true });
  if (error) {
    console.warn('Storage upload failed:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function computeAvailableSlotsForVet(vetId: string, dateStr: string): Promise<string[]> {
  const { data: settingsRow } = await supabase
    .from('vet_booking_settings')
    .select('*')
    .eq('vet_user_id', vetId)
    .maybeSingle();
  const dayStart = (settingsRow?.day_start as string) ?? '09:00:00';
  const dayEnd = (settingsRow?.day_end as string) ?? '17:00:00';
  const slotMinutes = Number(settingsRow?.slot_minutes) || 30;
  const allSlots = generateSlotsFromSettings(dayStart, dayEnd, slotMinutes);
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id,status,appt_date,appt_time,proposed_appt_date,proposed_appt_time,vet_user_id')
    .eq('vet_user_id', vetId);
  throwOnError(error);
  const taken = new Set<string>();
  for (const a of appts || []) {
    const st = String(a.status);
    if (st === 'Pending' || st === 'Confirmed') {
      const d = String(a.appt_date).slice(0, 10);
      if (d === dateStr) taken.add(normalizeTime(String(a.appt_time)));
    }
    if (st === 'Rescheduled' && a.proposed_appt_date && a.proposed_appt_time) {
      const d = String(a.proposed_appt_date).slice(0, 10);
      if (d === dateStr) taken.add(normalizeTime(String(a.proposed_appt_time)));
    }
  }
  return allSlots.filter((s) => !taken.has(s));
}

async function slotTakenByOtherVet(
  vetId: string,
  dateStr: string,
  timeNorm: string,
  excludeApptId: string | null,
): Promise<boolean> {
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id,status,appt_date,appt_time,proposed_appt_date,proposed_appt_time,vet_user_id')
    .eq('vet_user_id', vetId);
  throwOnError(error);
  const ex = excludeApptId ?? '';
  for (const a of appts || []) {
    if (String(a.id) === ex) continue;
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

export async function ownerBookAppointment(params: {
  ownerId: string;
  petId: string;
  vetId: string;
  petName: string;
  reason: string;
  date: string;
  time: string;
  notes?: string;
}): Promise<void> {
  const apptTime = normalizeTime(params.time);
  const { data: settingsRow } = await supabase
    .from('vet_booking_settings')
    .select('*')
    .eq('vet_user_id', params.vetId)
    .maybeSingle();
  const dayStart = (settingsRow?.day_start as string) ?? '09:00:00';
  const dayEnd = (settingsRow?.day_end as string) ?? '17:00:00';
  const slotMinutes = Number(settingsRow?.slot_minutes) || 30;
  const allowed = new Set(generateSlotsFromSettings(dayStart, dayEnd, slotMinutes));
  if (!allowed.has(apptTime)) throw new Error('Selected time is outside this vet’s bookable slots.');
  if (await slotTakenByOtherVet(params.vetId, params.date, apptTime, null)) {
    throw new Error('That time slot was just taken. Pick another slot.');
  }
  const { error } = await supabase.from('appointments').insert({
    pet_id: params.petId,
    vet_user_id: params.vetId,
    owner_user_id: params.ownerId,
    pet_name: params.petName,
    reason: params.reason,
    appt_date: params.date,
    appt_time: apptTime,
    notes: params.notes?.trim() || null,
    status: 'Pending',
  });
  throwOnError(error);
  await supabase.from('notifications').insert({
    user_id: params.vetId,
    title: 'New appointment request',
    message: `${params.reason} — ${params.date} ${apptTime} for ${params.petName}.`,
    notif_type: 'info',
  });
  await supabase.from('notifications').insert({
    user_id: params.ownerId,
    title: 'Booking submitted',
    message: `Request sent to the vet for ${params.petName} on ${params.date} at ${apptTime} (pending approval).`,
    notif_type: 'info',
  });
  await supabase.from('activities').insert({
    user_id: params.ownerId,
    activity_type: 'appointment',
    title: `Booking request: ${params.reason}`,
    description: `${params.date} ${apptTime}`,
    pet_name: params.petName,
    occurred_at: new Date().toISOString(),
  });
}

export async function ownerDeletePendingAppointment(apptId: string, ownerId: string): Promise<void> {
  const { data: row, error: e1 } = await supabase.from('appointments').select('id,status,pet_id').eq('id', apptId).maybeSingle();
  throwOnError(e1);
  if (!row) throw new Error('Appointment not found.');
  if (String(row.status) !== 'Pending') throw new Error('Only pending requests can be cancelled by the owner.');
  const { data: pet, error: e2 } = await supabase.from('pets').select('user_id').eq('id', row.pet_id).maybeSingle();
  throwOnError(e2);
  if (String(pet?.user_id) !== ownerId) throw new Error('Appointment not found.');
  const { error: e3 } = await supabase.from('appointments').delete().eq('id', apptId);
  throwOnError(e3);
}

export async function ownerRespondToReschedule(apptId: string, ownerId: string, accept: boolean): Promise<void> {
  const { data: a, error: e1 } = await supabase.from('appointments').select('*').eq('id', apptId).maybeSingle();
  throwOnError(e1);
  if (!a) throw new Error('Appointment not found.');
  if (String(a.status) !== 'Rescheduled') throw new Error('No reschedule proposal is waiting on this appointment.');
  const { data: pet, error: e2 } = await supabase.from('pets').select('user_id').eq('id', a.pet_id).maybeSingle();
  throwOnError(e2);
  if (String(pet?.user_id) !== ownerId) throw new Error('Appointment not found.');
  const pd = a.proposed_appt_date ? String(a.proposed_appt_date).slice(0, 10) : '';
  const pt = a.proposed_appt_time ? normalizeTime(String(a.proposed_appt_time)) : '';
  if (!pd || !pt) throw new Error('Missing proposed date/time from veterinarian.');
  const vetId = a.vet_user_id != null ? String(a.vet_user_id) : '';
  if (accept) {
    if (vetId && (await slotTakenByOtherVet(vetId, pd, pt, apptId))) {
      throw new Error('That slot is no longer available. Contact your vet.');
    }
    const { error: e3 } = await supabase
      .from('appointments')
      .update({
        appt_date: pd,
        appt_time: pt,
        proposed_appt_date: null,
        proposed_appt_time: null,
        status: 'Confirmed',
      })
      .eq('id', apptId);
    throwOnError(e3);
    if (vetId) {
      await supabase.from('notifications').insert({
        user_id: vetId,
        title: 'Reschedule accepted',
        message: `Owner accepted the new time ${pd} ${pt} for ${a.pet_name}.`,
        notif_type: 'success',
      });
    }
    await supabase.from('notifications').insert({
      user_id: ownerId,
      title: 'Appointment confirmed',
      message: `${a.pet_name}: your visit is confirmed for ${pd} at ${pt}.`,
      notif_type: 'success',
    });
  } else {
    const { error: e4 } = await supabase
      .from('appointments')
      .update({
        proposed_appt_date: null,
        proposed_appt_time: null,
        status: 'Rejected',
      })
      .eq('id', apptId);
    throwOnError(e4);
    if (vetId) {
      await supabase.from('notifications').insert({
        user_id: vetId,
        title: 'Reschedule declined',
        message: `Owner declined the proposed new time for ${a.pet_name}.`,
        notif_type: 'warning',
      });
    }
    await supabase.from('notifications').insert({
      user_id: ownerId,
      title: 'Appointment update',
      message: `You declined the new time for ${a.pet_name}. This booking is closed.`,
      notif_type: 'info',
    });
  }
}
