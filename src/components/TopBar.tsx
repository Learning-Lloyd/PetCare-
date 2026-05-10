import type { User, Notification, ViewType } from '@/types';
import { Bell, Settings, LogOut, Menu } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { mapNotificationRow, throwOnError } from '@/lib/supabaseHelpers';
import { notificationFromApi } from '@/lib/models';

interface TopBarProps {
  user: User;
  onLogout: () => void;
  onNavigate: (view: ViewType) => void;
  onToggleSidebar: () => void;
}

export default function TopBar({ user, onLogout, onNavigate, onToggleSidebar }: TopBarProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        throwOnError(error);
        if (!cancelled) setNotifications((data || []).map((row) => notificationFromApi(mapNotificationRow(row as Record<string, unknown>))));
      } catch {
        if (!cancelled) setNotifications([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-16 bg-white border-b border-[#D6E3F0] flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left side - Mobile menu toggle */}
      <button 
        onClick={onToggleSidebar}
        className="lg:hidden p-2 hover:bg-[#F3F7FB] rounded-lg"
      >
        <Menu className="w-5 h-5 text-[#5A6B7A]" />
      </button>

      {/* Right side - Actions */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative p-2 hover:bg-[#F3F7FB] rounded-lg transition-colors">
              <Bell className="w-5 h-5 text-[#5A6B7A]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="px-3 py-2 border-b border-[#D6E3F0]">
              <p className="font-medium text-[#1A202C]">Notifications</p>
            </div>
            {!notifications.length && (
              <div className="px-3 py-6 text-sm text-[#5A6B7A] text-center">No notifications yet.</div>
            )}
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="px-3 py-3 cursor-pointer">
                <div className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    notification.type === 'warning' ? 'bg-amber-500' :
                    notification.type === 'success' ? 'bg-green-500' :
                    notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-[#1A202C]">{notification.title}</p>
                    <p className="text-xs text-[#5A6B7A] mt-0.5">{notification.message}</p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <button 
          onClick={() => onNavigate('settings')}
          className="p-2 hover:bg-[#F3F7FB] rounded-lg transition-colors"
        >
          <Settings className="w-5 h-5 text-[#5A6B7A]" />
        </button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 hover:bg-[#F3F7FB] rounded-lg px-3 py-2 transition-colors">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-[#2B6CB0] text-white text-sm">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-[#1A202C] hidden sm:block">{user.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onNavigate('settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-red-600">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
