'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useAnnotations } from './useAnnotations';
import { toast } from '@/lib/toast';
import type {
  CreateAnnotationRequest,
  DicomAnnotation,
  UseAnnotationAutoSaveParams,
  UseAnnotationAutoSaveReturn,
  CornerstoneAnnotationEvent,
} from '@/types/annotations';

/**
 * Auto-save hook for DICOM annotations with debouncing
 * Provides debounced save functionality to reduce API calls and improve performance
 */
export function useAnnotationAutoSave(params: UseAnnotationAutoSaveParams): UseAnnotationAutoSaveReturn {
  const {
    studyUid,
    enabled = true,
    debounceMs = 1000,
    onSaveSuccess,
    onSaveError,
  } = params;

  // Get the main annotations hook
  const { createAnnotation, updateAnnotation } = useAnnotations({ studyUid });

  // State for tracking save operations
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Refs for managing timeouts and pending saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<CreateAnnotationRequest | null>(null);
  const savingRef = useRef(false);

  /**
   * Clear any pending save timeout
   */
  const clearPendingTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  /**
   * Perform the actual save operation
   */
  const performSave = useCallback(async (annotationData: CreateAnnotationRequest): Promise<DicomAnnotation | null> => {
    if (!enabled || savingRef.current) {
      return null;
    }

    try {
      setIsSaving(true);
      savingRef.current = true;
      setSaveError(undefined);

      // Create new annotation
      const savedAnnotation = await createAnnotation(annotationData);
      
      setLastSaveTime(new Date());
      
      // Call success callback if provided
      if (onSaveSuccess) {
        onSaveSuccess(savedAnnotation);
      }

      return savedAnnotation;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Auto-save failed';
      setSaveError(errorMessage);
      
      console.error('Auto-save error:', error);
      
      // Call error callback if provided
      if (onSaveError) {
        onSaveError(error instanceof Error ? error : new Error(errorMessage));
      }

      // Show user-friendly error message
      toast.error(`Auto-save failed: ${errorMessage}`);
      
      return null;

    } finally {
      setIsSaving(false);
      savingRef.current = false;
      pendingSaveRef.current = null;
    }
  }, [enabled, createAnnotation, onSaveSuccess, onSaveError]);

  /**
   * Debounced save function
   * Delays save operation by debounceMs milliseconds, cancelling previous pending saves
   */
  const debouncedSave = useCallback(async (annotationData: CreateAnnotationRequest): Promise<void> => {
    if (!enabled) {
      return;
    }

    // Validate required fields
    if (!annotationData.study_instance_uid || !annotationData.annotation_type || !annotationData.annotation_data) {
      console.error('Invalid annotation data for auto-save:', annotationData);
      return;
    }

    // Clear any existing timeout
    clearPendingTimeout();

    // Store the pending save data
    pendingSaveRef.current = annotationData;

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      const pendingData = pendingSaveRef.current;
      if (pendingData) {
        await performSave(pendingData);
      }
    }, debounceMs);
  }, [enabled, debounceMs, clearPendingTimeout, performSave]);

  /**
   * Cancel any pending save operation
   */
  const cancelPendingSave = useCallback(() => {
    clearPendingTimeout();
    pendingSaveRef.current = null;
  }, [clearPendingTimeout]);

  /**
   * Force immediate save of any pending data
   */
  const forceSave = useCallback(async (): Promise<void> => {
    clearPendingTimeout();
    
    const pendingData = pendingSaveRef.current;
    if (pendingData && enabled) {
      await performSave(pendingData);
    }
  }, [clearPendingTimeout, performSave, enabled]);

  /**
   * Handle Cornerstone annotation events
   * Extracts annotation data and triggers auto-save
   */
  const handleCornerstoneEvent = useCallback(async (event: CornerstoneAnnotationEvent): Promise<void> => {
    if (!enabled) {
      return;
    }

    const { annotation, changeType } = event.detail;
    
    // Only auto-save on completed or modified annotations
    if (changeType !== 'completed' && changeType !== 'modified') {
      return;
    }

    try {
      // Extract measurement data if available
      const measurementValue = annotation.data.cachedStats?.length || 
                              annotation.data.cachedStats?.area ||
                              undefined;
      
      const measurementUnit = annotation.data.cachedStats?.lengthUnits || 
                             annotation.data.cachedStats?.areaUnits ||
                             '';

      // Extract text label if available
      const label = annotation.data.text?.textBox?.text || '';

      // Prepare annotation data for saving
      const annotationData: CreateAnnotationRequest = {
        study_instance_uid: studyUid,
        series_instance_uid: annotation.metadata.seriesInstanceUID,
        sop_instance_uid: annotation.metadata.sopInstanceUID,
        image_id: annotation.imageId,
        frame_number: 1, // Default frame number
        annotation_type: mapCornerstoneToolToType(annotation.metadata.toolName),
        annotation_data: annotation.data,
        cornerstone_annotation_uid: annotation.annotationUID, // Store the Cornerstone3D UID
        label,
        measurement_value: measurementValue,
        measurement_unit: measurementUnit,
      };


      // Trigger debounced save
      await debouncedSave(annotationData);

    } catch (error) {
      console.error('Failed to process Cornerstone annotation event:', error);
    }
  }, [enabled, studyUid, debouncedSave]);

  /**
   * Map Cornerstone tool names to our annotation types
   */
  const mapCornerstoneToolToType = (toolName: string): CreateAnnotationRequest['annotation_type'] => {
    const toolMap: Record<string, CreateAnnotationRequest['annotation_type']> = {
      'Length': 'measurement',
      'Bidirectional': 'measurement',
      'EllipticalRoi': 'measurement',
      'RectangleRoi': 'measurement',
      'CircleRoi': 'measurement',
      'ArrowAnnotate': 'arrow',
      'TextMarker': 'annotation',
      'FreehandRoi': 'freehand',
      'Rectangle': 'rectangle',
      'Ellipse': 'ellipse',
    };

    return toolMap[toolName] || 'annotation';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPendingTimeout();
    };
  }, [clearPendingTimeout]);

  return {
    // Auto-save function
    debouncedSave,
    handleCornerstoneEvent,

    // Status
    isSaving,
    lastSaveTime,
    saveError,
    hasPendingSave: pendingSaveRef.current !== null,

    // Control
    cancelPendingSave,
    forceSave,
    
    // Configuration
    isEnabled: enabled,
    debounceDelay: debounceMs,
  };
}

export default useAnnotationAutoSave;