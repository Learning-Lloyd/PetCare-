import { useState, useEffect } from 'react';
import type { ViewType, User } from '@/types';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { fetchProfileRow, insertPublicUserProfileFromAuth, toAppUser } from '@/lib/supabaseHelpers';
import type { AuthError } from '@supabase/supabase-js';

function authErrorMessage(err: AuthError | null): string {
  return err?.message || 'Authentication failed';
}

// Pages
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
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

type RegisterResult = {
  ok: boolean;
  message?: string;
};

async function loadSessionUser(): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const profile = await fetchProfileRow(session.user.id).catch(() => null);
  return toAppUser(session.user, profile);
}

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('login');
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [vetSearch, setVetSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await loadSessionUser();
      if (cancelled) return;
      if (u) {
        setUser(u);
        setCurrentView(u.isVet ? 'vet-dashboard' : 'dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setCurrentView('login');
        return;
      }
      const profile = await fetchProfileRow(session.user.id).catch(() => null);
      const u = toAppUser(session.user, profile);
      setUser(u);
      setCurrentView(u.isVet ? 'vet-dashboard' : 'dashboard');
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error('Invalid credentials', { description: authErrorMessage(error) });
        return;
      }
      if (!data.user) return;
      const profile = await fetchProfileRow(data.user.id).catch(() => null);
      const u = toAppUser(data.user, profile);
      if (!u.isActive) {
        await supabase.auth.signOut();
        toast.error('Account deactivated', {
          description: 'This account has been deactivated. Contact an administrator.',
        });
        return;
      }
      setUser(u);
      setCurrentView(u.isVet ? 'vet-dashboard' : 'dashboard');
      toast.success('Welcome back!', { description: `Hello, ${u.name}` });
    } catch (e) {
      toast.error('Sign-in failed', { description: String(e) });
    }
  };

  const handleRegister = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email,
          password,
          full_name: name,
        },
      });
      if (error) {
        const message = error.message || 'Registration failed';
        toast.error('Registration failed', { description: message });
        return { ok: false, message };
      }
      const createdUser = (data as { user?: { id?: string; email?: string } } | null)?.user;
      if (!createdUser?.id) {
        toast.error('Registration failed', { description: 'User creation returned no id.' });
        return { ok: false, message: 'User creation returned no id.' };
      }
      // Keep frontend fallback profile insert aligned to public.users (uuid id).
      const insertErr = await insertPublicUserProfileFromAuth({
        id: String(createdUser.id),
        email: String(createdUser.email ?? email),
        name,
      });
      if (insertErr) {
        toast.error('Database error saving new user', { description: insertErr.message });
        return { ok: false, message: insertErr.message };
      }
      toast.success('User created', { description: `${email} can log in immediately.` });
      return { ok: true, message: 'User created successfully.' };
    } catch (e) {
      toast.error('Registration failed', { description: String(e) });
      return { ok: false, message: String(e) };
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
    setCurrentView('login');
    toast.info('Logged out successfully');
  };

  const navigateTo = (view: ViewType) => {
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
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const profile = await fetchProfileRow(session.user.id).catch(() => null);
      if (cancelled) return;
      const fresh = toAppUser(session.user, profile);
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
        return <LoginPage onLogin={handleLogin} onNavigate={navigateTo} />;
      case 'register':
        return <RegisterPage onRegister={handleRegister} onNavigate={navigateTo} />;
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
      <div className="min-h-screen bg-[#F6F8FC]">
        {renderPage()}
        <Toaster position="top-right" richColors />
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
        <Toaster position="top-right" richColors />
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

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
