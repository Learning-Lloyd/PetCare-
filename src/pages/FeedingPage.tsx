import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, FeedingSchedule, Pet } from '@/types';
import { Plus, Utensils, Clock, CheckCircle2, Circle, Apple, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { feedingFromApi, petFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface FeedingPageProps {
  onNavigate: (view: ViewType) => void;
}

const petPhoto = (pet?: Pet) =>
  pet?.photo || (pet ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(pet.name)}` : '');

export default function FeedingPage({ onNavigate: _onNavigate }: FeedingPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [schedules, setSchedules] = useState<FeedingSchedule[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [fPet, setFPet] = useState('');
  const [fTime, setFTime] = useState('08:00');
  const [fPortion, setFPortion] = useState('');
  const [fFood, setFFood] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        apiJson<Record<string, unknown>[]>('/api/feeding-schedules'),
        apiJson<Record<string, unknown>[]>('/api/pets'),
      ]);
      setSchedules(s.map(feedingFromApi));
      const plist = p.map(petFromApi);
      setPets(plist);
      setFPet((prev) => prev || plist[0]?.id || '');
    } catch (e) {
      toast.error('Could not load feeding data', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.feeding-header',
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

      gsap.fromTo('.feeding-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.feeding-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [schedules.length]);

  const toggleCompletion = async (id: string) => {
    const schedule = schedules.find(s => s.id === id);
    if (!schedule) return;
    const next = !schedule.completed;
    try {
      const updated = await apiJson<Record<string, unknown>>(`/api/feeding-schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: next }),
      });
      const row = feedingFromApi(updated);
      setSchedules((prev) => prev.map((s) => (s.id === id ? row : s)));
      toast.success(next ? 'Marked complete' : 'Marked incomplete');
    } catch (e) {
      toast.error('Could not update', { description: String(e) });
    }
  };

  const filteredSchedules = selectedPet === 'all' 
    ? schedules 
    : schedules.filter(s => s.petId === selectedPet);

  const getPetById = (id: string) => pets.find(p => p.id === id);

  const getSuggestedPortion = (weight: number) => {
    const minPortion = (weight * 0.02 * 1000).toFixed(0);
    const maxPortion = (weight * 0.03 * 1000).toFixed(0);
    return `${minPortion}-${maxPortion}g`;
  };

  const addSchedule = async () => {
    if (!pets.length) {
      toast.error('Add a pet first');
      return;
    }
    if (!fPortion.trim() || !fFood.trim()) {
      toast.error('Portion and food type are required');
      return;
    }
    try {
      await apiJson('/api/feeding-schedules', {
        method: 'POST',
        body: JSON.stringify({
          petId: fPet,
          time: fTime,
          portionSize: fPortion.trim(),
          foodType: fFood.trim(),
        }),
      });
      toast.success('Schedule added');
      setShowModal(false);
      setFPortion('');
      setFFood('');
      await load();
    } catch (e) {
      toast.error('Could not add', { description: String(e) });
    }
  };

  const doneCount = schedules.filter(s => s.completed).length;
  const pct = schedules.length ? (doneCount / schedules.length) * 100 : 0;

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="feeding-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Feeding Schedule</h1>
          <p className="text-[#5A6B7A]">Create meal times per pet. Check off meals as you go (saved to the database).</p>
        </div>
        <Button 
          type="button"
          onClick={() => setShowModal(true)}
          className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Schedule
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedPet('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            selectedPet === 'all'
              ? 'bg-[#2B6CB0] text-white'
              : 'bg-white text-[#5A6B7A] hover:bg-[#F3F7FB]'
          }`}
        >
          All Pets
        </button>
        {pets.map(pet => (
          <button
            type="button"
            key={pet.id}
            onClick={() => setSelectedPet(pet.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedPet === pet.id
                ? 'bg-[#2B6CB0] text-white'
                : 'bg-white text-[#5A6B7A] hover:bg-[#F3F7FB]'
            }`}
          >
            {pet.name}
          </button>
        ))}
      </div>

      <div className="bg-[#EAF2FF] rounded-[18px] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#2B6CB0] rounded-xl flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[#1A202C]">Today&apos;s Feeding Summary</h3>
            <p className="text-sm text-[#5A6B7A]">
              {doneCount} of {schedules.length} scheduled meals marked complete
            </p>
          </div>
        </div>
        <div className="w-full bg-white rounded-full h-3 overflow-hidden">
          <div 
            className="bg-[#2B6CB0] h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!filteredSchedules.length && (
        <p className="text-sm text-[#5A6B7A]">No feeding rows yet. Add a schedule for a pet.</p>
      )}

      <div className="feeding-grid grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSchedules.map((schedule) => {
          const pet = getPetById(schedule.petId);
          return (
            <div 
              key={schedule.id} 
              className={`feeding-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] transition-all ${
                schedule.completed ? 'opacity-70' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F3F7FB]">
                    <img 
                      src={petPhoto(pet)} 
                      alt={schedule.petName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-[#1A202C]">{schedule.petName}</p>
                    <p className="text-sm text-[#5A6B7A]">{schedule.foodType}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCompletion(schedule.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    schedule.completed 
                      ? 'bg-[#27AE60] text-white' 
                      : 'bg-[#F3F7FB] text-[#5A6B7A] hover:bg-[#EAF2FF]'
                  }`}
                >
                  {schedule.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#F3F7FB] rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[#5A6B7A] mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs uppercase">Time</span>
                  </div>
                  <p className="font-semibold text-[#1A202C]">{schedule.time}</p>
                </div>
                <div className="bg-[#F3F7FB] rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[#5A6B7A] mb-1">
                    <Apple className="w-4 h-4" />
                    <span className="text-xs uppercase">Portion</span>
                  </div>
                  <p className="font-semibold text-[#1A202C]">{schedule.portionSize}</p>
                </div>
              </div>

              {pet && (
                <div className="flex items-center gap-2 p-3 bg-[#EAF2FF] rounded-xl">
                  <Calculator className="w-4 h-4 text-[#2B6CB0]" />
                  <span className="text-sm text-[#5A6B7A]">
                    Suggested: <span className="font-medium text-[#2B6CB0]">{getSuggestedPortion(pet.weight)}</span> based on weight
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mt-4">
                {(schedule.days.length ? schedule.days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(day => (
                  <span 
                    key={day}
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      schedule.days.includes(day)
                        ? 'bg-[#2B6CB0] text-white'
                        : 'bg-[#F3F7FB] text-[#5A6B7A]'
                    }`}
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
        <h3 className="text-lg font-semibold text-[#1A202C] mb-4">Feeding Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[#F3F7FB] rounded-xl">
            <div className="w-8 h-8 bg-[#27AE60]/10 rounded-lg flex items-center justify-center mb-3">
              <Apple className="w-4 h-4 text-[#27AE60]" />
            </div>
            <h4 className="font-medium text-[#1A202C] mb-1">Portion Control</h4>
            <p className="text-sm text-[#5A6B7A]">Feed 2-3% of body weight daily, split into meals.</p>
          </div>
          <div className="p-4 bg-[#F3F7FB] rounded-xl">
            <div className="w-8 h-8 bg-[#2B6CB0]/10 rounded-lg flex items-center justify-center mb-3">
              <Clock className="w-4 h-4 text-[#2B6CB0]" />
            </div>
            <h4 className="font-medium text-[#1A202C] mb-1">Consistent Timing</h4>
            <p className="text-sm text-[#5A6B7A]">Feed at the same times daily to establish routine.</p>
          </div>
          <div className="p-4 bg-[#F3F7FB] rounded-xl">
            <div className="w-8 h-8 bg-[#F59E0B]/10 rounded-lg flex items-center justify-center mb-3">
              <Utensils className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <h4 className="font-medium text-[#1A202C] mb-1">Fresh Water</h4>
            <p className="text-sm text-[#5A6B7A]">Always provide fresh, clean water alongside meals.</p>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[18px] p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold text-[#1A202C]">Add feeding time</h3>
            {!pets.length ? (
              <p className="text-sm text-[#5A6B7A]">Add a pet first.</p>
            ) : (
              <>
                <div>
                  <Label>Pet</Label>
                  <select value={fPet} onChange={(e) => setFPet(e.target.value)} className="w-full h-12 mt-1 rounded-xl border border-[#D6E3F0] px-3 bg-[#F3F7FB]">
                    {pets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Portion</Label>
                  <Input placeholder="e.g. 250g" value={fPortion} onChange={(e) => setFPortion(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Food type</Label>
                  <Input placeholder="e.g. Dry kibble" value={fFood} onChange={(e) => setFFood(e.target.value)} className="mt-1" />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="button" className="flex-1 bg-[#2B6CB0] text-white" disabled={!pets.length} onClick={addSchedule}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
