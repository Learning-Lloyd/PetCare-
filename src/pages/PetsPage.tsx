import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, Pet } from '@/types';
import { Plus, Edit2, Trash2, Activity, Moon, Camera, Stethoscope, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { petFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface PetsPageProps {
  onNavigate: (view: ViewType) => void;
}

const hasPetPhoto = (pet: Pet) => Boolean(pet.photo && String(pet.photo).trim());

interface VetShareInfo {
  vetEmail: string;
  vetName: string;
  allowMedicalNotes: boolean;
}

interface OwnerVetHealthNote {
  id: string;
  vetName: string;
  noteKind: string;
  body: string;
  createdAt: string;
}

export default function PetsPage({ onNavigate }: PetsPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharePetId, setSharePetId] = useState<string | null>(null);
  const [sharePetName, setSharePetName] = useState('');
  const [shareVetEmail, setShareVetEmail] = useState('');
  const [shareAllowNotes, setShareAllowNotes] = useState(true);
  const [existingShares, setExistingShares] = useState<VetShareInfo[]>([]);
  const [notesPetId, setNotesPetId] = useState<string | null>(null);
  const [notesPetName, setNotesPetName] = useState('');
  const [ownerVetNotes, setOwnerVetNotes] = useState<OwnerVetHealthNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const loadPets = useCallback(async () => {
    try {
      const raw = await apiJson<Record<string, unknown>[]>('/api/pets');
      setPets(raw.map(petFromApi));
    } catch (e) {
      toast.error('Could not load pets', { description: String(e) });
      setPets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPets();
  }, [loadPets]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.pets-header',
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

      gsap.fromTo('.pet-card',
        { y: 60, opacity: 0, scale: 0.97 },
        { 
          y: 0, 
          opacity: 1, 
          scale: 1,
          duration: 0.5,
          stagger: 0.1,
          scrollTrigger: {
            trigger: '.pets-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.add-pet-card',
        { scale: 0.96, opacity: 0 },
        { 
          scale: 1, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.add-pet-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [pets.length]);

  const openVetNotes = async (petId: string, petName: string) => {
    setNotesPetId(petId);
    setNotesPetName(petName);
    setOwnerVetNotes([]);
    setNotesLoading(true);
    try {
      const rows = await apiJson<OwnerVetHealthNote[]>(`/api/pets/${petId}/vet-health-notes`);
      setOwnerVetNotes(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error('Could not load vet notes', { description: String(e) });
      setNotesPetId(null);
    } finally {
      setNotesLoading(false);
    }
  };

  const openShare = async (petId: string, petName: string) => {
    setSharePetId(petId);
    setSharePetName(petName);
    setShareVetEmail('');
    setShareAllowNotes(true);
    setExistingShares([]);
    try {
      const rows = await apiJson<VetShareInfo[]>(`/api/pets/${petId}/vet-shares`);
      setExistingShares(Array.isArray(rows) ? rows : []);
    } catch {
      setExistingShares([]);
    }
  };

  const submitShare = async () => {
    if (!sharePetId || !shareVetEmail.trim()) {
      toast.error('Enter the veterinarian account email.');
      return;
    }
    try {
      await apiJson(`/api/pets/${sharePetId}/vet-shares`, {
        method: 'POST',
        body: JSON.stringify({
          vetEmail: shareVetEmail.trim().toLowerCase(),
          allowMedicalNotes: shareAllowNotes,
        }),
      });
      toast.success('Vet access updated');
      const rows = await apiJson<VetShareInfo[]>(`/api/pets/${sharePetId}/vet-shares`);
      setExistingShares(Array.isArray(rows) ? rows : []);
      setShareVetEmail('');
    } catch (e) {
      toast.error('Could not share', { description: String(e) });
    }
  };

  const handleDeletePet = async (petId: string, petName: string) => {
    if (!confirm(`Are you sure you want to delete ${petName}?`)) return;
    try {
      await apiJson(`/api/pets/${petId}`, { method: 'DELETE' });
      setPets((prev) => prev.filter((p) => p.id !== petId));
      toast.success(`${petName} has been removed`);
    } catch (e) {
      toast.error('Could not delete pet', { description: String(e) });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-[#2B6CB0]';
      case 'Sleeping': return 'bg-[#5A6B7A]';
      case 'Healthy': return 'bg-[#27AE60]';
      case 'Observational': return 'bg-[#F59E0B]';
      default: return 'bg-[#5A6B7A]';
    }
  };

  const getHealthColor = (condition: string) => {
    switch (condition) {
      case 'Healthy': return 'bg-[#27AE60]/10 text-[#27AE60]';
      case 'Observational': return 'bg-[#F59E0B]/10 text-[#F59E0B]';
      default: return 'bg-[#5A6B7A]/10 text-[#5A6B7A]';
    }
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysUntil = (date?: Date | string) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  };

  return (
    <div ref={sectionRef} className="space-y-6">
      <div className="pets-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">My Pets</h1>
          <p className="text-[#5A6B7A]">
          Add your companions here — everything else (records, schedule, vaccines) builds on your pets.
        </p>
        </div>
        <Button 
          onClick={() => onNavigate('add-pet')}
          className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Pet
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-[#5A6B7A]">Loading pets…</p>
      )}

      {!loading && pets.length === 0 && (
        <div className="bg-white rounded-[18px] p-8 text-center shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
          <p className="text-[#1A202C] font-medium mb-2">You have not added any pets yet</p>
          <p className="text-sm text-[#5A6B7A] mb-4">Start by adding your first pet. Then you can log health records, vaccinations, feeding times, and more.</p>
          <Button onClick={() => onNavigate('add-pet')} className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Add your first pet
          </Button>
        </div>
      )}

      <div className="pets-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pets.map((pet) => (
          <div 
            key={pet.id}
            className="pet-card bg-white rounded-[18px] overflow-hidden shadow-[0_10px_30px_rgba(30,60,90,0.08)]"
          >
            <div className="relative h-48 overflow-hidden bg-[#F3F7FB]">
              {hasPetPhoto(pet) ? (
                <img
                  src={String(pet.photo)}
                  alt={pet.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#F3F7FB]">
                  <div className="flex flex-col items-center gap-2 text-[#5A6B7A]">
                    <div className="w-14 h-14 rounded-full bg-white/70 flex items-center justify-center border border-[#D6E3F0]">
                      <Camera className="w-7 h-7" />
                    </div>
                    <span className="text-xs">No photo</span>
                  </div>
                </div>
              )}
              <div className={`absolute top-3 right-3 px-3 py-1 rounded-full flex items-center gap-1.5 ${getStatusColor(pet.status)} text-white text-xs font-medium`}>
                {pet.status === 'Active' ? <Activity className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                {pet.status.toUpperCase()}
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-xl font-semibold text-[#1A202C]">{pet.name}</h3>
                  <p className="text-sm text-[#5A6B7A]">{pet.breed} • {pet.age} Years</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getHealthColor(pet.healthCondition || '')}`}>
                  {pet.healthCondition || '—'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#F3F7FB] rounded-xl p-3">
                  <p className="text-xs text-[#5A6B7A] uppercase">{pet.lastCheckup ? 'Last Checkup' : 'Next Vaccine'}</p>
                  <p className="text-sm font-medium text-[#1A202C] mt-0.5">
                    {pet.lastCheckup ? formatDate(pet.lastCheckup) : getDaysUntil(pet.nextVaccine)}
                  </p>
                </div>
                <div className="bg-[#F3F7FB] rounded-xl p-3">
                  <p className="text-xs text-[#5A6B7A] uppercase">Weight</p>
                  <p className="text-sm font-medium text-[#1A202C] mt-0.5">{pet.weight} kg</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-[#D6E3F0] flex-wrap">
                <button 
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('editPetId', pet.id);
                    onNavigate('edit-pet');
                  }}
                  className="flex items-center gap-1.5 text-sm text-[#2B6CB0] hover:text-[#1e4e8b] font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => openVetNotes(pet.id, pet.name)}
                  className="flex items-center gap-1.5 text-sm text-[#7c3aed] hover:text-[#6d28d9] font-medium"
                >
                  <StickyNote className="w-4 h-4" />
                  Vet notes
                </button>
                <button
                  type="button"
                  onClick={() => openShare(pet.id, pet.name)}
                  className="flex items-center gap-1.5 text-sm text-[#0d9488] hover:text-[#0f766e] font-medium"
                >
                  <Stethoscope className="w-4 h-4" />
                  Share with vet
                </button>
                <button 
                  type="button"
                  onClick={() => handleDeletePet(pet.id, pet.name)}
                  className="flex items-center gap-1.5 text-sm text-[#E53E3E] hover:text-[#c53030] font-medium ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        <button 
          type="button"
          onClick={() => onNavigate('add-pet')}
          className="add-pet-card border-2 border-dashed border-[#D6E3F0] rounded-[18px] p-6 flex flex-col items-center justify-center text-center hover:border-[#2B6CB0] hover:bg-[#F3F7FB] transition-all min-h-[400px]"
        >
          <div className="w-16 h-16 bg-[#F3F7FB] rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-[#5A6B7A]" />
          </div>
          <h3 className="text-lg font-semibold text-[#1A202C] mb-2">Add another pet</h3>
          <p className="text-sm text-[#5A6B7A] max-w-[200px] mb-4">
            Each pet gets its own health timeline, reminders, and schedule.
          </p>
          <span className="text-sm text-[#2B6CB0] font-medium flex items-center gap-1">
            Add pet →
          </span>
        </button>
      </div>

      <Dialog
        open={notesPetId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setNotesPetId(null);
            setOwnerVetNotes([]);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Veterinarian health notes</DialogTitle>
            <DialogDescription>
              Clinical notes your veterinarians added for {notesPetName}. Share your pet with a vet and enable
              clinical notes so they can add entries here.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-3 pr-1">
            {notesLoading && <p className="text-sm text-[#5A6B7A]">Loading…</p>}
            {!notesLoading &&
              ownerVetNotes.map((n) => (
                <Card key={n.id} className="border-[#D6E3F0] shadow-none">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex justify-between gap-2 mb-2">
                      <Badge variant="outline" className="capitalize">
                        {n.noteKind}
                      </Badge>
                      <span className="text-xs text-[#5A6B7A] shrink-0">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-[#5A6B7A] mb-1">{n.vetName}</p>
                    <p className="text-[#1A202C] text-sm whitespace-pre-wrap">{n.body}</p>
                  </CardContent>
                </Card>
              ))}
            {!notesLoading && !ownerVetNotes.length && (
              <p className="text-sm text-[#5A6B7A]">No veterinarian notes for this pet yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNotesPetId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sharePetId !== null} onOpenChange={(o) => !o && setSharePetId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share with a veterinarian</DialogTitle>
            <DialogDescription>
              Enter the email of a PetCare+ veterinarian account for {sharePetName}. They will only see this pet and
              cannot delete it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="vet-email">Vet account email</Label>
              <Input
                id="vet-email"
                type="email"
                value={shareVetEmail}
                onChange={(e) => setShareVetEmail(e.target.value)}
                placeholder="dr.smith@clinic.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="vet-notes"
                checked={shareAllowNotes}
                onCheckedChange={(c) => setShareAllowNotes(c === true)}
              />
              <Label htmlFor="vet-notes">Allow clinical notes from this vet</Label>
            </div>
            {existingShares.length > 0 && (
              <div className="rounded-lg border border-[#D6E3F0] p-3 text-sm">
                <p className="font-medium text-[#1A202C] mb-2">Currently shared with</p>
                <ul className="space-y-1 text-[#5A6B7A]">
                  {existingShares.map((s) => (
                    <li key={s.vetEmail}>
                      {s.vetName} ({s.vetEmail})
                      {s.allowMedicalNotes ? ' · notes on' : ' · notes off'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSharePetId(null)}>
              Close
            </Button>
            <Button type="button" className="bg-[#0d9488] hover:bg-[#0f766e]" onClick={submitShare}>
              Add vet access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
