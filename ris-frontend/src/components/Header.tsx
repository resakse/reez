'use client';

import { useSession, signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import { Menu } from "lucide-react";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 w-full bg-sidebar text-white">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="hover:bg-white/10 hover:text-white">
                <Menu className="h-6 w-6" />
            </Button>
            <Link href="/" className="flex items-center space-x-2">
                <span className="font-bold">
                Radiology IS
                </span>
            </Link>
        </div>

        <div className="flex items-center space-x-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full hover:bg-white/10 hover:text-white">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
                  <AvatarFallback>{user?.name?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.name}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
} 