import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Vaccination, Pet } from '@/types';
import { Plus, Syringe, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { mapPetRow, mapVaccinationRow, requireUserId, throwOnError } from '@/lib/supabaseHelpers';
import { petFromApi, vaccinationFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface VaccinationsPageProps {
  onNavigate: (view: ViewType) => void;
}

export default function VaccinationsPage({ onNavigate: _onNavigate }: VaccinationsPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalPet, setModalPet] = useState('');
  const [modalName, setModalName] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [modalNext, setModalNext] = useState('');
  const [modalNotes, setModalNotes] = useState('');

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
      setModalPet((prev) => prev || (plist[0]?.id ?? ''));
      const petIds = plist.map((p) => p.id);
      if (!petIds.length) {
        setVaccinations([]);
        return;
      }
      const { data: v, error: eV } = await supabase
        .from('vaccinations')
        .select('*')
        .in('pet_id', petIds)
        .order('date_given', { ascending: false });
      throwOnError(eV);
      setVaccinations((v || []).map((row) => vaccinationFromApi(mapVaccinationRow(row as Record<string, unknown>))));
    } catch (e) {
      toast.error('Could not load vaccinations', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.vax-header',
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

      gsap.fromTo('.vax-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.vax-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [vaccinations.length]);

  const handleStatusChange = async (id: string, newStatus: 'Done' | 'Pending') => {
    try {
      const { data: updated, error } = await supabase
        .from('vaccinations')
        .update({ status: newStatus })
        .eq('id', id)
        .select()
        .single();
      throwOnError(error);
      const row = vaccinationFromApi(mapVaccinationRow(updated as Record<string, unknown>));
      setVaccinations((prev) => prev.map((v) => (v.id === id ? row : v)));
      toast.success(`Vaccination marked as ${newStatus.toLowerCase()}`);
    } catch (e) {
      toast.error('Could not update', { description: String(e) });
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysUntil = (date?: Date | string) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
  };

  const pendingVaccinations = vaccinations.filter(v => v.status === 'Pending');
  const completedVaccinations = vaccinations.filter(v => v.status === 'Done');

  const submitModal = async () => {
    if (!pets.length) {
      toast.error('Add a pet first');
      return;
    }
    if (!modalName.trim() || !modalDate) {
      toast.error('Vaccine name and date are required');
      return;
    }
    try {
      const pet = pets.find((p) => p.id === modalPet);
      const { error } = await supabase.from('vaccinations').insert({
        pet_id: modalPet,
        pet_name: pet?.name ?? '',
        vaccine_name: modalName.trim(),
        date_given: modalDate,
        next_due_date: modalNext || null,
        notes: modalNotes.trim() || null,
        status: 'Pending',
      });
      throwOnError(error);
      toast.success('Vaccination added');
      setShowAddModal(false);
      setModalName('');
      setModalDate('');
      setModalNext('');
      setModalNotes('');
      await load();
    } catch (e) {
      toast.error('Could not add', { description: String(e) });
    }
  };

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="vax-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Vaccinations</h1>
          <p className="text-[#5A6B7A]">Track vaccines for each pet — data is stored in your database.</p>
        </div>
        <Button 
          type="button"
          onClick={() => setShowAddModal(true)}
          className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vaccination
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#F59E0B]">
          <p className="text-xs text-[#5A6B7A] uppercase">Pending</p>
          <p className="text-2xl font-bold text-[#1A202C]">{pendingVaccinations.length}</p>
        </div>
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#27AE60]">
          <p className="text-xs text-[#5A6B7A] uppercase">Completed</p>
          <p className="text-2xl font-bold text-[#1A202C]">{completedVaccinations.length}</p>
        </div>
        <div className="bg-white rounded-[14px] p-4 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#2B6CB0]">
          <p className="text-xs text-[#5A6B7A] uppercase">Total</p>
          <p className="text-2xl font-bold text-[#1A202C]">{vaccinations.length}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[#1A202C] mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
          Upcoming & Pending
        </h2>
        {!pendingVaccinations.length && (
          <p className="text-sm text-[#5A6B7A] mb-4">No pending vaccines. Add one with the button above.</p>
        )}
        <div className="vax-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingVaccinations.map((vax) => (
              <div key={vax.id} className="vax-card bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FEF3F2] rounded-xl flex items-center justify-center">
                      <Syringe className="w-5 h-5 text-[#F59E0B]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1A202C]">{vax.vaccineName}</p>
                      <p className="text-sm text-[#5A6B7A]">{vax.petName}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-[#FEF3F2] text-[#F59E0B] text-xs font-medium rounded-full">
                    Pending
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-[#5A6B7A]">
                    <Calendar className="w-4 h-4" />
                    <span>Given: {formatDate(vax.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#F59E0B]">
                    <Clock className="w-4 h-4" />
                    <span>{getDaysUntil(vax.nextDueDate)}</span>
                  </div>
                </div>

                {vax.notes && (
                  <p className="text-sm text-[#5A6B7A] mb-4 bg-[#F3F7FB] rounded-lg p-2">
                    {vax.notes}
                  </p>
                )}

                <Button
                  type="button"
                  onClick={() => handleStatusChange(vax.id, 'Done')}
                  className="w-full bg-[#27AE60] hover:bg-[#1e8a4a] text-white rounded-xl"
                  size="sm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark as Done
                </Button>
              </div>
            ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[#1A202C] mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#27AE60]" />
          Completed
        </h2>
        <div className="bg-white rounded-[18px] shadow-[0_10px_30px_rgba(30,60,90,0.08)] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F3F7FB]">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Pet</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Vaccine</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Date</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Next Due</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D6E3F0]">
              {!completedVaccinations.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#5A6B7A]">No completed entries yet.</td>
                </tr>
              )}
              {completedVaccinations.map((vax) => (
                <tr key={vax.id} className="hover:bg-[#F3F7FB]/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                        <span className="text-sm font-medium text-[#2B6CB0]">{vax.petName.charAt(0)}</span>
                      </div>
                      <span className="font-medium text-[#1A202C]">{vax.petName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#1A202C]">{vax.vaccineName}</td>
                  <td className="px-6 py-4 text-[#5A6B7A]">{formatDate(vax.date)}</td>
                  <td className="px-6 py-4 text-[#5A6B7A]">{vax.nextDueDate ? formatDate(vax.nextDueDate) : 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-[#27AE60]/10 text-[#27AE60] text-xs font-medium rounded-full">
                      Done
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[18px] p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[#1A202C] mb-4">Add Vaccination</h3>
            {!pets.length ? (
              <p className="text-sm text-[#5A6B7A] mb-4">Add a pet first, then you can log vaccines.</p>
            ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-[#1A202C]">Select Pet</Label>
                <select
                  value={modalPet}
                  onChange={(e) => setModalPet(e.target.value)}
                  className="w-full h-12 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl px-3 mt-1"
                >
                  {pets.map(pet => (
                    <option key={pet.id} value={pet.id}>{pet.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A202C]">Vaccine Name</Label>
                <Input 
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="e.g. Rabies"
                  className="w-full h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A202C]">Date given</Label>
                <Input 
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A202C]">Next due (optional)</Label>
                <Input 
                  type="date"
                  value={modalNext}
                  onChange={(e) => setModalNext(e.target.value)}
                  className="w-full h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A202C]">Notes</Label>
                <textarea 
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full h-24 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl px-3 py-2 mt-1 resize-none"
                />
              </div>
            </div>
            )}
            <div className="flex gap-3 mt-6">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setShowAddModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={submitModal}
                disabled={!pets.length}
                className="flex-1 bg-[#2B6CB0] hover:bg-[#1e4e8b]"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
