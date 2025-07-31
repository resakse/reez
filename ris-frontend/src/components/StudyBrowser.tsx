'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Eye, Calendar, User, FileImage, Search, 
  Filter, SortAsc, Monitor, Stethoscope 
} from 'lucide-react';
import { fetchStudies, Study } from '@/lib/studies';

// Study interface is now imported from lib/studies.ts

interface StudyBrowserProps {
  onStudySelect?: (studyInstanceUID: string) => void;
  showViewerButton?: boolean;
  patientFilter?: string;
}

const StudyBrowser: React.FC<StudyBrowserProps> = ({ 
  onStudySelect, 
  showViewerButton = true,
  patientFilter 
}) => {
  const router = useRouter();
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(patientFilter || '');
  const [modalityFilter, setModalityFilter] = useState<string>('');
  const [klinikFilter, setKlinikFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'patient' | 'modality'>('date');

  // Fetch studies from backend database
  useEffect(() => {
    const loadStudies = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const studiesData = await fetchStudies();
        setStudies(studiesData);
      } catch (err) {
        console.error('Error fetching studies:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch studies');
      } finally {
        setLoading(false);
      }
    };

    loadStudies();
  }, []);

  // Filter and sort studies
  const filteredStudies = studies
    .filter(study => {
      const matchesSearch = searchTerm === '' || 
        (study.patientName?.toLowerCase?.() || '').includes(searchTerm.toLowerCase()) ||
        (study.patientID || '').includes(searchTerm) ||
        (study.accessionNumber?.toLowerCase?.() || '').includes(searchTerm.toLowerCase());
      
      const matchesModality = modalityFilter === '' || study.modality === modalityFilter;
      const matchesKlinik = klinikFilter === '' || study.klinik === klinikFilter;
      
      return matchesSearch && matchesModality && matchesKlinik;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.studyDate + ' ' + b.studyTime).getTime() - 
                 new Date(a.studyDate + ' ' + a.studyTime).getTime();
        case 'patient':
          return (a.patientName || '').localeCompare(b.patientName || '');
        case 'modality':
          return (a.modality || '').localeCompare(b.modality || '');
        default:
          return 0;
      }
    });

  const handleStudySelect = (studyInstanceUID: string) => {
    if (onStudySelect) {
      onStudySelect(studyInstanceUID);
    }
  };

  const handleViewStudy = (studyInstanceUID: string) => {
    router.push(`/viewer/${encodeURIComponent(studyInstanceUID)}`);
  };

  const getModalityIcon = (modality: string) => {
    switch (modality) {
      case 'XR':
      case 'CR':
      case 'DX':
        return <Monitor className="h-4 w-4" />;
      case 'CT':
        return <FileImage className="h-4 w-4" />;
      case 'MR':
      case 'MRI':
        return <Stethoscope className="h-4 w-4" />;
      default:
        return <FileImage className="h-4 w-4" />;
    }
  };

  const formatDate = (dateStr: string, timeStr: string) => {
    try {
      const date = new Date(dateStr + ' ' + timeStr);
      return date.toLocaleString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return `${dateStr} ${timeStr}`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Loading Studies...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-center mt-2">Fetching DICOM studies from PACS</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Studies</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4 w-full"
              variant="outline"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Search and Filter Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Study Browser
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Patient name, ID, or accession..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="modality">Modality</Label>
              <select
                id="modality"
                value={modalityFilter}
                onChange={(e) => setModalityFilter(e.target.value)}
                className="w-full p-2 border border-input rounded-md bg-background"
              >
                <option value="">All Modalities</option>
                <option value="XR">X-Ray</option>
                <option value="CT">CT Scan</option>
                <option value="MR">MRI</option>
                <option value="US">Ultrasound</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="klinik">Klinik</Label>
              <select
                id="klinik"
                value={klinikFilter}
                onChange={(e) => setKlinikFilter(e.target.value)}
                className="w-full p-2 border border-input rounded-md bg-background"
              >
                <option value="">All Clinics</option>
                {Array.from(new Set(studies.map(study => study.klinik).filter(Boolean))).sort().map(klinik => (
                  <option key={klinik} value={klinik}>{klinik}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sort">Sort By</Label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'patient' | 'modality')}
                className="w-full p-2 border border-input rounded-md bg-background"
              >
                <option value="date">Study Date</option>
                <option value="patient">Patient Name</option>
                <option value="modality">Modality</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Found {filteredStudies.length} studies</span>
            <span>Sorted by {sortBy}</span>
          </div>
        </CardContent>
      </Card>

      {/* Studies List */}
      <ScrollArea className="h-96">
        <div className="space-y-3">
          {filteredStudies.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center text-muted-foreground">
                  <FileImage className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No studies found</p>
                  <p className="text-sm">Try adjusting your search criteria</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredStudies.map((study) => (
              <Card 
                key={study.studyInstanceUID} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleStudySelect(study.studyInstanceUID)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      {/* Patient Information */}
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{study.patientName}</span>
                        <Badge variant="outline" className="text-xs">
                          {study.patientID}
                        </Badge>
                      </div>
                      
                      {/* Study Information */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(study.studyDate, study.studyTime)}
                        </div>
                        <div className="flex items-center gap-1">
                          {getModalityIcon(study.modality)}
                          <Badge variant="secondary" className="text-xs">
                            {study.modality}
                          </Badge>
                        </div>
                        <span>{study.accessionNumber}</span>
                      </div>
                      
                      {/* Study Description */}
                      <p className="text-sm">{study.studyDescription}</p>
                      
                      {/* Study Stats */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{study.seriesCount} series</span>
                        <span>{study.imageCount} images</span>
                        {study.institution && <span>{study.institution}</span>}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    {showViewerButton && (
                      <div className="ml-4">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewStudy(study.studyInstanceUID);
                          }}
                          className="gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default StudyBrowser;