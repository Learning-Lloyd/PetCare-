import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Exercise, ExerciseType, Pet } from '@/types';
import { Plus, Activity, Footprints, Timer, Flame, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { mapExerciseRow, mapPetRow, requireUserId, throwOnError } from '@/lib/supabaseHelpers';
import { exerciseFromApi, petFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface ExercisePageProps {
  onNavigate: (view: ViewType) => void;
}

const petPhoto = (pet?: Pet) =>
  pet?.photo || (pet ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(pet.name)}` : '');

export default function ExercisePage({ onNavigate: _onNavigate }: ExercisePageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [ePet, setEPet] = useState('');
  const [eType, setEType] = useState<ExerciseType>('Walk');
  const [eDur, setEDur] = useState('30');
  const [eCal, setECal] = useState('');
  const [eDate, setEDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eNotes, setENotes] = useState('');

  const load = useCallback(async () => {
    try {
      const uid = await requireUserId();
      const { data: petsRaw, error: eP } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      throwOnError(eP);
      const plist = (petsRaw || []).map((row) => petFromApi(mapPetRow(row as Record<string, unknown>)));
      setPets(plist);
      setEPet((prev) => prev || plist[0]?.id || '');
      const petIds = plist.map((p) => p.id);
      if (!petIds.length) {
        setExercises([]);
        return;
      }
      const { data: ex, error: eE } = await supabase
        .from('exercise_logs')
        .select('*')
        .in('pet_id', petIds)
        .order('log_date', { ascending: false });
      throwOnError(eE);
      setExercises((ex || []).map((row) => exerciseFromApi(mapExerciseRow(row as Record<string, unknown>))));
    } catch (e) {
      toast.error('Could not load exercises', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.exercise-header',
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

      gsap.fromTo('.exercise-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.exercise-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [exercises.length]);

  const filteredExercises = selectedPet === 'all' 
    ? exercises 
    : exercises.filter(e => e.petId === selectedPet);

  const getPetById = (id: string) => pets.find(p => p.id === id);

  const getDailyProgress = (petId: string) => {
    const petExercises = exercises.filter(e => 
      e.petId === petId && 
      new Date(e.date).toDateString() === new Date().toDateString()
    );
    const totalMinutes = petExercises.reduce((sum, e) => sum + e.duration, 0);
    const goal = 60;
    return Math.min((totalMinutes / goal) * 100, 100);
  };

  const getTotalStats = () => {
    const today = new Date().toDateString();
    const todayExercises = exercises.filter(e => new Date(e.date).toDateString() === today);
    return {
      totalDuration: todayExercises.reduce((sum, e) => sum + e.duration, 0),
      totalCalories: todayExercises.reduce((sum, e) => sum + (e.caloriesBurned || 0), 0),
      count: todayExercises.length,
    };
  };

  const stats = getTotalStats();

  const logExercise = async () => {
    if (!pets.length) {
      toast.error('Add a pet first');
      return;
    }
    const duration = Number(eDur);
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error('Enter a valid duration in minutes');
      return;
    }
    try {
      const pet = pets.find((p) => p.id === ePet);
      const { error } = await supabase.from('exercise_logs').insert({
        pet_id: ePet,
        pet_name: pet?.name ?? '',
        exercise_type: eType,
        duration_minutes: duration,
        calories_burned: eCal ? Number(eCal) : null,
        log_date: eDate,
        notes: eNotes.trim() || null,
      });
      throwOnError(error);
      toast.success('Activity logged');
      setShowModal(false);
      setENotes('');
      setEDur('30');
      await load();
    } catch (e) {
      toast.error('Could not save', { description: String(e) });
    }
  };

  const types: ExerciseType[] = ['Walk', 'Playtime', 'Running', 'Swimming'];

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="exercise-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Exercise Tracker</h1>
          <p className="text-[#5A6B7A]">Log walks and playtime — stored per pet in your database.</p>
        </div>
        <Button 
          type="button"
          onClick={() => setShowModal(true)}
          className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Log Activity
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#2B6CB0]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <Timer className="w-5 h-5 text-[#2B6CB0]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Today&apos;s Duration</p>
              <p className="text-2xl font-bold text-[#1A202C]">{stats.totalDuration} min</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#F59E0B]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#FEF3F2] rounded-xl flex items-center justify-center">
              <Flame className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Calories Burned</p>
              <p className="text-2xl font-bold text-[#1A202C]">{stats.totalCalories}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#27AE60]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#27AE60]" />
            </div>
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase">Activities</p>
              <p className="text-2xl font-bold text-[#1A202C]">{stats.count}</p>
            </div>
          </div>
        </div>
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

      <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
        <h3 className="text-lg font-semibold text-[#1A202C] mb-4">Daily Exercise Goals</h3>
        {!pets.length && <p className="text-sm text-[#5A6B7A]">Add pets to see progress toward a 60 min/day goal.</p>}
        <div className="space-y-4">
          {pets.map(pet => {
            const progress = getDailyProgress(pet.id);
            return (
              <div key={pet.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#F3F7FB]">
                  <img src={petPhoto(pet)} alt={pet.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[#1A202C]">{pet.name}</span>
                    <span className="text-sm text-[#5A6B7A]">{Math.round(progress)}% of goal</span>
                  </div>
                  <div className="h-2 bg-[#F3F7FB] rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        progress >= 100 ? 'bg-[#27AE60]' : 'bg-[#2B6CB0]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[#1A202C] mb-4">Recent Activities</h2>
        {!filteredExercises.length && (
          <p className="text-sm text-[#5A6B7A] mb-4">No exercises logged yet.</p>
        )}
        <div className="exercise-grid grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredExercises.map((exercise) => {
            const pet = getPetById(exercise.petId);
            return (
              <div 
                key={exercise.id} 
                className="exercise-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F3F7FB]">
                      <img 
                        src={petPhoto(pet)} 
                        alt={exercise.petName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1A202C]">{exercise.petName}</p>
                      <p className="text-sm text-[#5A6B7A]">{exercise.type}</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
                    {exercise.type === 'Walk' || exercise.type === 'Running' ? (
                      <Footprints className="w-5 h-5 text-[#2B6CB0]" />
                    ) : (
                      <Activity className="w-5 h-5 text-[#2B6CB0]" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-[#F3F7FB] rounded-xl p-3 text-center">
                    <Timer className="w-4 h-4 text-[#5A6B7A] mx-auto mb-1" />
                    <p className="text-lg font-semibold text-[#1A202C]">{exercise.duration}</p>
                    <p className="text-xs text-[#5A6B7A]">min</p>
                  </div>
                  <div className="bg-[#F3F7FB] rounded-xl p-3 text-center">
                    <Flame className="w-4 h-4 text-[#5A6B7A] mx-auto mb-1" />
                    <p className="text-lg font-semibold text-[#1A202C]">{exercise.caloriesBurned || 0}</p>
                    <p className="text-xs text-[#5A6B7A]">kcal</p>
                  </div>
                  <div className="bg-[#F3F7FB] rounded-xl p-3 text-center">
                    <Calendar className="w-4 h-4 text-[#5A6B7A] mx-auto mb-1" />
                    <p className="text-sm font-semibold text-[#1A202C]">
                      {new Date(exercise.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-[#5A6B7A]">date</p>
                  </div>
                </div>

                {exercise.notes && (
                  <p className="text-sm text-[#5A6B7A] bg-[#F3F7FB] rounded-lg p-2">
                    {exercise.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[18px] p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Log activity</h3>
            {!pets.length ? (
              <p className="text-sm text-[#5A6B7A]">Add a pet first.</p>
            ) : (
              <>
                <div>
                  <Label>Pet</Label>
                  <select value={ePet} onChange={(e) => setEPet(e.target.value)} className="w-full h-12 mt-1 rounded-xl border px-3 bg-[#F3F7FB]">
                    {pets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Type</Label>
                  <select value={eType} onChange={(e) => setEType(e.target.value as ExerciseType)} className="w-full h-12 mt-1 rounded-xl border px-3 bg-[#F3F7FB]">
                    {types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input value={eDur} onChange={(e) => setEDur(e.target.value)} className="mt-1" type="number" min={1} />
                </div>
                <div>
                  <Label>Calories (optional)</Label>
                  <Input value={eCal} onChange={(e) => setECal(e.target.value)} className="mt-1" type="number" min={0} />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={eNotes} onChange={(e) => setENotes(e.target.value)} className="mt-1" placeholder="Optional" />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="button" className="flex-1 bg-[#2B6CB0] text-white" disabled={!pets.length} onClick={logExercise}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
