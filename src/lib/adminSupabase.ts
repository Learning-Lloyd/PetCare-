import { supabase } from '@/lib/supabaseClient';
import { throwOnError } from '@/lib/supabaseHelpers';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getReminderDaysBefore(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'reminder_days_before')
    .maybeSingle();
  throwOnError(error);
  const n = Number(data?.setting_value);
  return Math.max(0, Math.min(30, Number.isFinite(n) ? Math.round(n) : 3));
}

function ownerByPetId(
  pets: Record<string, unknown>[],
  users: Record<string, unknown>[],
): Map<string, { email: string; name: string }> {
  const userMap = new Map(users.map((u) => [String(u.id), u]));
  const m = new Map<string, { email: string; name: string }>();
  for (const p of pets) {
    const u = userMap.get(String(p.user_id));
    m.set(String(p.id), {
      email: u ? String(u.email ?? '') : '',
      name: u ? String(u.name ?? '') : '',
    });
  }
  return m;
}

export async function loadAdminDashboardData(reportStart: string, reportEnd: string) {
  const reminderDaysBefore = await getReminderDaysBefore();
  const [
    { data: users, error: eu },
    { data: pets, error: ep },
    { data: healthRecords, error: eh },
    { data: vaccinations, error: ev },
    { data: appointments, error: ea },
    { data: reminders, error: er },
    { data: notifications, error: en },
    { data: feedingSchedules, error: ef },
    { data: exerciseLogs, error: ee },
    { data: auditLog, error: eau },
    { data: activities, error: eac },
  ] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }),
    supabase.from('pets').select('*').order('created_at', { ascending: false }),
    supabase.from('health_records').select('*').order('record_date', { ascending: false }).limit(500),
    supabase.from('vaccinations').select('*').order('date_given', { ascending: false }),
    supabase.from('appointments').select('*').order('appt_date', { ascending: true }),
    supabase.from('reminders').select('*').order('reminder_date', { ascending: true }),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('feeding_schedules').select('*').order('pet_name', { ascending: true }),
    supabase.from('exercise_logs').select('*').order('log_date', { ascending: false }).limit(500),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(120),
    supabase.from('activities').select('*').order('occurred_at', { ascending: false }).limit(120),
  ]);
  for (const e of [eu, ep, eh, ev, ea, er, en, ef, ee, eau, eac]) throwOnError(e);

  const uList = users || [];
  const pList = pets || [];
  const petOwners = ownerByPetId(pList as Record<string, unknown>[], uList as Record<string, unknown>[]);
  const petCountByUser = new Map<string, number>();
  for (const p of pList) {
    const uid = String((p as Record<string, unknown>).user_id);
    petCountByUser.set(uid, (petCountByUser.get(uid) || 0) + 1);
  }

  const today = todayIso();
  const windowEnd = addDaysIso(today, reminderDaysBefore);

  const overview = {
    userCount: uList.length,
    activeUserCount: uList.filter((u) => Boolean((u as Record<string, unknown>).is_active ?? true)).length,
    petCount: pList.length,
    healthRecordCount: (healthRecords || []).length,
    vaccinationCount: (vaccinations || []).length,
    appointmentCount: (appointments || []).length,
    reminderCount: (reminders || []).length,
    notificationCount: (notifications || []).length,
    missedVaccinationCount: (vaccinations || []).filter((v) => {
      const r = v as Record<string, unknown>;
      return (
        r.status === 'Pending' &&
        r.next_due_date &&
        String(r.next_due_date).slice(0, 10) < today
      );
    }).length,
    overdueReminderCount: (reminders || []).filter((r) => {
      const x = r as Record<string, unknown>;
      return !x.completed && String(x.reminder_date).slice(0, 10) < today;
    }).length,
    incompleteFeedingCount: (feedingSchedules || []).filter((f) => !(f as Record<string, unknown>).completed)
      .length,
    upcomingReminderWindowCount: (reminders || []).filter((r) => {
      const x = r as Record<string, unknown>;
      if (x.completed) return false;
      const d = String(x.reminder_date).slice(0, 10);
      return d >= today && d <= windowEnd;
    }).length,
    reminderDaysBefore,
  };

  const adminUsers = uList.map((u) => {
    const r = u as Record<string, unknown>;
    return {
      id: String(r.id),
      email: String(r.email),
      name: String(r.name),
      isAdmin: Boolean(r.is_admin),
      isVet: Boolean(r.is_vet),
      vetLicenseId: r.vet_license_id != null ? String(r.vet_license_id) : undefined,
      isActive: Boolean(r.is_active ?? true),
      petCount: petCountByUser.get(String(r.id)) || 0,
      createdAt: String(r.created_at),
    };
  });

  const adminPets = pList.map((p) => {
    const r = p as Record<string, unknown>;
    const o = petOwners.get(String(r.id)) || { email: '', name: '' };
    return {
      id: String(r.id),
      userId: String(r.user_id ?? ''),
      name: String(r.name),
      type: String(r.pet_type || r.species || 'Other'),
      breed: String(r.breed ?? ''),
      age: r.age_years != null ? Number(r.age_years) : 0,
      weight: r.weight_kg != null ? Number(r.weight_kg) : 0,
      healthCondition: r.health_condition ? String(r.health_condition) : undefined,
      status: String(r.status || 'Active'),
      ownerEmail: o.email,
      ownerName: o.name,
      createdAt: String(r.created_at),
    };
  });

  const adminHealth = (healthRecords || []).map((h) => {
    const r = h as Record<string, unknown>;
    const o = petOwners.get(String(r.pet_id)) || { email: '', name: '' };
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(r.pet_name ?? ''),
      ownerEmail: o.email,
      ownerName: o.name,
      type: String(r.record_type || 'Check-up'),
      date: String(r.record_date).slice(0, 10),
      notes: String(r.notes ?? ''),
      createdAt: String(r.created_at),
    };
  });

  const adminVax = (vaccinations || []).map((v) => {
    const r = v as Record<string, unknown>;
    const o = petOwners.get(String(r.pet_id)) || { email: '', name: '' };
    const overdue =
      r.status === 'Pending' &&
      r.next_due_date != null &&
      String(r.next_due_date).slice(0, 10) < today;
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(r.pet_name),
      vaccineName: String(r.vaccine_name),
      date: String(r.date_given).slice(0, 10),
      nextDueDate: r.next_due_date ? String(r.next_due_date).slice(0, 10) : null,
      status: r.status === 'Done' || r.status === 'Pending' ? String(r.status) : 'Pending',
      ownerEmail: o.email,
      ownerName: o.name,
      missed: overdue,
    };
  });

  const adminFeed = (feedingSchedules || []).map((f) => {
    const r = f as Record<string, unknown>;
    const o = petOwners.get(String(r.pet_id)) || { email: '', name: '' };
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(r.pet_name),
      time: String(r.time_of_day),
      portionSize: String(r.portion_size),
      foodType: String(r.food_type),
      completed: Boolean(r.completed),
      ownerEmail: o.email,
      ownerName: o.name,
      missed: !r.completed,
    };
  });

  const adminEx = (exerciseLogs || []).map((e) => {
    const r = e as Record<string, unknown>;
    const o = petOwners.get(String(r.pet_id)) || { email: '', name: '' };
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(r.pet_name),
      type: String(r.exercise_type),
      duration: Number(r.duration_minutes),
      date: String(r.log_date).slice(0, 10),
      ownerEmail: o.email,
      ownerName: o.name,
      stale: String(r.log_date).slice(0, 10) < today,
    };
  });

  const adminAppt = (appointments || []).map((a) => {
    const r = a as Record<string, unknown>;
    const o = petOwners.get(String(r.pet_id)) || { email: '', name: '' };
    return {
      id: String(r.id),
      petId: String(r.pet_id),
      petName: String(r.pet_name),
      reason: String(r.reason),
      date: String(r.appt_date).slice(0, 10),
      time: String(r.appt_time),
      status: String(r.status),
      ownerEmail: o.email,
      ownerName: o.name,
    };
  });

  const userMap = new Map(uList.map((u) => [String((u as Record<string, unknown>).id), u as Record<string, unknown>]));
  const adminRem = (reminders || []).map((r) => {
    const x = r as Record<string, unknown>;
    const u = userMap.get(String(x.user_id));
    return {
      id: String(x.id),
      userId: String(x.user_id),
      petName: x.pet_name ? String(x.pet_name) : undefined,
      ownerEmail: u ? String(u.email ?? '') : '',
      ownerName: u ? String(u.name ?? '') : '',
      type: String(x.reminder_type),
      title: String(x.title),
      date: String(x.reminder_date).slice(0, 10),
      time: x.reminder_time ? String(x.reminder_time) : undefined,
      priority: String(x.priority),
      completed: Boolean(x.completed),
      description: x.description ? String(x.description) : undefined,
      overdue: !x.completed && String(x.reminder_date).slice(0, 10) < today,
    };
  });

  const adminNotif = (notifications || []).map((n) => {
    const x = n as Record<string, unknown>;
    const u = userMap.get(String(x.user_id));
    return {
      id: String(x.id),
      userId: String(x.user_id),
      ownerEmail: u ? String(u.email ?? '') : '',
      ownerName: u ? String(u.name ?? '') : '',
      title: String(x.title),
      message: String(x.message),
      type: String(x.notif_type || 'info'),
      read: Boolean(x.is_read),
      createdAt: String(x.created_at),
    };
  });

  const inRangeDate = (d: string) => {
    const x = d.slice(0, 10);
    return x >= reportStart && x <= reportEnd;
  };

  const report = {
    period: 'range' as const,
    startDate: reportStart,
    endDate: reportEnd,
    newUsers: uList.filter((u) => inRangeDate(String((u as Record<string, unknown>).created_at))).length,
    newPets: pList.filter((p) => inRangeDate(String((p as Record<string, unknown>).created_at))).length,
    healthRecords: (healthRecords || []).filter((h) =>
      inRangeDate(String((h as Record<string, unknown>).record_date)),
    ).length,
    vaccinationsGiven: (vaccinations || []).filter((v) =>
      inRangeDate(String((v as Record<string, unknown>).date_given)),
    ).length,
    exerciseLogs: (exerciseLogs || []).filter((e) =>
      inRangeDate(String((e as Record<string, unknown>).log_date)),
    ).length,
    remindersDue: (reminders || []).filter((r) =>
      inRangeDate(String((r as Record<string, unknown>).reminder_date)),
    ).length,
    appointments: (appointments || []).filter((a) =>
      inRangeDate(String((a as Record<string, unknown>).appt_date)),
    ).length,
    notifications: (notifications || []).filter((n) =>
      inRangeDate(String((n as Record<string, unknown>).created_at)),
    ).length,
    auditEvents: (auditLog || []).filter((a) =>
      inRangeDate(String((a as Record<string, unknown>).created_at)),
    ).length,
    missedVaccinations: overview.missedVaccinationCount,
  };

  const transactionHistory = (auditLog || []).map((a) => {
    const r = a as Record<string, unknown>;
    const u = userMap.get(String(r.user_id));
    return {
      id: String(r.id),
      userId: String(r.user_id),
      userEmail: u ? String(u.email ?? '') : '',
      userName: u ? String(u.name ?? '') : '',
      action: String(r.action),
      entityType: String(r.entity_type),
      entityId: r.entity_id != null ? String(r.entity_id) : '',
      detail: String(r.detail ?? ''),
      createdAt: String(r.created_at),
    };
  });

  const activityLogs = (activities || []).map((a) => {
    const r = a as Record<string, unknown>;
    const u = userMap.get(String(r.user_id));
    return {
      id: String(r.id),
      userId: String(r.user_id),
      userEmail: u ? String(u.email ?? '') : '',
      userName: u ? String(u.name ?? '') : '',
      type: String(r.activity_type),
      title: String(r.title),
      description: String(r.description ?? ''),
      petName: String(r.pet_name ?? ''),
      occurredAt: String(r.occurred_at),
    };
  });

  return {
    overview,
    users: adminUsers,
    pets: adminPets,
    settings: { reminderDaysBefore },
    vaccinations: adminVax,
    feeding: adminFeed,
    exercises: adminEx,
    healthRecords: adminHealth,
    appointments: adminAppt,
    reminders: adminRem,
    notifications: adminNotif,
    report,
    transactionHistory,
    activityLogs,
  };
}

export async function adminSaveReminderRule(days: number): Promise<{ reminderDaysBefore: number }> {
  const reminderDaysBefore = Math.max(0, Math.min(30, Math.round(days)));
  const { error } = await supabase.from('app_settings').upsert(
    { setting_key: 'reminder_days_before', setting_value: String(reminderDaysBefore) },
    { onConflict: 'setting_key' },
  );
  throwOnError(error);
  return { reminderDaysBefore };
}

export async function adminUpdateUser(
  id: string,
  body: {
    name?: string;
    email?: string;
    isAdmin?: boolean;
    isVet?: boolean;
    vetLicenseId?: string;
    isActive?: boolean;
  },
): Promise<void> {
  let isAdmin = body.isAdmin === true;
  let isVet = body.isVet === true;
  if (isVet && isAdmin) throw new Error('A user cannot be both administrator and veterinarian.');
  if (isVet) isAdmin = false;
  if (isAdmin) isVet = false;
  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = body.name;
  if (body.email != null) patch.email = body.email;
  if (body.isAdmin !== undefined) patch.is_admin = isAdmin;
  if (body.isVet !== undefined) patch.is_vet = isVet;
  if (body.vetLicenseId !== undefined) patch.vet_license_id = body.vetLicenseId || null;
  if (body.isActive !== undefined) patch.is_active = body.isActive;
  const { error } = await supabase.from('users').update(patch).eq('id', id);
  throwOnError(error);
}

export async function adminDeleteUser(id: string): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', id);
  throwOnError(error);
}

export async function adminUpdatePet(
  petId: string,
  body: {
    name?: string;
    type?: string;
    breed?: string;
    age?: number;
    weight?: number;
    healthCondition?: string;
    status?: string;
  },
): Promise<void> {
  const type = body.type ?? 'Dog';
  const patch: Record<string, unknown> = {
    name: body.name,
    pet_type: type,
    breed: body.breed,
    species: type,
    age_years: body.age,
    weight_kg: body.weight,
    health_condition: body.healthCondition ?? null,
    status: body.status,
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  const { error } = await supabase.from('pets').update(patch).eq('id', petId);
  throwOnError(error);
}

export async function adminPatchReminder(
  id: string,
  body: { title?: string; date?: string; completed?: boolean; description?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (body.title) patch.title = body.title;
  if (body.date) patch.reminder_date = body.date;
  if (body.completed !== undefined) patch.completed = body.completed;
  if (body.description !== undefined) patch.description = body.description || null;
  if (!Object.keys(patch).length) throw new Error('No fields to update.');
  const { error } = await supabase.from('reminders').update(patch).eq('id', id);
  throwOnError(error);
}

export async function adminDeleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  throwOnError(error);
}

export function adminCreateUserUnsupported(): never {
  throw new Error(
    'Creating sign-in accounts from the admin panel requires the Supabase Auth admin API (service role). Add users in the Supabase Dashboard or an Edge Function, then ensure a matching row exists in public.users.',
  );
}

export function adminResetPasswordUnsupported(): never {
  throw new Error(
    'Setting a user password from the admin panel requires the Supabase Auth admin API. Use the Supabase Dashboard or send a password recovery email with supabase.auth.resetPasswordForEmail from a trusted backend.',
  );
}
