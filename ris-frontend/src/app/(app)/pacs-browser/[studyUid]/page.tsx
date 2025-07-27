'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Module-level cache to prevent duplicate API calls across component remounts
const studyDataCache = new Map<string, {
  metadata: any;
  imageIds: string[];
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';

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
import { getStudyMetadata, getStudyImageIds } from '@/lib/orthanc';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import { 
  ArrowLeft, 
  Download, 
  User, 
  Calendar,
  Stethoscope,
  Archive,
  Eye,
  Clock,
  Building,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';

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

export default function LegacyStudyViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [metadata, setMetadata] = useState<StudyMetadata | null>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [isImportedToRis, setIsImportedToRis] = useState(false);
  const [risStudyId, setRisStudyId] = useState<number | null>(null);
  const [risExaminations, setRisExaminations] = useState<any[]>([]);
  const [enhancedDicomData, setEnhancedDicomData] = useState<any[]>([]);
  
  // Track fetched studies to prevent duplicate API calls
  const fetchedStudiesRef = useRef(new Set<string>());

  const studyUid = params?.studyUid as string;

  const checkRisImportStatus = useCallback(async () => {
    if (!studyUid) return;
    
    try {
      // Check if study exists in RIS by searching for study_instance_uid
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/?study_instance_uid=${studyUid}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        // Handle both paginated and direct array responses
        const results = data.results || data;
        
        if (Array.isArray(results) && results.length > 0) {
          setIsImportedToRis(true);
          setRisStudyId(results[0].id);
          
          // Fetch examination details for this study
          try {
            const examResponse = await AuthService.authenticatedFetch(
              `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/${results[0].id}/examinations/`
            );
            if (examResponse.ok) {
              const examData = await examResponse.json();
              setRisExaminations(examData);
            }
          } catch (err) {
            console.error('Error fetching examination details:', err);
          }
        } else {
          setIsImportedToRis(false);
          setRisStudyId(null);
          setRisExaminations([]);
        }
      } else {
        setIsImportedToRis(false);
        setRisStudyId(null);
      }
    } catch (err) {
      console.error('Error checking RIS import status:', err);
      // Don't set error state for this check, just assume not imported
      setIsImportedToRis(false);
    }
  }, [studyUid]);

  const fetchEnhancedDicomData = useCallback(async () => {
    if (!studyUid) return;
    
    try {
      console.log('🔍 Fetching enhanced DICOM data for study:', studyUid);
      // Fetch detailed metadata from our enhanced endpoint
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUid}/enhanced-metadata/`
      );
      
      console.log('📡 Enhanced metadata response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📋 Enhanced metadata response data:', data);
        setEnhancedDicomData(data.series || []);
        console.log('📊 Enhanced DICOM data set to:', data.series || []);
      } else {
        console.error('❌ Enhanced metadata request failed:', response.status, response.statusText);
      }
    } catch (err) {
      console.error('Error fetching enhanced DICOM data:', err);
    }
  }, [studyUid]);

  const fetchStudyData = useCallback(async () => {
    if (!studyUid) return;
    
    console.log(`Checking cache for study ${studyUid}...`);
    
    // Check if we have cached data that's still fresh
    const cachedData = studyDataCache.get(studyUid);
    const now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
      console.log(`Using cached data for study ${studyUid}`);
      setMetadata(cachedData.metadata);
      setImageIds(cachedData.imageIds);
      setLoading(false);
      return;
    }

    // Prevent duplicate fetches for the same study
    if (fetchedStudiesRef.current.has(studyUid)) {
      console.log(`Study ${studyUid} already being fetched, skipping...`);
      return;
    }

    // Mark this study as being fetched
    fetchedStudiesRef.current.add(studyUid);
    console.log('Fetching study data for UID:', studyUid);

    try {
      setLoading(true);
      setError(null);

      // Fetch study metadata and image IDs in parallel
      const [studyMetadata, studyImageIds] = await Promise.all([
        getStudyMetadata(studyUid),
        getStudyImageIds(studyUid)
      ]);

      console.log('Study metadata:', studyMetadata);
      console.log('Study image IDs:', studyImageIds);
      console.log(`Found ${studyImageIds.length} images for study ${studyUid}`);

      // Cache the fetched data
      studyDataCache.set(studyUid, {
        metadata: studyMetadata,
        imageIds: studyImageIds,
        timestamp: now
      });

      setMetadata(studyMetadata);
      setImageIds(studyImageIds);
      
      if (studyImageIds.length === 0) {
        toast.warning('No DICOM images found in this study');
      } else {
        toast.success(`Loaded ${studyImageIds.length} images from legacy study`);
      }
    } catch (err) {
      console.error('Error loading legacy study:', err);
      setError(err instanceof Error ? err.message : 'Failed to load legacy study');
      toast.error('Failed to load legacy study');
    } finally {
      setLoading(false);
      // Remove from fetching set after completion (success or failure)
      fetchedStudiesRef.current.delete(studyUid);
    }
  }, [studyUid]);

  useEffect(() => {
    if (studyUid && user) {
      console.log(`useEffect triggered for study: ${studyUid}`);
      fetchStudyData();
      checkRisImportStatus();
      fetchEnhancedDicomData();
    }
  }, [studyUid, user, fetchStudyData, checkRisImportStatus, fetchEnhancedDicomData]);

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

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return dateString;
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}/${month}/${year}`;
  };

  const formatTime = (timeString: string): string => {
    if (!timeString || timeString.length < 6) return timeString;
    return `${timeString.substring(0, 2)}:${timeString.substring(2, 4)}:${timeString.substring(4, 6)}`;
  };

  const calculateAge = (birthDate: string): string => {
    if (!birthDate || birthDate.length !== 8) return 'Unknown';
    
    const birth = new Date(
      parseInt(birthDate.substring(0, 4)),
      parseInt(birthDate.substring(4, 6)) - 1,
      parseInt(birthDate.substring(6, 8))
    );
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return `${age} years`;
  };

  const handleImportStudy = async () => {
    if (!metadata || !studyUid) return;

    setImporting(true);
    try {
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacs/import/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studyInstanceUid: studyUid,
          createPatient: true
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const examCount = result.examinationCount || 1;
        const examDetails = result.examinations || [];
        
        // Show detailed success message
        if (examCount > 1) {
          toast.success(`Study imported successfully! Created ${examCount} examinations: ${examDetails.map(e => e.exam_type).join(', ')}`);
        } else {
          toast.success(`Study imported successfully! Registration ID: ${result.registrationId}`);
        }
        
        // Update the RIS status immediately
        setIsImportedToRis(true);
        setRisStudyId(result.registrationId);
        
        // Set the examination details from the import response
        if (result.examinations) {
          setRisExaminations(result.examinations);
        }
        
        // Optionally redirect to the imported study in RIS
        setTimeout(() => {
          router.push(`/studies/${result.registrationId}`);
        }, 2000);
      } else {
        // Handle specific error cases
        if (response.status === 403) {
          toast.error('Only superusers can import studies');
        } else if (response.status === 400 && result.error?.includes('already imported')) {
          toast.warning(`Study already imported as registration ${result.registrationId}`);
          
          // Update the RIS status
          setIsImportedToRis(true);
          setRisStudyId(result.registrationId);
          
          setTimeout(() => {
            router.push(`/studies/${result.registrationId}`);
          }, 2000);
        } else {
          toast.error(result.error || 'Failed to import study');
        }
      }
    } catch (err) {
      console.error('Error importing study:', err);
      toast.error('Network error: Failed to import study');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          onClick={() => router.back()} 
          className="mt-4"
          variant="outline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="container-fluid px-4 py-8">
        <Alert>
          <AlertDescription>Legacy study not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isFullWindow) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        {/* Full Window DICOM Viewer */}
        <div className="relative h-full">
          {imageIds.length > 0 ? (
            <SimpleDicomViewer 
              imageIds={imageIds}
              studyMetadata={{
                patientName: metadata.PatientName || 'Unknown',
                patientId: metadata.PatientID || 'Unknown',
                studyDate: metadata.StudyDate || '',
                studyDescription: metadata.StudyDescription || '',
                modality: metadata.Modality || 'Unknown'
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-white">
                <Eye className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
                <p>This study contains no viewable images</p>
              </div>
            </div>
          )}
          
          {/* Full Window Overlay Information */}
          <div className="absolute top-4 left-4 text-white text-sm space-y-1 bg-black/50 p-3 rounded">
            <div><strong>Patient:</strong> {metadata?.PatientName || 'Unknown'}</div>
            <div><strong>ID:</strong> {metadata?.PatientID || 'Unknown'}</div>
            <div><strong>Accession:</strong> {metadata?.AccessionNumber || 'N/A'}</div>
            <div><strong>Clinic:</strong> {metadata?.InstitutionName || 'N/A'}</div>
            <div><strong>Date:</strong> {formatDate(metadata?.StudyDate || '')} {formatTime(metadata?.StudyTime || '')}</div>
            <div><strong>Radiographer:</strong> {
              (() => {
                // Get radiographer from RIS data or enhanced DICOM data
                if (isImportedToRis && risExaminations.length > 0 && risExaminations[0].jxr) {
                  return `${risExaminations[0].jxr.first_name} ${risExaminations[0].jxr.last_name}`;
                }
                if (enhancedDicomData.length > 0 && enhancedDicomData[0].radiographer_name) {
                  return enhancedDicomData[0].radiographer_name;
                }
                return metadata?.OperatorsName || 'N/A';
              })()
            }</div>
            <div><strong>Position:</strong> {
              (() => {
                // Get position from RIS data or enhanced DICOM data
                if (isImportedToRis && risExaminations.length > 0 && risExaminations[0].patient_position) {
                  return risExaminations[0].patient_position;
                }
                if (enhancedDicomData.length > 0 && enhancedDicomData[0].position) {
                  return enhancedDicomData[0].position;
                }
                return 'N/A';
              })()
            }</div>
          </div>
          
          {/* Keyboard shortcuts hint */}
          <div className="absolute bottom-4 right-4 text-white text-xs bg-black/50 p-2 rounded">
            Press F to toggle full window • ESC to exit
          </div>
          
          {/* Exit Full Window Button */}
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
    <div className="h-full flex">
      {/* DICOM Viewer - Full Height */}
      <div className="flex-1 relative">
        {imageIds.length > 0 ? (
          <SimpleDicomViewer 
            imageIds={imageIds}
            studyMetadata={{
              patientName: metadata.PatientName || 'Unknown',
              patientId: metadata.PatientID || 'Unknown',
              studyDate: metadata.StudyDate || '',
              studyDescription: metadata.StudyDescription || '',
              modality: metadata.Modality || 'Unknown'
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-background">
            <div className="text-center">
              <Eye className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
              <p className="text-muted-foreground">
                This study contains no viewable images
              </p>
            </div>
          </div>
        )}
        
        {/* Full Window Button */}
        <Button
          onClick={() => setIsFullWindow(true)}
          className="absolute top-4 right-4 z-10"
          size="sm"
          variant="secondary"
          title="Full Window View (Press F)"
        >
          <Maximize2 className="h-4 w-4 mr-2" />
          Full Window
        </Button>
      </div>

      {/* Collapsible Info Panel */}
      <div className={`${isPanelCollapsed ? 'w-12' : 'w-80'} border-l bg-muted/5 overflow-hidden transition-all duration-300 ease-in-out relative`}>
        {/* Collapse Toggle Button */}
        <Button
          onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          className="absolute top-4 left-1 z-20 bg-background border shadow-sm"
          size="sm"
          variant="secondary"
          title={isPanelCollapsed ? "Expand Panel" : "Collapse Panel"}
        >
          {isPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        
        {!isPanelCollapsed && (
          <div className="overflow-y-auto h-full">
        <div className="p-4 space-y-4">

          {/* Import Button or RIS Link */}
          {isImportedToRis ? (
            <Button 
              onClick={() => router.push(`/studies/${risStudyId}`)}
              className="w-full"
              variant="outline"
              title="View this study in RIS"
            >
              <Eye className="w-4 h-4 mr-2" />
              View in RIS
            </Button>
          ) : user?.is_superuser ? (
            <Button 
              onClick={handleImportStudy}
              disabled={importing}
              className="w-full"
              title="Import this study into the RIS database (Superuser only)"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import to RIS
                </>
              )}
            </Button>
          ) : null}

          {/* Patient Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <p className="text-sm font-semibold">{metadata.PatientName}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Patient ID</label>
                <p className="text-sm font-mono">{metadata.PatientID}</p>
              </div>
              {metadata.PatientSex && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Gender</label>
                  <p className="text-sm">
                    {metadata.PatientSex === 'M' ? 'Male' : 
                     metadata.PatientSex === 'F' ? 'Female' : 
                     metadata.PatientSex}
                  </p>
                </div>
              )}
              {metadata.PatientBirthDate && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Age</label>
                  <p className="text-sm">{calculateAge(metadata.PatientBirthDate)}</p>
                </div>
              )}
              {metadata.InstitutionName && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Clinic</label>
                  <p className="text-sm">{metadata.InstitutionName}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Study Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Stethoscope className="h-4 w-4" />
                Study Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                console.log('🎯 Rendering Study Details - isImportedToRis:', isImportedToRis, 'risExaminations.length:', risExaminations.length, 'enhancedDicomData.length:', enhancedDicomData.length);
                return null;
              })()}
              {isImportedToRis && risExaminations.length > 0 ? (
                // Show enhanced RIS examination details
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Study Date</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-sm">{formatDate(metadata.StudyDate || '')}</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Examinations ({risExaminations.length})</label>
                    <div className="mt-2 space-y-2">
                      {risExaminations.map((exam, index) => (
                        <div key={index} className="bg-muted/30 p-2 rounded text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {exam.exam.exam}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {exam.exam.modaliti.nama}
                            </Badge>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {exam.exam.part && (
                              <span>• {exam.exam.part.part}</span>
                            )}
                            {exam.patient_position && (
                              <span>• {exam.patient_position}</span>
                            )}
                            {exam.laterality && (
                              <span>• {exam.laterality}</span>
                            )}
                          </div>
                          {exam.jxr && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Radiographer: {exam.jxr.first_name} {exam.jxr.last_name}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Images</label>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {imageIds.length} images
                    </Badge>
                  </div>
                </>
              ) : enhancedDicomData.length > 0 ? (
                // Show enhanced DICOM metadata for legacy studies
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Study Date</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-sm">{formatDate(metadata.StudyDate || '')}</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Examinations ({enhancedDicomData.length})</label>
                    <div className="mt-2 space-y-2">
                      {enhancedDicomData.map((exam, index) => (
                        <div key={index} className="bg-muted/30 p-2 rounded text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {exam.exam_type}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {exam.modality}
                            </Badge>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {exam.body_part && (
                              <span>• {exam.body_part}</span>
                            )}
                            {exam.position && (
                              <span>• {exam.position}</span>
                            )}
                          </div>
                          {exam.radiographer_name && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Radiographer: {exam.radiographer_name}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            Images: {exam.instance_count}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Total Images</label>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {imageIds.length} images
                    </Badge>
                  </div>
                </>
              ) : (
                // Show basic DICOM metadata fallback
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Study Date</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-sm">{formatDate(metadata.StudyDate || '')}</p>
                    </div>
                  </div>
                  {metadata.StudyTime && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Study Time</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-sm">{formatTime(metadata.StudyTime)}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Modality</label>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {metadata.Modality}
                    </Badge>
                  </div>
                  {metadata.AccessionNumber && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Accession Number</label>
                      <p className="text-sm font-mono">{metadata.AccessionNumber}</p>
                    </div>
                  )}
                  {metadata.ReferringPhysicianName && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Referring Doctor</label>
                      <p className="text-sm">{metadata.ReferringPhysicianName}</p>
                    </div>
                  )}
                  {metadata.OperatorsName && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Radiographer</label>
                      <p className="text-sm">{metadata.OperatorsName}</p>
                    </div>
                  )}
                  {metadata.StudyDescription && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <p className="text-xs mt-1 p-2 bg-muted/50 rounded">
                        {metadata.StudyDescription}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Images</label>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {imageIds.length} images
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* DICOM Technical Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs">DICOM Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Study Instance UID</label>
                <p className="text-xs font-mono break-all bg-muted/50 p-2 rounded mt-1">
                  {studyUid}
                </p>
              </div>
              <Badge 
                variant={isImportedToRis ? "default" : "outline"} 
                className="text-xs mt-2"
              >
                <Archive className="h-3 w-3 mr-1" />
                {isImportedToRis ? "RIS Study" : "Legacy Study"}
              </Badge>
            </CardContent>
          </Card>
        </div>
          </div>
        )}
      </div>
    </div>
  );
}