'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Settings, BarChart, Home, Stethoscope, X, Bone, FileText, ClipboardList, ListChecks, UserCog, Archive, Upload, Disc3, AlertTriangle, TrendingUp, Menu, Moon, Sun, Monitor, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import Swal from 'sweetalert2';
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  isActive: (href: string) => boolean;
  getLinkClasses: (href: string) => string;
  getIconClasses: (href: string) => string;
}

function NavItem({ href, icon, label, isCollapsed, isActive, getLinkClasses, getIconClasses }: NavItemProps) {
  const linkContent = (
    <Link href={href} className={getLinkClasses(href)}>
      <div className={getIconClasses(href)}>{icon}</div>
      {!isCollapsed && label}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {linkContent}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

// Custom theme display components
function ThemeRow() {
  const { theme, setTheme } = useTheme();
  
  const getThemeIcon = () => {
    if (theme === 'light') return <Sun className="h-4 w-4" />;
    if (theme === 'dark') return <Moon className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };
  
  const getThemeLabel = () => {
    if (theme === 'light') return 'Light Mode';
    if (theme === 'dark') return 'Dark Mode';
    return 'System';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start h-8 px-2 hover:bg-white/10 hover:text-white">
          <div className="flex items-center gap-2">
            {getThemeIcon()}
            <span className="text-sm">{getThemeLabel()}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeIconOnly() {
  const { theme, setTheme } = useTheme();
  
  const getThemeIcon = () => {
    if (theme === 'light') return <Sun className="h-4 w-4" />;
    if (theme === 'dark') return <Moon className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 hover:text-white">
          {getThemeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Sidebar({ className, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { user, isLoading, logout } = useAuth();
  const { theme } = useTheme();
  const pathname = usePathname();
  const isSupervisor = user?.is_superuser || false;
  const isStaff = user?.is_staff || false;
  const isNormalUser = user && !isStaff;

  const handleLogout = async () => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'You will be logged out of the system.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
      background: isDark ? '#1f2937' : '#ffffff',
      color: isDark ? '#f9fafb' : '#1f2937',
      customClass: {
        popup: isDark ? 'dark-popup' : '',
        title: isDark ? 'dark-title' : '',
        content: isDark ? 'dark-content' : ''
      }
    });

    if (result.isConfirmed) {
      logout();
    }
  };
  
  // Don't render menu items while loading authentication state
  if (isLoading) {
    return (
      <aside className={cn("flex flex-col text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="hover:bg-white/10 hover:text-white">
              <Menu className="h-6 w-6" />
            </Button>
            {!isCollapsed && (
              <Link href="/" className="flex items-center space-x-2">
                <span className="font-bold">Radiology IS</span>
              </Link>
            )}
          </div>
        </div>
        <nav className="flex-1 p-4">
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
      <aside className={cn("flex flex-col text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="hover:bg-white/10 hover:text-white">
              <Menu className="h-6 w-6" />
            </Button>
            {!isCollapsed && (
              <Link href="/" className="flex items-center space-x-2">
                <span className="font-bold">Radiology IS</span>
              </Link>
            )}
          </div>
        </div>
        <nav className="flex-1 p-4">
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
    <TooltipProvider>
      <aside className={cn("flex flex-col text-white bg-sidebar", isCollapsed ? "w-20" : "w-64", "transition-all duration-300", className)}>
        {/* Header Section */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="hover:bg-white/10 hover:text-white">
              <Menu className="h-6 w-6" />
            </Button>
            {!isCollapsed && (
              <Link href="/" className="flex items-center space-x-2">
                <span className="font-bold">Radiology IS</span>
              </Link>
            )}
          </div>
        </div>

      {/* Navigation Section */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {!isNormalUser && (
            <li>
              <NavItem 
                href="/" 
                icon={<LayoutDashboard className="h-5 w-5" />} 
                label="Dashboard" 
                isCollapsed={isCollapsed}
                isActive={isActive}
                getLinkClasses={getLinkClasses}
                getIconClasses={getIconClasses}
              />
            </li>
          )}
          {!isNormalUser && (
            <li>
              <NavItem 
                href="/patients" 
                icon={<Users className="h-5 w-5" />} 
                label="Patients" 
                isCollapsed={isCollapsed}
                isActive={isActive}
                getLinkClasses={getLinkClasses}
                getIconClasses={getIconClasses}
              />
            </li>
          )}
          {!isNormalUser && (
            <li>
              <NavItem 
                href="/register" 
                icon={<ClipboardList className="h-5 w-5" />} 
                label="Registration" 
                isCollapsed={isCollapsed}
                isActive={isActive}
                getLinkClasses={getLinkClasses}
                getIconClasses={getIconClasses}
              />
            </li>
          )}
          <li>
            <NavItem 
              href="/examinations" 
              icon={<Stethoscope className="h-5 w-5" />} 
              label="Examinations" 
              isCollapsed={isCollapsed}
              isActive={isActive}
              getLinkClasses={getLinkClasses}
              getIconClasses={getIconClasses}
            />
          </li>
          <li>
            <NavItem 
              href="/pacs-browser" 
              icon={<Archive className="h-5 w-5" />} 
              label="PACS Browser" 
              isCollapsed={isCollapsed}
              isActive={isActive}
              getLinkClasses={getLinkClasses}
              getIconClasses={getIconClasses}
            />
          </li>
          {!isNormalUser && (
            <li>
              <NavItem 
                href="/upload" 
                icon={<Upload className="h-5 w-5" />} 
                label="Upload DICOM" 
                isCollapsed={isCollapsed}
                isActive={isActive}
                getLinkClasses={getLinkClasses}
                getIconClasses={getIconClasses}
              />
            </li>
          )}
          {!isNormalUser && (
            <li>
              <NavItem 
                href="/media-distributions" 
                icon={<Disc3 className="h-5 w-5" />} 
                label="CD/Film Distribution" 
                isCollapsed={isCollapsed}
                isActive={isActive}
                getLinkClasses={getLinkClasses}
                getIconClasses={getIconClasses}
              />
            </li>
          )}
          
          {!isNormalUser && (
            <>
              <li className="pt-4 pb-2">
                <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
                  {!isCollapsed ? "Quality Management" : "QM"}
                </div>
              </li>
              
              <li>
                <NavItem 
                  href="/reject-analysis" 
                  icon={<AlertTriangle className="h-5 w-5" />} 
                  label="Reject Analysis" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              
              <li className="pt-4 pb-2">
                <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
                  {!isCollapsed ? "Configuration" : "Config"}
                </div>
              </li>
              
              <li>
                <NavItem 
                  href="/wards" 
                  icon={<Home className="h-5 w-5" />} 
                  label="Wards" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              <li>
                <NavItem 
                  href="/modalities" 
                  icon={<X className="h-5 w-5" />} 
                  label="Modalities" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              <li>
                <NavItem 
                  href="/body-parts" 
                  icon={<Bone className="h-5 w-5" />} 
                  label="Body Parts" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              <li>
                <NavItem 
                  href="/exams" 
                  icon={<FileText className="h-5 w-5" />} 
                  label="Exam Types" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              <li>
                <NavItem 
                  href="/mwl" 
                  icon={<ListChecks className="h-5 w-5" />} 
                  label="MWL Worklist" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              
              <li className="pt-4 pb-2">
                <div className={cn("text-xs font-semibold text-gray-400 uppercase", isCollapsed && "text-center")}>
                  {!isCollapsed ? "System" : "Sys"}
                </div>
              </li>
              <li>
                <NavItem 
                  href="/staff" 
                  icon={<UserCog className="h-5 w-5" />} 
                  label="Staff Management" 
                  isCollapsed={isCollapsed}
                  isActive={isActive}
                  getLinkClasses={getLinkClasses}
                  getIconClasses={getIconClasses}
                />
              </li>
              {isSupervisor && (
                <li>
                  <NavItem 
                    href="/settings" 
                    icon={<Settings className="h-5 w-5" />} 
                    label="Settings" 
                    isCollapsed={isCollapsed}
                    isActive={isActive}
                    getLinkClasses={getLinkClasses}
                    getIconClasses={getIconClasses}
                  />
                </li>
              )}
              {isSupervisor && (
                <li>
                  <NavItem 
                    href="/audit-dashboard" 
                    icon={<Shield className="h-5 w-5" />} 
                    label="Audit Dashboard" 
                    isCollapsed={isCollapsed}
                    isActive={isActive}
                    getLinkClasses={getLinkClasses}
                    getIconClasses={getIconClasses}
                  />
                </li>
              )}
              <li>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center p-2 text-gray-400 cursor-not-allowed">
                        <BarChart className="h-5 w-5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Reports</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="flex items-center p-2 text-gray-400 cursor-not-allowed">
                    <BarChart className="h-5 w-5 mr-2" />
                    Reports
                  </div>
                )}
              </li>
            </>
          )}
        </ul>
      </nav>

      {/* Footer Section with Custom Theme and Profile Layout */}
      <div className="p-4 border-t border-white/10">
        {!isCollapsed ? (
          <div className="space-y-3">
            {/* Theme Toggle Row */}
            <ThemeRow />
            
            {/* Profile Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" alt={user?.username ?? ""} />
                  <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium truncate">{user?.username}</span>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/profile">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 hover:text-white">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 hover:bg-white/10 hover:text-white" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-center">
            <ThemeIconOnly />
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarImage src="" alt={user?.username ?? ""} />
                  <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{user?.username}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/profile">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 hover:text-white">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Profile Settings</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 hover:bg-white/10 hover:text-white" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Logout</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
    </TooltipProvider>
  );
} 