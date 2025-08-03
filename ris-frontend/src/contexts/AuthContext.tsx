'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import AuthService from '@/lib/auth';

interface User {
  id: number;
  username: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  first_name?: string;
  last_name?: string;
  email?: string;
  jawatan?: string;
  klinik?: string;
  komen?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshUser();
  }, []);

  const refreshUser = async () => {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      try {
        // Fetch full user profile from API
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/staff/${currentUser.user_id}/`
        );
        
        if (response.ok) {
          const userData = await response.json();
          setUser({
            id: userData.id,
            username: userData.username,
            is_staff: userData.is_staff,
            is_superuser: userData.is_superuser,
            is_active: userData.is_active,
            first_name: userData.first_name,
            last_name: userData.last_name,
            email: userData.email,
            jawatan: userData.jawatan,
            klinik: userData.klinik,
            komen: userData.komen,
          });
        } else {
          // Fallback to token data if API call fails
          setUser({ id: currentUser.user_id, username: currentUser.username });
        }
      } catch (error) {
        // Failed to fetch user profile
        // Fallback to token data
        setUser({ id: currentUser.user_id, username: currentUser.username });
      }
    } else {
      setUser(null);
    }
    setIsLoading(false);
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    const success = await AuthService.login(username, password);
    if (success) {
      await refreshUser();
    }
    return success;
  };

  const logout = () => {
    setIsLoading(true); // Prevent menu flash during logout
    AuthService.logout();
    setUser(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}