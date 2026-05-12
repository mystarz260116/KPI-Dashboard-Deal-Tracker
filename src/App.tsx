// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import DealInput from './pages/DealInput';
import DealHistory from './pages/DealHistory';
import CustomerMerge from './pages/CustomerMerge';
import ClinicDetail from './pages/ClinicDetail';
import CrmSearch from './pages/CrmSearch';
import DealProgressDashboard from './pages/DealProgressDashboard';
import SalesPerformanceDashboard from './pages/SalesPerformanceDashboard';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex h-screen items-center justify-center">
      Loading...
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRedirect({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const homePath = isMobile || !user?.can_view_dashboard ? '/deals/new' : '/dashboard';

  useEffect(() => {
    if (!isLoading && user) {
      navigate(homePath);
    }
  }, [user, isLoading, navigate, homePath]);

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center">
      Loading...
    </div>
  );
  if (user) return null;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
          <Route path="/signup" element={<AuthRedirect><Signup /></AuthRedirect>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/deals/new" element={<ProtectedRoute><DealInput /></ProtectedRoute>} />
          <Route path="/deals/history" element={<ProtectedRoute><DealHistory /></ProtectedRoute>} />
          <Route path="/deals/progress" element={<ProtectedRoute><DealProgressDashboard /></ProtectedRoute>} />
          <Route path="/sales-performance" element={<ProtectedRoute><SalesPerformanceDashboard /></ProtectedRoute>} />
          <Route path="/crm" element={<ProtectedRoute><CrmSearch /></ProtectedRoute>} />
          <Route path="/clinics/:kind/:clinicId" element={<ProtectedRoute><ClinicDetail /></ProtectedRoute>} />
          <Route path="/customer-merge" element={<ProtectedRoute><CustomerMerge /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
