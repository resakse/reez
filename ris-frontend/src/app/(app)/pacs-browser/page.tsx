'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getOrthancUrl } from '@/lib/pacs';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import { 
  Search, 
  Calendar, 
  Eye, 
  Download, 
  Filter,
  Archive,
  Stethoscope,
  User,
  Clock,
  RefreshCw
} from 'lucide-react';

interface LegacyStudy {
  ID: string;
  StudyInstanceUID: string;
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  Modality?: string;
  SeriesCount?: number;
  ImageCount?: number;
  InstitutionName?: string;
}

const modalityOptions = [
  { value: 'ALL', label: 'All Modalities' },
  { value: 'CT', label: 'CT Scan' },
  { value: 'MR', label: 'MRI' },
  { value: 'CR', label: 'X-Ray (CR)' },
  { value: 'DR', label: 'X-Ray (DR)' },
  { value: 'US', label: 'Ultrasound' },
  { value: 'MG', label: 'Mammography' },
  { value: 'RF', label: 'Fluoroscopy' },
  { value: 'NM', label: 'Nuclear Medicine' }
];

export default function PacsBrowserPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [studies, setStudies] = useState<LegacyStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalStudies, setTotalStudies] = useState(0);

  // Search filters
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modality, setModality] = useState('ALL');
  const [studyDescription, setStudyDescription] = useState('');

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return dateString;
    return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
  };

  const formatTime = (timeString: string): string => {
    if (!timeString || timeString.length < 6) return timeString;
    return `${timeString.substring(0, 2)}:${timeString.substring(2, 4)}:${timeString.substring(4, 6)}`;
  };

  const searchLegacyStudies = useCallback(async () => {
    try {
      setSearching(true);
      setError(null);
      
      console.log('🔍 Starting PACS search via backend API...');
      
      // Build search parameters
      const searchParams = {
        patientName: patientName.trim() || undefined,
        patientId: patientId.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        modality: (modality && modality !== 'ALL') ? modality : undefined,
        studyDescription: studyDescription.trim() || undefined,
        limit: 100
      };

      // Remove undefined values
      Object.keys(searchParams).forEach(key => 
        searchParams[key] === undefined && delete searchParams[key]
      );

      console.log('📤 Sending search params:', searchParams);

      // Use Django API endpoint instead of direct Orthanc connection
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(searchParams)
        }
      );

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Response error:', errorData);
        throw new Error(errorData.error || `Failed to search PACS: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 API response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      // Map backend response to frontend format
      const formattedStudies: LegacyStudy[] = data.studies.map((study: any) => ({
        ID: study.id,
        StudyInstanceUID: study.studyInstanceUid,
        PatientName: study.patientName,
        PatientID: study.patientId,
        PatientBirthDate: study.patientBirthDate,
        PatientSex: study.patientSex,
        StudyDate: study.studyDate,
        StudyTime: study.studyTime,
        StudyDescription: study.studyDescription,
        Modality: study.modality,
        SeriesCount: study.seriesCount,
        ImageCount: study.imageCount,
        InstitutionName: study.institutionName
      }));

      console.log('✅ Formatted studies count:', formattedStudies.length);
      console.log('✅ First formatted study:', formattedStudies[0]);

      setStudies(formattedStudies);
      setTotalStudies(formattedStudies.length);
      
      if (formattedStudies.length === 0) {
        console.log('ℹ️ No studies found');
        toast.success('Search completed - no studies found matching criteria');
      } else {
        console.log(`✅ Found ${formattedStudies.length} studies`);
        toast.success(`Found ${formattedStudies.length} legacy studies`);
      }
    } catch (err) {
      console.error('❌ Error searching legacy studies:', err);
      setError(err instanceof Error ? err.message : 'Failed to search legacy studies');
      toast.error('Failed to search legacy studies');
    } finally {
      setSearching(false);
    }
  }, [patientName, patientId, dateFrom, dateTo, modality, studyDescription]);

  const clearFilters = () => {
    setPatientName('');
    setPatientId('');
    setDateFrom('');
    setDateTo('');
    setModality('ALL');
    setStudyDescription('');
    setStudies([]);
    setTotalStudies(0);
    setError(null);
  };

  const viewStudy = (study: LegacyStudy) => {
    // Navigate to DICOM viewer with study UID
    router.push(`/pacs-browser/${study.StudyInstanceUID}`);
  };

  const importStudy = async (study: LegacyStudy) => {
    // TODO: Implement import functionality
    toast.info('Import functionality coming soon');
  };

  return (
    <div className="container-fluid px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Archive className="h-8 w-8" />
              PACS Browser
            </h1>
            <p className="mt-2 text-muted-foreground">
              Browse and view legacy DICOM studies from PACS archive
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Legacy Studies: {totalStudies}
          </Badge>
        </div>
      </div>

      {/* Search Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Legacy Studies
          </CardTitle>
          <CardDescription>
            Search through historical DICOM studies in the PACS archive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                placeholder="Enter patient name..."
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchLegacyStudies()}
              />
            </div>

            <div>
              <Label htmlFor="patientId">Patient ID</Label>
              <Input
                id="patientId"
                placeholder="Enter patient ID..."
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchLegacyStudies()}
              />
            </div>

            <div>
              <Label htmlFor="modality">Modality</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger>
                  <SelectValue placeholder="Select modality" />
                </SelectTrigger>
                <SelectContent>
                  {modalityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="studyDescription">Study Description</Label>
              <Input
                id="studyDescription"
                placeholder="Enter study description..."
                value={studyDescription}
                onChange={(e) => setStudyDescription(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchLegacyStudies()}
              />
            </div>
          </div>

          <div className="flex space-x-4 mt-6">
            <Button onClick={searchLegacyStudies} disabled={searching}>
              {searching ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search Studies
                </>
              )}
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              <Filter className="w-4 h-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Legacy Studies ({studies.length})
            </span>
          </CardTitle>
          <CardDescription>
            Historical DICOM studies from PACS archive
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Patient</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Study Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Modality</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Description</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Series</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((study) => (
                    <tr key={study.ID} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <p className="font-medium">{study.PatientName}</p>
                          <p className="text-xs text-muted-foreground">ID: {study.PatientID}</p>
                          {study.PatientSex && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {study.PatientSex === 'M' ? 'Male' : study.PatientSex === 'F' ? 'Female' : study.PatientSex}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{formatDate(study.StudyDate || '')}</span>
                        </div>
                        {study.StudyTime && (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatTime(study.StudyTime)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant="secondary" className="text-xs">
                          {study.Modality}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="max-w-xs truncate" title={study.StudyDescription}>
                          {study.StudyDescription || '-'}
                        </p>
                        {study.InstitutionName && (
                          <p className="text-xs text-muted-foreground mt-1">{study.InstitutionName}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant="outline" className="text-xs">
                          {study.SeriesCount} series
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewStudy(study)}
                            className="text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => importStudy(study)}
                            className="text-xs"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Import
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !searching ? (
            <div className="text-center py-12">
              <Archive className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Studies Found</h3>
              <p className="text-muted-foreground mb-4">
                Use the search filters above to find legacy DICOM studies
              </p>
              <Button onClick={searchLegacyStudies}>
                <Search className="w-4 h-4 mr-2" />
                Search All Studies
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}