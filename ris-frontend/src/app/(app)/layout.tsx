'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TargetRatesProvider } from '@/contexts/TargetRatesContext';
import { AISettingsProvider } from '@/contexts/AISettingsContext';
import Sidebar from "@/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Redirect unauthenticated users to login page
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  // Redirect normal users away from restricted pages
  useEffect(() => {
    if (!isLoading && user && !user.is_staff) {
      // Pages normal users can access
      const allowedPaths = ['/examinations', '/pacs-browser'];
      const isAllowedPath = allowedPaths.some(path => 
        pathname === path || pathname.startsWith(path + '/')
      );
      
      // If user is on a restricted page, redirect to examinations
      if (!isAllowedPath) {
        router.push('/examinations');
      }
    }
  }, [user, isLoading, pathname, router]);

  return (
    <TargetRatesProvider>
      <AISettingsProvider>
        <div className="flex min-h-screen">
          <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />
          <main className="flex-1 p-4 bg-background">{children}</main>
        </div>
      </AISettingsProvider>
    </TargetRatesProvider>
  );
} 