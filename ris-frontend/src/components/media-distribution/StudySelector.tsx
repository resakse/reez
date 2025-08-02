'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, User, FileText, Loader2, Clock, Image, Activity } from 'lucide-react';
import { StudyForMediaDistribution } from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

interface StudySelectorProps {
  selectedStudies: StudyForMediaDistribution[];
  onStudiesSelect: (studies: StudyForMediaDistribution[]) => void;
  disabled?: boolean;
  onSearchResults?: (results: StudyForMediaDistribution[], searchTerm: string) => void;
}

export function StudySelector({ selectedStudies, onStudiesSelect, disabled = false, onSearchResults }: StudySelectorProps) {
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
      
      // Notify parent component about search results
      if (onSearchResults) {
        onSearchResults(results, query);
      }
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

  const handleStudyToggle = (study: StudyForMediaDistribution) => {
    const isSelected = selectedStudies.some(s => s.id === study.id);
    let newSelectedStudies: StudyForMediaDistribution[];
    
    if (isSelected) {
      // Remove study from selection
      newSelectedStudies = selectedStudies.filter(s => s.id !== study.id);
    } else {
      // Add study to selection
      newSelectedStudies = [...selectedStudies, study];
    }
    
    onStudiesSelect(newSelectedStudies);
    
    // Update search term to reflect selection
    if (newSelectedStudies.length === 1) {
      setSearchTerm(`${newSelectedStudies[0].pesakit.nama} - ${newSelectedStudies[0].pesakit.mrn || newSelectedStudies[0].pesakit.nric}`);
    } else if (newSelectedStudies.length > 1) {
      setSearchTerm(`${newSelectedStudies.length} studies selected`);
    } else {
      setSearchTerm('');
    }
  };

  const handleClearSelection = () => {
    onStudiesSelect([]);
    setSearchTerm('');
    setSearchResults([]);
    setShowResults(false);
    
    // Clear search results in parent component
    if (onSearchResults) {
      onSearchResults([], '');
    }
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
      case 'XR': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'CT': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'MR': case 'MRI': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'US': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'RF': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
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

      {/* Selected Studies Display */}
      {selectedStudies.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-green-800 dark:text-green-200">
                Selected Studies ({selectedStudies.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                disabled={disabled}
                className="text-red-600 hover:text-red-700"
              >
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-32 overflow-y-auto space-y-2">
              {selectedStudies.map((study) => (
                <div key={study.id} className="p-2 bg-white dark:bg-gray-800 rounded border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                      <span className="font-medium text-sm">{study.pesakit.nama}</span>
                      <Badge variant="secondary" className="text-xs">
                        {study.pesakit.mrn || study.pesakit.nric}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStudyToggle(study)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      disabled={disabled}
                    >
                      ×
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(study.tarikh)}</span>
                    {study.modality && (
                      <>
                        <span>•</span>
                        <Badge className={getModalityBadgeColor(study.modality)} size="sm">
                          {study.modality}
                        </Badge>
                      </>
                    )}
                  </div>
                  
                  {study.study_description && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{study.study_description}</span>
                    </div>
                  )}
                  
                  {/* Exam Details */}
                  {study.exam_details && study.exam_details.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-3 w-3 text-blue-500" />
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {study.exam_details.length} Exam{study.exam_details.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-muted-foreground">• ~{study.image_count} images</span>
                      </div>
                      <div className="space-y-1">
                        {study.exam_details.slice(0, 3).map((exam, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              {exam.exam_name}
                              {exam.body_part && ` (${exam.body_part})`}
                              {exam.laterality && ` - ${exam.laterality}`}
                            </span>
                            {exam.xray_number && (
                              <span className="text-xs font-mono text-blue-600">
                                {exam.xray_number}
                              </span>
                            )}
                          </div>
                        ))}
                        {study.exam_details.length > 3 && (
                          <div className="text-muted-foreground">
                            ... and {study.exam_details.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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