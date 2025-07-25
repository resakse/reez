'use client';

import Link from "next/link";
import { cn } from "@/lib/utils";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsed: boolean;
}

export default function Sidebar({ className, isCollapsed }: SidebarProps) {
  return (
    <aside className={cn("hidden md:block border-r", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <Link href="/" className="flex items-center p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
              <span className="mr-2">🏠</span>
              {!isCollapsed && "Dashboard"}
            </Link>
          </li>
          <li>
            <Link href="/patients" className="flex items-center p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
              <span className="mr-2">👥</span>
              {!isCollapsed && "Patients"}
            </Link>
          </li>
          <li>
            <div className="flex items-center p-2 text-gray-400 dark:text-gray-500">
              <span className="mr-2">⚙️</span>
              {!isCollapsed && "(Settings - TBD)"}
            </div>
          </li>
          <li>
            <div className="flex items-center p-2 text-gray-400 dark:text-gray-500">
              <span className="mr-2">📊</span>
              {!isCollapsed && "(Reports - TBD)"}
            </div>
          </li>
        </ul>
      </nav>
    </aside>
  );
} 