import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType, HealthRecord } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { mapHealthRecordRow, mapPetRow, requireUserId, throwOnError } from '@/lib/supabaseHelpers';
import { healthRecordFromApi, petFromApi } from '@/lib/models';
import { healthScoreFromPets } from '@/lib/stats';
import { toast } from 'sonner';
import { Plus, Search, Filter, FileText, Syringe, Stethoscope, Pill, FlaskConical, Scissors, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface HealthRecordsPageProps {
  onNavigate: (view: ViewType) => void;
}

const recordTypeIcons: Record<string, React.ReactNode> = {
  'Vaccination': <Syringe className="w-4 h-4" />,
  'Check-up': <Stethoscope className="w-4 h-4" />,
  'Medication': <Pill className="w-4 h-4" />,
  'Treatment': <FileText className="w-4 h-4" />,
  'Lab Results': <FlaskConical className="w-4 h-4" />,
  'Surgery': <Scissors className="w-4 h-4" />,
};

const recordTypeColors: Record<string, string> = {
  'Vaccination': 'bg-blue-100 text-blue-600',
  'Check-up': 'bg-purple-100 text-purple-600',
  'Medication': 'bg-amber-100 text-amber-600',
  'Treatment': 'bg-teal-100 text-teal-600',
  'Lab Results': 'bg-gray-100 text-gray-600',
  'Surgery': 'bg-red-100 text-red-600',
};

export default function HealthRecordsPage({ onNavigate }: HealthRecordsPageProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [healthScore, setHealthScore] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const uid = await requireUserId();
      const { data: rawPets, error: eP } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      throwOnError(eP);
      const pets = (rawPets || []).map((row) => petFromApi(mapPetRow(row as Record<string, unknown>)));
      const petIds = pets.map((p) => p.id);
      let rec: HealthRecord[] = [];
      if (petIds.length) {
        const { data: rawRec, error: eR } = await supabase
          .from('health_records')
          .select('*')
          .in('pet_id', petIds)
          .order('record_date', { ascending: false });
        throwOnError(eR);
        rec = (rawRec || []).map((row) => healthRecordFromApi(mapHealthRecordRow(row as Record<string, unknown>)));
      }
      setRecords(rec);
      setHealthScore(healthScoreFromPets(pets));
    } catch (e) {
      toast.error('Could not load records', { description: String(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.records-header',
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

      gsap.fromTo('.stat-card',
        { y: 30, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          scrollTrigger: {
            trigger: '.stats-row',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      gsap.fromTo('.records-table',
        { y: 40, opacity: 0 },
        { 
          y: 0, 
          opacity: 1,
          duration: 0.5,
          scrollTrigger: {
            trigger: '.records-table',
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const filteredRecords = records.filter(record => {
    const matchesSearch = 
      record.petName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.notes.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || record.type === filterType;
    return matchesSearch && matchesType;
  });

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const upcomingVaccinations = records.filter(r => r.type === 'Vaccination').length;
  const recentRecords = records.filter(r => {
    const daysDiff = (Date.now() - r.date.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  }).length;

  return (
    <div ref={sectionRef} className="space-y-6">
      {/* Header */}
      <div className="records-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#5A6B7A] mb-2">
            <span>Platform</span>
            <span>›</span>
            <span className="text-[#2B6CB0]">Health Records</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-1">Health Records</h1>
          <p className="text-[#5A6B7A]">Track medical history, vaccinations, and recovery logs in a centralized clinical sanctuary.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="border-[#D6E3F0] text-[#5A6B7A] hover:bg-[#F3F7FB] rounded-xl"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button 
            onClick={() => onNavigate('add-record')}
            className="bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#2B6CB0]">
          <div>
            <p className="text-xs text-[#5A6B7A] uppercase mb-1">Upcoming Vaccinations</p>
            <p className="text-2xl font-bold text-[#1A202C]">{upcomingVaccinations}</p>
            <p className="text-sm text-[#5A6B7A] mt-1">Vaccination-type entries in your log</p>
          </div>
        </div>
        <div className="stat-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#27AE60]">
          <div>
            <p className="text-xs text-[#5A6B7A] uppercase mb-1">Recent Activity</p>
            <p className="text-2xl font-bold text-[#1A202C]">{recentRecords} Records</p>
            <p className="text-sm text-[#5A6B7A] mt-1">Added this calendar month</p>
          </div>
        </div>
        <div className="stat-card bg-white rounded-[14px] p-5 shadow-[0_4px_12px_rgba(30,60,90,0.06)] border-l-4 border-[#8B5CF6]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#5A6B7A] uppercase mb-1">Health Score</p>
              <p className="text-2xl font-bold text-[#1A202C]">{healthScore}%</p>
              <p className="text-sm text-[#5A6B7A] mt-1">System-wide pet wellness</p>
            </div>
            <div className="w-12 h-12 bg-[#EAF2FF] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-[#2B6CB0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="records-table bg-white rounded-[18px] shadow-[0_10px_30px_rgba(30,60,90,0.08)] overflow-hidden">
        <div className="p-5 border-b border-[#D6E3F0]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-[#1A202C]">Comprehensive Medical Log</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A6B7A]" />
              <Input
                placeholder="Search by pet or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full sm:w-64 h-10 bg-[#F3F7FB] border-[#D6E3F0] rounded-xl text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F3F7FB]">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Pet Name</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Date</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Record Type</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Notes</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Files</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-[#5A6B7A] uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D6E3F0]">
              {!filteredRecords.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#5A6B7A]">
                    No health records yet. Add a pet, then use <span className="font-medium text-[#2B6CB0]">Add Record</span>.
                  </td>
                </tr>
              )}
              {filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-[#F3F7FB]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                        <span className="text-sm font-medium text-[#2B6CB0]">{record.petName.charAt(0)}</span>
                      </div>
                      <span className="font-medium text-[#1A202C]">{record.petName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#5A6B7A]">{formatDate(record.date)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${recordTypeColors[record.type] || 'bg-gray-100 text-gray-600'}`}>
                      {recordTypeIcons[record.type] ?? <FileText className="w-4 h-4" />}
                      {record.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#5A6B7A] max-w-xs truncate">{record.notes}</td>
                  <td className="px-6 py-4">
                    {record.attachments?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {record.attachments.map((href) => {
                          const name = decodeURIComponent(href.split('/').pop() || 'file');
                          return (
                            <a
                              key={href}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={name}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#2B6CB0] hover:text-[#1e4e8b] max-w-[140px]"
                            >
                              <Paperclip className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{name}</span>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-[#5A6B7A]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" className="text-[#2B6CB0] hover:text-[#1e4e8b] text-sm font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-[#D6E3F0] flex items-center justify-between">
          <p className="text-sm text-[#5A6B7A]">Showing {filteredRecords.length} of {records.length} records</p>
          <div className="flex gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2B6CB0] text-white text-sm">1</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F3F7FB] text-[#5A6B7A] text-sm hover:bg-[#EAF2FF]">2</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F3F7FB] text-[#5A6B7A] text-sm hover:bg-[#EAF2FF]">3</button>
          </div>
        </div>
      </div>
    </div>
  );
}
