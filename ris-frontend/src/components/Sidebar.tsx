'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Settings, BarChart, Home, Stethoscope, X, Bone, FileText, ClipboardList, ListChecks, UserCog, Archive, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsed: boolean;
}

export default function Sidebar({ className, isCollapsed }: SidebarProps) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const isSupervisor = user?.is_superuser || false;
  const isStaff = user?.is_staff || false;
  const isNormalUser = user && !isStaff;
  
  // Don't render menu items while loading authentication state
  if (isLoading) {
    return (
      <aside className={cn("hidden md:block text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
        <nav className="p-4">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        </nav>
      </aside>
    );
  }
  
  // Don't render menu items if user is not authenticated
  if (!user) {
    return (
      <aside className={cn("hidden md:block text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
        <nav className="p-4">
          <div className="flex items-center justify-center h-32 text-white/60 text-sm">
            {!isCollapsed && "Please log in"}
          </div>
        </nav>
      </aside>
    );
  }

  // Helper function to determine if a link is active
  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    // Check if current path starts with the href and is followed by either end of string or a slash
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Helper function to get link classes
  const getLinkClasses = (href: string) => {
    return cn(
      "flex items-center p-2 rounded transition-all duration-200 relative",
      isActive(href) 
        ? "bg-white/20 text-white font-medium border-l-4 border-white/60 shadow-sm" 
        : "hover:bg-white/10 text-white/90 hover:text-white"
    );
  };

  // Helper function to get icon classes
  const getIconClasses = (href: string) => {
    return cn(
      "h-5 w-5 mr-2 transition-all duration-200",
      isActive(href) ? "text-white" : "text-white/80"
    );
  };

  return (
    <aside className={cn("hidden md:block text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
      <nav className="p-4">
        <ul className="space-y-2">
          {!isNormalUser && (
            <li>
              <Link href="/" className={getLinkClasses("/")}>
                <LayoutDashboard className={getIconClasses("/")} />
                {!isCollapsed && "Dashboard"}
              </Link>
            </li>
          )}
          {!isNormalUser && (
            <li>
              <Link href="/patients" className={getLinkClasses("/patients")}>
                <Users className={getIconClasses("/patients")} />
                {!isCollapsed && "Patients"}
              </Link>
            </li>
          )}
          {!isNormalUser && (
            <li>
              <Link href="/register" className={getLinkClasses("/register")}>
                <ClipboardList className={getIconClasses("/register")} />
                {!isCollapsed && "Registration"}
              </Link>
            </li>
          )}
          <li>
            <Link href="/examinations" className={getLinkClasses("/examinations")}>
              <Stethoscope className={getIconClasses("/examinations")} />
              {!isCollapsed && "Examinations"}
            </Link>
          </li>
          <li>
            <Link href="/pacs-browser" className={getLinkClasses("/pacs-browser")}>
              <Archive className={getIconClasses("/pacs-browser")} />
              {!isCollapsed && "PACS Browser"}
            </Link>
          </li>
          {!isNormalUser && (
            <li>
              <Link href="/upload" className={getLinkClasses("/upload")}>
                <Upload className={getIconClasses("/upload")} />
                {!isCollapsed && "Upload DICOM"}
              </Link>
            </li>
          )}
          
          {!isNormalUser && (
            <>
              <li className="pt-4 pb-2">
                <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
                  {!isCollapsed ? "Configuration" : "Config"}
                </div>
              </li>
              
              <li>
                <Link href="/wards" className={getLinkClasses("/wards")}>
                  <Home className={getIconClasses("/wards")} />
                  {!isCollapsed && "Wards"}
                </Link>
              </li>
              <li>
                <Link href="/modalities" className={getLinkClasses("/modalities")}>
                  <X className={getIconClasses("/modalities")} />
                  {!isCollapsed && "Modalities"}
                </Link>
              </li>
              <li>
                <Link href="/body-parts" className={getLinkClasses("/body-parts")}>
                  <Bone className={getIconClasses("/body-parts")} />
                  {!isCollapsed && "Body Parts"}
                </Link>
              </li>
              <li>
                <Link href="/exams" className={getLinkClasses("/exams")}>
                  <FileText className={getIconClasses("/exams")} />
                  {!isCollapsed && "Exam Types"}
                </Link>
              </li>
              <li>
                <Link href="/mwl" className={getLinkClasses("/mwl")}>
                  <ListChecks className={getIconClasses("/mwl")} />
                  {!isCollapsed && "MWL Worklist"}
                </Link>
              </li>
              
              <li className="pt-4 pb-2">
                <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
                  {!isCollapsed ? "System" : "Sys"}
                </div>
              </li>
              <li>
                <Link href="/staff" className={getLinkClasses("/staff")}>
                  <UserCog className={getIconClasses("/staff")} />
                  {!isCollapsed && "Staff Management"}
                </Link>
              </li>
              {isSupervisor && (
                <li>
                  <Link href="/settings" className={getLinkClasses("/settings")}>
                    <Settings className={getIconClasses("/settings")} />
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
            </>
          )}
        </ul>
      </nav>
    </aside>
  );
} 