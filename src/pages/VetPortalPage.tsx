import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ViewType } from '@/types';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Syringe,
  StickyNote,
} from 'lucide-react';

const FOCUS_KEY = 'vetFocusPetId';

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar day when the vet accepted the booking (`approvedAt`). */
function approvalDayKey(approvedAt: string | undefined): string | null {
  if (!approvedAt) return null;
  const d = new Date(approvedAt);
  if (Number.isNaN(d.getTime())) return null;
  return ymdLocal(d);
}

function isVetAccessDenied(e: unknown) {
  return String(e).includes('Veterinarian access required');
}

interface VetPetCard {
  id: string;
  name: string;
  type: string;
  breed: string;
  age: number;
  healthSummary: string;
  photo?: string;
  allowMedicalNotes: boolean;
  ownerName?: string;
}

interface Overview {
  assignedPetsCount: number;
  upcomingVaccinations: number;
  pendingCheckups: number;
  recentMedicalUpdates: number;
  pendingBookingRequests?: number;
}

interface HealthRec {
  id: string;
  type: string;
  date: string;
  notes: string;
  createdAt: string;
}

interface VaxRow {
  id: string;
  petId: string;
  petName: string;
  vaccineName: string;
  date: string;
  nextDueDate?: string | null;
  status: string;
  notes?: string;
}

interface VetNoteRow {
  id: string;
  noteKind: string;
  body: string;
  createdAt: string;
  vetName: string;
}

interface ApptRow {
  id: string;
  petId?: string;
  petName: string;
  ownerName: string;
  ownerEmail: string;
  reason: string;
  date: string;
  time: string;
  proposedDate?: string;
  proposedTime?: string;
  notes?: string;
  vetNotes?: string;
  status: string;
  vetUserId?: string;
  approvedAt?: string;
}

interface VetPortalPageProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  searchQuery: string;
}

export default function VetPortalPage({ currentView, onNavigate, searchQuery }: VetPortalPageProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pets, setPets] = useState<VetPetCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusPetId, setFocusPetId] = useState<string>(() => sessionStorage.getItem(FOCUS_KEY) || '');
  const [records, setRecords] = useState<HealthRec[]>([]);
  const [vaxList, setVaxList] = useState<VaxRow[]>([]);
  const [upcomingVax, setUpcomingVax] = useState<VaxRow[]>([]);
  const [notes, setNotes] = useState<VetNoteRow[]>([]);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [recordFrom, setRecordFrom] = useState('');
  const [recordTo, setRecordTo] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteKind, setNoteKind] = useState('observation');
  const [vaxRemarks, setVaxRemarks] = useState<Record<string, string>>({});
  const [apptTab, setApptTab] = useState<'queue' | 'day' | 'all' | 'hours'>('queue');
  const [dayPick, setDayPick] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvalCalDate, setApprovalCalDate] = useState(() => new Date());
  const [hoursDraft, setHoursDraft] = useState({ dayStart: '09:00', dayEnd: '17:00', slotMinutes: 30 });
  const [resOpen, setResOpen] = useState<ApptRow | null>(null);
  const [resDate, setResDate] = useState('');
  const [resSlots, setResSlots] = useState<string[]>([]);
  const [resTime, setResTime] = useState('');
  const [resLoading, setResLoading] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState<{ row: ApptRow; kind: 'complete' | 'missed' } | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');

  const loadPets = useCallback(async () => {
    const q = searchQuery.trim();
    const path = q ? `/api/vet/pets?q=${encodeURIComponent(q)}` : '/api/vet/pets';
    const raw = await apiJson<VetPetCard[]>(path);
    setPets(Array.isArray(raw) ? raw : []);
  }, [searchQuery]);

  const refreshOverview = useCallback(async () => {
    const o = await apiJson<Overview>('/api/vet/overview');
    setOverview(o);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (currentView === 'vet-dashboard') {
          const o = await apiJson<Overview>('/api/vet/overview');
          if (!cancelled) setOverview(o);
        }
        if (
          ['vet-dashboard', 'vet-assigned', 'vet-records', 'vet-notes', 'vet-vaccinations'].includes(
            currentView,
          )
        ) {
          await loadPets();
        }
        if (currentView === 'vet-records' && focusPetId) {
          const qs =
            recordFrom && recordTo
              ? `?from=${encodeURIComponent(recordFrom)}&to=${encodeURIComponent(recordTo)}`
              : '';
          const r = await apiJson<HealthRec[]>(`/api/vet/pets/${focusPetId}/health-records${qs}`);
          if (!cancelled) setRecords(Array.isArray(r) ? r : []);
        }
        if (currentView === 'vet-vaccinations') {
          const u = await apiJson<VaxRow[]>('/api/vet/vaccinations/upcoming');
          if (!cancelled) setUpcomingVax(Array.isArray(u) ? u : []);
          if (focusPetId) {
            const v = await apiJson<VaxRow[]>(`/api/vet/pets/${focusPetId}/vaccinations`);
            if (!cancelled) setVaxList(Array.isArray(v) ? v : []);
          } else {
            if (!cancelled) setVaxList([]);
          }
        }
        if (currentView === 'vet-notes' && focusPetId) {
          const n = await apiJson<VetNoteRow[]>(`/api/vet/pets/${focusPetId}/notes`);
          if (!cancelled) setNotes(Array.isArray(n) ? n : []);
        } else if (currentView === 'vet-notes') {
          if (!cancelled) setNotes([]);
        }
        if (currentView === 'vet-appointments') {
          const [a, bs] = await Promise.all([
            apiJson<ApptRow[]>('/api/vet/appointments'),
            apiJson<{ dayStart: string; dayEnd: string; slotMinutes: number }>('/api/vet/booking-settings').catch(
              () => null,
            ),
          ]);
          if (!cancelled) {
            setAppts(Array.isArray(a) ? a : []);
            if (bs) {
              setHoursDraft({
                dayStart: bs.dayStart,
                dayEnd: bs.dayEnd,
                slotMinutes: bs.slotMinutes,
              });
            }
          }
        }
      } catch (e) {
        if (!cancelled && !isVetAccessDenied(e)) {
          toast.error('Could not load vet data', { description: String(e) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentView, focusPetId, loadPets, recordFrom, recordTo]);

  useEffect(() => {
    if (!pets.length) return;
    if (!focusPetId || !pets.some((p) => p.id === focusPetId)) {
      const first = pets[0].id;
      setFocusPetId(first);
      sessionStorage.setItem(FOCUS_KEY, first);
    }
  }, [pets, focusPetId]);

  const focusPet = useMemo(() => pets.find((p) => p.id === focusPetId), [pets, focusPetId]);

  const pendingAppts = useMemo(() => appts.filter((a) => a.status === 'Pending'), [appts]);
  const dayAppts = useMemo(
    () => appts.filter((a) => String(a.date).slice(0, 10) === dayPick),
    [appts, dayPick],
  );

  const reloadAppts = useCallback(async () => {
    const a = await apiJson<ApptRow[]>('/api/vet/appointments');
    setAppts(Array.isArray(a) ? a : []);
  }, []);

  const afterApptChange = useCallback(
    async (msg: string) => {
      toast.success(msg);
      await reloadAppts();
      await refreshOverview();
    },
    [reloadAppts, refreshOverview],
  );

  const loadResSlotsFor = useCallback(async (d: string) => {
    setResLoading(true);
    try {
      const me = await apiJson<{ user: { id: string } }>('/api/auth/me');
      const r = await apiJson<{ slots: string[] }>(
        `/api/vets/${encodeURIComponent(me.user.id)}/slots?date=${encodeURIComponent(d)}`,
      );
      setResSlots(Array.isArray(r.slots) ? r.slots : []);
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not load slots', { description: String(e) });
      setResSlots([]);
    } finally {
      setResLoading(false);
    }
  }, []);

  const openReschedule = (row: ApptRow) => {
    setResOpen(row);
    const d = String(row.date).slice(0, 10);
    setResDate(d);
    setResTime('');
    void loadResSlotsFor(d);
  };

  const patchAppt = async (id: string, body: Record<string, unknown>) => {
    await apiJson(`/api/vet/appointments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  };

  const handleAcceptAppt = async (id: string) => {
    try {
      await patchAppt(id, { action: 'accept' });
      await afterApptChange('Booking accepted');
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not accept', { description: String(e) });
    }
  };

  const handleRejectAppt = async (id: string) => {
    try {
      await patchAppt(id, { action: 'reject' });
      await afterApptChange('Request declined');
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not reject', { description: String(e) });
    }
  };

  const submitReschedule = async () => {
    if (!resOpen || !resDate || !resTime) {
      toast.error('Pick a date and time');
      return;
    }
    try {
      await patchAppt(resOpen.id, { action: 'reschedule', proposedDate: resDate, proposedTime: resTime });
      setResOpen(null);
      await afterApptChange('New time sent to owner');
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not reschedule', { description: String(e) });
    }
  };

  const submitOutcome = async () => {
    if (!outcomeOpen) return;
    const action = outcomeOpen.kind === 'complete' ? 'complete' : 'missed';
    const notes = outcomeNotes.trim() || undefined;
    try {
      await patchAppt(outcomeOpen.row.id, { action, vetNotes: notes });
      setOutcomeOpen(null);
      setOutcomeNotes('');
      await afterApptChange(outcomeOpen.kind === 'complete' ? 'Marked complete' : 'Marked missed');
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not update', { description: String(e) });
    }
  };

  const saveBookingHours = async () => {
    try {
      await apiJson('/api/vet/booking-settings', {
        method: 'PATCH',
        body: JSON.stringify(hoursDraft),
      });
      toast.success('Booking hours saved');
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Save failed', { description: String(e) });
    }
  };

  const setFocus = (id: string) => {
    setFocusPetId(id);
    sessionStorage.setItem(FOCUS_KEY, id);
  };

  const openPet = (id: string) => {
    setFocus(id);
    onNavigate('vet-records');
  };

  const submitNote = async () => {
    if (!focusPetId || !noteBody.trim()) {
      toast.error('Choose a pet and enter a note.');
      return;
    }
    try {
      await apiJson(`/api/vet/pets/${focusPetId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ noteKind, body: noteBody.trim() }),
      });
      toast.success('Note saved');
      setNoteBody('');
      const n = await apiJson<VetNoteRow[]>(`/api/vet/pets/${focusPetId}/notes`);
      setNotes(Array.isArray(n) ? n : []);
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Could not save note', { description: String(e) });
    }
  };

  const patchVax = async (id: string, status: 'Done' | 'Pending') => {
    try {
      const remarks = vaxRemarks[id]?.trim();
      await apiJson(`/api/vet/vaccinations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          remarks: remarks || undefined,
          notesAppend: true,
        }),
      });
      toast.success(status === 'Done' ? 'Marked as completed' : 'Updated');
      setVaxRemarks((prev) => ({ ...prev, [id]: '' }));
      const u = await apiJson<VaxRow[]>('/api/vet/vaccinations/upcoming');
      setUpcomingVax(Array.isArray(u) ? u : []);
      if (focusPetId) {
        const v = await apiJson<VaxRow[]>(`/api/vet/pets/${focusPetId}/vaccinations`);
        setVaxList(Array.isArray(v) ? v : []);
      }
      await refreshOverview();
    } catch (e) {
      if (!isVetAccessDenied(e)) toast.error('Update failed', { description: String(e) });
    }
  };

  if (loading && !overview && currentView === 'vet-dashboard') {
    return <p className="text-sm text-[#64748b]">Loading dashboard…</p>;
  }

  if (currentView === 'vet-dashboard') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Practice overview</h1>
          <p className="text-[#64748b] mt-1">Assigned pets and time-sensitive care items.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard
            icon={<HeartPulse className="w-5 h-5" />}
            label="Assigned pets"
            value={overview?.assignedPetsCount ?? 0}
            accent="from-[#ecfdf5] to-white border-[#a7f3d0]"
          />
          <SummaryCard
            icon={<Syringe className="w-5 h-5" />}
            label="Upcoming vaccinations"
            value={overview?.upcomingVaccinations ?? 0}
            accent="from-[#eff6ff] to-white border-[#93c5fd]"
          />
          <SummaryCard
            icon={<Calendar className="w-5 h-5" />}
            label="Pending checkups"
            value={overview?.pendingCheckups ?? 0}
            accent="from-[#fffbeb] to-white border-[#fcd34d]"
          />
          <SummaryCard
            icon={<ClipboardList className="w-5 h-5" />}
            label="Booking requests"
            value={overview?.pendingBookingRequests ?? 0}
            accent="from-[#fef3c7] to-white border-[#fcd34d]"
          />
          <SummaryCard
            icon={<Activity className="w-5 h-5" />}
            label="Recent medical updates"
            value={overview?.recentMedicalUpdates ?? 0}
            accent="from-[#f5f3ff] to-white border-[#c4b5fd]"
          />
        </div>
        <Card className="border-[#C8E6D0] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-[#0f172a]">Quick actions</CardTitle>
            <CardDescription>Jump to workflows for shared patients.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="bg-[#0d9488] hover:bg-[#0f766e]"
              onClick={() => onNavigate('vet-assigned')}
            >
              View assigned pets
            </Button>
            <Button type="button" variant="outline" className="border-[#0d9488] text-[#0f766e]" onClick={() => onNavigate('vet-vaccinations')}>
              Vaccination queue
            </Button>
            <Button type="button" variant="outline" onClick={() => onNavigate('vet-appointments')}>
              Appointments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentView === 'vet-assigned') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Assigned pets</h1>
          <p className="text-[#64748b] mt-1">Patients shared with you by their owners.</p>
        </div>
        {loading && <p className="text-sm text-[#64748b]">Loading…</p>}
        {!loading && !pets.length && (
          <Card className="border-[#e2e8f0]">
            <CardContent className="py-12 text-center text-[#64748b]">
              No pets are shared with your account yet. Owners can add your clinic email from My Pets.
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {pets.map((pet) => (
            <Card key={pet.id} className="border-[#C8E6D0] overflow-hidden shadow-[0_8px_30px_rgba(13,148,136,0.08)]">
              <div className="h-40 bg-gradient-to-br from-[#ecfdf5] to-[#e0f2fe] relative">
                {pet.photo ? (
                  <img src={pet.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#94a3b8]">
                    <Camera className="w-10 h-10" />
                  </div>
                )}
                <Badge
                  className={`absolute top-3 right-3 ${
                    pet.healthSummary === 'Needs Attention'
                      ? 'bg-amber-500 hover:bg-amber-500'
                      : 'bg-[#0d9488] hover:bg-[#0d9488]'
                  }`}
                >
                  {pet.healthSummary}
                </Badge>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{pet.name}</CardTitle>
                <CardDescription>
                  {pet.type} · {pet.breed} · {pet.age} yr
                  {pet.ownerName ? ` · Owner: ${pet.ownerName}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Button type="button" size="sm" className="bg-[#0d9488]" onClick={() => openPet(pet.id)}>
                  View details
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!pet.allowMedicalNotes}
                  title={!pet.allowMedicalNotes ? 'Owner has not enabled medical notes' : ''}
                  onClick={() => {
                    setFocus(pet.id);
                    onNavigate('vet-notes');
                  }}
                >
                  <StickyNote className="w-4 h-4 mr-1" />
                  Add note
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (currentView === 'vet-records') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Medical records</h1>
          <p className="text-[#64748b] mt-1">Read-only timeline from owner-entered records (audit on vet actions is separate).</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="space-y-2 min-w-[200px]">
            <Label>Patient</Label>
            <Select value={focusPetId} onValueChange={(v) => setFocus(v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select pet" />
              </SelectTrigger>
              <SelectContent>
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={recordFrom} onChange={(e) => setRecordFrom(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={recordTo} onChange={(e) => setRecordTo(e.target.value)} className="rounded-xl" />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-6 md:mt-0"
              onClick={async () => {
                if (!focusPetId) return;
                try {
                  const qs =
                    recordFrom && recordTo
                      ? `?from=${encodeURIComponent(recordFrom)}&to=${encodeURIComponent(recordTo)}`
                      : '';
                  const r = await apiJson<HealthRec[]>(`/api/vet/pets/${focusPetId}/health-records${qs}`);
                  setRecords(Array.isArray(r) ? r : []);
                } catch (e) {
                  if (!isVetAccessDenied(e)) toast.error(String(e));
                }
              }}
            >
              Apply filter
            </Button>
          </div>
        </div>
        {!focusPet && <p className="text-sm text-amber-700">Select a shared pet to view records.</p>}
        {focusPet && (
          <div className="relative border-l-2 border-[#0d9488]/30 ml-3 space-y-6 pl-8">
            {records.map((r) => (
              <div key={r.id} className="relative">
                <span className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-[#0d9488] ring-4 ring-[#ecfdf5]" />
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline" className="border-[#0d9488] text-[#0f766e]">
                      {r.type}
                    </Badge>
                    <span className="text-sm text-[#64748b]">{r.date}</span>
                  </div>
                  <p className="text-[#0f172a] whitespace-pre-wrap">{r.notes || '—'}</p>
                </div>
              </div>
            ))}
            {!records.length && (
              <p className="text-sm text-[#64748b]">No records in this range.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'vet-vaccinations') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Vaccinations</h1>
          <p className="text-[#64748b] mt-1">Upcoming doses across assigned pets, and per-patient history.</p>
        </div>
        <Card className="border-[#bae6fd]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Syringe className="w-5 h-5 text-[#2563eb]" />
              Upcoming &amp; due (90 days)
            </CardTitle>
            <CardDescription>Mark completed and add remarks — changes are audited.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pet</TableHead>
                  <TableHead>Vaccine</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingVax.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.petName}</TableCell>
                    <TableCell>{v.vaccineName}</TableCell>
                    <TableCell>{v.nextDueDate || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === 'Done' ? 'default' : 'secondary'}>{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-y-2">
                      <Input
                        placeholder="Remarks (optional)"
                        value={vaxRemarks[v.id] || ''}
                        onChange={(e) => setVaxRemarks((prev) => ({ ...prev, [v.id]: e.target.value }))}
                        className="max-w-[220px] ml-auto"
                      />
                      {v.status !== 'Done' && (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[#2563eb]"
                          onClick={() => patchVax(v.id, 'Done')}
                        >
                          Mark completed
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!upcomingVax.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[#64748b] py-8">
                      No pending vaccinations in the next 90 days.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Patient history</h2>
          <div className="max-w-xs mb-4">
            <Label>Pet</Label>
            <Select value={focusPetId} onValueChange={(v) => setFocus(v)}>
              <SelectTrigger className="rounded-xl mt-1">
                <SelectValue placeholder="Select pet" />
              </SelectTrigger>
              <SelectContent>
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaccine</TableHead>
                <TableHead>Given</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vaxList.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.vaccineName}</TableCell>
                  <TableCell>{v.date}</TableCell>
                  <TableCell>{v.nextDueDate || '—'}</TableCell>
                  <TableCell>{v.status}</TableCell>
                </TableRow>
              ))}
              {!vaxList.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-[#64748b] py-6">
                    {focusPetId ? 'No vaccination rows for this pet.' : 'Select a pet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (currentView === 'vet-notes') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Health notes</h1>
          <p className="text-[#64748b] mt-1">
            Professional observations — not a prescription unless the practice enables it elsewhere.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-[#C8E6D0]">
            <CardHeader>
              <CardTitle className="text-base">Add note</CardTitle>
              <CardDescription>
                {focusPet?.allowMedicalNotes === false
                  ? 'The owner has disabled medical notes for this patient.'
                  : 'Diagnosis-style wording should follow your clinic standards.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={focusPetId} onValueChange={(v) => setFocus(v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select pet" />
                  </SelectTrigger>
                  <SelectContent>
                    {pets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={noteKind} onValueChange={setNoteKind}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnosis">Diagnosis / assessment</SelectItem>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="recommendation">Recommendation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={5}
                  className="rounded-xl"
                  disabled={focusPet?.allowMedicalNotes === false}
                  placeholder="Clinical observations, follow-up items…"
                />
              </div>
              <Button
                type="button"
                className="bg-[#0d9488]"
                disabled={!focusPetId || focusPet?.allowMedicalNotes === false}
                onClick={submitNote}
              >
                Save note
              </Button>
            </CardContent>
          </Card>
          <div>
            <h2 className="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">Timeline</h2>
            <div className="space-y-4">
              {notes.map((n) => (
                <Card key={n.id} className="border-[#e2e8f0]">
                  <CardContent className="pt-4">
                    <div className="flex justify-between gap-2 mb-2">
                      <Badge variant="outline">{n.noteKind}</Badge>
                      <span className="text-xs text-[#94a3b8]">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[#64748b] mb-1">{n.vetName}</p>
                    <p className="text-[#0f172a] whitespace-pre-wrap">{n.body}</p>
                  </CardContent>
                </Card>
              ))}
              {!notes.length && (
                <p className="text-sm text-[#64748b]">No vet notes for this patient yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'vet-appointments') {
    const statusClass = (s: string) => {
      switch (s) {
        case 'Pending':
          return 'bg-amber-50 text-amber-900 border-amber-200';
        case 'Confirmed':
          return 'bg-emerald-50 text-emerald-900 border-emerald-200';
        case 'Rejected':
          return 'bg-red-50 text-red-900 border-red-200';
        case 'Rescheduled':
          return 'bg-violet-50 text-violet-900 border-violet-200';
        case 'Completed':
          return 'bg-slate-50 text-slate-800 border-slate-200';
        case 'Missed':
          return 'bg-orange-50 text-orange-950 border-orange-200';
        default:
          return 'bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]';
      }
    };

    const calYear = approvalCalDate.getFullYear();
    const calMonth = approvalCalDate.getMonth();
    const monthTitle = approvalCalDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDaySunday0 = new Date(calYear, calMonth, 1).getDay();
    const calFirstPad = firstDaySunday0 === 0 ? 6 : firstDaySunday0 - 1;
    const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayClock = new Date();
    const todayY = todayClock.getFullYear();
    const todayM = todayClock.getMonth();
    const todayD = todayClock.getDate();

    const renderApptTable = (rows: ApptRow[], emptyMsg: string) => (
      <Card className="border-[#C8E6D0]">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pet</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="whitespace-nowrap">Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.petName}</TableCell>
                  <TableCell className="text-sm text-[#64748b]">
                    <div>{a.ownerName || '—'}</div>
                    {a.ownerEmail ? <div className="text-xs">{a.ownerEmail}</div> : null}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <span className="line-clamp-2 text-sm">{a.reason}</span>
                    {a.vetNotes && (a.status === 'Completed' || a.status === 'Missed') ? (
                      <p className="text-xs text-[#64748b] mt-1">Notes: {a.vetNotes}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {a.date} {a.time}
                    {a.status === 'Rescheduled' && a.proposedDate && a.proposedTime ? (
                      <div className="text-xs text-violet-700 mt-1">
                        Proposed: {a.proposedDate} {a.proposedTime}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-[#64748b] whitespace-nowrap align-top">
                    {a.approvedAt
                      ? new Date(a.approvedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${statusClass(a.status)} font-normal`}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {a.status === 'Pending' ? (
                        <>
                          <Button type="button" size="sm" className="bg-[#0d9488]" onClick={() => handleAcceptAppt(a.id)}>
                            Accept
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleRejectAppt(a.id)}>
                            Reject
                          </Button>
                          <Button type="button" size="sm" variant="secondary" onClick={() => openReschedule(a)}>
                            New time
                          </Button>
                        </>
                      ) : null}
                      {a.status === 'Confirmed' ? (
                        <>
                          <Button type="button" size="sm" variant="secondary" onClick={() => openReschedule(a)}>
                            Suggest time
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setOutcomeNotes('');
                              setOutcomeOpen({ row: a, kind: 'complete' });
                            }}
                          >
                            Complete
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-orange-800 border-orange-200"
                            onClick={() => {
                              setOutcomeNotes('');
                              setOutcomeOpen({ row: a, kind: 'missed' });
                            }}
                          >
                            Missed
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[#64748b] py-10">
                    {emptyMsg}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );

    return (
      <>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#0f172a]">Appointments</h1>
            <p className="text-[#64748b] mt-1">
              Manage booking requests, your day, and published hours. Owners are notified when you accept, decline, or
              propose a new slot.
            </p>
          </div>

          <div className="bg-white rounded-[18px] p-6 shadow-[0_10px_30px_rgba(13,148,136,0.08)] border border-[#C8E6D0]">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">Booking calendar</h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Teal dot: day you approved a request. Gray dot: visit scheduled. Click a day to open Day view.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalCalDate(new Date(calYear, calMonth - 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#ecfdf5]"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-5 h-5 text-[#64748b]" />
                </button>
                <span className="text-sm font-medium text-[#0f172a] min-w-[10rem] text-center">{monthTitle}</span>
                <button
                  type="button"
                  onClick={() => setApprovalCalDate(new Date(calYear, calMonth + 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#ecfdf5]"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-5 h-5 text-[#64748b]" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-[#64748b] py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calFirstPad }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {Array.from({ length: calDaysInMonth }).map((_, i) => {
                const day = i + 1;
                const cellYmd = ymdLocal(new Date(calYear, calMonth, day));
                const hasApproval = appts.some((row) => approvalDayKey(row.approvedAt) === cellYmd);
                const hasVisit = appts.some((row) => String(row.date).slice(0, 10) === cellYmd);
                const isToday =
                  calYear === todayY && calMonth === todayM && day === todayD;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setDayPick(cellYmd);
                      setApptTab('day');
                    }}
                    className={`aspect-square p-2 rounded-lg border transition-all text-left flex flex-col justify-between ${
                      isToday
                        ? 'border-[#0d9488] bg-[#ecfdf5]'
                        : 'border-transparent hover:bg-[#f8fafc] hover:border-[#99f6e4]'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isToday ? 'text-[#0d9488]' : 'text-[#0f172a]'}`}>
                      {day}
                    </span>
                    {(hasApproval || hasVisit) && (
                      <div className="flex gap-1 justify-end">
                        {hasApproval ? (
                          <span className="w-2 h-2 rounded-full bg-[#0d9488]" title="Approved" />
                        ) : null}
                        {hasVisit ? (
                          <span className="w-2 h-2 rounded-full bg-[#94a3b8]" title="Visit" />
                        ) : null}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Tabs value={apptTab} onValueChange={(v) => setApptTab(v as typeof apptTab)}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-[#ecfdf5] p-1 rounded-xl">
              <TabsTrigger value="queue" className="rounded-lg data-[state=active]:bg-white">
                Pending ({pendingAppts.length})
              </TabsTrigger>
              <TabsTrigger value="day" className="rounded-lg data-[state=active]:bg-white">
                Day view
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white">
                All
              </TabsTrigger>
              <TabsTrigger value="hours" className="rounded-lg data-[state=active]:bg-white">
                Slot grid
              </TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-4 space-y-3">
              {renderApptTable(
                pendingAppts,
                'No pending requests. When an owner books you, it will appear here.',
              )}
            </TabsContent>

            <TabsContent value="day" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Schedule date</Label>
                  <Input
                    type="date"
                    value={dayPick}
                    onChange={(e) => setDayPick(e.target.value)}
                    className="w-auto rounded-xl"
                  />
                </div>
              </div>
              {renderApptTable(dayAppts, 'Nothing on this day.')}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              {renderApptTable(appts, 'No appointments yet.')}
            </TabsContent>

            <TabsContent value="hours" className="mt-4 space-y-4">
              <Card className="border-[#C8E6D0]">
                <CardHeader>
                  <CardTitle className="text-lg">Public availability</CardTitle>
                  <CardDescription>
                    Slots shown to pet owners (default 09:00–17:00, every 30 minutes). End time is exclusive of a
                    partial slot.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Day starts</Label>
                    <Input
                      type="time"
                      value={hoursDraft.dayStart}
                      onChange={(e) => setHoursDraft((d) => ({ ...d, dayStart: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Day ends</Label>
                    <Input
                      type="time"
                      value={hoursDraft.dayEnd}
                      onChange={(e) => setHoursDraft((d) => ({ ...d, dayEnd: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Slot length (minutes)</Label>
                    <Input
                      type="number"
                      min={15}
                      max={120}
                      step={5}
                      value={hoursDraft.slotMinutes}
                      onChange={(e) =>
                        setHoursDraft((d) => ({ ...d, slotMinutes: Number(e.target.value) || d.slotMinutes }))
                      }
                      className="rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="button" className="bg-[#0d9488]" onClick={() => void saveBookingHours()}>
                      Save hours
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={!!resOpen} onOpenChange={(o) => !o && setResOpen(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Suggest a new time</DialogTitle>
            </DialogHeader>
            {resOpen ? (
              <div className="space-y-3 text-sm text-[#64748b]">
                <p>
                  {resOpen.petName} — current request {resOpen.date} {resOpen.time}
                </p>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={resDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setResDate(v);
                      setResTime('');
                      void loadResSlotsFor(v);
                    }}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Open slots</Label>
                  {resLoading ? (
                    <p>Loading…</p>
                  ) : !resSlots.length ? (
                    <p className="text-amber-800">No free slots that day.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                      {resSlots.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setResTime(s)}
                          className={`px-2 py-1 rounded-lg text-xs border ${
                            resTime === s ? 'bg-[#0d9488] text-white border-[#0d9488]' : 'bg-white border-[#e2e8f0]'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setResOpen(null)}>
                Close
              </Button>
              <Button type="button" className="bg-[#0d9488]" onClick={() => void submitReschedule()}>
                Send to owner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!outcomeOpen} onOpenChange={(o) => !o && setOutcomeOpen(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{outcomeOpen?.kind === 'complete' ? 'Mark visit complete' : 'Mark as missed'}</DialogTitle>
            </DialogHeader>
            {outcomeOpen ? (
              <div className="space-y-2 text-sm text-[#64748b]">
                <p>
                  {outcomeOpen.row.petName} — {outcomeOpen.row.date} {outcomeOpen.row.time}
                </p>
                <div className="space-y-1">
                  <Label>Post-visit notes (optional)</Label>
                  <Textarea
                    value={outcomeNotes}
                    onChange={(e) => setOutcomeNotes(e.target.value)}
                    rows={4}
                    className="rounded-xl"
                    placeholder="Follow-up, home care, prescriptions…"
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOutcomeOpen(null)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0d9488]" onClick={() => void submitOutcome()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[#64748b]">
      <ClipboardList className="w-5 h-5" />
      <span>Select a section from the sidebar.</span>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card className={`border bg-gradient-to-br shadow-sm ${accent}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-[#64748b]">{label}</CardTitle>
        <div className="text-[#0d9488]">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-[#0f172a]">{value}</p>
      </CardContent>
    </Card>
  );
}
