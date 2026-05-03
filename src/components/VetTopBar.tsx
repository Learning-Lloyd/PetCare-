import type { User } from '@/types';
import { Bell, Menu, Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api';

interface VetNotif {
  id: string;
  title: string;
  message: string;
  type: string;
}

interface VetTopBarProps {
  user: User;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function VetTopBar({ user, onToggleSidebar, searchQuery, onSearchChange }: VetTopBarProps) {
  const [vetAlerts, setVetAlerts] = useState<VetNotif[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiJson<VetNotif[]>('/api/vet/notifications');
        if (!cancelled) setVetAlerts(Array.isArray(raw) ? raw : []);
      } catch {
        if (!cancelled) setVetAlerts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const license = user.vetLicenseId?.trim() || '—';

  return (
    <header className="h-[72px] bg-white border-b border-[#C8E6D0] flex items-center gap-4 px-4 md:px-6 sticky top-0 z-30 shadow-[0_1px_0_rgba(13,148,136,0.06)]">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="lg:hidden p-2 hover:bg-[#ecfdf5] rounded-lg text-[#475569]"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 max-w-xl hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search assigned pets by name, breed, or type…"
            className="pl-10 rounded-xl border-[#bae6fd] bg-[#f8fafc] focus-visible:ring-[#0d9488]"
          />
        </div>
      </div>

      <div className="flex-1 sm:hidden min-w-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search pets…"
            className="pl-10 rounded-xl border-[#bae6fd] bg-[#f8fafc] text-sm"
          />
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative p-2 hover:bg-[#ecfdf5] rounded-lg transition-colors"
            aria-label="Alerts"
          >
            <Bell className="w-5 h-5 text-[#0d9488]" />
            {vetAlerts.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-[#dc2626] text-white text-[10px] rounded-full flex items-center justify-center">
                {vetAlerts.length > 9 ? '9+' : vetAlerts.length}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-96 max-h-[min(70vh,420px)] overflow-y-auto">
          <div className="px-3 py-2 border-b border-[#e2e8f0]">
            <p className="font-semibold text-[#0f172a]">Practice alerts</p>
            <p className="text-xs text-[#64748b]">Vaccinations, appointments, and follow-ups</p>
          </div>
          {!vetAlerts.length && (
            <div className="px-3 py-8 text-sm text-[#64748b] text-center">No active alerts.</div>
          )}
          {vetAlerts.map((a) => (
            <DropdownMenuItem key={a.id} className="flex flex-col items-start gap-1 py-3 cursor-default">
              <span className="font-medium text-[#0f172a] text-sm">{a.title}</span>
              <span className="text-xs text-[#64748b] leading-snug">{a.message}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="hidden md:flex flex-col items-end text-right min-w-0">
        <span className="text-sm font-semibold text-[#0f172a] truncate max-w-[200px]">{user.name}</span>
        <span className="text-xs text-[#64748b]">
          License <span className="font-mono text-[#0d9488]">{license}</span>
        </span>
      </div>

      <Avatar className="h-10 w-10 border-2 border-[#a7f3d0]">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback className="bg-[#ecfdf5] text-[#0f766e] text-sm font-semibold">
          {user.name
            .split(/\s+/)
            .map((s) => s[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </header>
  );
}
