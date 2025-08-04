'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertCircle } from 'lucide-react';
import PacsServerManager from '@/components/PacsServerManager';
import AISettingsManager from '@/components/AISettingsManager';

export default function SettingsPage() {
  const { user } = useAuth();

  // Check if user is superuser
  const isSupervisor = user?.is_superuser || false;

  if (!isSupervisor) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Access denied. Only supervisors can access system settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          System Settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Configure system-wide settings, PACS server connections, and AI reporting
        </p>
      </div>
      
      <AISettingsManager />
      <PacsServerManager />
    </div>
  );
}