import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { Spinner } from '@/components/ui/spinner';

/**
 * Waits for Supabase session hydration before deciding auth redirects.
 * Renders a loading UI while `isLoading` is true; only redirects to `/login` when loading finished and there is no session.
 */
export default function ProtectedRoute() {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <Spinner className="size-10 text-teal-600 animate-spin" aria-label="Loading session" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
