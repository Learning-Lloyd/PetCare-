import { useState, useEffect } from 'react';
import type { ViewType, User } from '@/types';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

const SESSION_KEY = 'petcare_session';
const USER_KEY = 'petcare_user';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(SESSION_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(res: Response): Promise<string> {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return "Start the API in a second terminal: npm run api (port 3001), keep it running while you use the app.";
  }
  try {
    const j = await res.json();
    return typeof j.error === "string" ? j.error : res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
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

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('login');
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [vetSearch, setVetSearch] = useState('');

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(USER_KEY);
          return;
        }
        const { user: u } = await res.json();
        const parsed = u as User;
        setUser(parsed);
        setCurrentView(parsed.isVet ? 'vet-dashboard' : 'dashboard');
      } catch {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(USER_KEY);
      }
    })();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        toast.error('Invalid credentials', { description: await readError(res) });
        return;
      }
      const { user: u, sessionToken } = await res.json();
      localStorage.setItem(SESSION_KEY, sessionToken);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u as User);
      setCurrentView(u.isVet ? 'vet-dashboard' : 'dashboard');
      toast.success('Welcome back!', { description: `Hello, ${u.name}` });
    } catch {
      toast.error("Could not reach server", {
        description: "Run npm run api in another terminal (same app folder), then try again.",
      });
    }
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        toast.error('Registration failed', { description: await readError(res) });
        return;
      }
      const { user: u, sessionToken } = await res.json();
      localStorage.setItem(SESSION_KEY, sessionToken);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u as User);
      setCurrentView('dashboard');
      toast.success('Account created!', { description: `Welcome, ${name}` });
    } catch {
      toast.error("Could not reach server", {
        description: "Run npm run api in another terminal (same app folder), then try again.",
      });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { ...authHeaders() } });
    } catch {
      /* ignore */
    }
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
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

  /** Vet shell mounts when `user.isVet` is true; confirm with `/api/auth/me` so UI matches DB (avoids 403 loops). */
  useEffect(() => {
    if (!user?.isVet) return;
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { user: User };
        const fresh = data.user;
        if (cancelled) return;
        if (!fresh.isVet) {
          setUser(fresh);
          setCurrentView('dashboard');
          toast.info('This account is not a veterinarian. Showing the standard dashboard.');
        }
      } catch {
        /* ignore */
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

  // Render the appropriate page based on current view
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

  // If not logged in, show auth pages
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
      {/* Sidebar */}
      <Sidebar 
        currentView={currentView} 
        onNavigate={navigateTo} 
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isAdmin={user.isAdmin === true}
      />
      
      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Top Bar */}
        <TopBar 
          user={user} 
          onLogout={handleLogout} 
          onNavigate={navigateTo}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        
        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          {renderPage()}
        </main>
      </div>
      
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
