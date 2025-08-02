'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, User, FileText, Loader2 } from 'lucide-react';
import { StudyForMediaDistribution } from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

interface StudySelectorProps {
  selectedStudy?: StudyForMediaDistribution;
  onStudySelect: (study: StudyForMediaDistribution | undefined) => void;
  disabled?: boolean;
}

export function StudySelector({ selectedStudy, onStudySelect, disabled = false }: StudySelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StudyForMediaDistribution[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Debounced search function
  const searchStudies = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await MediaDistributionAPI.searchStudiesForMedia(query);
      setSearchResults(results);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search studies');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      searchStudies(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, searchStudies]);

  const handleStudySelect = (study: StudyForMediaDistribution) => {
    onStudySelect(study);
    setShowResults(false);
    setSearchTerm(`${study.pesakit.nama} - ${study.pesakit.mrn || study.pesakit.nric}`);
  };

  const handleClearSelection = () => {
    onStudySelect(undefined);
    setSearchTerm('');
    setSearchResults([]);
    setShowResults(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getModalityBadgeColor = (modality: string) => {
    switch (modality?.toUpperCase()) {
      case 'XR': return 'bg-blue-100 text-blue-800';
      case 'CT': return 'bg-green-100 text-green-800';
      case 'MR': case 'MRI': return 'bg-purple-100 text-purple-800';
      case 'US': return 'bg-yellow-100 text-yellow-800';
      case 'RF': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="study-search">Search Patient Study</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="study-search"
            placeholder="Search by patient name, MRN, or NRIC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            disabled={disabled}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        
        {searchTerm.length > 0 && searchTerm.length < 3 && (
          <p className="text-sm text-muted-foreground">
            Enter at least 3 characters to search
          </p>
        )}
      </div>

      {/* Selected Study Display */}
      {selectedStudy && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-green-800">Selected Study</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                disabled={disabled}
                className="text-red-600 hover:text-red-700"
              >
                Clear Selection
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-green-600" />
              <span className="font-medium">{selectedStudy.pesakit.nama}</span>
              <Badge variant="secondary">
                {selectedStudy.pesakit.mrn || selectedStudy.pesakit.nric}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <span>{formatDate(selectedStudy.tarikh)}</span>
              {selectedStudy.modality && (
                <Badge className={getModalityBadgeColor(selectedStudy.modality)}>
                  {selectedStudy.modality}
                </Badge>
              )}
            </div>
            
            {selectedStudy.study_description && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-green-600" />
                <span className="text-sm">{selectedStudy.study_description}</span>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground">
              Accession: {selectedStudy.parent_accession_number}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {showResults && searchResults.length > 0 && !selectedStudy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search Results</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto">
              {searchResults.map((study) => (
                <div
                  key={study.id}
                  className="p-4 border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleStudySelect(study)}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{study.pesakit.nama}</span>
                        <Badge variant="secondary">
                          {study.pesakit.mrn || study.pesakit.nric}
                        </Badge>
                      </div>
                      {study.modality && (
                        <Badge className={getModalityBadgeColor(study.modality)}>
                          {study.modality}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(study.tarikh)}</span>
                      <span>•</span>
                      <span>{study.parent_accession_number}</span>
                    </div>
                    
                    {study.study_description && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span>{study.study_description}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {showResults && searchResults.length === 0 && searchTerm.length >= 3 && !isSearching && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No completed studies found for "{searchTerm}"</p>
            <p className="text-sm mt-2">
              Only completed studies are available for media distribution
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}