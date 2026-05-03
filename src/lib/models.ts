import type {
  Activity,
  Appointment,
  Exercise,
  FeedingSchedule,
  HealthRecord,
  Notification,
  Pet,
  Reminder,
  Vaccination,
} from "@/types"

function d(v: unknown): Date {
  return new Date(v as string)
}

function dOpt(v: unknown): Date | undefined {
  if (v == null || v === "") return undefined
  return new Date(v as string)
}

export function petFromApi(o: Record<string, unknown>): Pet {
  return {
    id: String(o.id),
    userId: String(o.userId),
    name: String(o.name),
    type: o.type as Pet["type"],
    breed: String(o.breed ?? ""),
    age: Number(o.age ?? 0),
    weight: Number(o.weight ?? 0),
    healthCondition: o.healthCondition ? String(o.healthCondition) : undefined,
    status: (o.status as Pet["status"]) || "Active",
    photo: o.photo ? String(o.photo) : undefined,
    lastCheckup: dOpt(o.lastCheckup),
    nextVaccine: dOpt(o.nextVaccine),
    createdAt: d(o.createdAt),
  }
}

export function healthRecordFromApi(o: Record<string, unknown>): HealthRecord {
  const att = o.attachments
  const attachments = Array.isArray(att)
    ? (att as unknown[]).map((u) => String(u)).filter(Boolean)
    : []
  return {
    id: String(o.id),
    petId: String(o.petId),
    petName: String(o.petName ?? ""),
    type: o.type as HealthRecord["type"],
    date: d(o.date),
    notes: String(o.notes ?? ""),
    ...(attachments.length ? { attachments } : {}),
    createdAt: d(o.createdAt),
  }
}

export function vaccinationFromApi(o: Record<string, unknown>): Vaccination {
  return {
    id: String(o.id),
    petId: String(o.petId),
    petName: String(o.petName),
    vaccineName: String(o.vaccineName),
    date: d(o.date),
    nextDueDate: dOpt(o.nextDueDate),
    status: o.status as Vaccination["status"],
    notes: o.notes ? String(o.notes) : undefined,
  }
}

export function feedingFromApi(o: Record<string, unknown>): FeedingSchedule {
  return {
    id: String(o.id),
    petId: String(o.petId),
    petName: String(o.petName),
    time: String(o.time),
    portionSize: String(o.portionSize),
    foodType: String(o.foodType),
    completed: Boolean(o.completed),
    days: Array.isArray(o.days) ? (o.days as string[]) : [],
  }
}

export function exerciseFromApi(o: Record<string, unknown>): Exercise {
  return {
    id: String(o.id),
    petId: String(o.petId),
    petName: String(o.petName),
    type: o.type as Exercise["type"],
    duration: Number(o.duration),
    caloriesBurned: o.caloriesBurned != null ? Number(o.caloriesBurned) : undefined,
    date: d(o.date),
    notes: o.notes ? String(o.notes) : undefined,
  }
}

export function reminderFromApi(o: Record<string, unknown>): Reminder {
  return {
    id: String(o.id),
    userId: String(o.userId),
    petId: o.petId != null ? String(o.petId) : undefined,
    petName: o.petName != null ? String(o.petName) : undefined,
    type: o.type as Reminder["type"],
    title: String(o.title),
    date: d(o.date),
    time: o.time ? String(o.time) : undefined,
    priority: o.priority as Reminder["priority"],
    completed: Boolean(o.completed),
    description: o.description ? String(o.description) : undefined,
  }
}

export function appointmentFromApi(o: Record<string, unknown>): Appointment {
  return {
    id: String(o.id),
    petId: String(o.petId),
    petName: String(o.petName),
    vetId: o.vetId != null ? String(o.vetId) : undefined,
    vetName: o.vetName != null ? String(o.vetName) : undefined,
    reason: String(o.reason),
    date: d(o.date),
    time: String(o.time),
    proposedDate: o.proposedDate != null ? d(o.proposedDate) : undefined,
    proposedTime: o.proposedTime != null ? String(o.proposedTime) : undefined,
    notes: o.notes ? String(o.notes) : undefined,
    vetNotes: o.vetNotes != null ? String(o.vetNotes) : undefined,
    status: o.status as Appointment["status"],
  }
}

export function activityFromApi(o: Record<string, unknown>): Activity {
  return {
    id: String(o.id),
    userId: String(o.userId),
    type: o.type as Activity["type"],
    title: String(o.title),
    description: String(o.description),
    petName: String(o.petName),
    timestamp: d(o.timestamp),
  }
}

export function notificationFromApi(o: Record<string, unknown>): Notification {
  return {
    id: String(o.id),
    userId: String(o.userId),
    title: String(o.title),
    message: String(o.message),
    type: o.type as Notification["type"],
    read: Boolean(o.read),
    createdAt: d(o.createdAt),
  }
}
