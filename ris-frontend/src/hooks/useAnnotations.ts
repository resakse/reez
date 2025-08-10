'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';
import type {
  DicomAnnotation,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  AnnotationListResponse,
  AnnotationFilters,
  AnnotationType,
  UseAnnotationsParams,
  UseAnnotationsReturn,
} from '@/types/annotations';
import { ANNOTATION_API_ENDPOINTS } from '@/types/annotations';

/**
 * Main hook for DICOM annotation CRUD operations
 * Provides comprehensive annotation management functionality with loading states and error handling
 */
export function useAnnotations(params: UseAnnotationsParams = {}): UseAnnotationsReturn {
  const {
    studyUid,
    imageId,
    autoRefresh = false,
    refreshInterval = 30000,
  } = params;

  // State management
  const [annotations, setAnnotations] = useState<DicomAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  /**
   * Build API URL with filters
   */
  const buildApiUrl = useCallback((filters: AnnotationFilters = {}) => {
    const params = new URLSearchParams();
    
    if (studyUid || filters.study_uid) {
      params.append('study_uid', studyUid || filters.study_uid!);
    }
    
    if (imageId || filters.image_id) {
      params.append('image_id', imageId || filters.image_id!);
    }
    
    if (filters.series_uid) {
      params.append('series_uid', filters.series_uid);
    }
    
    if (filters.annotation_type) {
      params.append('annotation_type', filters.annotation_type);
    }
    
    if (filters.user_id) {
      params.append('user_id', filters.user_id.toString());
    }
    
    if (filters.date_from) {
      params.append('date_from', filters.date_from);
    }
    
    if (filters.date_to) {
      params.append('date_to', filters.date_to);
    }
    
    if (filters.has_measurements !== undefined) {
      params.append('has_measurements', filters.has_measurements.toString());
    }
    
    if (filters.search) {
      params.append('search', filters.search);
    }

    const queryString = params.toString();
    return queryString ? `${ANNOTATION_API_ENDPOINTS.ANNOTATIONS}?${queryString}` : ANNOTATION_API_ENDPOINTS.ANNOTATIONS;
  }, [studyUid, imageId]);

  /**
   * Fetch annotations with optional filters
   */
  const fetchAnnotations = useCallback(async (filters: AnnotationFilters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = buildApiUrl(filters);
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          // No annotations found is not an error
          setAnnotations([]);
          setLastFetch(new Date());
          return;
        }
        throw new Error(`Failed to fetch annotations: ${response.status} ${response.statusText}`);
      }
      
      const data: AnnotationListResponse | DicomAnnotation[] = await response.json();
      
      // Handle both paginated and simple array responses
      const annotationList = Array.isArray(data) ? data : data.results;
      
      setAnnotations(annotationList);
      setLastFetch(new Date());
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Failed to fetch annotations:', err);
      toast.error(`Failed to fetch annotations: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [buildApiUrl]);

  /**
   * Create a new annotation
   */
  const createAnnotation = useCallback(async (annotationData: CreateAnnotationRequest): Promise<DicomAnnotation> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await AuthService.authenticatedFetch(ANNOTATION_API_ENDPOINTS.ANNOTATIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...annotationData,
          frame_number: annotationData.frame_number || 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.detail || errorData?.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const newAnnotation: DicomAnnotation = await response.json();
      
      // Add to local state
      setAnnotations(prev => [newAnnotation, ...prev]);
      
      toast.success('Annotation saved successfully');
      return newAnnotation;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create annotation';
      setError(errorMessage);
      console.error('Failed to create annotation:', err);
      toast.error(`Failed to save annotation: ${errorMessage}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an existing annotation
   */
  const updateAnnotation = useCallback(async (
    id: number, 
    updateData: Partial<UpdateAnnotationRequest>
  ): Promise<DicomAnnotation> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await AuthService.authenticatedFetch(ANNOTATION_API_ENDPOINTS.ANNOTATION_DETAIL(id), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.detail || errorData?.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const updatedAnnotation: DicomAnnotation = await response.json();
      
      // Update local state
      setAnnotations(prev => 
        prev.map(annotation => 
          annotation.id === id ? updatedAnnotation : annotation
        )
      );
      
      toast.success('Annotation updated successfully');
      return updatedAnnotation;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update annotation';
      setError(errorMessage);
      console.error('Failed to update annotation:', err);
      toast.error(`Failed to update annotation: ${errorMessage}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete an annotation (only user's own annotations)
   */
  const deleteAnnotation = useCallback(async (id: number): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await AuthService.authenticatedFetch(ANNOTATION_API_ENDPOINTS.ANNOTATION_DETAIL(id), {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You can only delete your own annotations');
        }
        if (response.status === 404) {
          throw new Error('Annotation not found');
        }
        throw new Error(`Failed to delete annotation: ${response.status} ${response.statusText}`);
      }
      
      // Remove from local state
      setAnnotations(prev => prev.filter(annotation => annotation.id !== id));
      
      toast.success('Annotation deleted successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete annotation';
      setError(errorMessage);
      console.error('Failed to delete annotation:', err);
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refresh annotations manually
   */
  const refreshAnnotations = useCallback(async (): Promise<void> => {
    await fetchAnnotations();
  }, [fetchAnnotations]);

  /**
   * Filter annotations by type
   */
  const getAnnotationsByType = useCallback((type: AnnotationType): DicomAnnotation[] => {
    return annotations.filter(annotation => annotation.annotation_type === type);
  }, [annotations]);

  /**
   * Filter annotations by image ID
   */
  const getAnnotationsByImage = useCallback((targetImageId: string): DicomAnnotation[] => {
    return annotations.filter(annotation => annotation.image_id === targetImageId);
  }, [annotations]);

  /**
   * Filter annotations by user ID
   */
  const getUserAnnotations = useCallback((userId: number): DicomAnnotation[] => {
    return annotations.filter(annotation => annotation.user === userId);
  }, [annotations]);

  /**
   * Get current user's annotations
   */
  const getCurrentUserAnnotations = useMemo((): DicomAnnotation[] => {
    const currentUser = AuthService.getCurrentUser();
    return currentUser ? getUserAnnotations(currentUser.user_id) : [];
  }, [annotations, getUserAnnotations]);

  /**
   * Get annotation statistics
   */
  const getAnnotationStats = useMemo(() => {
    const stats = {
      total: annotations.length,
      byType: {} as Record<AnnotationType, number>,
      withMeasurements: annotations.filter(a => a.measurement_value !== null && a.measurement_value !== undefined).length,
      currentUserCount: getCurrentUserAnnotations.length,
    };

    // Count by type
    annotations.forEach(annotation => {
      stats.byType[annotation.annotation_type] = (stats.byType[annotation.annotation_type] || 0) + 1;
    });

    return stats;
  }, [annotations, getCurrentUserAnnotations.length]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !refreshInterval) return;

    const interval = setInterval(() => {
      fetchAnnotations();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAnnotations]);

  // Initial fetch
  useEffect(() => {
    if (studyUid || imageId) {
      fetchAnnotations();
    }
  }, [studyUid, imageId, fetchAnnotations]);

  return {
    // Data
    annotations,
    loading,
    error,
    lastFetch,
    stats: getAnnotationStats,
    currentUserAnnotations: getCurrentUserAnnotations,

    // Actions
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    refreshAnnotations,

    // Filters and utilities
    getAnnotationsByType,
    getAnnotationsByImage,
    getUserAnnotations,

    // Utilities
    clearError: () => setError(null),
    fetchWithFilters: fetchAnnotations,
  };
}

export default useAnnotations;