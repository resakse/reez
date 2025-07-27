'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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
import { 
  ArrowLeft, 
  Download, 
  User, 
  Calendar,
  Stethoscope,
  Archive,
  Eye,
  Clock,
  Building
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

  const studyUid = params?.studyUid as string;

  const fetchStudyData = useCallback(async () => {
    if (!studyUid) return;

    try {
      setLoading(true);
      setError(null);

      console.log('Fetching study data for UID:', studyUid);

      // Fetch study metadata and image IDs in parallel
      const [studyMetadata, studyImageIds] = await Promise.all([
        getStudyMetadata(studyUid),
        getStudyImageIds(studyUid)
      ]);

      console.log('Study metadata:', studyMetadata);
      console.log('Study image IDs:', studyImageIds);

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
    }
  }, [studyUid]);

  useEffect(() => {
    if (studyUid && user) {
      fetchStudyData();
    }
  }, [studyUid, user, fetchStudyData]);

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
    if (!metadata) return;

    setImporting(true);
    try {
      // TODO: Implement actual import functionality
      // This would involve:
      // 1. Creating patient record if not exists
      // 2. Creating study record in RIS database
      // 3. Linking to PACS study
      
      toast.info('Import functionality coming soon');
    } catch (err) {
      console.error('Error importing study:', err);
      toast.error('Failed to import study');
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

  return (
    <div className="h-full flex">
      {/* DICOM Viewer - Full Height */}
      <div className="flex-1">
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
      </div>

      {/* Collapsible Info Panel */}
      <div className="w-80 border-l bg-muted/5 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Import Button */}
          <Button 
            onClick={handleImportStudy}
            disabled={importing}
            className="w-full"
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
              <Badge variant="outline" className="text-xs mt-2">
                <Archive className="h-3 w-3 mr-1" />
                Legacy Study
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}