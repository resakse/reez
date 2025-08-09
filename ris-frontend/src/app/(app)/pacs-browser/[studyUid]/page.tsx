'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

// Global Cornerstone initialization state
let cornerstoneInitialized = false;

// Initialize Cornerstone.js once globally 
const initializeCornerstone = async () => {
  if (cornerstoneInitialized) return;

  try {
    // Import required modules
    const [
      { init: coreInit },
      { init: dicomImageLoaderInit },
      cornerstoneDICOMImageLoader
    ] = await Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/dicom-image-loader'),
      import('@cornerstonejs/dicom-image-loader')
    ]);

    // Initialize Cornerstone core
    await coreInit();
    
    // Initialize DICOM image loader
    await dicomImageLoaderInit();

    // Configure authentication for all DICOM requests
    cornerstoneDICOMImageLoader.configure({
      beforeSend: function(xhr) {
        // Add JWT Bearer token to all DICOM image requests
        const token = AuthService.getAccessToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
      }
    });

    cornerstoneInitialized = true;
    console.log('Cornerstone.js initialized with authentication');
  } catch (error) {
    console.error('Failed to initialize Cornerstone:', error);
    throw error;
  }
};

// DICOM Thumbnail component using Cornerstone.js for proper DICOM rendering
const DicomThumbnail: React.FC<{
  imageId: string;
  alt: string;
  fallback: string;
}> = ({ imageId, alt, fallback }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!imageId || !canvasRef.current) return;

    const loadDicomThumbnail = async () => {
      try {
        setLoading(true);
        setError(false);

        // Ensure Cornerstone is initialized
        await initializeCornerstone();

        // Import Cornerstone.js 
        const cornerstone = await import('@cornerstonejs/core');
        
        // Load the DICOM image using Cornerstone
        const image = await cornerstone.imageLoader.loadAndCacheImage(imageId);
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Set canvas size
        canvas.width = 128; // Thumbnail size
        canvas.height = 128;
        
        const context = canvas.getContext('2d');
        if (!context) return;

        // Create a temporary canvas for the full image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;
        const tempContext = tempCanvas.getContext('2d');
        if (!tempContext) return;

        // Get pixel data and convert to ImageData
        const pixelData = image.getPixelData();
        const imageData = tempContext.createImageData(image.width, image.height);
        
        // Convert DICOM pixel data to RGBA
        for (let i = 0; i < pixelData.length; i++) {
          const pixelValue = pixelData[i];
          // Apply window/level for proper display
          let normalizedValue = (pixelValue - image.intercept) * image.slope;
          normalizedValue = Math.max(0, Math.min(255, normalizedValue));
          
          const index = i * 4;
          imageData.data[index] = normalizedValue;     // R
          imageData.data[index + 1] = normalizedValue; // G
          imageData.data[index + 2] = normalizedValue; // B
          imageData.data[index + 3] = 255;             // A
        }

        // Draw to temp canvas
        tempContext.putImageData(imageData, 0, 0);

        // Scale down to thumbnail size
        context.drawImage(tempCanvas, 0, 0, image.width, image.height, 0, 0, 128, 128);
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to load DICOM thumbnail:', err);
        setError(true);
        setLoading(false);
      }
    };

    loadDicomThumbnail();
  }, [imageId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-gray-400 text-xs">{fallback}</span>
      </div>
    );
  }

  return (
    <canvas 
      ref={canvasRef}
      className="w-full h-full object-cover"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    />
  );
};

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
  Maximize2,
  FileText,
  Edit,
  CheckCircle,
  Info,
  Split,
  Grid2x2,
  Grid3x3,
  ChevronDown
} from 'lucide-react';

import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

const ReportingPanel = dynamic(() => import('@/components/ReportingPanel'), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-20 bg-muted rounded"></div>
        <div className="h-20 bg-muted rounded"></div>
      </div>
    </div>
  ),
});

const ReportingModal = dynamic(() => import('@/components/ReportingModal'), {
  ssr: false,
});

const ComparisonViewDicomViewer = dynamic(() => import('@/components/ComparisonViewDicomViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Loading Comparison View...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-center mt-2">Initializing comparison viewer</p>
        </CardContent>
      </Card>
    </div>
  ),
});



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
  Manufacturer?: string;
  ManufacturerModelName?: string;
}

export default function LegacyStudyViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  // Get PACS server ID from URL parameters
  const pacsServerId = searchParams.get('pacs_server_id');
  
  
  const [metadata, setMetadata] = useState<StudyMetadata | null>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true); // Right panel starts collapsed
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false); // Left sidebar starts expanded
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [isImportedToRis, setIsImportedToRis] = useState(false);
  const [risStudyId, setRisStudyId] = useState<number | null>(null);
  const [risExaminations, setRisExaminations] = useState<any[]>([]);
  const [enhancedDicomData, setEnhancedDicomData] = useState<any[]>([]);
  const [hasReport, setHasReport] = useState(false);
  const [showReporting, setShowReporting] = useState(false);
  const [showReportingModal, setShowReportingModal] = useState(false);
  const [currentReport, setCurrentReport] = useState<any>(null);
  
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFunctions, setReportFunctions] = useState<any>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'comparison'>('single');
  const [layoutHover, setLayoutHover] = useState<{cols: number, rows: number} | null>(null);
  const [currentLayout, setCurrentLayout] = useState<{cols: number, rows: number}>({cols: 1, rows: 1});
  
  // Debug layout changes
  useEffect(() => {
    console.log('page.tsx currentLayout changed:', currentLayout);
  }, [currentLayout]);

  // Multi-viewport functionality is handled by SimpleDicomViewer and ProjectionDicomViewer components

  // Function to trigger report reload
  const handleReportUpdate = () => {
    if (reportFunctions && reportFunctions.loadReports) {
      reportFunctions.loadReports();
    }
  };
  
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
            // Error fetching examination details
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
      // Error checking RIS import status
      // Don't set error state for this check, just assume not imported
      setIsImportedToRis(false);
    }
  }, [studyUid]);

  const fetchEnhancedDicomData = useCallback(async () => {
    if (!studyUid) return;
    
    try {
      // Fetch detailed metadata from our enhanced endpoint
      const pacsParam = pacsServerId ? `?pacs_server_id=${pacsServerId}` : '';
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUid}/enhanced-metadata/${pacsParam}`;
      
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setEnhancedDicomData(data.series || []);
      }
    } catch (err) {
      // Error fetching enhanced DICOM data
    }
  }, [studyUid, pacsServerId]);

  const fetchStudyData = useCallback(async () => {
    if (!studyUid) return;
    
    // Check if we have cached data that's still fresh
    const cachedData = studyDataCache.get(studyUid);
    const now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
      setMetadata(cachedData.metadata);
      setImageIds(cachedData.imageIds);
      setLoading(false);
      return;
    }

    // Prevent duplicate fetches for the same study
    if (fetchedStudiesRef.current.has(studyUid)) {
      return;
    }

    // Mark this study as being fetched
    fetchedStudiesRef.current.add(studyUid);

    try {
      setLoading(true);
      setError(null);

      // First fetch study metadata to determine if it's a large CT/MRI study
      const studyMetadata = await getStudyMetadata(studyUid, pacsServerId);

      // ONLY use series endpoint - NO FALLBACKS
      const pacsParam = pacsServerId ? `?pacs_server_id=${pacsServerId}` : '';
      const seriesUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUid}/series/${pacsParam}`;
      
      
      const seriesResponse = await AuthService.authenticatedFetch(seriesUrl);
      
      if (!seriesResponse.ok) {
        throw new Error(`Series endpoint failed with status ${seriesResponse.status}`);
      }
      
      const seriesData = await seriesResponse.json();
      const totalImages = seriesData.series?.reduce((sum: number, s: any) => sum + s.imageCount, 0) || 0;
      const seriesCount = seriesData.series?.length || 0;
      
      // Create data with ONLY first image of each series
      const firstImages = seriesData.series?.map((s: any) => `wadors:${s.firstImageUrl}`) || [];
      
      // Map series data to expected format
      const enhancedSeriesInfo = seriesData.series?.map((s: any) => ({
        seriesId: s.seriesId,
        seriesInstanceUID: s.seriesUid,
        seriesDescription: s.seriesDescription,
        instanceCount: s.imageCount,
        imageCount: s.imageCount
      })) || [];
      
      const studyImageData = {
        imageIds: firstImages, // Only first images for thumbnails
        seriesInfo: enhancedSeriesInfo,
        total: totalImages
      };
      
      // Removed toast notification

      // Cache the fetched data
      studyDataCache.set(studyUid, {
        metadata: studyMetadata,
        imageIds: studyImageData.imageIds,
        timestamp: now
      });

      setMetadata(studyMetadata);
      setImageIds(studyImageData.imageIds);
      setSeriesInfo(studyImageData.seriesInfo || []);
      
      if (studyImageData.imageIds.length === 0) {
        // Removed toast notification
      } else if (studyImageData.total && studyImageData.total > studyImageData.imageIds.length) {
        // Large study with lazy loading
        const seriesCount = studyImageData.seriesInfo?.length || 0;
        // Removed toast notification
      } else {
        // Regular study
        const seriesCount = studyImageData.seriesInfo?.length || 0;
        if (seriesCount > 1) {
          // Removed toast notification
        } else {
          // Removed toast notification
        }
      }
    } catch (err) {
      // Error loading legacy study
      setError(err instanceof Error ? err.message : 'Failed to load legacy study');
      // Removed toast notification
    } finally {
      setLoading(false);
      // Remove from fetching set after completion (success or failure)
      fetchedStudiesRef.current.delete(studyUid);
    }
  }, [studyUid, pacsServerId]);

  useEffect(() => {
    if (studyUid && user) {
      // Fetching study data
      fetchStudyData();
      checkRisImportStatus();
      fetchEnhancedDicomData();
    }
  }, [studyUid, user]);

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
        router.push(`/studies/${result.registrationId}`);
      } else {
        // Handle specific error cases
        if (response.status === 403) {
          toast.error('Only superusers can import studies');
        } else if (response.status === 400 && result.error?.includes('already imported')) {
          toast.warning(`Study already imported as registration ${result.registrationId}`);
          
          // Update the RIS status
          setIsImportedToRis(true);
          setRisStudyId(result.registrationId);
          
          router.push(`/studies/${result.registrationId}`);
        } else {
          toast.error(result.error || 'Failed to import study');
        }
      }
    } catch (err) {
      // Error importing study
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
        {/* Full Window DICOM Viewer - Use absolute positioning for maximum space utilization */}
        <div className="absolute inset-0">
          {(() => {
            const renderViewer = (isFullWindow: boolean) => {
              if (imageIds.length === 0) {
                const textColor = isFullWindow ? "text-white" : "text-muted-foreground";
                const bgColor = isFullWindow ? "" : "bg-background";
                
                return (
                  <div className={`h-full flex items-center justify-center ${bgColor}`}>
                    <div className="text-center max-w-md">
                      <Eye className={`mx-auto h-12 w-12 mb-4 ${textColor}`} />
                      <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
                      <p className={isFullWindow ? "text-white" : "text-muted-foreground mb-4"}>
                        This study contains no viewable images{isFullWindow ? "" : ". This may be due to:"}
                      </p>
                      {!isFullWindow && (
                        <>
                          <ul className="text-sm text-muted-foreground text-left space-y-1">
                            <li>• PACS server storage configuration issues</li>
                            <li>• DICOM files were deleted from storage</li>
                            <li>• Network connectivity problems</li>
                            <li>• Corrupted or invalid DICOM data</li>
                            <li>• Orthanc database inconsistency</li>
                          </ul>
                          <p className="text-xs text-muted-foreground mt-4">
                            Contact your system administrator if this problem persists.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              // Determine which viewer to use based on modality
              const modality = metadata.Modality || 'Unknown';
              const isProjectionModality = ['CR', 'DR', 'XR', 'DX', 'RG', 'RF'].includes(modality);
              
              const studyMetadata = {
                patientName: metadata.PatientName || 'Unknown',
                patientId: metadata.PatientID || 'Unknown',
                studyDate: metadata.StudyDate || '',
                studyDescription: metadata.StudyDescription || '',
                modality: metadata.Modality || 'Unknown',
                studyInstanceUID: studyUid,
                // For DicomOverlay - PascalCase format
                PatientName: metadata.PatientName,
                PatientID: metadata.PatientID,
                StudyDate: metadata.StudyDate,
                StudyTime: metadata.StudyTime,
                StudyDescription: metadata.StudyDescription,
                Modality: metadata.Modality,
                InstitutionName: metadata.InstitutionName,
                Manufacturer: metadata.Manufacturer,
                ManufacturerModelName: metadata.ManufacturerModelName,
                OperatorsName: metadata.OperatorsName
              };

              // Single viewer component - handles all modes internally
              const ViewerComponent = isProjectionModality ? ProjectionDicomViewer : SimpleDicomViewer;
              const viewerProps = {
                imageIds,
                studyMetadata,
                showOverlay,
                setShowOverlay,
                examinations: risExaminations,
                enhancedDicomData,
                pacsServerId,
                isFullWindow,
                currentLayout,
                ...(isProjectionModality ? {} : { seriesInfo })
              };

              return <ViewerComponent key={`layout-${currentLayout.cols}x${currentLayout.rows}`} {...viewerProps} />;
            };

            return renderViewer(true); // Full-window mode
          })()}
          
          
          {/* Keyboard shortcuts hint */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-xs bg-black/50 p-2 rounded">
            Press F to toggle full window • ESC to exit
          </div>
          
          {/* Exit Full Window and Report Buttons */}
          <div className="absolute top-4 right-4 flex gap-2">
            {(user?.can_report || user?.can_view_report || user?.is_staff || user?.is_superuser) && (
              <Button
                onClick={() => setShowReportingModal(true)}
                className="bg-yellow-500/90 hover:bg-yellow-600/90 text-black"
                size="sm"
                title="Create/View Report"
              >
                <FileText className="h-4 w-4 mr-2" />
                Report
              </Button>
            )}
            
            
            <Button
              onClick={() => setIsFullWindow(false)}
              className="bg-white/90 hover:bg-white text-black"
              size="sm"
            >
              Exit Full Window
            </Button>
          </div>
        </div>
        
        {/* Reporting Modal in Full Window Mode */}
        <ReportingModal
          isOpen={showReportingModal}
          onClose={() => setShowReportingModal(false)}
          studyInstanceUID={studyUid}
          examinations={risExaminations}
          studyMetadata={metadata}
          currentReport={currentReport}
          onReportUpdate={handleReportUpdate}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* DICOM Viewer - Full Height */}
      <div className="flex-1 relative">
        {viewMode === 'comparison' ? (
          // Comparison View Mode
          <ComparisonViewDicomViewer
            initialStudyUID={studyUid}
            pacsServerId={pacsServerId}
          />
        ) : (
          // Single Viewer Mode
          <>
            {/* Use the same rendering logic - create a helper function to avoid duplication */}
            {(() => {
              const renderViewer = (isFullWindow: boolean) => {
                if (imageIds.length === 0) {
                  return (
                    <div className="h-full flex items-center justify-center bg-background">
                      <div className="text-center max-w-md">
                        <Eye className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Images Available</h3>
                        <p className="text-muted-foreground mb-4">
                          This study contains no viewable images. This may be due to:
                        </p>
                        <ul className="text-sm text-muted-foreground text-left space-y-1">
                          <li>• PACS server storage configuration issues</li>
                          <li>• DICOM files were deleted from storage</li>
                          <li>• Network connectivity problems</li>
                          <li>• Corrupted or invalid DICOM data</li>
                          <li>• Orthanc database inconsistency</li>
                        </ul>
                        <p className="text-xs text-muted-foreground mt-4">
                          Contact your system administrator if this problem persists.
                        </p>
                      </div>
                    </div>
                  );
                }

                // Determine which viewer to use based on modality
                const modality = metadata.Modality || 'Unknown';
                const isProjectionModality = ['CR', 'DR', 'XR', 'DX', 'RG', 'RF'].includes(modality);
                
                const studyMetadata = {
                  patientName: metadata.PatientName || 'Unknown',
                  patientId: metadata.PatientID || 'Unknown',
                  studyDate: metadata.StudyDate || '',
                  studyDescription: metadata.StudyDescription || '',
                  modality: metadata.Modality || 'Unknown',
                  studyInstanceUID: studyUid,
                  // For DicomOverlay - PascalCase format
                  PatientName: metadata.PatientName,
                  PatientID: metadata.PatientID,
                  StudyDate: metadata.StudyDate,
                  StudyTime: metadata.StudyTime,
                  StudyDescription: metadata.StudyDescription,
                  Modality: metadata.Modality,
                  InstitutionName: metadata.InstitutionName,
                  Manufacturer: metadata.Manufacturer,
                  ManufacturerModelName: metadata.ManufacturerModelName,
                  OperatorsName: metadata.OperatorsName
                };

                // Single viewer component - handles all modes internally
                const ViewerComponent = isProjectionModality ? ProjectionDicomViewer : SimpleDicomViewer;
                const viewerProps = {
                  imageIds,
                  studyMetadata,
                  showOverlay,
                  setShowOverlay,
                  examinations: risExaminations,
                  enhancedDicomData,
                  pacsServerId,
                  isFullWindow,
                  currentLayout,
                  ...(isProjectionModality ? {} : { seriesInfo })
                };

                return <ViewerComponent key={`layout-${currentLayout.cols}x${currentLayout.rows}`} {...viewerProps} />;
              };

              return renderViewer(false); // Regular windowed mode
            })()}
          </>
        )}
        
        {/* Action Buttons */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {(user?.can_report || user?.can_view_report || user?.is_staff || user?.is_superuser) && (
            <Button
              onClick={() => setShowReportingModal(true)}
              size="sm"
              variant="default"
              title="Create/View Report"
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              <FileText className="h-4 w-4 mr-2" />
              Report
            </Button>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                title="Layout"
              >
                <Grid3x3 className="h-4 w-4 mr-2" />
                Layout
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 bg-gray-800 border-gray-600" align="end">
              <div 
                className="grid grid-cols-3 gap-1"
                onMouseLeave={() => setLayoutHover(null)}
              >
                {Array.from({ length: 9 }, (_, i) => {
                  const row = Math.floor(i / 3) + 1;
                  const col = (i % 3) + 1;
                  const isHighlighted = layoutHover ? (row <= layoutHover.rows && col <= layoutHover.cols) : false;
                  
                  return (
                    <div
                      key={i}
                      className={`w-8 h-8 border border-gray-500 cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      onMouseEnter={() => {
                        setLayoutHover({ cols: col, rows: row });
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (layoutHover) {
                          console.log('Setting layout to:', layoutHover);
                          setCurrentLayout({ cols: layoutHover.cols, rows: layoutHover.rows });
                        }
                        setLayoutHover(null);
                      }}
                      title={`${col}x${row}`}
                    />
                  );
                })}
              </div>
              <div className="text-center text-xs text-gray-300 mt-2">
                {layoutHover ? `${layoutHover.cols}×${layoutHover.rows}` : 'Hover to preview'}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {viewMode !== 'single' && (
            <Button
              onClick={() => setViewMode('single')}
              size="sm"
              variant="outline"
              title="Return to Single View"
            >
              <Eye className="h-4 w-4 mr-2" />
              Single
            </Button>
          )}
          
          {viewMode === 'single' && (
            <Button
              onClick={() => setIsFullWindow(true)}
              size="sm"
              variant="secondary"
              title="Full Window View (Press F)"
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Full Window
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Info/Report Panel */}
      <div className={`${isPanelCollapsed ? 'w-12' : 'w-80'} border-l bg-muted/5 overflow-hidden transition-all duration-300 ease-in-out relative`}>
        {/* Panel Toggle Buttons */}
        <div className="absolute top-4 left-1 z-20 flex flex-col gap-1">
          <Button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className="bg-background border shadow-sm"
            size="sm"
            variant="secondary"
            title={isPanelCollapsed ? "Expand Panel" : "Collapse Panel"}
          >
            {isPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          
        </div>
        
        {!isPanelCollapsed && (
          <div className="overflow-y-auto h-full">
            {/* Toggle Button - Always Visible */}
            {isImportedToRis && (
              <div className="p-4 pb-0">
                <div className="relative z-10">
                  <Button 
                    onClick={() => setShowReporting(!showReporting)}
                    className="w-full"
                    variant={showReporting ? "default" : "outline"}
                    title={showReporting ? "Show Study Info" : "Show Reports"}
                  >
                    {showReporting ? <Eye className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                    {showReporting ? "Show Info" : "Show Report"}
                  </Button>
                </div>
              </div>
            )}
            
            {showReporting ? (
              <div className="p-4">
                {/* Report Controls */}
                <div className="mb-4 space-y-3">
                  {/* Report Status and Metadata */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Radiology Report</span>
                    </div>
                    {currentReport && (
                      <Badge 
                        variant={currentReport.report_status === 'completed' ? 'default' : 'secondary'}
                        className={`text-xs ${currentReport.report_status === 'completed' ? 'bg-green-500 hover:bg-green-600' : ''}`}
                      >
                        {currentReport.report_status === 'completed' ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <Edit className="h-3 w-3 mr-1" />
                        )}
                        {currentReport.report_status === 'completed' ? 'Completed' : 'Draft'}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Report Metadata */}
                  {currentReport && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {currentReport.radiologist_name || 'Unknown User'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(currentReport.modified).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  
                  {/* Report Action Buttons */}
                  {reportFunctions && reportFunctions.canReport && !reportFunctions.isEditing && (
                    <div className="flex gap-2">
                      {currentReport ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => reportFunctions.editReport(currentReport)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      ) : (
                        <Button 
                          size="sm"
                          onClick={reportFunctions.startNewReport}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          New Report
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                
                <ReportingPanel
                  studyInstanceUID={studyUid}
                  examinations={risExaminations}
                  onReportChange={setHasReport}
                  onCurrentReportChange={setCurrentReport}
                  onFunctionsReady={setReportFunctions}
                  showHeader={false}
                />
              </div>
            ) : (
              <div className="p-4 space-y-4">

          {/* Import Button for non-RIS studies */}
          {!isImportedToRis && user?.is_superuser ? (
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
                              {exam.exam?.exam || 'N/A'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {exam.exam?.modaliti?.nama || 'N/A'}
                            </Badge>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {exam.exam?.part && (
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
            )}
          </div>
        )}
      </div>

      {/* Reporting Modal - Available in both modes */}
      <ReportingModal
        isOpen={showReportingModal}
        onClose={() => setShowReportingModal(false)}
        studyInstanceUID={studyUid}
        examinations={risExaminations}
        studyMetadata={metadata}
        currentReport={currentReport}
        onReportUpdate={handleReportUpdate}
      />
    </div>
  );
}