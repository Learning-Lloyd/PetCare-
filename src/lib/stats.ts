import type { Appointment, Exercise, HealthRecord, Pet, Vaccination } from "@/types"

export function dashboardStatsFromData(
  pets: Pet[],
  appointments: Appointment[],
  records: HealthRecord[],
  vaccinations: Vaccination[],
  exercises: Exercise[],
) {
  const totalPets = pets.length
  const upcomingAppointments = appointments.filter((a) => {
    if (!["Pending", "Confirmed", "Rescheduled"].includes(a.status)) return false
    const day = new Date(a.date instanceof Date ? a.date.getTime() : new Date(a.date as string).getTime())
    day.setHours(0, 0, 0, 0)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return day.getTime() >= start.getTime()
  }).length
  const recentRecords = records.filter((r) => {
    const daysDiff = (Date.now() - r.date.getTime()) / (1000 * 60 * 60 * 24)
    return daysDiff <= 30
  }).length
  const pendingVaccinations = vaccinations.filter((v) => v.status === "Pending").length
  const completedExercises = exercises.filter((e) => {
    const daysDiff = (Date.now() - e.date.getTime()) / (1000 * 60 * 60 * 24)
    return daysDiff <= 7
  }).length

  return {
    totalPets,
    upcomingAppointments,
    recentRecords,
    pendingVaccinations,
    completedExercises,
  }
}

export function healthScoreFromPets(pets: Pet[]): number {
  if (!pets.length) return 100
  const healthyPets = pets.filter((p) => p.healthCondition === "Healthy").length
  return Math.round((healthyPets / pets.length) * 100)
}
