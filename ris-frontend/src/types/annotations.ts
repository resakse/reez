/**
 * Comprehensive TypeScript interfaces and types for the DICOM annotation system
 * 
 * This file defines all the types needed for the persistent DICOM annotation
 * functionality including database models, API requests/responses, form data,
 * and React component interfaces.
 */

// ============================================================================
// Core Annotation Types
// ============================================================================

/**
 * Available annotation types that can be created in the DICOM viewer
 */
export type AnnotationType = 
  | 'measurement' 
  | 'annotation' 
  | 'arrow' 
  | 'rectangle' 
  | 'ellipse' 
  | 'freehand';

/**
 * Study priority levels for annotations
 */
export type StudyPriority = 'STAT' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Annotation status for tracking lifecycle
 */
export type AnnotationStatus = 'DRAFT' | 'COMPLETED' | 'MODIFIED' | 'DELETED';

// ============================================================================
// Core DicomAnnotation Interface (matches Django backend model)
// ============================================================================

/**
 * Main annotation interface that matches the Django DicomAnnotation model
 */
export interface DicomAnnotation {
  // Primary key and relationships
  id: number;
  pacs_exam: number;
  user: number;
  
  // DICOM/Image identification
  study_instance_uid: string;
  series_instance_uid: string;
  sop_instance_uid: string;
  image_id: string;
  frame_number: number;
  
  // Annotation core data
  annotation_type: AnnotationType;
  annotation_data: CornerstoneAnnotationData;
  cornerstone_annotation_uid?: string; // For visibility control with Cornerstone3D
  
  // Metadata
  label?: string;
  description?: string;
  
  // Measurement specific fields
  measurement_value?: number;
  measurement_unit?: string;
  
  // Timestamps
  created_at: string;
  modified_at: string;
  
  // Computed fields from API
  user_full_name: string;
  can_delete: boolean;
}

// ============================================================================
// Cornerstone3D Integration Types
// ============================================================================

/**
 * Cornerstone annotation data structure
 * This represents the actual annotation data as stored by Cornerstone3D
 */
export interface CornerstoneAnnotationData {
  // Common fields for all annotation types
  annotationUID?: string;
  isLocked?: boolean;
  isVisible?: boolean;
  metadata?: {
    toolName: string;
    referencedImageId: string;
    FrameOfReferenceUID?: string;
    seriesInstanceUID?: string;
    sopInstanceUID?: string;
  };
  
  // Measurement specific data
  handles?: {
    points?: number[][];
    activeHandleIndex?: number;
  };
  
  // Text annotations
  text?: {
    textBox?: {
      text: string;
      hasMoved: boolean;
      worldPosition?: number[];
      worldBoundingBox?: {
        topLeft?: number[];
        topRight?: number[];
        bottomLeft?: number[];
        bottomRight?: number[];
      };
    };
  };
  
  // Cached statistics for measurements
  cachedStats?: {
    length?: number;
    lengthUnits?: string;
    area?: number;
    areaUnits?: string;
    mean?: number;
    stdDev?: number;
    min?: number;
    max?: number;
    modalityUnit?: string;
  };
  
  // Styling information
  style?: {
    color?: string;
    lineWidth?: number;
    lineDash?: string;
    fillColor?: string;
    fillOpacity?: number;
  };
  
  // Additional data for specific annotation types
  [key: string]: any;
}

/**
 * Cornerstone event data when annotations are created/modified
 */
export interface CornerstoneAnnotationEvent {
  detail: {
    annotation: {
      annotationUID: string;
      data: CornerstoneAnnotationData;
      metadata: {
        toolName: string;
        referencedImageId: string;
        FrameOfReferenceUID: string;
        seriesInstanceUID: string;
        sopInstanceUID: string;
      };
      imageId: string;
    };
    changeType: 'completed' | 'modified' | 'removed' | 'added';
    viewportId: string;
    renderingEngineId: string;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request payload for creating a new annotation
 */
export interface CreateAnnotationRequest {
  // Required DICOM identification
  study_instance_uid: string;
  series_instance_uid: string;
  sop_instance_uid: string;
  image_id: string;
  frame_number?: number;
  
  // Annotation data
  annotation_type: AnnotationType;
  annotation_data: CornerstoneAnnotationData;
  cornerstone_annotation_uid?: string; // Store Cornerstone3D annotation UID
  
  // Optional metadata
  label?: string;
  description?: string;
  measurement_value?: number;
  measurement_unit?: string;
  
  // Optional PACS exam reference
  pacs_exam?: number;
}

/**
 * Request payload for updating an existing annotation
 */
export interface UpdateAnnotationRequest {
  id: number;
  annotation_data?: CornerstoneAnnotationData;
  cornerstone_annotation_uid?: string;
  label?: string;
  description?: string;
  measurement_value?: number;
  measurement_unit?: string;
}

/**
 * API response for annotation list endpoints
 */
export interface AnnotationListResponse {
  count: number;
  next?: string;
  previous?: string;
  results: DicomAnnotation[];
}

/**
 * API response for single annotation endpoints
 */
export interface AnnotationResponse {
  success: boolean;
  data: DicomAnnotation;
  message?: string;
}

/**
 * API response for batch operations
 */
export interface BatchAnnotationResponse {
  success: boolean;
  created: DicomAnnotation[];
  updated: DicomAnnotation[];
  deleted: number[];
  errors?: Array<{
    id?: number;
    error: string;
    details?: any;
  }>;
}

// ============================================================================
// Form and UI Types
// ============================================================================

/**
 * Form data for annotation creation/editing
 */
export interface AnnotationFormData {
  label: string;
  description: string;
  annotation_type: AnnotationType;
  measurement_value?: number;
  measurement_unit?: string;
}

/**
 * Form validation errors
 */
export interface AnnotationFormErrors {
  label?: string[];
  description?: string[];
  annotation_type?: string[];
  measurement_value?: string[];
  measurement_unit?: string[];
  non_field_errors?: string[];
}

/**
 * Props for annotation list components
 */
export interface AnnotationListProps {
  studyUid: string;
  imageId?: string;
  onAnnotationSelect?: (annotation: DicomAnnotation) => void;
  onAnnotationDelete?: (annotationId: number) => void;
  showUserFilter?: boolean;
  showTypeFilter?: boolean;
}

/**
 * Props for annotation form components
 */
export interface AnnotationFormProps {
  annotation?: DicomAnnotation;
  onSave: (data: AnnotationFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  errors?: AnnotationFormErrors;
}

/**
 * Props for annotation panel component
 */
export interface AnnotationPanelProps {
  studyUid: string;
  currentImageId?: string;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

// ============================================================================
// Hook Types and Parameters
// ============================================================================

/**
 * Parameters for the useAnnotations hook
 */
export interface UseAnnotationsParams {
  studyUid?: string;
  imageId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

/**
 * Return type for the useAnnotations hook
 */
export interface UseAnnotationsReturn {
  // Data
  annotations: DicomAnnotation[];
  loading: boolean;
  error: string | null;
  lastFetch: Date | null;
  stats: {
    total: number;
    byType: Record<AnnotationType, number>;
    withMeasurements: number;
    currentUserCount: number;
  };
  currentUserAnnotations: DicomAnnotation[];
  
  // Actions
  createAnnotation: (data: CreateAnnotationRequest) => Promise<DicomAnnotation>;
  updateAnnotation: (id: number, data: Partial<UpdateAnnotationRequest>) => Promise<DicomAnnotation>;
  deleteAnnotation: (id: number) => Promise<void>;
  refreshAnnotations: () => Promise<void>;
  
  // Filters and utilities
  getAnnotationsByType: (type: AnnotationType) => DicomAnnotation[];
  getAnnotationsByImage: (imageId: string) => DicomAnnotation[];
  getUserAnnotations: (userId: number) => DicomAnnotation[];
  
  // Utilities
  clearError: () => void;
  fetchWithFilters: (filters?: AnnotationFilters) => Promise<void>;
}

/**
 * Parameters for the useAnnotationAutoSave hook
 */
export interface UseAnnotationAutoSaveParams {
  studyUid: string;
  enabled?: boolean;
  debounceMs?: number;
  onSaveSuccess?: (annotation: DicomAnnotation) => void;
  onSaveError?: (error: Error) => void;
}

/**
 * Return type for the useAnnotationAutoSave hook
 */
export interface UseAnnotationAutoSaveReturn {
  // Auto-save function
  debouncedSave: (annotationData: CreateAnnotationRequest) => Promise<void>;
  handleCornerstoneEvent: (event: CornerstoneAnnotationEvent) => Promise<void>;
  
  // Status
  isSaving: boolean;
  lastSaveTime?: Date;
  saveError?: string;
  hasPendingSave: boolean;
  
  // Control
  cancelPendingSave: () => void;
  forceSave: () => Promise<void>;
  
  // Configuration
  isEnabled: boolean;
  debounceDelay: number;
}

// ============================================================================
// Filter and Search Types
// ============================================================================

/**
 * Filter options for annotation queries
 */
export interface AnnotationFilters {
  study_uid?: string;
  series_uid?: string;
  image_id?: string;
  annotation_type?: AnnotationType;
  user_id?: number;
  date_from?: string;
  date_to?: string;
  has_measurements?: boolean;
  search?: string; // Search in label and description
}

/**
 * Sort options for annotation lists
 */
export interface AnnotationSortOptions {
  field: 'created_at' | 'modified_at' | 'user_full_name' | 'annotation_type' | 'label';
  direction: 'asc' | 'desc';
}

// ============================================================================
// Error Handling Types
// ============================================================================

/**
 * Specific error types for annotation operations
 */
export interface AnnotationError {
  type: 'NETWORK_ERROR' | 'VALIDATION_ERROR' | 'PERMISSION_ERROR' | 'NOT_FOUND' | 'SERVER_ERROR';
  message: string;
  details?: any;
  statusCode?: number;
}

/**
 * Error boundary props for annotation components
 */
export interface AnnotationErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: AnnotationError; onRetry?: () => void }>;
  onError?: (error: AnnotationError) => void;
}

// ============================================================================
// Export Configuration and Utility Types
// ============================================================================

/**
 * Export options for annotations
 */
export interface AnnotationExportOptions {
  format: 'JSON' | 'CSV' | 'DICOM_SR';
  includeImageData?: boolean;
  includeUserData?: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
  annotationTypes?: AnnotationType[];
}

/**
 * Import options for annotations
 */
export interface AnnotationImportOptions {
  format: 'JSON' | 'DICOM_SR';
  overwriteExisting?: boolean;
  validateImageReferences?: boolean;
  assignToCurrentUser?: boolean;
}

// ============================================================================
// Tab Interface Types
// ============================================================================

/**
 * Tab configuration for right panel
 */
export interface RightPanelTab {
  id: 'patient' | 'report' | 'annotations';
  label: string;
  component: React.ComponentType<any>;
  badge?: number | string;
  disabled?: boolean;
}

/**
 * Props for the right panel tabs component
 */
export interface RightPanelTabsProps {
  studyUid: string;
  patientData?: any;
  studyData?: any;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  annotationCount?: number;
  examinations?: any[]; // For reporting panel
}

// ============================================================================
// API Endpoint Constants
// ============================================================================

/**
 * API endpoints for annotation operations
 */
export const ANNOTATION_API_ENDPOINTS = {
  // CRUD operations
  ANNOTATIONS: '/api/annotations/',
  ANNOTATION_DETAIL: (id: number) => `/api/annotations/${id}/`,
  
  // Query endpoints
  BY_STUDY: '/api/annotations/by_study/',
  BY_IMAGE: '/api/annotations/by_image/',
  BY_USER: '/api/annotations/by_user/',
  
  // Batch operations
  BATCH_CREATE: '/api/annotations/batch_create/',
  BATCH_UPDATE: '/api/annotations/batch_update/',
  BATCH_DELETE: '/api/annotations/batch_delete/',
  
  // Export/Import
  EXPORT: '/api/annotations/export/',
  IMPORT: '/api/annotations/import/',
  
  // Statistics
  STATS: '/api/annotations/stats/',
  USER_STATS: '/api/annotations/user_stats/',
} as const;

// ============================================================================
// Default Values and Constants
// ============================================================================

/**
 * Default values for annotation creation
 */
export const ANNOTATION_DEFAULTS = {
  FRAME_NUMBER: 1,
  AUTO_SAVE_DEBOUNCE_MS: 1000,
  REFRESH_INTERVAL_MS: 30000,
  MAX_LABEL_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000,
} as const;

/**
 * Measurement units
 */
export const MEASUREMENT_UNITS = {
  LENGTH: ['mm', 'cm', 'px'],
  AREA: ['mm²', 'cm²', 'px²'],
  VOLUME: ['mm³', 'cm³', 'ml'],
  ANGLE: ['°', 'rad'],
  DENSITY: ['HU', 'mg/cm³'],
} as const;

/**
 * Annotation type display names
 */
export const ANNOTATION_TYPE_NAMES: Record<AnnotationType, string> = {
  measurement: 'Measurement',
  annotation: 'Text Annotation',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  freehand: 'Freehand Drawing',
} as const;

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if an object is a valid DicomAnnotation
 */
export function isDicomAnnotation(obj: any): obj is DicomAnnotation {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'number' &&
    typeof obj.study_instance_uid === 'string' &&
    typeof obj.annotation_type === 'string' &&
    typeof obj.user_full_name === 'string' &&
    typeof obj.can_delete === 'boolean'
  );
}

/**
 * Type guard to check if an annotation type is valid
 */
export function isValidAnnotationType(type: string): type is AnnotationType {
  return ['measurement', 'annotation', 'arrow', 'rectangle', 'ellipse', 'freehand'].includes(type);
}

/**
 * Type guard to check if an error is an AnnotationError
 */
export function isAnnotationError(error: any): error is AnnotationError {
  return (
    error &&
    typeof error === 'object' &&
    typeof error.type === 'string' &&
    typeof error.message === 'string'
  );
}

// ============================================================================
// Utility Type Helpers
// ============================================================================

/**
 * Make certain fields optional for update operations
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract specific fields from DicomAnnotation for API requests
 */
export type AnnotationApiFields = Pick<DicomAnnotation, 
  'study_instance_uid' | 
  'series_instance_uid' | 
  'sop_instance_uid' | 
  'image_id' | 
  'annotation_type' | 
  'annotation_data' | 
  'cornerstone_annotation_uid' |
  'label' | 
  'description' | 
  'measurement_value' | 
  'measurement_unit'
>;

/**
 * Readonly version of DicomAnnotation for display purposes
 */
export type ReadonlyDicomAnnotation = Readonly<DicomAnnotation>;

/**
 * Annotation with optional fields for form state
 */
export type AnnotationFormState = PartialBy<AnnotationApiFields, 
  'study_instance_uid' | 
  'series_instance_uid' | 
  'sop_instance_uid' | 
  'image_id' | 
  'annotation_data'
>;