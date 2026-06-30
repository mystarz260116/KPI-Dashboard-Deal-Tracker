// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { User } from '../types';
import { perfMark, perfMeasure } from '../lib/perf';
import { authFetch } from '../lib/authFetch';

type MfaStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  isEnrolled: boolean;
  isVerified: boolean;
};

interface AuthContextType {
  user: User | null;
  logout: () => Promise<void>;
  isLoading: boolean;
  mfaStatus: MfaStatus | null;
  isMfaLoading: boolean;
  refreshMfaStatus: () => Promise<MfaStatus | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [isMfaLoading, setIsMfaLoading] = useState(false);
  const recordedLoginKeyRef = useRef<string | null>(null);
  const loadedSessionKeyRef = useRef<string | null>(null);
  const authLoadSeqRef = useRef(0);

  const recordLoginUsage = async (session: Session | null) => {
    if (!session?.user) return;

    const tokenKey = `${session.user.id}:${session.access_token}`;
    if (recordedLoginKeyRef.current === tokenKey) {
      return;
    }

    recordedLoginKeyRef.current = tokenKey;

    try {
      await authFetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'record-login' }),
      });
    } catch (error) {
      console.error('login usage tracking error:', error);
      recordedLoginKeyRef.current = null;
    }
  };

  const buildUserFromSession = async (session: Session | null): Promise<User | null> => {
    if (!session?.user) return null;

    const userId = session.user.id;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('name, email, role, department_id, can_view_dashboard, departments(name)')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('profile fetch error:', error);
      return null;
    }

    const departments = (profile as any).departments;
    const departmentName = Array.isArray(departments)
      ? (departments[0]?.name ?? '')
      : (departments?.name ?? '');

    return {
      id: userId,
      name: profile.name,
      department_id: profile.department_id ?? null,
      department: departmentName,
      email: profile.email,
      role: profile.role,
      can_view_dashboard: true,
    };
  };

  const loadMfaStatus = async (session: Session | null): Promise<MfaStatus | null> => {
    if (!session?.user) {
      setMfaStatus(null);
      return null;
    }

    setIsMfaLoading(true);

    try {
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aalError) {
        throw aalError;
      }

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();

      if (factorsError) {
        throw factorsError;
      }

      const nextStatus = {
        currentLevel: aalData.currentLevel,
        nextLevel: aalData.nextLevel,
        isEnrolled: (factorsData.totp ?? []).length > 0,
        isVerified: aalData.currentLevel === 'aal2',
      };

      setMfaStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      console.error('mfa status fetch error:', error);
      const fallbackStatus = {
        currentLevel: null,
        nextLevel: null,
        isEnrolled: false,
        isVerified: false,
      };
      setMfaStatus(fallbackStatus);
      return fallbackStatus;
    } finally {
      setIsMfaLoading(false);
    }
  };

  const refreshMfaStatus = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return loadMfaStatus(session);
  };

  const getSessionKey = (session: Session | null) => (
    session?.user ? `${session.user.id}:${session.access_token}` : 'signed-out'
  );

  const applyAuthSession = async (
    session: Session | null,
    label: 'auth:init' | 'auth:change',
    options: { force?: boolean; trackLogin?: boolean } = {}
  ) => {
    const sessionKey = getSessionKey(session);

    if (!options.force && loadedSessionKeyRef.current === sessionKey) {
      return;
    }

    loadedSessionKeyRef.current = sessionKey;
    const loadSeq = authLoadSeqRef.current + 1;
    authLoadSeqRef.current = loadSeq;

    perfMark(`${label}:start`);

    if (!session?.user) {
      setUser(null);
      setMfaStatus(null);
      setIsLoading(false);
      perfMark(`${label}:end`);
      perfMeasure(label, `${label}:start`, `${label}:end`);
      return;
    }

    const [nextUser, nextMfaStatus] = await Promise.all([
      buildUserFromSession(session),
      loadMfaStatus(session),
    ]);

    if (authLoadSeqRef.current !== loadSeq) {
      return;
    }

    setUser(nextUser);
    setIsLoading(false);
    perfMark(`${label}:end`);
    perfMeasure(label, `${label}:start`, `${label}:end`);

    if (options.trackLogin && nextMfaStatus?.isVerified) {
      void recordLoginUsage(session);
    }
  };

  const shouldHandleAuthChange = (event: AuthChangeEvent, session: Session | null) => {
    if (event === 'SIGNED_OUT') {
      return true;
    }

    if (!session?.user) {
      return true;
    }

    if (event === 'TOKEN_REFRESHED') {
      return false;
    }

    const sessionKey = getSessionKey(session);
    return loadedSessionKeyRef.current !== sessionKey;
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      await applyAuthSession(session, 'auth:init', { trackLogin: true });
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!shouldHandleAuthChange(event, session)) {
        return;
      }

      const load = async () => {
        await applyAuthSession(session, 'auth:change', { trackLogin: event === 'SIGNED_IN' });
      };

      load();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMfaStatus(null);
  };

  return (
    <AuthContext.Provider value={{ user, logout, isLoading, mfaStatus, isMfaLoading, refreshMfaStatus }}>
      {children}
    </AuthContext.Provider>
  );
}
