'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CollaborativeReportingInterface } from '@/components/CollaborativeReportingInterface';
import { useAISettings } from '@/contexts/AISettingsContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, FileText, Shield, ArrowLeft, User, Calendar, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';

interface ExaminationDetails {
  id: number;
  no_xray: string;
  exam: {
    nama: string;
    modaliti: {
      nama: string;
    };
  };
  daftar: {
    pesakit: {
      nama: string;
      mrn: string;
      nric: string;
      jantina: string;
      umur: number;
    };
    tarikh: string;
    masa: string;
  };
  catatan?: string;
  status?: string;
}

export default function ReportingPage() {
  const params = useParams();
  const router = useRouter();
  const examinationId = params.examinationId as string;
  const { isAIEnabled, isLoading: aiSettingsLoading } = useAISettings();
  
  const [examination, setExamination] = useState<ExaminationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiReportId, setAiReportId] = useState<string | undefined>();

  useEffect(() => {
    if (examinationId) {
      loadExaminationDetails();
      checkForExistingAIReport();
    }
  }, [examinationId]);

  const loadExaminationDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch examination details
      const response = await AuthService.authenticatedFetch(`/api/examinations/${examinationId}/`);
      
      if (response.ok) {
        const data = await response.json();
        setExamination(data);
      } else if (response.status === 404) {
        setError('Examination not found');
      } else {
        setError('Failed to load examination details');
      }
    } catch (err) {
      console.error('Error loading examination:', err);
      setError('Failed to load examination details');
    } finally {
      setIsLoading(false);
    }
  };

  const checkForExistingAIReport = async () => {
    try {
      // Check if there's already an AI report for this examination
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/?search=${examinationId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          setAiReportId(data.results[0].id.toString());
        }
      }
    } catch (err) {
      console.error('Error checking for existing AI report:', err);
    }
  };

  const handleBackToExaminations = () => {
    router.push('/examinations');
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString: string) => {
    try {
      return new Date(`1970-01-01T${timeString}`).toLocaleTimeString('en-MY', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return timeString;
    }
  };

  if (isLoading || aiSettingsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </CardContent>
        </Card>
        
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={handleBackToExaminations}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Examinations
          </Button>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center h-96">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Unable to Load Examination</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={loadExaminationDetails}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!examinationId) {
    return (
      <div className="container mx-auto p-6">
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
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={handleBackToExaminations}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Examinations
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              AI-Assisted Reporting
              {isAIEnabled && (
                <div className="flex items-center gap-2 ml-4">
                  <Brain className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-600 font-medium">AI-Enabled</span>
                </div>
              )}
            </h1>
            <p className="text-muted-foreground">
              Examination: {examinationId}
            </p>
          </div>
        </div>
        {examination && (
          <Badge variant="outline" className="text-sm">
            {examination.exam.modaliti.nama}
          </Badge>
        )}
      </div>

      {/* Patient and Examination Information */}
      {examination && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient & Examination Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Patient Information */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">PATIENT INFORMATION</h4>
                <div className="space-y-1">
                  <p className="font-medium">{examination.daftar.pesakit.nama}</p>
                  <p className="text-sm text-muted-foreground">
                    MRN: {examination.daftar.pesakit.mrn}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    NRIC: {examination.daftar.pesakit.nric}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {examination.daftar.pesakit.jantina}, {examination.daftar.pesakit.umur} years old
                  </p>
                </div>
              </div>

              {/* Examination Information */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">EXAMINATION DETAILS</h4>
                <div className="space-y-1">
                  <p className="font-medium">{examination.exam.nama}</p>
                  <p className="text-sm text-muted-foreground">
                    Modality: {examination.exam.modaliti.nama}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Number: {examination.no_xray}
                  </p>
                  {examination.status && (
                    <Badge variant="secondary" className="text-xs">
                      {examination.status}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Study Information */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  STUDY INFORMATION
                </h4>
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">Date:</span> {formatDate(examination.daftar.tarikh)}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Time:</span> {formatTime(examination.daftar.masa)}
                  </p>
                  {examination.catatan && (
                    <p className="text-sm">
                      <span className="font-medium">Notes:</span> {examination.catatan}
                    </p>
                  )}
                  {aiReportId && (
                    <Badge variant="outline" className="text-xs">
                      AI Report Available
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Status Alert */}
      {!isAIEnabled && (
        <Alert>
          <Brain className="h-4 w-4" />
          <AlertDescription>
            AI reporting is currently disabled. You can enable it in the settings to access AI-assisted features.
            Currently showing standard 2-panel reporting interface.
          </AlertDescription>
        </Alert>
      )}

      {/* Collaborative Reporting Interface */}
      <div className="min-h-screen">
        <CollaborativeReportingInterface 
          examinationId={examinationId}
          aiReportId={aiReportId}
        />
      </div>
    </div>
  );
}