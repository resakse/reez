'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Ward?: string;
  Klinik?: string;
}

interface ModalityOption {
  value: string;
  label: string;
}

export default function PacsBrowserPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [studies, setStudies] = useState<LegacyStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalStudies, setTotalStudies] = useState(0);
  const [modalityOptions, setModalityOptions] = useState<ModalityOption[]>([
    { value: 'ALL', label: 'All Modalities' }
  ]);
  const [allKlinikOptions, setAllKlinikOptions] = useState<string[]>([]);
  const [allStudies, setAllStudies] = useState<LegacyStudy[]>([]);

  // Search filters
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modality, setModality] = useState('ALL');
  const [studyDescription, setStudyDescription] = useState('');
  const [klinik, setKlinik] = useState('all');

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return dateString;
    return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
  };

  const formatTime = (timeString: string): string => {
    if (!timeString || timeString.length < 6) return timeString;
    return `${timeString.substring(0, 2)}:${timeString.substring(2, 4)}:${timeString.substring(4, 6)}`;
  };

  const extractKlinikFromDescription = (text: string): string => {
    if (!text) return '';
    
    // Multiple patterns to match different klinik formats
    const patterns = [
      // "KLINIK KESIHATAN BUKIT KUDA" - standard format
      /KLINIK\s+[A-Z][A-Z\s]*/i,
      // "RUJUKAN: KLINIK MATA" - with rujukan prefix
      /RUJUKAN[:\s]*KLINIK\s+[A-Z][A-Z\s]*/i,
      // "Klinik Ortopedik" - mixed case
      /Klinik\s+[A-Za-z][A-Za-z\s]*/,
      // "WARD 3A" or "WAD 5B" - ward references
      /W[A-Z]*D\s+[A-Z0-9][A-Z0-9\s]*/i,
      // "Unit Rawatan Rapi" - unit references
      /UNIT\s+[A-Z][A-Z\s]*/i,
      // "Jabatan Emergency" - department references
      /JABATAN\s+[A-Z][A-Z\s]*/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let result = match[0].trim();
        // Clean up common prefixes
        result = result.replace(/^RUJUKAN[:\s]*/i, '');
        return result;
      }
    }
    
    // If no specific pattern matches, look for any capitalized department-like words
    const fallbackMatch = text.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/);
    if (fallbackMatch && fallbackMatch[0].length > 3) {
      return fallbackMatch[0];
    }
    
    return '';
  };

  // Auto-filter studies based on current filter values
  const filteredStudies = useMemo(() => {
    let filtered = [...allStudies];

    // Apply text filters only if they meet minimum length requirement
    if (patientName.length >= 3) {
      filtered = filtered.filter(study => 
        study.PatientName?.toLowerCase().includes(patientName.toLowerCase())
      );
    }

    if (patientId.length >= 3) {
      filtered = filtered.filter(study => 
        study.PatientID?.includes(patientId)
      );
    }

    if (studyDescription.length >= 3) {
      filtered = filtered.filter(study => 
        study.StudyDescription?.toLowerCase().includes(studyDescription.toLowerCase())
      );
    }

    // Apply dropdown filters immediately
    if (modality && modality !== 'ALL') {
      filtered = filtered.filter(study => study.Modality === modality);
    }

    if (klinik && klinik !== 'all') {
      filtered = filtered.filter(study => 
        study.Klinik && study.Klinik.toLowerCase().includes(klinik.toLowerCase())
      );
    }

    // Apply date filters
    if (dateFrom) {
      const fromDate = dateFrom.replace(/-/g, '');
      filtered = filtered.filter(study => study.StudyDate >= fromDate);
    }

    if (dateTo) {
      const toDate = dateTo.replace(/-/g, '');
      filtered = filtered.filter(study => study.StudyDate <= toDate);
    }

    return filtered;
  }, [allStudies, patientName, patientId, studyDescription, modality, klinik, dateFrom, dateTo]);

  // Update displayed studies when filtered studies change
  useEffect(() => {
    setStudies(filteredStudies);
    setTotalStudies(filteredStudies.length);
  }, [filteredStudies]);

  const searchLegacyStudies = useCallback(async () => {
    try {
      setSearching(true);
      setError(null);
      
      // Build search parameters (klinik and modality filtering done client-side)
      const searchParams = {
        patientName: patientName.trim() || undefined,
        patientId: patientId.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        studyDescription: studyDescription.trim() || undefined,
        limit: 100
      };

      // Remove undefined values
      Object.keys(searchParams).forEach(key => 
        searchParams[key] === undefined && delete searchParams[key]
      );

      // Searching with built parameters

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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to search PACS: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      // Map backend response to frontend format
      let formattedStudies: LegacyStudy[] = data.studies.map((study: any) => ({
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
        InstitutionName: study.institutionName,
        Ward: study.ward,
        Klinik: extractKlinikFromDescription(study.institutionName || study.studyDescription)
      }));

      // Store all studies for client-side filtering
      setAllStudies(formattedStudies);

      // Update klinik options from search results (preserve existing options)
      const extractedKliniks = formattedStudies.map(study => study.Klinik).filter(Boolean);
      const newKlinikOptions = Array.from(new Set([
        ...allKlinikOptions,
        ...extractedKliniks
      ])).sort();
      setAllKlinikOptions(newKlinikOptions);
      
      if (formattedStudies.length === 0) {
        toast.success('Search completed - no studies found matching criteria');
      } else {
        toast.success(`Found ${formattedStudies.length} legacy studies`);
      }
    } catch (err) {
      // Error searching legacy studies
      setError(err instanceof Error ? err.message : 'Failed to search legacy studies');
      toast.error('Failed to search legacy studies');
    } finally {
      setSearching(false);
    }
  }, [patientName, patientId, dateFrom, dateTo, modality, studyDescription, klinik]);

  const clearFilters = () => {
    setPatientName('');
    setPatientId('');
    setDateFrom('');
    setDateTo('');
    setModality('ALL');
    setStudyDescription('');
    setKlinik('all');
    setError(null);
    // Studies will be automatically filtered by the useMemo
  };

  const viewStudy = (study: LegacyStudy) => {
    // Navigate to DICOM viewer with study UID
    router.push(`/pacs-browser/${study.StudyInstanceUID}`);
  };

  const importStudy = async (study: LegacyStudy) => {
    // TODO: Implement import functionality
    toast.info('Import functionality coming soon');
  };

  // Fetch modality options from database
  useEffect(() => {
    const fetchModalities = async () => {
      try {
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`
        );
        
        if (response.ok) {
          const data = await response.json();
          const options: ModalityOption[] = [
            { value: 'ALL', label: 'All Modalities' }
          ];
          
          // Handle both paginated (data.results) and direct array responses
          const modalities = data.results || data;
          
          if (!Array.isArray(modalities)) {
            console.error('Invalid modalities response:', data);
            toast.error('Invalid modality data format');
            return;
          }
          
          // Process modalities and ensure proper DICOM codes
          modalities.forEach((modality: any) => {
            let dicomCode = modality.singkatan;
            
            // If singkatan is empty/null, try to map from nama
            if (!dicomCode || dicomCode.trim() === '') {
              // Map common Malaysian names to DICOM codes
              const nama = modality.nama.toLowerCase();
              if (nama.includes('x-ray') || nama.includes('xray')) {
                dicomCode = 'XR';
              } else if (nama.includes('ct') || nama.includes('computed tomography')) {
                dicomCode = 'CT';
              } else if (nama.includes('mri') || nama.includes('magnetic resonance')) {
                dicomCode = 'MR';
              } else if (nama.includes('ultrasound') || nama.includes('ultrasonografi')) {
                dicomCode = 'US';
              } else if (nama.includes('mammography') || nama.includes('mamografi')) {
                dicomCode = 'MG';
              } else {
                // Default to first 2-3 characters if no mapping found
                dicomCode = modality.nama.substring(0, 3).toUpperCase();
              }
            }
            
            options.push({
              value: dicomCode,
              label: modality.nama
            });
          });
          
          setModalityOptions(options);
        } else {
          console.error('Failed to fetch modalities:', response.status, response.statusText);
          toast.error('Failed to load modality options');
        }
      } catch (err) {
        console.error('Failed to fetch modalities:', err);
        toast.error('Failed to load modality options');
      }
    };

    fetchModalities();
  }, []);

  // Auto-load studies on component mount  
  useEffect(() => {
    const autoLoadStudies = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Search with empty parameters to get all recent studies
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: 100 })
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to load studies: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load studies');
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
          InstitutionName: study.institutionName,
          Ward: study.ward,
          Klinik: extractKlinikFromDescription(study.institutionName || study.studyDescription)
        }));

        // Store all studies for client-side filtering
        setAllStudies(formattedStudies);
        
        // Update klinik options from all studies (preserve existing options)
        const extractedKliniks = formattedStudies.map(study => study.Klinik).filter(Boolean);
        const newKlinikOptions = Array.from(new Set([
          ...allKlinikOptions,
          ...extractedKliniks
        ])).sort();
        setAllKlinikOptions(newKlinikOptions);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load studies');
      } finally {
        setLoading(false);
      }
    };

    autoLoadStudies();
  }, []);

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                placeholder="Enter patient name (min 3 chars)..."
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="patientId">Patient ID</Label>
              <Input
                id="patientId"
                placeholder="Enter patient ID (min 3 chars)..."
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
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
                placeholder="Enter study description (min 3 chars)..."
                value={studyDescription}
                onChange={(e) => setStudyDescription(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="klinik">Klinik</Label>
              <Select value={klinik} onValueChange={setKlinik}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  {allKlinikOptions.map(clinic => (
                    <SelectItem key={clinic} value={clinic}>{clinic}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center mt-6">
            <div className="text-sm text-muted-foreground">
              Filters apply automatically • Text search requires minimum 3 characters
            </div>
            <div className="flex space-x-4">
              <Button onClick={searchLegacyStudies} disabled={searching}>
                {searching ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Studies
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                <Filter className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
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