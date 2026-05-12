import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import App from '@/App';
import { Spinner } from '@/components/ui/spinner';
import { attemptLogin } from '@/lib/authFlows';
import type { ViewType } from '@/types';

function LoginRoute() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <Spinner className="size-10 text-teal-600 animate-spin" aria-label="Loading session" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (email: string, password: string) => {
    const result = await attemptLogin(email, password);
    if (!result.ok) {
      if (result.deactivated) {
        toast.error('Account deactivated', { description: result.error });
      } else {
        toast.error('Invalid credentials', { description: result.error });
      }
      return;
    }
    toast.success('Welcome back!', { description: `Hello, ${result.user.name}` });
    navigate('/', { replace: true });
  };

  const onNavigate = (view: ViewType) => {
    if (view === 'register') navigate('/register');
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <LoginPage onLogin={handleLogin} onNavigate={onNavigate} />
    </div>
  );
}

function RegisterRoute() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <Spinner className="size-10 text-teal-600 animate-spin" aria-label="Loading session" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  const onNavigate = (view: ViewType) => {
    if (view === 'login') navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <RegisterPage onNavigate={onNavigate} />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/*" element={<App />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}
