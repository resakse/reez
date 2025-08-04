'use client';

import { useParams } from 'next/navigation';
import { CollaborativeReportingInterface } from '@/components/CollaborativeReportingInterface';
import { useAISettings } from '@/contexts/AISettingsContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Brain, FileText, Shield } from 'lucide-react';

export default function ReportingPage() {
  const params = useParams();
  const examinationId = params.examinationId as string;
  const { isAIEnabled, isLoading } = useAISettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading reporting interface...</p>
        </div>
      </div>
    );
  }

  if (!examinationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Radiology Reporting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Invalid examination ID. Please select a valid examination to start reporting.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-screen">
      {/* Header */}
      <div className="mb-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Radiology Reporting</h1>
            {isAIEnabled && (
              <div className="flex items-center gap-2 ml-4">
                <Brain className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-600 font-medium">AI-Assisted</span>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground">
            Examination ID: {examinationId}
          </div>
        </div>
        
        {!isAIEnabled && (
          <Alert className="mt-4">
            <Brain className="h-4 w-4" />
            <AlertDescription>
              AI reporting is currently disabled. You can enable it in the settings to access AI-assisted features.
              Currently showing standard 2-panel reporting interface.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Collaborative Reporting Interface */}
      <CollaborativeReportingInterface 
        examinationId={examinationId}
      />
    </div>
  );
}