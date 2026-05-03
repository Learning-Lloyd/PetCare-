import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ViewType, PetType, Pet } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Camera, Lightbulb, Search } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { petFromApi } from '@/lib/models';

gsap.registerPlugin(ScrollTrigger);

interface AddPetPageProps {
  onNavigate: (view: ViewType) => void;
  editMode?: boolean;
}

const petTypes: PetType[] = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];

/** Curated breeds for search-as-you-type (owners can still pick or type any custom value). */
const BREEDS_BY_TYPE: Record<PetType, readonly string[]> = {
  Dog: [
    'Mixed breed',
    'Golden Retriever',
    'Labrador Retriever',
    'German Shepherd',
    'French Bulldog',
    'Bulldog',
    'Poodle',
    'Beagle',
    'Rottweiler',
    'Yorkshire Terrier',
    'Dachshund',
    'Siberian Husky',
    'Shih Tzu',
    'Border Collie',
    'Australian Shepherd',
    'Cocker Spaniel',
    'Chihuahua',
    'Boxer',
    'Doberman Pinscher',
    'Great Dane',
    'Cavalier King Charles Spaniel',
    'Maltese',
    'Pomeranian',
    'Schnauzer',
    'Jack Russell Terrier',
    'Pug',
    'Mastiff',
    'Saint Bernard',
    'Other (describe in notes)',
  ],
  Cat: [
    'Mixed breed',
    'Domestic Shorthair',
    'Domestic Longhair',
    'Persian',
    'Maine Coon',
    'Ragdoll',
    'British Shorthair',
    'Siamese',
    'Bengal',
    'Sphynx',
    'Scottish Fold',
    'American Shorthair',
    'Russian Blue',
    'Norwegian Forest Cat',
    'Abyssinian',
    'Birman',
    'Oriental Shorthair',
    'Devon Rex',
    'Himalayan',
    'Other (describe in notes)',
  ],
  Bird: [
    'Mixed / unknown',
    'Budgerigar (Budgie)',
    'Cockatiel',
    'Lovebird',
    'Canary',
    'Finch (Zebra)',
    'Conure',
    'African Grey Parrot',
    'Macaw',
    'Cockatoo',
    'Amazon Parrot',
    'Quaker Parakeet',
    'Eclectus',
    'Dove / Pigeon',
    'Chicken',
    'Duck',
    'Other (describe in notes)',
  ],
  Rabbit: [
    'Mixed breed',
    'Holland Lop',
    'Mini Lop',
    'Netherland Dwarf',
    'Lionhead',
    'Flemish Giant',
    'Rex',
    'English Angora',
    'Dutch',
    'Mini Rex',
    'Polish',
    'Harlequin',
    'Other (describe in notes)',
  ],
  Other: [
    'Mixed / unspecified',
    'Hamster',
    'Guinea Pig',
    'Gerbil',
    'Rat',
    'Mouse',
    'Chinchilla',
    'Ferret',
    'Turtle',
    'Tortoise',
    'Snake',
    'Lizard',
    'Fish',
    'Horse',
    'Goat',
    'Other (describe in notes)',
  ],
};

export default function AddPetPage({ onNavigate, editMode = false }: AddPetPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const breedInputRef = useRef<HTMLInputElement>(null);
  const breedComboRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Dog' as PetType,
    customType: '',
    breed: '',
    age: '',
    weight: '',
    healthCondition: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<string | null>(null);
  const [breedMenuOpen, setBreedMenuOpen] = useState(false);
  const [breedActiveIndex, setBreedActiveIndex] = useState(-1);

  const breedCatalog = BREEDS_BY_TYPE[formData.type] ?? BREEDS_BY_TYPE.Other;

  const breedSuggestions = useMemo(() => {
    const q = formData.breed.trim().toLowerCase();
    if (!q) return [...breedCatalog].slice(0, 12);
    return breedCatalog.filter((b) => b.toLowerCase().includes(q)).slice(0, 20);
  }, [formData.breed, breedCatalog]);

  const closeBreedMenu = useCallback(() => {
    setBreedMenuOpen(false);
    setBreedActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!breedMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = breedComboRef.current;
      if (el && !el.contains(e.target as Node)) closeBreedMenu();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [breedMenuOpen, closeBreedMenu]);

  useEffect(() => {
    setBreedActiveIndex(-1);
  }, [formData.type]);

  useEffect(() => {
    if (!editMode) return;
    const id = sessionStorage.getItem('editPetId');
    if (!id) return;
    setEditingId(id);
    (async () => {
      try {
        const raw = await apiJson<Record<string, unknown>[]>('/api/pets');
        const p = raw.map(petFromApi).find((x: Pet) => x.id === id);
        if (p) {
          const normalizedType = (petTypes as string[]).includes(p.type) ? p.type : 'Other';
          setFormData({
            name: p.name,
            type: normalizedType as PetType,
            customType: normalizedType === 'Other' ? String(p.type || '').trim() : '',
            breed: p.breed,
            age: String(p.age),
            weight: String(p.weight),
            healthCondition: p.healthCondition || '',
          });
          if (p.photo) setSelectedPhotoPreviewUrl(String(p.photo));
        }
      } catch {
        toast.error('Could not load pet for editing');
      }
    })();
  }, [editMode]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.add-pet-header',
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

      gsap.fromTo('.form-card',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.form-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.upload-area',
        { x: 20, opacity: 0 },
        { 
          x: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.upload-area',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.tip-card',
        { y: 20, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.tip-card',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const typeToSave =
        formData.type === 'Other' ? (formData.customType || '').trim() || 'Other' : formData.type;
      const body = JSON.stringify({
        name: formData.name,
        type: typeToSave,
        breed: formData.breed,
        age: Number(formData.age),
        weight: Number(formData.weight),
        healthCondition: formData.healthCondition || undefined,
      });
      if (editMode && editingId) {
        await apiJson(`/api/pets/${editingId}`, { method: 'PATCH', body });
        if (selectedPhoto) {
          const dataUrl = await fileToDataUrl(selectedPhoto);
          const updated = await apiJson<Record<string, unknown>>(`/api/pets/${editingId}/photo`, {
            method: 'POST',
            body: JSON.stringify({ dataUrl }),
          });
          const p = petFromApi(updated);
          setSelectedPhoto(null);
          setSelectedPhotoPreviewUrl(p.photo ? String(p.photo) : null);
        }
        sessionStorage.removeItem('editPetId');
        toast.success('Pet profile updated!', { description: `${formData.name} has been saved.` });
      } else {
        const created = await apiJson<Record<string, unknown>>('/api/pets', { method: 'POST', body });
        const createdPet = petFromApi(created);
        if (selectedPhoto) {
          const dataUrl = await fileToDataUrl(selectedPhoto);
          const updated = await apiJson<Record<string, unknown>>(`/api/pets/${createdPet.id}/photo`, {
            method: 'POST',
            body: JSON.stringify({ dataUrl }),
          });
          const p = petFromApi(updated);
          setSelectedPhoto(null);
          setSelectedPhotoPreviewUrl(p.photo ? String(p.photo) : null);
        }
        toast.success('New pet added!', {
          description: `${formData.name} is saved. You can add health records, vaccines, and more.`,
        });
      }
      onNavigate('pets');
    } catch (err) {
      toast.error('Could not save pet', { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const selectBreed = (value: string) => {
    handleChange('breed', value);
    closeBreedMenu();
    breedInputRef.current?.focus();
  };

  const onBreedKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!breedMenuOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setBreedMenuOpen(true);
      setBreedActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!breedMenuOpen) return;

    if (e.key === 'Escape') {
      closeBreedMenu();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      setBreedActiveIndex((i) => Math.min(i + 1, breedSuggestions.length - 1));
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      setBreedActiveIndex((i) => Math.max(i - 1, 0));
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && breedActiveIndex >= 0 && breedSuggestions[breedActiveIndex]) {
      selectBreed(breedSuggestions[breedActiveIndex]);
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    const url = URL.createObjectURL(selectedPhoto);
    setSelectedPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPhoto]);

  const openFilePicker = () => fileInputRef.current?.click();

  const onPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedPhoto(file);
    if (file) toast.success('Photo selected', { description: file.name });
    // Allow selecting the same file again later.
    e.target.value = '';
  };

  return (
    <div ref={sectionRef} className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="add-pet-header">
        <button 
          onClick={() => onNavigate('pets')}
          className="flex items-center gap-2 text-sm text-[#5A6B7A] hover:text-[#1A202C] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pets
        </button>
        <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">
          {editMode ? 'Edit Pet Profile' : 'Add New Pet'}
        </h1>
        <p className="text-[#5A6B7A]">
          {editMode ? 'Update your companion\'s clinical profile.' : 'Create a comprehensive clinical profile for your new companion.'}
        </p>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            <div className="form-card bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)]">
              <h2 className="text-lg font-semibold text-[#2B6CB0] mb-6">Basic Information</h2>
              
              <div className="space-y-5">
                {/* Pet Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-[#1A202C]">
                    Pet Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. Luna"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                    required
                  />
                </div>

                {/* Pet Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#1A202C]">Pet Type</Label>
                  <div className="flex flex-wrap gap-2">
                    {petTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleChange('type', type)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          formData.type === type
                            ? 'bg-[#2B6CB0] text-white'
                            : 'bg-[#F3F7FB] text-[#5A6B7A] hover:bg-[#EAF2FF]'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.type === 'Other' && (
                  <div className="space-y-2">
                    <Label htmlFor="customType" className="text-sm font-medium text-[#1A202C]">
                      Specify Pet Type
                    </Label>
                    <Input
                      id="customType"
                      placeholder="e.g. Hamster, Turtle, Fish"
                      value={formData.customType}
                      onChange={(e) => handleChange('customType', e.target.value)}
                      className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                      required
                    />
                  </div>
                )}

                {/* Breed */}
                <div className="space-y-2">
                  <Label htmlFor="breed" className="text-sm font-medium text-[#1A202C]">
                    Breed
                  </Label>
                  <div ref={breedComboRef} className="relative">
                    <Input
                      ref={breedInputRef}
                      id="breed"
                      role="combobox"
                      aria-expanded={breedMenuOpen}
                      aria-autocomplete="list"
                      aria-controls="breed-suggestions"
                      placeholder="Search or enter breed"
                      value={formData.breed}
                      autoComplete="off"
                      onChange={(e) => {
                        handleChange('breed', e.target.value);
                        setBreedMenuOpen(true);
                        setBreedActiveIndex(-1);
                      }}
                      onFocus={() => {
                        setBreedMenuOpen(true);
                        setBreedActiveIndex(-1);
                      }}
                      onKeyDown={onBreedKeyDown}
                      className="h-12 pr-10 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6B7A] hover:text-[#2B6CB0] p-1 rounded-md hover:bg-[#EAF2FF]"
                      aria-label="Open breed suggestions"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        breedInputRef.current?.focus();
                        setBreedMenuOpen((o) => !o);
                        setBreedActiveIndex(-1);
                      }}
                    >
                      <Search className="w-4 h-4" />
                    </button>
                    {breedMenuOpen && (
                      <ul
                        id="breed-suggestions"
                        role="listbox"
                        className="absolute z-50 mt-1 w-full max-h-52 overflow-auto rounded-xl border border-[#D6E3F0] bg-white py-1 shadow-lg"
                      >
                        {breedSuggestions.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-[#5A6B7A]">No matches — keep typing to use a custom breed.</li>
                        ) : (
                          breedSuggestions.map((b, idx) => (
                            <li key={`${b}-${idx}`} role="option" aria-selected={idx === breedActiveIndex}>
                              <button
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm ${
                                  idx === breedActiveIndex ? 'bg-[#EAF2FF] text-[#2B6CB0]' : 'text-[#1A202C] hover:bg-[#F3F7FB]'
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setBreedActiveIndex(idx)}
                                onClick={() => selectBreed(b)}
                              >
                                {b}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                  <p className="text-xs text-[#5A6B7A]">Suggestions update by pet type. You can always type a breed not listed.</p>
                </div>

                {/* Age and Weight */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="age" className="text-sm font-medium text-[#1A202C]">
                      Age (Years)
                    </Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="0"
                      value={formData.age}
                      onChange={(e) => handleChange('age', e.target.value)}
                      className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="text-sm font-medium text-[#1A202C]">
                      Weight (kg)
                    </Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={formData.weight}
                      onChange={(e) => handleChange('weight', e.target.value)}
                      className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                      required
                    />
                  </div>
                </div>

                {/* Health Condition */}
                <div className="space-y-2">
                  <Label htmlFor="healthCondition" className="text-sm font-medium text-[#1A202C]">
                    Health Condition (Optional)
                  </Label>
                  <Input
                    id="healthCondition"
                    placeholder="e.g. Healthy, Observational, etc."
                    value={formData.healthCondition}
                    onChange={(e) => handleChange('healthCondition', e.target.value)}
                    className="h-12 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-[#1A202C] placeholder:text-[#5A6B7A]/50 focus:border-[#2B6CB0] focus:ring-[#2B6CB0]"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onNavigate('pets')}
                className="h-12 px-6 rounded-xl border-[#D6E3F0] text-[#5A6B7A] hover:bg-[#F3F7FB]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 px-8 bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
              >
                {isSubmitting ? 'Saving...' : editMode ? 'Save Changes' : 'Save Pet Profile'}
              </Button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upload Area */}
          <div
            className="upload-area bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(30,60,90,0.08)] border-2 border-dashed border-[#D6E3F0] cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openFilePicker();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPhotoSelected}
            />
            <div className="text-center">
              <div className="w-16 h-16 bg-[#EAF2FF] rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-[#2B6CB0]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1A202C] mb-2">Upload Photo</h3>
              <p className="text-sm text-[#5A6B7A] mb-4">
                High resolution images help our AI identify physical health markers.
              </p>
              {selectedPhotoPreviewUrl ? (
                <div className="mb-4">
                  <img
                    src={selectedPhotoPreviewUrl}
                    alt={selectedPhoto ? `Selected: ${selectedPhoto.name}` : 'Selected pet photo'}
                    className="w-full max-h-56 object-cover rounded-xl border border-[#D6E3F0]"
                  />
                  <p className="mt-2 text-xs text-[#5A6B7A] truncate">{selectedPhoto?.name}</p>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="border-[#2B6CB0] text-[#2B6CB0] hover:bg-[#EAF2FF] rounded-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  openFilePicker();
                }}
              >
                Select File
              </Button>
            </div>
          </div>

          {/* Health Tip */}
          <div className="tip-card bg-[#EAF2FF] rounded-[18px] p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-[#2B6CB0] rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-[#1A202C] mb-1">Health Tip</h4>
                <p className="text-sm text-[#5A6B7A]">
                  Providing accurate weight and age helps us curate the specific nutritional dosages {formData.name || 'your pet'} will need.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
