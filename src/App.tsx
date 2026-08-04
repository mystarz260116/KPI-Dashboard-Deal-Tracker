// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MfaSetup from './pages/MfaSetup';
import MfaVerify from './pages/MfaVerify';
import Dashboard from './pages/Dashboard';
import DealInput from './pages/DealInput';
import DealHistory from './pages/DealHistory';
import CustomerMerge from './pages/CustomerMerge';
import ClinicDetail from './pages/ClinicDetail';
import CrmSearch from './pages/CrmSearch';
import DealProgressDashboard from './pages/DealProgressDashboard';
import SalesPerformanceDashboard from './pages/SalesPerformanceDashboard';
import ClinicAssetsDashboard from './pages/ClinicAssetsDashboard';
import UserMaster from './pages/UserMaster';
import InitialPasswordSetup from './pages/InitialPasswordSetup';
import ClinicSalesTrend from './pages/ClinicSalesTrend';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, mfaStatus, isMfaLoading } = useAuth();
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;

  if (isLoading || isMfaLoading) return (
    <div className="flex h-screen items-center justify-center">
      Loading...
    </div>
  );
  if (!user) return <Navigate to="/login" replace state={{ from }} />;
  if (user.must_change_password) return <Navigate to="/initial-password" replace />;
  if (!mfaStatus?.isEnrolled) return <Navigate to="/mfa/setup" replace state={{ from }} />;
  if (!mfaStatus.isVerified) return <Navigate to="/mfa/verify" replace state={{ from }} />;
  return <>{children}</>;
}

function MfaRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, mfaStatus, isMfaLoading } = useAuth();
  const location = useLocation();
  const redirectPath = typeof location.state?.from === 'string' ? location.state.from : '';
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const homePath = redirectPath || (isMobile || !user?.can_view_dashboard ? '/deals/new' : '/dashboard');

  if (isLoading || isMfaLoading) return (
    <div className="flex h-screen items-center justify-center">
      Loading...
    </div>
  );
  if (!user) return <Navigate to="/login" replace state={location.state} />;
  if (user.must_change_password) return <Navigate to="/initial-password" replace />;
  if (mfaStatus?.isVerified) return <Navigate to={homePath} replace />;
  return <>{children}</>;
}

function UserManagementRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user?.can_manage_users) {
    return <Navigate to={user?.can_view_dashboard ? '/dashboard' : '/deals/new'} replace />;
  }

  return <>{children}</>;
}

function InitialPasswordRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) return <Navigate to="/mfa/setup" replace />;
  return <InitialPasswordSetup />;
}

function AuthRedirect({ children }: { children: ReactNode }) {
  const { user, isLoading, mfaStatus, isMfaLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = typeof location.state?.from === 'string' ? location.state.from : '';
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const homePath = redirectPath || (isMobile || !user?.can_view_dashboard ? '/deals/new' : '/dashboard');

  useEffect(() => {
    if (isLoading || isMfaLoading || !user) {
      return;
    }

    if (user.must_change_password) {
      navigate('/initial-password', { replace: true });
      return;
    }

    if (!mfaStatus?.isEnrolled) {
      navigate('/mfa/setup', { state: { from: redirectPath || homePath }, replace: true });
      return;
    }

    if (!mfaStatus.isVerified) {
      navigate('/mfa/verify', { state: { from: redirectPath || homePath }, replace: true });
      return;
    }

    navigate(homePath);
  }, [user, isLoading, isMfaLoading, mfaStatus, navigate, redirectPath, homePath]);

  if (isLoading || isMfaLoading) return (
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
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<AuthRedirect><ForgotPassword /></AuthRedirect>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/initial-password" element={<InitialPasswordRoute />} />
          <Route path="/mfa/setup" element={<MfaRoute><MfaSetup /></MfaRoute>} />
          <Route path="/mfa/verify" element={<MfaRoute><MfaVerify /></MfaRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/deals/new" element={<ProtectedRoute><DealInput /></ProtectedRoute>} />
          <Route path="/deals/history" element={<ProtectedRoute><DealHistory /></ProtectedRoute>} />
          <Route path="/deals/progress" element={<ProtectedRoute><DealProgressDashboard /></ProtectedRoute>} />
          <Route path="/sales-performance" element={<ProtectedRoute><SalesPerformanceDashboard /></ProtectedRoute>} />
          <Route path="/clinic-assets" element={<ProtectedRoute><ClinicAssetsDashboard /></ProtectedRoute>} />
          <Route path="/clinic-sales-trend" element={<ProtectedRoute><ClinicSalesTrend /></ProtectedRoute>} />
          <Route path="/crm" element={<ProtectedRoute><CrmSearch /></ProtectedRoute>} />
          <Route path="/clinics/:kind/:clinicId" element={<ProtectedRoute><ClinicDetail /></ProtectedRoute>} />
          <Route path="/customer-merge" element={<ProtectedRoute><UserManagementRoute><CustomerMerge /></UserManagementRoute></ProtectedRoute>} />
          <Route path="/user-master" element={<ProtectedRoute><UserManagementRoute><UserMaster /></UserManagementRoute></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
