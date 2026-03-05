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
import { User } from '../types';

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

  useEffect(() => {
    // ここは朱さんがSupabase Authに差し替えお願いします。
    // 今は仮の実装
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const logout = async () => {
    // ここも朱さんがSupabase Authに差し替えお願いします。
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
