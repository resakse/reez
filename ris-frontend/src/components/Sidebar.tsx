'use client';

import Link from "next/link";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Settings, BarChart } from "lucide-react";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsed: boolean;
}

export default function Sidebar({ className, isCollapsed }: SidebarProps) {
  return (
    <aside className={cn("hidden md:block text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <Link href="/" className="flex items-center p-2 rounded hover:bg-white/10">
              <LayoutDashboard className="h-5 w-5 mr-2" />
              {!isCollapsed && "Dashboard"}
            </Link>
          </li>
          <li>
            <Link href="/patients" className="flex items-center p-2 rounded hover:bg-white/10">
              <Users className="h-5 w-5 mr-2" />
              {!isCollapsed && "Patients"}
            </Link>
          </li>
          <li>
            <div className="flex items-center p-2 text-gray-400">
              <Settings className="h-5 w-5 mr-2" />
              {!isCollapsed && "(Settings - TBD)"}
            </div>
          </li>
          <li>
            <div className="flex items-center p-2 text-gray-400">
              <BarChart className="h-5 w-5 mr-2" />
              {!isCollapsed && "(Reports - TBD)"}
            </div>
          </li>
        </ul>
      </nav>
    </aside>
  );
} 