// User Types
export interface User {
  id: string;
  name: string;
  email: string;
  /** Plain password only exists in local/mock data — never returned from the API. */
  password?: string;
  avatar?: string;
  bio?: string;
  createdAt: Date | string;
  /** Set by API from users.is_admin — only admins can open the admin dashboard; admins cannot delete other users’ pets (owners delete from My Pets). */
  isAdmin?: boolean;
  /** Set by API from users.is_vet — veterinarian accounts use the Vet Dashboard only (not the owner workspace). */
  isVet?: boolean;
  /** Professional license ID for display on the vet dashboard (optional). */
  vetLicenseId?: string;
  /** Set by API from users.is_active — deactivated users cannot sign in. */
  isActive?: boolean;
}

// Pet Types
export type PetType = 'Dog' | 'Cat' | 'Bird' | 'Rabbit' | 'Other';
export type PetStatus = 'Active' | 'Sleeping' | 'Observational' | 'Healthy';

export interface Pet {
  id: string;
  userId: string;
  name: string;
  type: PetType;
  breed: string;
  age: number;
  weight: number;
  healthCondition?: string;
  status: PetStatus;
  photo?: string;
  lastCheckup?: Date;
  nextVaccine?: Date;
  createdAt: Date;
}

// Health Record Types
export type RecordType = 'Vaccination' | 'Check-up' | 'Medication' | 'Treatment' | 'Lab Results' | 'Surgery';

export interface HealthRecord {
  id: string;
  petId: string;
  petName: string;
  type: RecordType;
  date: Date;
  notes: string;
  attachments?: string[];
  createdAt: Date;
}

// Vaccination Types
export interface Vaccination {
  id: string;
  petId: string;
  petName: string;
  vaccineName: string;
  date: Date;
  nextDueDate?: Date;
  status: 'Done' | 'Pending';
  notes?: string;
}

// Feeding Schedule Types
export interface FeedingSchedule {
  id: string;
  petId: string;
  petName: string;
  time: string;
  portionSize: string;
  foodType: string;
  completed: boolean;
  days: string[];
}

// Exercise Types
export type ExerciseType = 'Walk' | 'Playtime' | 'Running' | 'Swimming';

export interface Exercise {
  id: string;
  petId: string;
  petName: string;
  type: ExerciseType;
  duration: number;
  caloriesBurned?: number;
  date: Date;
  notes?: string;
}

// Reminder Types
export type ReminderType = 'Vaccination' | 'Feeding' | 'Exercise' | 'Appointment' | 'Medication';
export type ReminderPriority = 'Urgent' | 'Routine' | 'Checkup';

export interface Reminder {
  id: string;
  userId: string;
  petId?: string;
  petName?: string;
  type: ReminderType;
  title: string;
  date: Date;
  time?: string;
  priority: ReminderPriority;
  completed: boolean;
  description?: string;
}

// Appointment Types (vet booking workflow)
export type AppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Rejected'
  | 'Rescheduled'
  | 'Completed'
  | 'Missed';

export interface Appointment {
  id: string;
  petId: string;
  petName: string;
  vetId?: string;
  vetName?: string;
  reason: string;
  date: Date;
  time: string;
  proposedDate?: Date;
  proposedTime?: string;
  notes?: string;
  vetNotes?: string;
  status: AppointmentStatus;
}

// Activity Types
export interface Activity {
  id: string;
  userId: string;
  type: 'health_record' | 'appointment' | 'feeding' | 'exercise' | 'vaccination';
  title: string;
  description: string;
  petName: string;
  timestamp: Date;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: Date;
}

// App State
export type ViewType = 
  | 'login' 
  | 'register' 
  | 'dashboard' 
  | 'pets' 
  | 'add-pet' 
  | 'edit-pet'
  | 'vaccinations' 
  | 'feeding' 
  | 'exercise' 
  | 'reminders' 
  | 'health-records' 
  | 'add-record'
  | 'schedule' 
  | 'add-appointment'
  | 'settings'
  | 'admin'
  | 'vet-dashboard'
  | 'vet-assigned'
  | 'vet-records'
  | 'vet-vaccinations'
  | 'vet-notes'
  | 'vet-appointments';
