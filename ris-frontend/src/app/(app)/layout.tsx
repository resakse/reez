'use client';

import { useState } from 'react';
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header onToggleSidebar={toggleSidebar} />
      <div className="flex flex-1">
        <Sidebar isCollapsed={isSidebarCollapsed} />
        <main className="flex-1 p-4 bg-background">{children}</main>
      </div>
    </div>
  );
} 