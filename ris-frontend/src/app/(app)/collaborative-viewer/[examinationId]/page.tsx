'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAISettings } from '@/contexts/AISettingsContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import { 
  ArrowLeft, 
  User, 
  Calendar,
  Stethoscope,
  Brain,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  AlertTriangle,
  Maximize2
} from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import { getStudyMetadata, getStudyImageIds } from '@/lib/orthanc';

const SimpleDicomViewer = dynamic(() => import('@/components/SimpleDicomViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Loading DICOM Viewer...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-center mt-2">Initializing Cornerstone3D</p>
        </CardContent>
      </Card>
    </div>
  ),
});

const ProjectionDicomViewer = dynamic(() => import('@/components/ProjectionDicomViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Loading X-ray Viewer...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-center mt-2">Initializing X-ray viewer...</p>
        </CardContent>
      </Card>
    </div>
  ),
});

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
    study_instance_uid?: string;
  };
  catatan?: string;
  status?: string;
}

interface StudyMetadata {
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  Modality?: string;
  InstitutionName?: string;
  SeriesCount?: number;
  ImageCount?: number;
  AccessionNumber?: string;
  ReferringPhysicianName?: string;
  OperatorsName?: string;
}

interface AIReport {
  id: string;
  report: string;
  confidence: number;
  findings: any[];
}

interface AISuggestion {
  id: string;
  section: 'clinical_history' | 'technique' | 'findings' | 'impression' | 'recommendations';
  text: string;
  confidence: number;
}

interface RadiologistReport {
  clinical_history: string;
  technique: string;
  findings: string;
  impression: string;
  recommendations: string;
}

export default function CollaborativeViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { isAIEnabled, isLoading: aiSettingsLoading } = useAISettings();
  const examinationId = params.examinationId as string;
  
  // Examination and DICOM data
  const [examination, setExamination] = useState<ExaminationDetails | null>(null);
  const [studyMetadata, setStudyMetadata] = useState<StudyMetadata | null>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // AI reporting state
  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<string[]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiReportId, setAiReportId] = useState<string | undefined>();
  
  // UI state
  const [aiPanelMinimized, setAiPanelMinimized] = useState(false);
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // Report state
  const [radiologistReport, setRadiologistReport] = useState<RadiologistReport>({
    clinical_history: '',
    technique: '',
    findings: '',
    impression: '',
    recommendations: ''
  });

  useEffect(() => {
    if (examinationId && user) {
      loadExaminationAndDicom();
      checkForExistingAIReport();
    }
  }, [examinationId, user]);

  const loadExaminationAndDicom = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch examination details
      const examResponse = await AuthService.authenticatedFetch(`/api/examinations/${examinationId}/`);
      
      if (examResponse.ok) {
        const examData = await examResponse.json();
        setExamination(examData);
        
        // If we have a study instance UID, load DICOM data
        if (examData.daftar?.study_instance_uid) {
          await loadDicomData(examData.daftar.study_instance_uid);
        }
      } else if (examResponse.status === 404) {
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

  const loadDicomData = async (studyUid: string) => {
    try {
      // Load study metadata
      const metadata = await getStudyMetadata(studyUid);
      setStudyMetadata(metadata);

      // Load DICOM images using the same logic as pacs-browser
      const seriesResponse = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUid}/series/`
      );
      
      if (seriesResponse.ok) {
        const seriesData = await seriesResponse.json();
        
        // Create data with first image of each series (for thumbnails)
        const firstImages = seriesData.series?.map((s: any) => `wadors:${s.firstImageUrl}`) || [];
        
        // Map series data to expected format
        const enhancedSeriesInfo = seriesData.series?.map((s: any) => ({
          seriesId: s.seriesId,
          seriesInstanceUID: s.seriesUid,
          seriesDescription: s.seriesDescription,
          instanceCount: s.imageCount,
          imageCount: s.imageCount
        })) || [];
        
        setImageIds(firstImages);
        setSeriesInfo(enhancedSeriesInfo);
      }
    } catch (err) {
      console.error('Error loading DICOM data:', err);
      // Don't set error for DICOM failure, just continue without images
    }
  };

  const checkForExistingAIReport = async () => {
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/?search=${examinationId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          setAiReportId(data.results[0].id.toString());
          loadAIReport(data.results[0].id.toString());
          loadAISuggestions(data.results[0].id.toString());
        }
      } else if (response.status === 404) {
        // AI reporting endpoint not available - this is expected
      }
    } catch (err) {
    }
  };

  const loadAIReport = async (reportId: string) => {
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/${reportId}/`);
      if (response.ok) {
        const data = await response.json();
        setAiReport(data);
      } else if (response.status === 404) {
      }
    } catch (error) {
    }
  };

  const loadAISuggestions = async (reportId: string) => {
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/${reportId}/`);
      if (response.ok) {
        const data = await response.json();
        setAiSuggestions(data.ai_suggestions || []);
      } else if (response.status === 404) {
      }
    } catch (error) {
    }
  };

  const generateAIReport = async () => {
    if (!isAIEnabled) return;
    
    setIsGeneratingAI(true);
    try {
      const response = await AuthService.authenticatedFetch('/api/ai-reporting/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examination_number: examinationId })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAiReport(result);
        setAiReportId(result.id);
        
        setTimeout(() => {
          loadAISuggestions(result.id);
        }, 1000);
        
        toast.success('AI report generated successfully');
      } else if (response.status === 404) {
        toast.warning('AI reporting feature is not available');
      } else {
        toast.error('Failed to generate AI report');
      }
    } catch (error) {
      toast.warning('AI reporting service is not available');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAcceptSuggestion = (suggestionId: string, suggestionText: string) => {
    setAcceptedSuggestions([...acceptedSuggestions, suggestionId]);
    
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      setRadiologistReport(prev => ({
        ...prev,
        [suggestion.section]: prev[suggestion.section] + 
          (prev[suggestion.section] ? '\n\n' : '') + suggestionText
      }));
    }
    
    toast.success('AI suggestion accepted');
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    try {
      AuthService.authenticatedFetch('/api/ai-reporting/collaborations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interaction_type: 'reject_ai_finding',
          ai_suggestion: suggestionId,
          radiologist_action: 'Rejected',
          feedback_category: 'not_applicable'
        })
      }).catch(() => {
        // Ignore API errors for collaboration tracking
      });
    } catch (error) {
      // Ignore errors
    }
    
    toast.success('AI suggestion rejected');
  };

  const saveCollaborativeReport = async () => {
    try {
      const response = await AuthService.authenticatedFetch('/api/ai-reporting/radiologist-reports/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_report: aiReportId,
          clinical_history: radiologistReport.clinical_history,
          technique: radiologistReport.technique,
          findings: radiologistReport.findings,
          impression: radiologistReport.impression,
          recommendations: radiologistReport.recommendations,
          complexity_level: calculateComplexity(),
          radiologist_confidence: calculateConfidence()
        })
      });

      if (response.ok) {
        setIsComplete(true);
        toast.success('Collaborative report saved successfully');
      } else if (response.status === 404) {
        toast.warning('Report saving feature is not available');
      } else {
        toast.error('Failed to save report');
      }
    } catch (error) {
      toast.warning('Report saving service is not available');
    }
  };

  const calculateComplexity = (): 'routine' | 'complex' | 'critical' => {
    const findingsLength = radiologistReport.findings.length;
    const impressionLength = radiologistReport.impression.length;
    
    if (findingsLength > 500 || impressionLength > 200) return 'complex';
    if (radiologistReport.findings.toLowerCase().includes('urgent') || 
        radiologistReport.impression.toLowerCase().includes('critical')) return 'critical';
    return 'routine';
  };

  const calculateConfidence = (): number => {
    let score = 0;
    if (radiologistReport.clinical_history) score += 0.1;
    if (radiologistReport.technique) score += 0.1;
    if (radiologistReport.findings) score += 0.4;
    if (radiologistReport.impression) score += 0.3;
    if (radiologistReport.recommendations) score += 0.1;
    return score;
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

  // Determine layout classes based on AI enabled state and panel minimization
  const getLayoutClasses = () => {
    if (!isAIEnabled) {
      return "grid grid-cols-2 gap-6 h-screen p-4"; // 2-panel layout
    }
    
    if (aiPanelMinimized) {
      return "grid grid-cols-[1fr_auto_1fr] gap-6 h-screen p-4"; // Minimized AI panel
    }
    
    return "grid grid-cols-3 gap-6 h-screen p-4"; // Full 3-panel layout
  };

  // Keyboard shortcut for full window toggle (F key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' || event.key === 'F') {
        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          setIsFullWindow(!isFullWindow);
        }
      }
      if (event.key === 'Escape' && isFullWindow) {
        event.preventDefault();
        setIsFullWindow(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullWindow]);

  if (isLoading || aiSettingsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        
        <div className={getLayoutClasses()}>
          <Skeleton className="h-full" />
          {isAIEnabled && <Skeleton className="h-full" />}
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={() => router.push('/examinations')}
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
              <Button onClick={loadExaminationAndDicom}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!examination) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Collaborative Reporting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Invalid examination ID. Please select a valid examination to start reporting.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Full window DICOM viewer
  if (isFullWindow) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <div className="relative h-full">
          {imageIds.length > 0 ? (() => {
            const modality = studyMetadata?.Modality || 'Unknown';
            const isProjectionModality = ['CR', 'DR', 'XR', 'DX', 'RG', 'RF'].includes(modality);
            
            const dicomStudyMetadata = {
              patientName: studyMetadata?.PatientName || examination.daftar.pesakit.nama,
              patientId: studyMetadata?.PatientID || examination.daftar.pesakit.mrn,
              studyDate: studyMetadata?.StudyDate || '',
              studyDescription: studyMetadata?.StudyDescription || examination.exam.nama,
              modality: studyMetadata?.Modality || examination.exam.modaliti.nama,
              studyInstanceUID: examination.daftar.study_instance_uid || ''
            };

            if (isProjectionModality) {
              return (
                <ProjectionDicomViewer 
                  imageIds={imageIds}
                  studyMetadata={dicomStudyMetadata}
                />
              );
            } else {
              return (
                <SimpleDicomViewer 
                  imageIds={imageIds}
                  seriesInfo={seriesInfo}
                  studyMetadata={dicomStudyMetadata}
                />
              );
            }
          })() : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-white">
                <Eye className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
                <p>This examination has no associated DICOM images</p>
              </div>
            </div>
          )}
          
          <Button
            onClick={() => setIsFullWindow(false)}
            className="absolute top-4 right-4 bg-black/50 hover:bg-black/70"
            size="sm"
          >
            Exit Full Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b bg-background p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/examinations')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Examinations
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Collaborative Reporting
                {isAIEnabled && (
                  <div className="flex items-center gap-2 ml-4">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-600 font-medium">AI-Enabled</span>
                  </div>
                )}
              </h1>
              <p className="text-muted-foreground">
                {examination.exam.nama} - {examination.no_xray}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {examination.exam.modaliti.nama}
            </Badge>
            <Button
              onClick={() => setIsFullWindow(true)}
              size="sm"
              variant="secondary"
              title="Full Window View (Press F)"
              disabled={imageIds.length === 0}
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Full Window
            </Button>
          </div>
        </div>

        {/* Patient Information Banner */}
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium">Patient:</span> {examination.daftar.pesakit.nama}
            </div>
            <div>
              <span className="font-medium">MRN:</span> {examination.daftar.pesakit.mrn}
            </div>
            <div>
              <span className="font-medium">Date:</span> {formatDate(examination.daftar.tarikh)}
            </div>
            <div>
              <span className="font-medium">Age/Gender:</span> {examination.daftar.pesakit.umur}y, {examination.daftar.pesakit.jantina}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={getLayoutClasses()}>
        {/* DICOM Viewer Panel */}
        <div className="border rounded-lg p-4 bg-background">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">DICOM Viewer</h3>
            <div className="flex gap-2">
              {isAIEnabled && !aiReport && (
                <Button
                  onClick={generateAIReport}
                  disabled={isGeneratingAI}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isGeneratingAI ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Generate AI Report
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          
          <div className="h-full">
            {imageIds.length > 0 ? (() => {
              const modality = studyMetadata?.Modality || examination.exam.modaliti.nama;
              const isProjectionModality = ['CR', 'DR', 'XR', 'DX', 'RG', 'RF'].includes(modality);
              
              const dicomStudyMetadata = {
                patientName: studyMetadata?.PatientName || examination.daftar.pesakit.nama,
                patientId: studyMetadata?.PatientID || examination.daftar.pesakit.mrn,
                studyDate: studyMetadata?.StudyDate || '',
                studyDescription: studyMetadata?.StudyDescription || examination.exam.nama,
                modality: studyMetadata?.Modality || examination.exam.modaliti.nama,
                studyInstanceUID: examination.daftar.study_instance_uid || ''
              };

              if (isProjectionModality) {
                return (
                  <ProjectionDicomViewer 
                    imageIds={imageIds}
                    studyMetadata={dicomStudyMetadata}
                  />
                );
              } else {
                return (
                  <SimpleDicomViewer 
                    imageIds={imageIds}
                    seriesInfo={seriesInfo}
                    studyMetadata={dicomStudyMetadata}
                  />
                );
              }
            })() : (
              <div className="h-full flex items-center justify-center bg-muted/10 rounded">
                <div className="text-center">
                  <Eye className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
                  <p className="text-muted-foreground">
                    This examination has no associated DICOM images
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* AI Suggestions Panel - Only when AI is enabled */}
        {isAIEnabled && (
          <div className={`border rounded-lg bg-background ${aiPanelMinimized ? 'w-12' : 'w-full'} transition-all duration-300`}>
            {aiPanelMinimized ? (
              // Minimized AI Panel
              <div className="h-full flex flex-col items-center justify-start p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiPanelMinimized(false)}
                  className="mb-4"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="writing-mode-vertical text-sm text-muted-foreground">
                  AI Suggestions
                </div>
                {aiSuggestions.length > 0 && (
                  <Badge variant="secondary" className="mt-2 rotate-90">
                    {aiSuggestions.length}
                  </Badge>
                )}
              </div>
            ) : (
              // Full AI Panel
              <div className="p-4 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI Suggestions
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAiPanelMinimized(true)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4">
                  {aiSuggestions.length === 0 && !aiReport && (
                    <Alert>
                      <Brain className="h-4 w-4" />
                      <AlertDescription>
                        Generate an AI report to see suggestions and collaborative features.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {aiSuggestions.length === 0 && aiReport && (
                    <Alert>
                      <Brain className="h-4 w-4" />
                      <AlertDescription>
                        AI report generated. Suggestions will appear here as they become available.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {aiSuggestions.map((suggestion) => (
                    <Card key={suggestion.id} className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {suggestion.section.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <Badge 
                          variant={suggestion.confidence > 0.8 ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      
                      <p className="text-sm mb-3 text-gray-700">
                        {suggestion.text}
                      </p>
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcceptSuggestion(suggestion.id, suggestion.text)}
                          disabled={acceptedSuggestions.includes(suggestion.id)}
                          className="text-xs"
                        >
                          {acceptedSuggestions.includes(suggestion.id) ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Accepted
                            </>
                          ) : (
                            'Accept'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectSuggestion(suggestion.id)}
                          className="text-xs"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Radiologist Report Editor Panel */}
        <div className="border rounded-lg p-4 bg-background flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Radiology Report</h3>
            {isAIEnabled && (
              <Badge variant="outline" className="text-xs">
                AI-Assisted
              </Badge>
            )}
          </div>
          
          <div className="flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="clinical-history" className="text-sm font-medium">Clinical History</Label>
              <Textarea
                id="clinical-history"
                value={radiologistReport.clinical_history}
                onChange={(e) => setRadiologistReport(prev => ({
                  ...prev, clinical_history: e.target.value
                }))}
                placeholder="Clinical indication and patient history..."
                rows={3}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="technique" className="text-sm font-medium">Technique</Label>
              <Textarea
                id="technique"
                value={radiologistReport.technique}
                onChange={(e) => setRadiologistReport(prev => ({
                  ...prev, technique: e.target.value
                }))}
                placeholder="Imaging technique and parameters..."
                rows={2}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="findings" className="text-sm font-medium">Findings</Label>
              <Textarea
                id="findings"
                value={radiologistReport.findings}
                onChange={(e) => setRadiologistReport(prev => ({
                  ...prev, findings: e.target.value
                }))}
                placeholder="Detailed imaging findings..."
                rows={6}
                className="mt-1 font-mono text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="impression" className="text-sm font-medium">Impression</Label>
              <Textarea
                id="impression"
                value={radiologistReport.impression}
                onChange={(e) => setRadiologistReport(prev => ({
                  ...prev, impression: e.target.value
                }))}
                placeholder="Clinical impression and diagnosis..."
                rows={4}
                className="mt-1 font-mono text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="recommendations" className="text-sm font-medium">Recommendations</Label>
              <Textarea
                id="recommendations"
                value={radiologistReport.recommendations}
                onChange={(e) => setRadiologistReport(prev => ({
                  ...prev, recommendations: e.target.value
                }))}
                placeholder="Follow-up recommendations..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="flex gap-2">
              <Button 
                onClick={saveCollaborativeReport}
                disabled={!radiologistReport.findings || !radiologistReport.impression}
                className="bg-green-600 hover:bg-green-700"
              >
                Save Report
              </Button>
              {isAIEnabled && aiReport && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    toast.info('AI second opinion requested');
                  }}
                >
                  AI Second Opinion
                </Button>
              )}
            </div>
            
            {isComplete && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Report saved successfully. 
                  {isAIEnabled && (
                    <> AI suggestions used: {acceptedSuggestions.length}/{aiSuggestions.length}</>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}