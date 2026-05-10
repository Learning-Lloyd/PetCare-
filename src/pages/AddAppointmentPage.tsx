import { useState, useEffect, useRef } from 'react';
import type { ViewType, Pet } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { computeAvailableSlotsForVet, mapPetRow, ownerBookAppointment, requireUserId, throwOnError } from '@/lib/supabaseHelpers';
import { petFromApi } from '@/lib/models';
import { Calendar, Clock, Shield, RefreshCw, FileText, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';

gsap.registerPlugin(ScrollTrigger);

interface VetListItem {
  id: string;
  name: string;
  email: string;
  vetLicenseId?: string;
}

interface AddAppointmentPageProps {
  onNavigate: (view: ViewType) => void;
}

export default function AddAppointmentPage({ onNavigate }: AddAppointmentPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [vets, setVets] = useState<VetListItem[]>([]);
  const [selectedPet, setSelectedPet] = useState('');
  const [selectedVet, setSelectedVet] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = await requireUserId();
        const { data: rawPets, error: eP } = await supabase
          .from('pets')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        throwOnError(eP);
        const list = (rawPets || []).map((row) => petFromApi(mapPetRow(row as Record<string, unknown>)));
        setPets(list);
        if (list.length) setSelectedPet(list[0].id);
        const { data: rawVets, error: eV } = await supabase
          .from('users')
          .select('id,name,email,vet_license_id,is_active')
          .eq('is_vet', true)
          .order('name', { ascending: true });
        throwOnError(eV);
        const vetList: VetListItem[] = (rawVets || [])
          .filter((v) => v.is_active !== false)
          .map((v) => ({
          id: String(v.id),
          name: String(v.name ?? ''),
          email: String(v.email ?? ''),
          vetLicenseId: v.vet_license_id ? String(v.vet_license_id) : undefined,
        }));
        setVets(vetList);
        if (vetList.length) setSelectedVet(vetList[0].id);
      } catch {
        toast.error('Could not load pets or veterinarians');
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedVet || !date) {
      setSlots([]);
      setSelectedTime('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const slots = await computeAvailableSlotsForVet(selectedVet, date);
        if (!cancelled) {
          setSlots(slots);
          setSelectedTime('');
        }
      } catch {
        if (!cancelled) {
          setSlots([]);
          toast.error('Could not load available times');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVet, date]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.appointment-header',
        { y: -20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      gsap.fromTo(
        '.form-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.form-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pets.length || !selectedPet) {
      toast.error('Add a pet first');
      return;
    }
    if (!selectedVet) {
      toast.error('Select a veterinarian');
      return;
    }
    if (!date || !selectedTime) {
      toast.error('Pick a date and an available time slot');
      return;
    }
    setIsSubmitting(true);
    try {
      const uid = await requireUserId();
      const pet = pets.find((p) => p.id === selectedPet);
      await ownerBookAppointment({
        ownerId: uid,
        petId: selectedPet,
        vetId: selectedVet,
        petName: pet?.name ?? '',
        reason,
        date,
        time: selectedTime,
        notes: notes.trim() || undefined,
      });
      toast.success('Booking request sent', {
        description: 'Your vet will confirm or suggest another time. Check Schedule for status.',
      });
      onNavigate('schedule');
    } catch (err) {
      toast.error('Could not book', { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pets.length) {
    return (
      <div ref={sectionRef} className="space-y-6 max-w-4xl">
        <div className="appointment-header mb-4">
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Book appointment</h1>
          <p className="text-[#5A6B7A] mb-4">Add at least one pet before booking with a vet.</p>
          <Button type="button" onClick={() => onNavigate('add-pet')} className="bg-[#2B6CB0] text-white rounded-xl">
            Add a pet
          </Button>
        </div>
      </div>
    );
  }

  if (!vets.length) {
    return (
      <div ref={sectionRef} className="space-y-6 max-w-4xl">
        <div className="appointment-header mb-4">
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Book appointment</h1>
          <p className="text-[#5A6B7A] mb-4">
            No veterinarian accounts are registered yet. An administrator can mark a user as a vet in Admin, then
            you can book here.
          </p>
          <Button type="button" variant="outline" onClick={() => onNavigate('schedule')} className="rounded-xl">
            Back to schedule
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="space-y-6 max-w-4xl">
      <div className="appointment-header">
        <div className="flex items-center gap-2 text-sm text-[#5A6B7A] mb-2">
          <button type="button" onClick={() => onNavigate('schedule')} className="hover:text-[#1A202C]">
            Schedule
          </button>
          <span>›</span>
          <span className="text-[#2B6CB0]">Book appointment</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Book appointment</h1>
            <p className="text-[#5A6B7A]">
              Choose your pet, a veterinarian, and an open slot. The visit stays Pending until the vet accepts.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 bg-[#EAF2FF] rounded-xl px-4 py-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-[#2B6CB0]" />
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-card bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A202C]">Select pet</Label>
              <select
                value={selectedPet}
                onChange={(e) => setSelectedPet(e.target.value)}
                className="w-full h-12 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl px-3 text-[#1A202C] focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
              >
                <option value="">Choose a pet…</option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A202C]">Select veterinarian</Label>
              <select
                value={selectedVet}
                onChange={(e) => setSelectedVet(e.target.value)}
                className="w-full h-12 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl px-3 text-[#1A202C] focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
              >
                <option value="">Choose a vet…</option>
                {vets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.vetLicenseId ? ` (${v.vetLicenseId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm font-medium text-[#1A202C]">Reason for visit</Label>
              <Input
                placeholder="e.g. Annual exam, limping, vaccine boosters"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A202C]">Date</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C]"
                  required
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5A6B7A] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A202C]">Available time</Label>
              <p className="text-xs text-[#5A6B7A] mb-1">Slots follow each vet’s published hours (default 9–5, every 30 min).</p>
              {loadingSlots ? (
                <p className="text-sm text-[#5A6B7A] py-2">Loading open slots…</p>
              ) : !date ? (
                <p className="text-sm text-[#5A6B7A] py-2">Pick a date to see open times.</p>
              ) : !slots.length ? (
                <p className="text-sm text-amber-700 py-2">No open slots that day. Try another date.</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        selectedTime === slot
                          ? 'bg-[#2B6CB0] text-white border-[#2B6CB0]'
                          : 'bg-[#F3F7FB] border-[#D6E3F0] text-[#1A202C] hover:border-[#2B6CB0]'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 inline mr-1 opacity-80" />
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <Label className="text-sm font-medium text-[#1A202C]">Notes for the clinic (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Symptoms, medications, or special handling…"
              className="w-full h-28 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl p-3 text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-[#D6E3F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onNavigate('schedule')}
              className="h-12 px-6 rounded-xl border-[#D6E3F0] text-[#5A6B7A] hover:bg-[#F3F7FB]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedTime}
              className="h-12 px-8 bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
            >
              {isSubmitting ? 'Booking…' : 'Book appointment'}
            </Button>
          </div>
        </div>
      </form>

      <div className="info-cards grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="info-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center mb-3">
            <Shield className="w-5 h-5 text-[#2B6CB0]" />
          </div>
          <h4 className="font-semibold text-[#1A202C] mb-1">Real workflow</h4>
          <p className="text-sm text-[#5A6B7A]">Requests are stored as Pending until your vet accepts or proposes a new time.</p>
        </div>
        <div className="info-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center mb-3">
            <RefreshCw className="w-5 h-5 text-[#2B6CB0]" />
          </div>
          <h4 className="font-semibold text-[#1A202C] mb-1">No double booking</h4>
          <p className="text-sm text-[#5A6B7A]">Confirmed and pending slots are removed from the picker for everyone else.</p>
        </div>
        <div className="info-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)]">
          <div className="w-10 h-10 bg-[#EAF2FF] rounded-xl flex items-center justify-center mb-3">
            <FileText className="w-5 h-5 text-[#2B6CB0]" />
          </div>
          <h4 className="font-semibold text-[#1A202C] mb-1">Notifications</h4>
          <p className="text-sm text-[#5A6B7A]">You and your vet get in-app alerts when status changes.</p>
        </div>
      </div>
    </div>
  );
}
