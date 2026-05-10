import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Activity, Appointment, Exercise, HealthRecord, Pet, Reminder, Vaccination } from '@/types';
import { 
  PawPrint, 
  Calendar, 
  FileText, 
  Activity as ActivityIcon, 
  Syringe,
  Utensils,
  Apple,
  AlertCircle
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '@/lib/supabaseClient';
import {
  mapActivityRow,
  mapAppointmentRow,
  mapExerciseRow,
  mapHealthRecordRow,
  mapPetRow,
  mapReminderRow,
  mapVaccinationRow,
  throwOnError,
} from '@/lib/supabaseHelpers';
import {
  activityFromApi,
  appointmentFromApi,
  exerciseFromApi,
  healthRecordFromApi,
  petFromApi,
  reminderFromApi,
  vaccinationFromApi,
} from '@/lib/models';
import { dashboardStatsFromData, healthScoreFromPets } from '@/lib/stats';

gsap.registerPlugin(ScrollTrigger);

interface DashboardPageProps {
  onNavigate: (view: ViewType) => void;
  userName: string;
}

export default function DashboardPage({ onNavigate, userName }: DashboardPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const uid = user.id;
      const { data: petsRaw, error: eP } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      throwOnError(eP);
      const petIds = (petsRaw || []).map((row) => String((row as Record<string, unknown>).id));
      const empty = petIds.length === 0;

      const [apRes, hrRes, vRes, exRes, actRes, remRes] = await Promise.all([
        empty
          ? Promise.resolve({ data: [] as Record<string, unknown>[] })
          : supabase.from('appointments').select('*').in('pet_id', petIds).order('appt_date', { ascending: true }),
        empty
          ? Promise.resolve({ data: [] as Record<string, unknown>[] })
          : supabase.from('health_records').select('*').in('pet_id', petIds).order('record_date', { ascending: false }),
        empty
          ? Promise.resolve({ data: [] as Record<string, unknown>[] })
          : supabase.from('vaccinations').select('*').in('pet_id', petIds).order('date_given', { ascending: false }),
        empty
          ? Promise.resolve({ data: [] as Record<string, unknown>[] })
          : supabase.from('exercise_logs').select('*').in('pet_id', petIds).order('log_date', { ascending: false }),
        supabase.from('activities').select('*').eq('user_id', uid).order('occurred_at', { ascending: false }).limit(50),
        supabase.from('reminders').select('*').eq('user_id', uid).order('reminder_date', { ascending: true }),
      ]);
      throwOnError(apRes.error);
      throwOnError(hrRes.error);
      throwOnError(vRes.error);
      throwOnError(exRes.error);
      throwOnError(actRes.error);
      throwOnError(remRes.error);

      const vetIds = [
        ...new Set(
          (apRes.data || [])
            .map((x) => (x as Record<string, unknown>).vet_user_id)
            .filter((id) => id != null)
            .map(String),
        ),
      ];
      let vetNameById: Record<string, string> = {};
      if (vetIds.length) {
        const { data: vets, error: eV } = await supabase.from('users').select('id,name').in('id', vetIds);
        throwOnError(eV);
        vetNameById = Object.fromEntries((vets || []).map((v) => [String(v.id), String(v.name ?? '')]));
      }

      const p = (petsRaw || []) as Record<string, unknown>[];
      const a = (apRes.data || []) as Record<string, unknown>[];
      const r = (hrRes.data || []) as Record<string, unknown>[];
      const v = (vRes.data || []) as Record<string, unknown>[];
      const e = (exRes.data || []) as Record<string, unknown>[];
      const act = (actRes.data || []) as Record<string, unknown>[];
      const rem = (remRes.data || []) as Record<string, unknown>[];

      setPets(p.map((row) => petFromApi(mapPetRow(row))));
      setAppointments(
        a.map((row) =>
          appointmentFromApi(
            mapAppointmentRow(row, vetNameById[String((row as Record<string, unknown>).vet_user_id)]),
          ),
        ),
      );
      setRecords(r.map((row) => healthRecordFromApi(mapHealthRecordRow(row))));
      setVaccinations(v.map((row) => vaccinationFromApi(mapVaccinationRow(row))));
      setExercises(e.map((row) => exerciseFromApi(mapExerciseRow(row))));
      setActivities(act.map((row) => activityFromApi(mapActivityRow(row))));
      setReminders(rem.map((row) => reminderFromApi(mapReminderRow(row))));
    } catch {
      /* keep zeros */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = dashboardStatsFromData(pets, appointments, records, vaccinations, exercises);
  const healthScore = healthScoreFromPets(pets);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.dashboard-header',
        { x: -30, opacity: 0 },
        { 
          x: 0, 
          opacity: 1, 
          duration: 0.6,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.stat-card',
        { y: 40, opacity: 0, scale: 0.98 },
        { 
          y: 0, 
          opacity: 1, 
          scale: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.stats-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.activity-item',
        { x: -20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          scrollTrigger: {
            trigger: '.activity-section',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.quick-action',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.06,
          scrollTrigger: {
            trigger: '.quick-actions',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [activities.length]);

  const formatTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'health_record': return <FileText className="w-4 h-4 text-[#2B6CB0]" />;
      case 'appointment': return <Calendar className="w-4 h-4 text-[#27AE60]" />;
      case 'vaccination': return <Syringe className="w-4 h-4 text-[#F59E0B]" />;
      case 'feeding': return <Utensils className="w-4 h-4 text-[#8B5CF6]" />;
      case 'exercise': return <ActivityIcon className="w-4 h-4 text-[#EC4899]" />;
      default: return <PawPrint className="w-4 h-4 text-[#2B6CB0]" />;
    }
  };

  const upcomingStatuses = new Set(['Pending', 'Confirmed', 'Rescheduled']);
  const firstUpcoming = [...appointments]
    .filter((x) => upcomingStatuses.has(x.status))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const apptHint = firstUpcoming
    ? `${firstUpcoming.petName} (${firstUpcoming.status}): ${firstUpcoming.reason}`
    : 'Book a vet visit under Schedule';

  const alertReminders = reminders.filter((r) => !r.completed).slice(0, 3);
  const greet = userName.trim() || 'there';

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="dashboard-header">
        <h1 className="text-3xl font-semibold text-[#1A202C] mb-1">
          Welcome back, {greet}!
        </h1>
        <p className="text-[#5A6B7A]">
          Start by adding pets, then log health records, vaccines, feeding, and exercise — everything here is saved to your database.
        </p>
      </div>

      <div className="stats-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] border-t-2 border-[#2B6CB0]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase tracking-wide font-medium">Total Pets</p>
              <p className="text-3xl font-bold text-[#1A202C] mt-1">{stats.totalPets}</p>
            </div>
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <PawPrint className="w-5 h-5 text-[#2B6CB0]" />
            </div>
          </div>
        </div>

        <div className="stat-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] border-t-2 border-[#27AE60]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase tracking-wide font-medium">Upcoming Appointments</p>
              <p className="text-3xl font-bold text-[#1A202C] mt-1">{stats.upcomingAppointments}</p>
              <p className="text-xs text-[#27AE60] mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#27AE60] rounded-full"></span>
                {apptHint}
              </p>
            </div>
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#27AE60]" />
            </div>
          </div>
        </div>

        <div className="stat-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] border-t-2 border-[#8B5CF6]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase tracking-wide font-medium">Recent Records</p>
              <p className="text-3xl font-bold text-[#1A202C] mt-1">{stats.recentRecords}</p>
              <p className="text-xs text-[#5A6B7A] mt-1">Last 30 days</p>
            </div>
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#8B5CF6]" />
            </div>
          </div>
        </div>

        <div className="stat-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] border-t-2 border-[#F59E0B]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase tracking-wide font-medium">Health Score</p>
              <p className="text-3xl font-bold text-[#1A202C] mt-1">{healthScore}%</p>
              <p className="text-xs text-[#5A6B7A] mt-1">Based on pets marked Healthy</p>
            </div>
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <ActivityIcon className="w-5 h-5 text-[#F59E0B]" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="activity-section lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1A202C]">Recent Activity</h2>
            <button 
              type="button"
              onClick={() => onNavigate('health-records')}
              className="text-sm text-[#2B6CB0] hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {!activities.length && (
              <p className="text-sm text-[#5A6B7A] bg-white rounded-[14px] p-6 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
                No activity yet. Add a pet and create a health record or appointment to see your timeline here.
              </p>
            )}
            {activities.slice(0, 5).map((activity) => (
              <div 
                key={activity.id}
                className="activity-item bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)] flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-[#F3F7FB]">
                  <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(activity.petName)}`}
                    alt={activity.petName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#1A202C] truncate">{activity.title}</p>
                  <p className="text-sm text-[#5A6B7A] truncate">
                    {activity.description} • {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
                <div className="w-8 h-8 bg-[#F3F7FB] rounded-lg flex items-center justify-center flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="quick-actions">
          <h2 className="text-lg font-semibold text-[#1A202C] mb-4">Quick Actions</h2>
          <div className="bg-white rounded-[18px] p-4 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => onNavigate('add-pet')}
                className="quick-action flex flex-col items-center justify-center p-4 bg-[#F3F7FB] hover:bg-[#EAF2FF] rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mb-2 shadow-sm">
                  <PawPrint className="w-5 h-5 text-[#2B6CB0]" />
                </div>
                <span className="text-sm font-medium text-[#1A202C]">Add Pet</span>
              </button>

              <button 
                type="button"
                onClick={() => onNavigate('add-record')}
                className="quick-action flex flex-col items-center justify-center p-4 bg-[#F3F7FB] hover:bg-[#EAF2FF] rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mb-2 shadow-sm">
                  <ActivityIcon className="w-5 h-5 text-[#2B6CB0]" />
                </div>
                <span className="text-sm font-medium text-[#1A202C]">Add Record</span>
              </button>

              <button 
                type="button"
                onClick={() => onNavigate('feeding')}
                className="quick-action flex flex-col items-center justify-center p-4 bg-[#F3F7FB] hover:bg-[#EAF2FF] rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mb-2 shadow-sm">
                  <Apple className="w-5 h-5 text-[#F59E0B]" />
                </div>
                <span className="text-sm font-medium text-[#1A202C]">Feeding</span>
              </button>

              <button 
                type="button"
                onClick={() => onNavigate('reminders')}
                className="quick-action flex flex-col items-center justify-center p-4 bg-[#FEF3F2] hover:bg-[#FEE4E2] rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mb-2 shadow-sm">
                  <AlertCircle className="w-5 h-5 text-[#E53E3E]" />
                </div>
                <span className="text-sm font-medium text-[#E53E3E]">Reminders</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#EAF2FF] rounded-[18px] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-[#2B6CB0] rounded-lg flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-[#1A202C]">Upcoming reminders</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {!alertReminders.length && (
            <div className="bg-white rounded-xl p-4 text-sm text-[#5A6B7A]">
              No open reminders. Add some under <button type="button" className="text-[#2B6CB0] font-medium" onClick={() => onNavigate('reminders')}>Reminders</button>.
            </div>
          )}
          {alertReminders.map((r) => (
            <div key={r.id} className="bg-white rounded-xl p-4 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${r.priority === 'Urgent' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
              <div>
                <p className="text-sm font-medium text-[#1A202C]">{r.title}</p>
                <p className="text-xs text-[#5A6B7A]">{r.petName ? `${r.petName} · ` : ''}{r.description || r.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
