import { useState, useEffect, useRef } from 'react';
import type { ViewType, RecordType, Pet } from '@/types';
import { Syringe, Stethoscope, Pill, FileText, Lightbulb, Upload, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { petFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface AddRecordPageProps {
  onNavigate: (view: ViewType) => void;
}

const recordTypes: { type: RecordType; icon: React.ReactNode; label: string }[] = [
  { type: 'Vaccination', icon: <Syringe className="w-5 h-5" />, label: 'Vaccination' },
  { type: 'Check-up', icon: <Stethoscope className="w-5 h-5" />, label: 'Check-up' },
  { type: 'Medication', icon: <Pill className="w-5 h-5" />, label: 'Medication' },
  { type: 'Treatment', icon: <FileText className="w-5 h-5" />, label: 'Other' },
];

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

export default function AddRecordPage({ onNavigate }: AddRecordPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<RecordType>('Vaccination');
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<string>('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await apiJson<Record<string, unknown>[]>('/api/pets');
        const list = raw.map(petFromApi);
        setPets(list);
        if (list.length && !selectedPet) setSelectedPet(list[0].id);
      } catch {
        toast.error('Could not load pets');
      }
    })();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.record-header',
        { x: -20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.form-section',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.form-section',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.info-panel',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.info-panel',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pets.length) {
      toast.error('Add a pet first', { description: 'You need at least one pet to create a health record.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const oversized = attachments.find((f) => f.size > MAX_ATTACHMENT_BYTES);
      if (oversized) {
        toast.error('File too large', {
          description: `${oversized.name} exceeds 5MB. Remove it or choose a smaller file.`,
        });
        setIsSubmitting(false);
        return;
      }
      const attachmentDataUrls =
        attachments.length > 0 ? await Promise.all(attachments.map(fileToDataUrl)) : [];
      await apiJson('/api/health-records', {
        method: 'POST',
        body: JSON.stringify({
          petId: selectedPet,
          recordType: selectedType,
          date,
          notes,
          attachments: attachmentDataUrls,
        }),
      });
      toast.success('Health record created!', {
        description: 'The record has been saved to your database.',
      });
      onNavigate('health-records');
    } catch (err) {
      toast.error('Could not save record', { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPetData = pets.find(p => p.id === selectedPet);

  return (
    <div ref={sectionRef} className="space-y-6 max-w-5xl">
      <div className="record-header">
        <div className="flex items-center gap-2 text-sm text-[#5A6B7A] mb-2">
          <button type="button" onClick={() => onNavigate('health-records')} className="hover:text-[#1A202C]">
            Health Records
          </button>
          <span>›</span>
          <span className="text-[#2B6CB0]">Add New Record</span>
        </div>
        <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Create Health Entry</h1>
        <p className="text-[#5A6B7A]">
          Log visits and treatments for a pet you have already added.
        </p>
      </div>

      {!pets.length ? (
        <div className="bg-white rounded-[18px] p-8 shadow-[0_10px_30px_rgba(30,60,90,0.08)] text-center">
          <p className="text-[#1A202C] font-medium mb-2">No pets yet</p>
          <p className="text-sm text-[#5A6B7A] mb-4">Add a pet first, then you can attach health records.</p>
          <Button type="button" onClick={() => onNavigate('add-pet')} className="bg-[#2B6CB0] text-white rounded-xl">
            Add a pet
          </Button>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            <div className="form-section bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#1A202C]">Select Pet</Label>
                  <select
                    value={selectedPet}
                    onChange={(e) => setSelectedPet(e.target.value)}
                    className="w-full h-12 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl px-3 text-[#1A202C] focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                  >
                    {pets.map(pet => (
                      <option key={pet.id} value={pet.id}>{pet.name} ({pet.breed})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#1A202C]">Service Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <Label className="text-sm font-medium text-[#1A202C]">Type of Record</Label>
                <div className="grid grid-cols-4 gap-3">
                  {recordTypes.map((type) => (
                    <button
                      key={type.type}
                      type="button"
                      onClick={() => setSelectedType(type.type)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        selectedType === type.type
                          ? 'border-[#2B6CB0] bg-[#EAF2FF] text-[#2B6CB0]'
                          : 'border-[#D6E3F0] bg-white text-[#5A6B7A] hover:border-[#2B6CB0]/50'
                      }`}
                    >
                      {type.icon}
                      <span className="text-xs font-medium mt-2">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <Label className="text-sm font-medium text-[#1A202C]">Clinical Observations & Notes</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Document the details of the visit..."
                  className="w-full h-32 bg-[#F3F7FB] border border-[#D6E3F0] rounded-xl p-3 text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0] resize-none"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-[#1A202C]">Attachments</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  multiple
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (!picked.length) return;
                    setAttachments((prev) => {
                      const next = [...prev, ...picked].slice(0, MAX_ATTACHMENTS);
                      if (prev.length + picked.length > MAX_ATTACHMENTS) {
                        toast.message('Attachment limit', {
                          description: `Up to ${MAX_ATTACHMENTS} files per record. Extra files were skipped.`,
                        });
                      }
                      return next;
                    });
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-[#D6E3F0] rounded-xl p-6 text-center hover:border-[#2B6CB0] transition-colors cursor-pointer bg-[#FAFCFE]"
                >
                  <Upload className="w-8 h-8 text-[#5A6B7A] mx-auto mb-2" />
                  <p className="text-sm text-[#1A202C] font-medium">Upload files</p>
                  <p className="text-xs text-[#5A6B7A] mt-1">
                    Images or PDF, up to {MAX_ATTACHMENTS} files (5MB each)
                  </p>
                </button>
                {attachments.length > 0 && (
                  <ul className="space-y-2">
                    {attachments.map((f, i) => (
                      <li
                        key={`${f.name}-${i}-${f.size}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[#D6E3F0] bg-[#F3F7FB] px-3 py-2 text-sm text-[#1A202C]"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          className="shrink-0 p-1 rounded-md hover:bg-white text-[#5A6B7A]"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="outline" onClick={() => onNavigate('health-records')} className="rounded-xl">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl">
                  {isSubmitting ? 'Saving…' : 'Save Record'}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <div className="info-panel space-y-4">
          <div className="bg-[#EAF2FF] rounded-[18px] p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-[#2B6CB0] rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-[#1A202C] mb-1">Selected pet</h4>
                <p className="text-sm text-[#5A6B7A]">
                  {selectedPetData ? `${selectedPetData.name} — records are stored in MySQL and show on Health Records.` : '—'}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[18px] p-5 shadow-[0_10px_30px_rgba(30,60,90,0.08)] flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-[#27AE60]" />
            <p className="text-sm text-[#5A6B7A]">Data is saved to your account in the database.</p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
