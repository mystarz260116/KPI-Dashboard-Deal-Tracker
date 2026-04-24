// src/contexts/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { User } from '../types';
import { perfMark, perfMeasure } from '../lib/perf';

interface AuthContextType {
  user: User | null;
  logout: () => Promise<void>;
  isLoading: boolean;
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
      can_view_dashboard: profile.can_view_dashboard ?? false,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      perfMark('auth:init:start');
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      const user = await buildUserFromSession(session);
      setUser(user);
      setIsLoading(false);
      perfMark('auth:init:end');
      perfMeasure('auth:init', 'auth:init:start', 'auth:init:end');
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const load = async () => {
        perfMark('auth:change:start');
        const user = await buildUserFromSession(session);
        setUser(user);
        setIsLoading(false);
        perfMark('auth:change:end');
        perfMeasure('auth:change', 'auth:change:start', 'auth:change:end');
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
  };

  return (
    <AuthContext.Provider value={{ user, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
