import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Appointment, Pet, AppointmentStatus } from '@/types';
import { apiJson } from '@/lib/api';
import { appointmentFromApi, petFromApi } from '@/lib/models';
import { toast } from 'sonner';
import { Plus, Calendar, ChevronLeft, ChevronRight, Clock, CheckCircle2, CalendarDays, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface SchedulePageProps {
  onNavigate: (view: ViewType) => void;
}

function statusBadgeClass(status: AppointmentStatus) {
  switch (status) {
    case 'Pending':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Confirmed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'Rescheduled':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    case 'Completed':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'Missed':
      return 'bg-orange-100 text-orange-900 border-orange-200';
    default:
      return 'bg-[#F3F7FB] text-[#5A6B7A] border-[#D6E3F0]';
  }
}

export default function SchedulePage({ onNavigate }: SchedulePageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        apiJson<Record<string, unknown>[]>('/api/appointments'),
        apiJson<Record<string, unknown>[]>('/api/pets'),
      ]);
      setAppointments(a.map(appointmentFromApi));
      setPets(p.map(petFromApi));
    } catch (e) {
      toast.error('Could not load schedule', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.schedule-header',
        { y: -20, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.calendar-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.calendar-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.task-card',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.tasks-section',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  };

  const { firstDay, daysInMonth } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const getAppointmentsForDate = (day: number) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
    return appointments.filter(a => new Date(a.date).toDateString() === dateStr);
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const today = new Date().getDate();
  const isCurrentMonth = currentDate.getMonth() === new Date().getMonth();

  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter((a) => a.status === 'Completed').length;
  const missedOrClosed = appointments.filter((a) => a.status === 'Missed' || a.status === 'Rejected').length;

  const cancelPending = async (id: string) => {
    try {
      await apiJson(`/api/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.success('Booking cancelled');
      await load();
    } catch (e) {
      toast.error('Could not cancel', { description: String(e) });
    }
  };

  const respondReschedule = async (id: string, accept: boolean) => {
    try {
      await apiJson(`/api/appointments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ acceptProposed: accept }),
      });
      toast.success(accept ? 'New time confirmed' : 'You declined the new time');
      await load();
    } catch (e) {
      toast.error('Could not update', { description: String(e) });
    }
  };

  return (
    <div ref={sectionRef} className="space-y-6">
      {/* Header */}
      <div className="schedule-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Schedule</h1>
          <p className="text-[#5A6B7A]">Manage upcoming clinical appointments and wellness routines.</p>
        </div>
        <Button
          onClick={() => onNavigate('add-appointment')}
          className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Book appointment
        </Button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="calendar-card bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-[#1A202C]">{monthName}</h2>
                <div className="flex gap-1">
                  <button 
                    onClick={() => navigateMonth(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F3F7FB]"
                  >
                    <ChevronLeft className="w-5 h-5 text-[#5A6B7A]" />
                  </button>
                  <button 
                    onClick={() => navigateMonth(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F3F7FB]"
                  >
                    <ChevronRight className="w-5 h-5 text-[#5A6B7A]" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    viewMode === 'week' ? 'bg-[#2B6CB0] text-white' : 'bg-[#F3F7FB] text-[#5A6B7A]'
                  }`}
                >
                  WEEK
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    viewMode === 'month' ? 'bg-[#2B6CB0] text-white' : 'bg-[#F3F7FB] text-[#5A6B7A]'
                  }`}
                >
                  MONTH
                </button>
              </div>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-[#5A6B7A] py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              
              {/* Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayAppointments = getAppointmentsForDate(day);
                const isToday = isCurrentMonth && day === today;
                
                return (
                  <div 
                    key={day}
                    className={`aspect-square p-2 rounded-lg border transition-all cursor-pointer hover:border-[#2B6CB0] ${
                      isToday 
                        ? 'border-[#2B6CB0] bg-[#EAF2FF]' 
                        : 'border-transparent hover:bg-[#F3F7FB]'
                    }`}
                  >
                    <div className="flex flex-col h-full">
                      <span className={`text-sm font-medium ${isToday ? 'text-[#2B6CB0]' : 'text-[#1A202C]'}`}>
                        {day}
                      </span>
                      {dayAppointments.length > 0 && (
                        <div className="mt-auto">
                          <div className="w-2 h-2 bg-[#2B6CB0] rounded-full" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="tasks-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1A202C]">Upcoming Tasks</h2>
            <span className="px-2 py-1 bg-[#F3F7FB] rounded-full text-xs font-medium text-[#5A6B7A]">
              {appointments.filter((a) => a.status === 'Pending').length} Awaiting vet
            </span>
          </div>

          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="task-card bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <img
                      src={
                        pets.find((p) => p.id === appointment.petId)?.photo ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(appointment.petName)}`
                      }
                      alt={appointment.petName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-semibold text-[#1A202C] truncate">{appointment.petName}</h4>
                      <Badge variant="outline" className={`text-xs font-medium border ${statusBadgeClass(appointment.status)}`}>
                        {appointment.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#5A6B7A] truncate">{appointment.reason}</p>
                    {appointment.vetName && (
                      <p className="text-xs text-[#2B6CB0] mt-0.5">Vet: {appointment.vetName}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[#5A6B7A]">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(appointment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {appointment.time}
                      </span>
                    </div>
                    {appointment.status === 'Confirmed' && (
                      <p className="text-xs text-[#5A6B7A] mt-2">
                        Confirmed visit — arrive on time. Vet notes after the visit may appear below.
                      </p>
                    )}
                    {appointment.vetNotes && (appointment.status === 'Completed' || appointment.status === 'Missed') && (
                      <p className="text-xs text-[#1A202C] mt-2 bg-[#F3F7FB] rounded-lg p-2">
                        <span className="font-medium">Clinic notes: </span>
                        {appointment.vetNotes}
                      </p>
                    )}
                    {appointment.status === 'Rescheduled' && appointment.proposedDate && appointment.proposedTime && (
                      <div className="mt-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
                        <p className="text-sm text-[#1A202C] font-medium mb-1">Vet suggested a new time</p>
                        <p className="text-xs text-[#5A6B7A] mb-2">
                          {new Date(appointment.proposedDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          at {appointment.proposedTime}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#2B6CB0] text-white"
                            onClick={() => respondReschedule(appointment.id, true)}
                          >
                            Accept new time
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => respondReschedule(appointment.id, false)}>
                            Decline
                          </Button>
                        </div>
                      </div>
                    )}
                    {appointment.status === 'Pending' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200"
                          onClick={() => cancelPending(appointment.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Cancel request
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={() => onNavigate('schedule')}
            className="w-full mt-4 py-3 text-[#2B6CB0] font-medium text-sm hover:underline"
          >
            View All Upcoming
          </button>
        </div>
      </div>

      {/* Bottom Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-[#2B6CB0]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Total Appointments</p>
              <p className="text-2xl font-bold text-[#1A202C]">{totalAppointments}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-[#27AE60]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Completed (Oct)</p>
              <p className="text-2xl font-bold text-[#1A202C]">{completedAppointments}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FEF3F2] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#E53E3E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Missed / declined</p>
              <p className="text-2xl font-bold text-[#1A202C]">{missedOrClosed}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
