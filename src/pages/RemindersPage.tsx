import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Reminder, ReminderPriority, ReminderType, Pet } from '@/types';
import { Bell, CheckCircle2, Circle, Calendar, Clock, AlertTriangle, Syringe, Utensils, Activity, Pill, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { petFromApi, reminderFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface RemindersPageProps {
  onNavigate: (view: ViewType) => void;
}

export default function RemindersPage({ onNavigate: _onNavigate }: RemindersPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all');
  const [showModal, setShowModal] = useState(false);
  const [rTitle, setRTitle] = useState('');
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('');
  const [rType, setRType] = useState<ReminderType>('Medication');
  const [rPriority, setRPriority] = useState<ReminderPriority>('Routine');
  const [rPet, setRPet] = useState('');
  const [rDesc, setRDesc] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        apiJson<Record<string, unknown>[]>('/api/reminders'),
        apiJson<Record<string, unknown>[]>('/api/pets'),
      ]);
      setReminders(r.map(reminderFromApi));
      setPets(p.map(petFromApi));
    } catch (e) {
      toast.error('Could not load reminders', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reminders-header',
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

      gsap.fromTo('.reminder-card',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.reminders-list',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [reminders.length]);

  const toggleCompletion = async (id: string) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    const next = !reminder.completed;
    try {
      const updated = await apiJson<Record<string, unknown>>(`/api/reminders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: next }),
      });
      const row = reminderFromApi(updated);
      setReminders((prev) => prev.map((r) => (r.id === id ? row : r)));
      toast.success(next ? 'Marked complete' : 'Reopened');
    } catch (e) {
      toast.error('Could not update', { description: String(e) });
    }
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'Vaccination': return <Syringe className="w-5 h-5" />;
      case 'Feeding': return <Utensils className="w-5 h-5" />;
      case 'Exercise': return <Activity className="w-5 h-5" />;
      case 'Medication': return <Pill className="w-5 h-5" />;
      default: return <Bell className="w-5 h-5" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-500 text-white';
      case 'Routine': return 'bg-blue-500 text-white';
      case 'Checkup': return 'bg-amber-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const filteredReminders = reminders.filter(r => {
    if (filter === 'today') {
      return new Date(r.date).toDateString() === new Date().toDateString();
    }
    if (filter === 'upcoming') {
      return new Date(r.date) > new Date();
    }
    return true;
  });

  const todayReminders = reminders.filter(r => 
    new Date(r.date).toDateString() === new Date().toDateString() && !r.completed
  );

  const upcomingReminders = reminders.filter(r => 
    new Date(r.date) > new Date() && !r.completed
  );

  const addReminder = async () => {
    if (!rTitle.trim() || !rDate) {
      toast.error('Title and date are required');
      return;
    }
    try {
      await apiJson('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title: rTitle.trim(),
          date: rDate,
          time: rTime || null,
          type: rType,
          priority: rPriority,
          petId: rPet || null,
          description: rDesc || null,
        }),
      });
      toast.success('Reminder added');
      setShowModal(false);
      setRTitle('');
      setRDate('');
      setRTime('');
      setRDesc('');
      await load();
    } catch (e) {
      toast.error('Could not add', { description: String(e) });
    }
  };

  const types: ReminderType[] = ['Vaccination', 'Feeding', 'Exercise', 'Appointment', 'Medication'];
  const priorities: ReminderPriority[] = ['Urgent', 'Routine', 'Checkup'];

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="reminders-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Reminders</h1>
          <p className="text-[#5A6B7A]">Create reminders for yourself.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setShowModal(true)} className="bg-[#2B6CB0] text-white rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Add reminder
          </Button>
          <div className="w-10 h-10 bg-[#F59E0B] rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-[#5A6B7A]">Pending</p>
            <p className="text-xl font-bold text-[#1A202C]">{reminders.filter(r => !r.completed).length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Urgent</p>
              <p className="text-2xl font-bold text-[#1A202C]">
                {reminders.filter(r => r.priority === 'Urgent' && !r.completed).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#2B6CB0]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Today</p>
              <p className="text-2xl font-bold text-[#1A202C]">{todayReminders.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#27AE60]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Upcoming</p>
              <p className="text-2xl font-bold text-[#1A202C]">{upcomingReminders.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'today', 'upcoming'] as const).map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
              filter === f
                ? 'bg-[#2B6CB0] text-white'
                : 'bg-white text-[#5A6B7A] hover:bg-[#F3F7FB]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="reminders-list space-y-3">
        {!filteredReminders.length && (
          <p className="text-sm text-[#5A6B7A]">No reminders match this filter. Add one with &quot;Add reminder&quot;.</p>
        )}
        {filteredReminders.map((reminder) => (
          <div 
            key={reminder.id}
            className={`reminder-card bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)] flex items-center gap-4 ${
              reminder.completed ? 'opacity-60' : ''
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              reminder.completed ? 'bg-[#F3F7FB] text-[#5A6B7A]' : 'bg-[#EAF2FF] text-[#2B6CB0]'
            }`}>
              {getReminderIcon(reminder.type)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-semibold text-[#1A202C] truncate ${reminder.completed ? 'line-through' : ''}`}>
                  {reminder.title}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getPriorityColor(reminder.priority)}`}>
                  {reminder.priority}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#5A6B7A]">
                {reminder.petName && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-[#EAF2FF] flex items-center justify-center text-xs">
                      {reminder.petName.charAt(0)}
                    </span>
                    {reminder.petName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(reminder.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {reminder.time && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {reminder.time}
                  </span>
                )}
              </div>
              {reminder.description && (
                <p className="text-sm text-[#5A6B7A] mt-1">{reminder.description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => toggleCompletion(reminder.id)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                reminder.completed 
                  ? 'bg-[#27AE60] text-white' 
                  : 'bg-[#F3F7FB] text-[#5A6B7A] hover:bg-[#EAF2FF]'
              }`}
            >
              {reminder.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
        <h3 className="text-lg font-semibold text-[#1A202C] mb-4">Notification Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#F3F7FB] rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2B6CB0] rounded-xl flex items-center justify-center">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-[#1A202C]">In-App Notifications</p>
                <p className="text-sm text-[#5A6B7A]">Bell menu uses data from the database when you add notifications there.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[18px] p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">New reminder</h3>
            <div>
              <Label>Title</Label>
              <Input value={rTitle} onChange={(e) => setRTitle(e.target.value)} className="mt-1" placeholder="e.g. Heartworm pill" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Time (optional)</Label>
              <Input type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <select value={rType} onChange={(e) => setRType(e.target.value as ReminderType)} className="w-full h-12 mt-1 rounded-xl border px-3 bg-[#F3F7FB]">
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select value={rPriority} onChange={(e) => setRPriority(e.target.value as ReminderPriority)} className="w-full h-12 mt-1 rounded-xl border px-3 bg-[#F3F7FB]">
                {priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Pet (optional)</Label>
              <select value={rPet} onChange={(e) => setRPet(e.target.value)} className="w-full h-12 mt-1 rounded-xl border px-3 bg-[#F3F7FB]">
                <option value="">— None —</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={rDesc} onChange={(e) => setRDesc(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="button" className="flex-1 bg-[#2B6CB0] text-white" onClick={addReminder}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
