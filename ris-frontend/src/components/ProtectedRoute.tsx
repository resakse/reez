'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireStaff?: boolean;
  requireSuperuser?: boolean;
  fallbackPath?: string;
}

export default function ProtectedRoute({ 
  children, 
  requireStaff = false, 
  requireSuperuser = false,
  fallbackPath = '/examinations'
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      // Check if user meets requirements
      if (requireSuperuser && !user.is_superuser) {
        router.push(fallbackPath);
        return;
      }
      
      if (requireStaff && !user.is_staff) {
        router.push(fallbackPath);
        return;
      }
    }
  }, [user, isLoading, requireStaff, requireSuperuser, router, fallbackPath]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // User not logged in
  if (!user) {
    return null; // AuthWrapper will handle redirect to login
  }

  // Check permissions
  if (requireSuperuser && !user.is_superuser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2">You need superuser privileges to access this page.</p>
        </div>
      </div>
    );
  }

  if (requireStaff && !user.is_staff) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2">You need staff privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}