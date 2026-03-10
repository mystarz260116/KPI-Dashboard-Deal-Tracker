// src/contexts/AuthContext.tsx


// ============================================
// 🚨 朱さんへ：差し替えが必要な箇所です
// --------------------------------------------
// このファイルの login / logout / useEffect は
// 現在 localStorage の仮実装になっています。
// Supabase Auth（onAuthStateChange）への
// 差し替えをお願いします🙏
// ============================================

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
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
      .select('name, email, role, department_id')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('profile fetch error:', error);
      return null;
    }

    let departmentName = '';

    if (profile.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .single();

      departmentName = dept?.name ?? '';
    }

    return {
      id: userId,
      name: profile.name,
      department: departmentName,
      email: profile.email,
      role: profile.role,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      const user = await buildUserFromSession(session);
      setUser(user);
      setIsLoading(false);
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const load = async () => {
        const user = await buildUserFromSession(session);
        setUser(user);
        setIsLoading(false);
      };

      load();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
