import type { ViewType } from '@/types';
import { 
  LayoutDashboard, 
  PawPrint, 
  ClipboardList, 
  Calendar, 
  Settings,
  Plus,
  Syringe,
  Utensils,
  Activity,
  Bell,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isOpen: boolean;
  onToggle: () => void;
  isAdmin?: boolean;
}

function buildMenuItems(showAdmin: boolean) {
  const items: { id: ViewType; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pets', label: 'My Pets', icon: PawPrint },
    { id: 'health-records', label: 'Health Records', icon: ClipboardList },
    { id: 'vaccinations', label: 'Vaccinations', icon: Syringe },
    { id: 'feeding', label: 'Feeding', icon: Utensils },
    { id: 'exercise', label: 'Exercise', icon: Activity },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
  ];
  if (showAdmin) {
    items.push({ id: 'admin', label: 'Admin', icon: Shield });
  }
  items.push({ id: 'settings', label: 'Settings', icon: Settings });
  return items;
}

export default function Sidebar({ currentView, onNavigate, isOpen, onToggle, isAdmin }: SidebarProps) {
  const menuItems = buildMenuItems(Boolean(isAdmin));
  const handleAddPet = () => {
    onNavigate('add-pet');
  };

  return (
    <aside 
      className={`fixed left-0 top-0 h-full bg-white border-r border-[#D6E3F0] z-40 transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-20'
      }`}
    >
      {/* Logo */}
      <div className="p-6 border-b border-[#D6E3F0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2B6CB0] rounded-xl flex items-center justify-center flex-shrink-0">
            <PawPrint className="w-5 h-5 text-white" />
          </div>
          {isOpen && (
            <div>
              <h1 className="font-semibold text-[#1A202C] text-lg">PetCare+</h1>
              <p className="text-xs text-[#5A6B7A]">CLINICAL SANCTUARY</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Pet Button */}
      <div className="p-4">
        <Button 
          onClick={handleAddPet}
          className={`bg-[#2B6CB0] hover:bg-[#1e4e8b] text-white rounded-xl ${
            isOpen ? 'w-full' : 'w-12 h-12 p-0'
          }`}
        >
          <Plus className="w-5 h-5" />
          {isOpen && <span className="ml-2">Add New Pet</span>}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id || 
            (item.id === 'pets' && currentView === 'add-pet') ||
            (item.id === 'health-records' && currentView === 'add-record') ||
            (item.id === 'schedule' && currentView === 'add-appointment');
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-[#EAF2FF] text-[#2B6CB0]' 
                  : 'text-[#5A6B7A] hover:bg-[#F3F7FB] hover:text-[#1A202C]'
              } ${!isOpen && 'justify-center'}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive && 'stroke-[2.5px]'}`} />
              {isOpen && (
                <span className={`text-sm ${isActive ? 'font-medium' : 'font-normal'}`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute bottom-4 right-4 w-8 h-8 bg-[#F3F7FB] hover:bg-[#EAF2FF] rounded-lg flex items-center justify-center text-[#5A6B7A] transition-colors"
      >
        {isOpen ? '←' : '→'}
      </button>
    </aside>
  );
}
