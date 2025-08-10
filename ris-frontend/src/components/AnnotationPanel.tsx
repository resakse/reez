'use client';

import React, { useMemo } from 'react';
import { Trash2, User, Calendar, Ruler, MessageSquare, ArrowRight, Square, Circle, Edit3, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAnnotations } from '@/hooks/useAnnotations';
import { toast } from '@/lib/toast';
import type { DicomAnnotation, AnnotationType } from '@/types/annotations';

interface AnnotationPanelProps {
  studyUid: string;
  currentImageId?: string;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

// Icon mapping for annotation types
const annotationTypeIcons: Record<AnnotationType, React.ComponentType<{ className?: string }>> = {
  measurement: Ruler,
  annotation: MessageSquare,
  arrow: ArrowRight,
  rectangle: Square,
  ellipse: Circle,
  freehand: Edit3,
};

// Color mapping for annotation types
const annotationTypeColors: Record<AnnotationType, string> = {
  measurement: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  annotation: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  arrow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  rectangle: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  ellipse: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  freehand: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

// Format timestamp for display
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffInHours < 24) {
    // Show relative time for recent annotations
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60);
      return diffInMinutes <= 0 ? 'Just now' : `${diffInMinutes} min ago`;
    }
    return `${Math.floor(diffInHours)}h ago`;
  }
  
  // Show date for older annotations
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

// Annotation item component
const AnnotationItem: React.FC<{
  annotation: DicomAnnotation;
  onDelete: (id: number) => Promise<void>;
  onToggleVisibility?: (annotation: DicomAnnotation) => void;
  isCurrentImage?: boolean;
}> = ({ annotation, onDelete, onToggleVisibility, isCurrentImage }) => {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [currentVisibility, setCurrentVisibility] = React.useState<boolean>(true);
  const IconComponent = annotationTypeIcons[annotation.annotation_type];

  // Default to visible since annotations are restored on page load
  React.useEffect(() => {
    setCurrentVisibility(true);
  }, []);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!annotation.can_delete) {
      toast.error('You can only delete your own annotations');
      return;
    }

    // Simple confirmation without using browser confirm
    setIsDeleting(true);
    
    try {
      await onDelete(annotation.id);
      // Don't show toast here - the hook already shows success/error toasts
    } catch (error) {
      // Error toast is already shown by the hook
      console.error('Failed to delete annotation:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleVisibility) {
      // Update local visibility state optimistically
      setCurrentVisibility(!currentVisibility);
      onToggleVisibility(annotation);
    }
  };

  const hasMeasurement = annotation.measurement_value !== null && 
                        annotation.measurement_value !== undefined && 
                        annotation.measurement_value > 0;

  return (
    <Card 
      className={`transition-all duration-200 hover:shadow-md cursor-pointer ${
        isCurrentImage ? 'ring-2 ring-primary/20 bg-accent/5' : 'hover:bg-accent/5'
      }`}
      onClick={handleToggleVisibility}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header with type badge and timestamp */}
            <div className="flex items-center justify-between">
              <Badge 
                variant="outline" 
                className={`flex items-center gap-1.5 ${annotationTypeColors[annotation.annotation_type]}`}
              >
                <IconComponent className="w-3 h-3" />
                <span className="capitalize font-medium">
                  {annotation.annotation_type}
                </span>
              </Badge>
              <div className="flex items-center gap-2">
                {currentVisibility ? (
                  <Eye className="w-3 h-3 text-green-600 opacity-80" title="Annotation is visible - click to hide" />
                ) : (
                  <EyeOff className="w-3 h-3 text-red-600 opacity-80" title="Annotation is hidden - click to show" />
                )}
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(annotation.created_at)}
                </span>
              </div>
            </div>

            {/* User information */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground">{annotation.user_full_name}</span>
              {isCurrentImage && (
                <Badge variant="secondary" className="text-xs">
                  Current Image
                </Badge>
              )}
            </div>

            {/* Label */}
            {annotation.label && (
              <div className="font-medium text-foreground">
                {annotation.label}
              </div>
            )}

            {/* Measurement display */}
            {hasMeasurement && (
              <div className="flex items-center gap-2 text-sm">
                <Ruler className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-mono font-medium">
                  {annotation.measurement_value.toFixed(2)} {annotation.measurement_unit || 'px'}
                </span>
              </div>
            )}

            {/* Description */}
            {annotation.description && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2 border-l-2 border-muted-foreground/20">
                {annotation.description}
              </div>
            )}

            {/* Image reference for multi-image studies */}
            {!isCurrentImage && (
              <div className="text-xs text-muted-foreground font-mono bg-muted/30 rounded px-2 py-1 truncate">
                Image: {annotation.image_id ? (annotation.image_id.split('/').pop() || annotation.image_id) : 'Current'}
              </div>
            )}
          </div>

          {/* Delete button */}
          {annotation.can_delete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 shrink-0 h-8 w-8"
              aria-label="Delete annotation"
            >
              {isDeleting ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Loading skeleton component
const AnnotationSkeleton: React.FC = () => (
  <Card>
    <CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </CardContent>
  </Card>
);

// Empty state component
const EmptyState: React.FC<{ hasCurrentImage: boolean }> = ({ hasCurrentImage }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
      <Ruler className="w-8 h-8 text-muted-foreground/50" />
    </div>
    <h3 className="font-medium text-foreground mb-2">No annotations found</h3>
    <p className="text-sm text-muted-foreground max-w-sm">
      {hasCurrentImage
        ? 'Start creating annotations by using the measurement and drawing tools in the viewer.'
        : 'No annotations have been created for this study yet.'
      }
    </p>
  </div>
);

// Error state component
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <Alert className="mx-4">
    <AlertCircle className="h-4 w-4" />
    <div className="flex-1">
      <h4 className="font-medium">Failed to load annotations</h4>
      <p className="text-sm text-muted-foreground mt-1">{error}</p>
    </div>
    <Button variant="outline" size="sm" onClick={onRetry}>
      Retry
    </Button>
  </Alert>
);

// Main component
export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  studyUid,
  currentImageId,
  isVisible = true,
  onToggleVisibility
}) => {
  const { 
    annotations, 
    loading, 
    error, 
    deleteAnnotation, 
    refreshAnnotations,
    stats
  } = useAnnotations({ studyUid });

  // Listen for annotation saved events to refresh the panel immediately
  React.useEffect(() => {
    const handleAnnotationSaved = (event: CustomEvent) => {
      if (event.detail.studyUid === studyUid) {
        refreshAnnotations();
      }
    };

    const handleAnnotationsRestored = (event: CustomEvent) => {
      if (event.detail.studyUid === studyUid) {
        console.log(`Annotation panel: ${event.detail.count} annotations restored, refreshing panel`);
        refreshAnnotations();
      }
    };

    window.addEventListener('annotationSaved', handleAnnotationSaved as EventListener);
    window.addEventListener('annotationsRestored', handleAnnotationsRestored as EventListener);
    
    return () => {
      window.removeEventListener('annotationSaved', handleAnnotationSaved as EventListener);
      window.removeEventListener('annotationsRestored', handleAnnotationsRestored as EventListener);
    };
  }, [studyUid, refreshAnnotations]);

  // Group annotations by current image and others
  const { currentImageAnnotations, otherAnnotations } = useMemo(() => {
    if (!currentImageId) {
      return {
        currentImageAnnotations: [],
        otherAnnotations: annotations
      };
    }

    const current: DicomAnnotation[] = [];
    const others: DicomAnnotation[] = [];

    annotations.forEach(annotation => {
      if (annotation.image_id === currentImageId) {
        current.push(annotation);
      } else {
        others.push(annotation);
      }
    });

    return {
      currentImageAnnotations: current,
      otherAnnotations: others
    };
  }, [annotations, currentImageId]);

  const handleDeleteAnnotation = async (annotationId: number) => {
    await deleteAnnotation(annotationId);
  };

  const handleToggleAnnotationVisibility = (annotation: DicomAnnotation) => {
    // Since we don't have cornerstone UIDs anymore, this is just a UI state toggle
    // The actual annotation restoration/visibility is handled at page load
    toast.info('Annotation visibility toggle - UI state only');
  };

  const handleRetry = () => {
    refreshAnnotations();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Annotations</h3>
            <Badge variant="secondary" className="text-xs">
              {stats.total}
            </Badge>
          </div>
          {onToggleVisibility && (
            <Button variant="ghost" size="sm" onClick={onToggleVisibility}>
              Hide
            </Button>
          )}
        </div>

        {/* Statistics */}
        {stats.total > 0 && (
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>{stats.currentUserCount} by you</span>
            {stats.withMeasurements > 0 && (
              <span>{stats.withMeasurements} with measurements</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <AnnotationSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={handleRetry} />
          </div>
        ) : annotations.length === 0 ? (
          <EmptyState hasCurrentImage={!!currentImageId} />
        ) : (
          <ScrollArea className="flex-1" style={{ height: 'calc(100vh - 200px)', maxHeight: '1000px' }}>
            <div className="p-4 space-y-4">
              {/* Current image annotations */}
              {currentImageAnnotations.length > 0 && (
                <div className="space-y-3">
                  {currentImageId && (
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Current Image ({currentImageAnnotations.length})
                    </h4>
                  )}
                  {currentImageAnnotations.map((annotation) => (
                    <AnnotationItem
                      key={annotation.id}
                      annotation={annotation}
                      onDelete={handleDeleteAnnotation}
                      onToggleVisibility={handleToggleAnnotationVisibility}
                      isCurrentImage={true}
                    />
                  ))}
                </div>
              )}

              {/* Other annotations */}
              {otherAnnotations.length > 0 && (
                <div className="space-y-3">
                  {currentImageAnnotations.length > 0 && (
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Other Images ({otherAnnotations.length})
                    </h4>
                  )}
                  {otherAnnotations.map((annotation) => (
                    <AnnotationItem
                      key={annotation.id}
                      annotation={annotation}
                      onDelete={handleDeleteAnnotation}
                      onToggleVisibility={handleToggleAnnotationVisibility}
                      isCurrentImage={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default AnnotationPanel;