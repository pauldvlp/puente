import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/query';
import { AuthProvider, useAuth } from './lib/auth';
import { LiveProvider } from './lib/live';
import { useSetupStatus } from './lib/hooks';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui/spinner';
import { Toaster } from './components/ui/sonner';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { NodesPage } from './pages/NodesPage';
import { RoutesPage } from './pages/RoutesPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';

function FullScreen() {
  return (
    <div className="grid h-screen place-items-center">
      <Spinner className="size-8" />
    </div>
  );
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  );
}

function AppRoutes() {
  const { loading, isAuthenticated } = useAuth();
  const setup = useSetupStatus();

  if (loading || setup.isLoading) return <FullScreen />;
  const hasAdmin = setup.data?.hasAdmin ?? false;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage hasAdmin={hasAdmin} />}
      />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
