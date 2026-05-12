import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ViewType, User } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { fetchProfileRow, toAppUser } from '@/lib/supabaseHelpers';
import { useAuth } from '@/providers/AuthProvider';

// Pages
import DashboardPage from '@/pages/DashboardPage';
import PetsPage from '@/pages/PetsPage';
import AddPetPage from '@/pages/AddPetPage';
import VaccinationsPage from '@/pages/VaccinationsPage';
import FeedingPage from '@/pages/FeedingPage';
import ExercisePage from '@/pages/ExercisePage';
import RemindersPage from '@/pages/RemindersPage';
import HealthRecordsPage from '@/pages/HealthRecordsPage';
import AddRecordPage from '@/pages/AddRecordPage';
import SchedulePage from '@/pages/SchedulePage';
import AddAppointmentPage from '@/pages/AddAppointmentPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import VetPortalPage from '@/pages/VetPortalPage';

// Components
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import VetSidebar from '@/components/VetSidebar';
import VetTopBar from '@/components/VetTopBar';

function App() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [vetSearch, setVetSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const authUser = session?.user;
    if (!authUser) {
      setUser(null);
      return;
    }
    (async () => {
      const profile = await fetchProfileRow(authUser.id).catch(() => null);
      if (cancelled) return;
      const u = toAppUser(authUser, profile);
      setUser(u);
      setCurrentView((prev) => {
        if (u.isVet) return 'vet-dashboard';
        if (!u.isVet && String(prev).startsWith('vet-')) return 'dashboard';
        return prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
    setCurrentView('dashboard');
    toast.info('Logged out successfully');
    navigate('/login', { replace: true });
  };

  const navigateTo = (view: ViewType) => {
    if (view === 'login') {
      navigate('/login');
      return;
    }
    if (view === 'register') {
      navigate('/register');
      return;
    }
    setCurrentView(view);
  };

  useEffect(() => {
    if (!user?.isVet && user && String(currentView).startsWith('vet-')) {
      setCurrentView('dashboard');
    }
    if (user?.isVet && currentView === 'admin') {
      setCurrentView('vet-dashboard');
    }
  }, [user, currentView]);

  /** Refresh profile from DB so vet/admin flags match Supabase. */
  useEffect(() => {
    if (!user?.isVet) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!s?.user || cancelled) return;
      const profile = await fetchProfileRow(s.user.id).catch(() => null);
      if (cancelled) return;
      const fresh = toAppUser(s.user, profile);
      if (!fresh.isVet) {
        setUser(fresh);
        setCurrentView('dashboard');
        toast.info('This account is not a veterinarian. Showing the standard dashboard.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isVet]);

  const renderVetPage = () => {
    switch (currentView) {
      case 'settings':
        return <SettingsPage onNavigate={navigateTo} user={user} onUpdateUser={setUser} />;
      case 'vet-dashboard':
      case 'vet-assigned':
      case 'vet-records':
      case 'vet-vaccinations':
      case 'vet-notes':
      case 'vet-appointments':
        return (
          <VetPortalPage currentView={currentView} onNavigate={navigateTo} searchQuery={vetSearch} />
        );
      default:
        return (
          <VetPortalPage currentView="vet-dashboard" onNavigate={navigateTo} searchQuery={vetSearch} />
        );
    }
  };

  const renderPage = () => {
    switch (currentView) {
      case 'login':
      case 'register':
        return <DashboardPage onNavigate={navigateTo} userName={user?.name ?? ''} />;
      case 'dashboard':
        return <DashboardPage onNavigate={navigateTo} userName={user?.name ?? ''} />;
      case 'pets':
        return <PetsPage onNavigate={navigateTo} />;
      case 'add-pet':
        return <AddPetPage onNavigate={navigateTo} />;
      case 'edit-pet':
        return <AddPetPage onNavigate={navigateTo} editMode />;
      case 'vaccinations':
        return <VaccinationsPage onNavigate={navigateTo} />;
      case 'feeding':
        return <FeedingPage onNavigate={navigateTo} />;
      case 'exercise':
        return <ExercisePage onNavigate={navigateTo} />;
      case 'reminders':
        return <RemindersPage onNavigate={navigateTo} />;
      case 'health-records':
        return <HealthRecordsPage onNavigate={navigateTo} />;
      case 'add-record':
        return <AddRecordPage onNavigate={navigateTo} />;
      case 'schedule':
        return <SchedulePage onNavigate={navigateTo} />;
      case 'add-appointment':
        return <AddAppointmentPage onNavigate={navigateTo} />;
      case 'settings':
        return <SettingsPage onNavigate={navigateTo} user={user} onUpdateUser={setUser} />;
      case 'admin':
        if (!user?.isAdmin) {
          return <DashboardPage onNavigate={navigateTo} userName={user?.name ?? ''} />;
        }
        return <AdminDashboardPage onNavigate={navigateTo} currentUserId={user.id} />;
      default:
        return <DashboardPage onNavigate={navigateTo} userName={user?.name ?? ''} />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    );
  }

  if (user.isVet) {
    return (
      <div className="min-h-screen bg-[#f0fdf9] flex">
        <VetSidebar
          currentView={currentView}
          onNavigate={navigateTo}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onLogout={handleLogout}
        />
        <div
          className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}
        >
          <VetTopBar
            user={user}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            searchQuery={vetSearch}
            onSearchChange={setVetSearch}
          />
          <main className="flex-1 p-4 md:p-6 overflow-auto">{renderVetPage()}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC] flex">
      <Sidebar
        currentView={currentView}
        onNavigate={navigateTo}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isAdmin={user.isAdmin === true}
      />

      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <TopBar
          user={user}
          onLogout={handleLogout}
          onNavigate={navigateTo}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        <main className="flex-1 p-6 overflow-auto">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
