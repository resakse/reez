# DICOM Annotation Hooks Usage Examples

This document provides comprehensive examples of how to use the DICOM annotation hooks in your React components.

## useAnnotations Hook

The main hook for DICOM annotation CRUD operations.

```typescript
import { useAnnotations } from '@/hooks/useAnnotations';
import { toast } from '@/lib/toast';

function AnnotationManager({ studyUid }: { studyUid: string }) {
  const {
    annotations,
    loading,
    error,
    stats,
    currentUserAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    refreshAnnotations,
    getAnnotationsByType,
    clearError,
  } = useAnnotations({
    studyUid,
    autoRefresh: true,
    refreshInterval: 30000, // 30 seconds
  });

  const handleCreateAnnotation = async () => {
    try {
      await createAnnotation({
        study_instance_uid: studyUid,
        series_instance_uid: '1.2.3.4.5.6',
        sop_instance_uid: '1.2.3.4.5.7',
        image_id: 'wadouri:http://example.com/image.dcm',
        annotation_type: 'measurement',
        annotation_data: {
          // Cornerstone annotation data
          handles: {
            points: [[100, 100], [200, 200]],
          },
          cachedStats: {
            length: 50.5,
            lengthUnits: 'mm',
          },
        },
        label: 'Distance measurement',
        measurement_value: 50.5,
        measurement_unit: 'mm',
      });
    } catch (error) {
      console.error('Failed to create annotation:', error);
    }
  };

  const handleDeleteAnnotation = async (id: number) => {
    if (confirm('Are you sure you want to delete this annotation?')) {
      try {
        await deleteAnnotation(id);
      } catch (error) {
        console.error('Failed to delete annotation:', error);
      }
    }
  };

  if (loading) return <div>Loading annotations...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <div className="mb-4">
        <h2>Annotations ({stats.total})</h2>
        <p>Your annotations: {stats.currentUserCount}</p>
        <p>With measurements: {stats.withMeasurements}</p>
        <button onClick={handleCreateAnnotation}>Create Test Annotation</button>
        <button onClick={refreshAnnotations}>Refresh</button>
        {error && <button onClick={clearError}>Clear Error</button>}
      </div>
      
      <div>
        {annotations.map((annotation) => (
          <div key={annotation.id} className="border p-4 mb-2">
            <h3>{annotation.annotation_type} - {annotation.label}</h3>
            <p>By: {annotation.user_full_name}</p>
            <p>Created: {new Date(annotation.created_at).toLocaleString()}</p>
            {annotation.measurement_value && (
              <p>Value: {annotation.measurement_value} {annotation.measurement_unit}</p>
            )}
            {annotation.can_delete && (
              <button 
                onClick={() => handleDeleteAnnotation(annotation.id)}
                className="text-red-600"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3>By Type:</h3>
        {Object.entries(stats.byType).map(([type, count]) => (
          <div key={type}>
            {type}: {count} annotations
            <ul>
              {getAnnotationsByType(type as any).map(ann => (
                <li key={ann.id}>{ann.label || 'Unlabeled'}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## useAnnotationAutoSave Hook

The auto-save hook for seamless Cornerstone integration.

```typescript
import { useAnnotationAutoSave } from '@/hooks/useAnnotationAutoSave';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useCallback, useEffect } from 'react';

function DicomViewerWithAutoSave({ studyUid }: { studyUid: string }) {
  const { refreshAnnotations } = useAnnotations({ studyUid });
  
  const {
    debouncedSave,
    handleCornerstoneEvent,
    isSaving,
    lastSaveTime,
    saveError,
    hasPendingSave,
    cancelPendingSave,
    forceSave,
    isEnabled,
    debounceDelay,
  } = useAnnotationAutoSave({
    studyUid,
    enabled: true,
    debounceMs: 1000, // 1 second debounce
    onSaveSuccess: (annotation) => {
      console.log('Annotation auto-saved:', annotation.id);
      refreshAnnotations(); // Refresh the list to show new annotation
    },
    onSaveError: (error) => {
      console.error('Auto-save failed:', error);
    },
  });

  // Manual save example
  const handleManualSave = async () => {
    try {
      await debouncedSave({
        study_instance_uid: studyUid,
        series_instance_uid: '1.2.3.4.5.6',
        sop_instance_uid: '1.2.3.4.5.7',
        image_id: 'wadouri:http://example.com/image.dcm',
        annotation_type: 'annotation',
        annotation_data: {
          text: {
            textBox: {
              text: 'Manual annotation',
              hasMoved: false,
            },
          },
        },
        label: 'Manual annotation',
      });
    } catch (error) {
      console.error('Manual save failed:', error);
    }
  };

  // Cornerstone event integration
  useEffect(() => {
    // This would typically be set up in your Cornerstone viewer component
    const handleAnnotationModified = (evt: any) => {
      handleCornerstoneEvent(evt);
    };

    // Example: Set up Cornerstone event listeners
    // element.addEventListener('annotationModified', handleAnnotationModified);
    // element.addEventListener('annotationCompleted', handleAnnotationModified);

    return () => {
      // Cleanup event listeners
      // element.removeEventListener('annotationModified', handleAnnotationModified);
      // element.removeEventListener('annotationCompleted', handleAnnotationModified);
    };
  }, [handleCornerstoneEvent]);

  return (
    <div>
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h3>Auto-save Status</h3>
        <p>Enabled: {isEnabled ? 'Yes' : 'No'}</p>
        <p>Debounce delay: {debounceDelay}ms</p>
        <p>Currently saving: {isSaving ? 'Yes' : 'No'}</p>
        <p>Has pending save: {hasPendingSave ? 'Yes' : 'No'}</p>
        {lastSaveTime && <p>Last saved: {lastSaveTime.toLocaleString()}</p>}
        {saveError && <p className="text-red-600">Error: {saveError}</p>}
      </div>

      <div className="mb-4 space-x-2">
        <button onClick={handleManualSave}>Manual Save</button>
        <button onClick={cancelPendingSave} disabled={!hasPendingSave}>
          Cancel Pending Save
        </button>
        <button onClick={forceSave} disabled={!hasPendingSave}>
          Force Save Now
        </button>
      </div>

      {/* Your DICOM viewer component would go here */}
      <div className="border-2 border-dashed border-gray-300 p-8 text-center">
        <p>DICOM Viewer Component</p>
        <p>Annotations will auto-save when created/modified</p>
      </div>
    </div>
  );
}
```

## Complete Integration Example

Here's how you might integrate both hooks in a complete DICOM viewer component:

```typescript
import React, { useCallback, useEffect } from 'react';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useAnnotationAutoSave } from '@/hooks/useAnnotationAutoSave';
import { toast } from '@/lib/toast';

interface DicomViewerProps {
  studyUid: string;
  currentImageId?: string;
}

function CompleteDicomViewer({ studyUid, currentImageId }: DicomViewerProps) {
  // Main annotations hook
  const {
    annotations,
    loading,
    error,
    stats,
    createAnnotation,
    deleteAnnotation,
    getAnnotationsByImage,
    clearError,
  } = useAnnotations({
    studyUid,
    autoRefresh: false, // We'll manage refresh manually
  });

  // Auto-save hook
  const {
    handleCornerstoneEvent,
    isSaving,
    saveError,
    cancelPendingSave,
    isEnabled,
  } = useAnnotationAutoSave({
    studyUid,
    enabled: true,
    debounceMs: 1500, // Slightly longer debounce for less frequent saves
    onSaveSuccess: (annotation) => {
      toast.success(`${annotation.annotation_type} saved automatically`);
      // Could refresh annotations here if needed
    },
    onSaveError: (error) => {
      toast.error(`Auto-save failed: ${error.message}`);
    },
  });

  // Get annotations for current image
  const currentImageAnnotations = currentImageId 
    ? getAnnotationsByImage(currentImageId)
    : [];

  // Handle annotation deletion with confirmation
  const handleDeleteWithConfirmation = useCallback(async (id: number) => {
    const annotation = annotations.find(a => a.id === id);
    if (!annotation) return;

    const confirmed = confirm(
      `Delete ${annotation.annotation_type} "${annotation.label || 'Unlabeled'}"?`
    );
    
    if (confirmed) {
      try {
        await deleteAnnotation(id);
        toast.success('Annotation deleted');
      } catch (error) {
        // Error already handled by hook and toast shown
      }
    }
  }, [annotations, deleteAnnotation]);

  // Component lifecycle effects
  useEffect(() => {
    // Set up Cornerstone event listeners here
    // This is where you'd integrate with your actual Cornerstone viewer
    const setupCornerstoneListeners = () => {
      // Example event listener setup
      // const element = document.getElementById('dicom-viewer');
      // if (element) {
      //   element.addEventListener('annotationModified', handleCornerstoneEvent);
      //   element.addEventListener('annotationCompleted', handleCornerstoneEvent);
      // }
    };

    setupCornerstoneListeners();

    return () => {
      // Cleanup event listeners
      cancelPendingSave(); // Cancel any pending saves on unmount
    };
  }, [handleCornerstoneEvent, cancelPendingSave]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error(`Annotation error: ${error}`);
    }
    if (saveError) {
      toast.error(`Save error: ${saveError}`);
    }
  }, [error, saveError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2">Loading annotations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main viewer area */}
      <div className="flex-1 relative">
        {/* DICOM viewer would go here */}
        <div id="dicom-viewer" className="h-full bg-black">
          {/* Cornerstone viewer component */}
        </div>
        
        {/* Auto-save indicator */}
        {isSaving && (
          <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded">
            Auto-saving...
          </div>
        )}
      </div>

      {/* Annotation sidebar */}
      <div className="w-80 bg-gray-50 border-l overflow-y-auto">
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">
            Annotations ({currentImageAnnotations.length})
          </h3>

          {/* Status indicators */}
          <div className="mb-4 text-sm text-gray-600">
            <div>Total annotations: {stats.total}</div>
            <div>Auto-save: {isEnabled ? 'Enabled' : 'Disabled'}</div>
            {error && (
              <div className="text-red-600">
                {error}
                <button onClick={clearError} className="ml-2 underline">
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Annotation list */}
          <div className="space-y-3">
            {currentImageAnnotations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No annotations on current image
              </p>
            ) : (
              currentImageAnnotations.map((annotation) => (
                <div key={annotation.id} className="bg-white p-3 rounded border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium capitalize">
                        {annotation.annotation_type}
                      </h4>
                      {annotation.label && (
                        <p className="text-sm text-gray-600">{annotation.label}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        By {annotation.user_full_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(annotation.created_at).toLocaleString()}
                      </p>
                      {annotation.measurement_value && (
                        <p className="text-sm font-medium text-blue-600">
                          {annotation.measurement_value} {annotation.measurement_unit}
                        </p>
                      )}
                    </div>
                    {annotation.can_delete && (
                      <button
                        onClick={() => handleDeleteWithConfirmation(annotation.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete annotation"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary by type */}
          {stats.total > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-medium mb-2">By Type</h4>
              <div className="space-y-1 text-sm">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div key={type} className="flex justify-between">
                    <span className="capitalize">{type}:</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompleteDicomViewer;
```

## Key Features

### useAnnotations Hook
- ✅ **CRUD Operations**: Create, read, update, delete annotations
- ✅ **Filtering**: By study UID, image ID, annotation type, user, date range
- ✅ **Statistics**: Count by type, measurements, current user annotations
- ✅ **Error Handling**: Comprehensive error states and user feedback
- ✅ **Loading States**: Track loading state for all operations
- ✅ **Auto-refresh**: Optional automatic data refresh
- ✅ **Authentication Integration**: Uses existing AuthService for JWT tokens
- ✅ **Toast Notifications**: User-friendly success/error messages

### useAnnotationAutoSave Hook
- ✅ **Debounced Auto-save**: 1-second default delay to reduce API calls
- ✅ **Cornerstone Integration**: Direct event handler for Cornerstone3D
- ✅ **Save Status Tracking**: Know when saves are in progress or completed
- ✅ **Error Recovery**: Graceful handling of network errors
- ✅ **Manual Controls**: Cancel pending saves or force immediate save
- ✅ **Configurable**: Enable/disable, custom debounce timing
- ✅ **Data Mapping**: Automatic conversion from Cornerstone to API format

## Best Practices

1. **Use auto-refresh sparingly** - Only enable when necessary to avoid unnecessary API calls
2. **Handle errors gracefully** - Always provide user feedback for failed operations
3. **Debounce saves appropriately** - 1-2 seconds is usually optimal for auto-save
4. **Clean up on unmount** - Cancel pending operations when components unmount
5. **Filter annotations by image** - Don't load all study annotations if you only need current image
6. **Provide loading feedback** - Show spinners/indicators during operations
7. **Confirm deletions** - Always ask for confirmation before deleting annotations