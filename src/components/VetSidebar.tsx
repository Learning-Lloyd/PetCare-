import type { ViewType } from '@/types';
import {
  LayoutDashboard,
  PawPrint,
  ClipboardList,
  Syringe,
  StickyNote,
  Calendar,
  LogOut,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const VET_MENU: { id: ViewType; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'vet-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'vet-assigned', label: 'Assigned Pets', icon: PawPrint },
  { id: 'vet-records', label: 'Medical Records', icon: ClipboardList },
  { id: 'vet-vaccinations', label: 'Vaccination History', icon: Syringe },
  { id: 'vet-notes', label: 'Health Notes', icon: StickyNote },
  { id: 'vet-appointments', label: 'Appointments', icon: Calendar },
  { id: 'settings', label: 'Account', icon: Settings },
];

interface VetSidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isOpen: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

export default function VetSidebar({ currentView, onNavigate, isOpen, onToggle, onLogout }: VetSidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white border-r border-[#C8E6D0] z-40 transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-20'
      }`}
    >
      <div className="p-6 border-b border-[#C8E6D0] bg-gradient-to-r from-[#f8fffb] to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#0d9488] to-[#2563eb] rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <StethoscopeIcon />
          </div>
          {isOpen && (
            <div>
              <h1 className="font-semibold text-[#0f172a] text-lg">PetCare+</h1>
              <p className="text-xs text-[#0d9488] font-medium tracking-wide">VET PORTAL</p>
            </div>
          )}
        </div>
      </div>

      <nav className="px-3 py-4 space-y-1">
        {VET_MENU.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-[#ecfdf5] text-[#0f766e] shadow-sm border border-[#a7f3d0]'
                  : 'text-[#475569] hover:bg-[#f0fdf9] hover:text-[#0f172a]'
              } ${!isOpen && 'justify-center'}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'stroke-[2.5px]' : ''}`} />
              {isOpen && (
                <span className={`text-sm ${isActive ? 'font-semibold' : 'font-normal'}`}>{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <Button
          type="button"
          variant="outline"
          onClick={onLogout}
          className={`w-full border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2] rounded-xl ${
            isOpen ? '' : 'px-0 w-12'
          }`}
        >
          <LogOut className="w-4 h-4" />
          {isOpen && <span className="ml-2">Logout</span>}
        </Button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="absolute bottom-4 right-4 w-8 h-8 bg-[#ecfdf5] hover:bg-[#d1fae5] rounded-lg flex items-center justify-center text-[#475569] transition-colors"
        aria-label="Toggle sidebar"
      >
        {isOpen ? '←' : '→'}
      </button>
    </aside>
  );
}

function StethoscopeIcon() {
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4h2a2 2 0 012 2v2a4 4 0 004 4 4 4 0 004-4V6a2 2 0 012-2h2" />
      <path d="M6 20a6 6 0 0112 0" />
      <path d="M12 16v-2" />
    </svg>
  );
}
