'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, Calendar, Shield, Settings, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Please log in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences
          </p>
        </div>
        
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Your account details and basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src="" alt={user.username} />
                <AvatarFallback className="text-2xl">
                  {user.username?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-semibold">{user.username}</h3>
                <p className="text-muted-foreground">
                  {user.first_name && user.last_name 
                    ? `${user.first_name} ${user.last_name}` 
                    : 'No display name set'
                  }
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={user.username} readOnly />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  value={user.email || 'Not provided'} 
                  readOnly 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">First Name</Label>
                  <Input 
                    id="first_name" 
                    value={user.first_name || 'Not provided'} 
                    readOnly 
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input 
                    id="last_name" 
                    value={user.last_name || 'Not provided'} 
                    readOnly 
                  />
                </div>
              </div>

              {(user.is_staff || user.is_superuser) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="jawatan">Position (Jawatan)</Label>
                    <Input 
                      id="jawatan" 
                      value={user.jawatan || 'Not specified'} 
                      readOnly 
                    />
                  </div>
                  <div>
                    <Label htmlFor="klinik">Clinic (Klinik)</Label>
                    <Input 
                      id="klinik" 
                      value={user.klinik || 'Not specified'} 
                      readOnly 
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Status
            </CardTitle>
            <CardDescription>
              Your role and permissions in the system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Account Type</span>
                <Badge variant={user.is_superuser ? "default" : user.is_staff ? "secondary" : "outline"}>
                  {user.is_superuser ? "Super Administrator" : user.is_staff ? "Staff Member" : "Standard User"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge variant={user.is_active !== false ? "default" : "destructive"}>
                  {user.is_active !== false ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Staff Access</span>
                <Badge variant={user.is_staff ? "default" : "outline"}>
                  {user.is_staff ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Admin Access</span>
                <Badge variant={user.is_superuser ? "default" : "outline"}>
                  {user.is_superuser ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Permissions</h4>
              <div className="text-sm text-muted-foreground">
                {user.is_superuser ? (
                  <p>You have full administrative access to all system features.</p>
                ) : user.is_staff ? (
                  <p>You have access to staff features including patient management, examinations, and reporting.</p>
                ) : (
                  <p>You have access to view examinations and PACS browser only.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comments Section - Separate Card */}
      {(user.is_staff || user.is_superuser) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Comments
            </CardTitle>
            <CardDescription>
              Additional notes and comments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="komen">Comments (Komen)</Label>
              <Textarea 
                id="komen" 
                value={user.komen || 'No comments'} 
                readOnly 
                rows={4}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Account Actions
          </CardTitle>
          <CardDescription>
            Manage your account settings and session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Link href="/profile/edit">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </Link>
            
            <Link href="/profile/change-password">
              <Button variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Change Password
              </Button>
            </Link>
            
            <Button variant="destructive" onClick={logout}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}