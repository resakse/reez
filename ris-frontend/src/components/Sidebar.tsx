'use client';

import Link from "next/link";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Settings, BarChart, Home, Stethoscope, X, Bone, FileText, ClipboardList, ListChecks, UserCog, Archive } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsed: boolean;
}

export default function Sidebar({ className, isCollapsed }: SidebarProps) {
  const { user } = useAuth();
  const isSupervisor = user?.is_superuser || false;

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
            <Link href="/register" className="flex items-center p-2 rounded hover:bg-white/10">
              <ClipboardList className="h-5 w-5 mr-2" />
              {!isCollapsed && "Registration"}
            </Link>
          </li>
          <li>
            <Link href="/examinations" className="flex items-center p-2 rounded hover:bg-white/10">
              <Stethoscope className="h-5 w-5 mr-2" />
              {!isCollapsed && "Examinations"}
            </Link>
          </li>
          <li>
            <Link href="/pacs-browser" className="flex items-center p-2 rounded hover:bg-white/10">
              <Archive className="h-5 w-5 mr-2" />
              {!isCollapsed && "PACS Browser"}
            </Link>
          </li>
          
          <li className="pt-4 pb-2">
            <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
              {!isCollapsed ? "Configuration" : "Config"}
            </div>
          </li>
          
          <li>
            <Link href="/wards" className="flex items-center p-2 rounded hover:bg-white/10">
              <Home className="h-5 w-5 mr-2" />
              {!isCollapsed && "Wards"}
            </Link>
          </li>
          <li>
            <Link href="/modalities" className="flex items-center p-2 rounded hover:bg-white/10">
              <X className="h-5 w-5 mr-2" />
              {!isCollapsed && "Modalities"}</Link>
          </li>
          <li>
            <Link href="/body-parts" className="flex items-center p-2 rounded hover:bg-white/10">
              <Bone className="h-5 w-5 mr-2" />
              {!isCollapsed && "Body Parts"}
            </Link>
          </li>
          <li>
            <Link href="/exams" className="flex items-center p-2 rounded hover:bg-white/10">
              <FileText className="h-5 w-5 mr-2" />
              {!isCollapsed && "Exam Types"}
            </Link>
          </li>
          <li>
            <Link href="/mwl" className="flex items-center p-2 rounded hover:bg-white/10">
              <ListChecks className="h-5 w-5 mr-2" />
              {!isCollapsed && "MWL Worklist"}
            </Link>
          </li>
          
          <li className="pt-4 pb-2">
            <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
              {!isCollapsed ? "System" : "Sys"}
            </div>
          </li>
          <li>
            <Link href="/staff" className="flex items-center p-2 rounded hover:bg-white/10">
              <UserCog className="h-5 w-5 mr-2" />
              {!isCollapsed && "Staff Management"}
            </Link>
          </li>
          {isSupervisor && (
            <li>
              <Link href="/settings" className="flex items-center p-2 rounded hover:bg-white/10">
                <Settings className="h-5 w-5 mr-2" />
                {!isCollapsed && "Settings"}
              </Link>
            </li>
          )}
          <li>
            <div className="flex items-center p-2 text-gray-400 cursor-not-allowed">
              <BarChart className="h-5 w-5 mr-2" />
              {!isCollapsed && "Reports"}
            </div>
          </li>
        </ul>
      </nav>
    </aside>
  );
} 