// Types for Media Distribution (CD/Film) system

export interface MediaDistribution {
  id: number;
  request_date: string;
  // Legacy single study support
  daftar?: {
    id: number;
    pesakit: {
      id: number;
      nama: string;
      nric: string;
      mrn?: string;
    };
    tarikh: string;
    parent_accession_number: string;
    study_description?: string;
  };
  // New multiple studies support
  studies: {
    id: number;
    pesakit: {
      id: number;
      nama: string;
      nric: string;
      mrn?: string;
    };
    tarikh: string;
    parent_accession_number: string;
    study_description?: string;
  }[];
  study_count: number;
  patient_name: string;
  patient_mrn?: string;
  patient_nric: string;
  media_type: 'CD' | 'DVD' | 'XRAY_FILM' | 'USB' | 'DIGITAL_COPY';
  quantity: number;
  status: 'REQUESTED' | 'PREPARING' | 'READY' | 'COLLECTED' | 'CANCELLED';
  collected_by?: string;
  collected_by_ic?: string;
  relationship_to_patient?: string;
  collection_datetime?: string;
  prepared_by?: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  handed_over_by?: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  comments?: string;
  cancellation_reason?: string;
  urgency: 'NORMAL' | 'URGENT' | 'STAT';
  created: string;
  modified: string;
}

// List view interface with flattened fields from MediaDistributionListSerializer
export interface MediaDistributionListItem {
  id: number;
  request_date: string;
  media_type: 'CD' | 'DVD' | 'XRAY_FILM' | 'USB' | 'DIGITAL_COPY';
  quantity: number;
  status: 'REQUESTED' | 'PREPARING' | 'READY' | 'COLLECTED' | 'CANCELLED';
  urgency: 'NORMAL' | 'URGENT' | 'STAT';
  collected_by?: string;
  collected_by_ic?: string;
  relationship_to_patient?: string;
  collection_datetime?: string;
  patient_name: string;
  patient_mrn?: string;
  study_count: number;
  study_summary: {
    date_range: string;
    accession_numbers: string[];
    total_studies: number;
    study_descriptions: string[];
  };
  prepared_by_name?: string;
  handed_over_by_name?: string;
  cancellation_reason?: string;
  comments?: string;
}

export interface MediaDistributionRequest {
  study_ids: number[]; // New field for multiple studies
  daftar_ids?: number[]; // Legacy support
  daftar_id?: number; // Legacy single study support
  media_type: 'CD' | 'DVD' | 'XRAY_FILM' | 'USB' | 'DIGITAL_COPY';
  quantity: number;
  urgency: 'NORMAL' | 'URGENT' | 'STAT';
  comments?: string;
}

export interface MediaDistributionStats {
  total_distributions: number;
  status_breakdown: {
    REQUESTED: number;
    PREPARING: number;
    READY: number;
    COLLECTED: number;
    CANCELLED: number;
  };
  media_type_breakdown: {
    CD: number;
    DVD: number;
    XRAY_FILM: number;
    USB: number;
    DIGITAL_COPY: number;
  };
  urgency_breakdown: {
    NORMAL: number;
    URGENT: number;
    STAT: number;
  };
  recent_activity: {
    requests_last_30_days: number;
    collections_last_30_days: number;
  };
}

export interface CollectionDetails {
  collected_by: string;
  collected_by_ic: string;
  relationship_to_patient: string;
  collection_datetime?: string;
  comments?: string;
}

export interface MediaDistributionFilters {
  status?: 'REQUESTED' | 'PREPARING' | 'READY' | 'COLLECTED' | 'CANCELLED';
  media_type?: 'CD' | 'DVD' | 'X-Ray Film' | 'USB' | 'Digital Copy';
  urgency?: 'Normal' | 'Urgent' | 'STAT';
  patient_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// Study/Daftar minimal type for selection
export interface StudyForMediaDistribution {
  id: number;
  pesakit: {
    id: number;
    nama: string;
    nric: string;
    mrn?: string;
  };
  tarikh: string;
  parent_accession_number: string;
  study_description?: string;
  modality?: string;
  study_status: string;
  // Additional fields for media calculation
  image_count?: number;
  series_count?: number;
  estimated_size_mb?: number;
  study_time?: string; // Formatted time for same-day studies
  exam_details?: {
    exam_name: string;
    body_part?: string;
    laterality?: string;
    modality?: string;
    status?: string;
    xray_number?: string;
    technical_params?: {
      kv?: number;
      mas?: number;
      mgy?: number;
    };
  }[];
}

// API endpoints
export const MEDIA_DISTRIBUTION_ENDPOINTS = {
  LIST: '/api/media-distributions/',
  STATS: '/api/media-distributions/stats/',
  COLLECT: (id: number) => `/api/media-distributions/${id}/collect/`,
  MARK_READY: (id: number) => `/api/media-distributions/${id}/mark-ready/`,
  CANCEL: (id: number) => `/api/media-distributions/${id}/cancel/`,
  RESTORE: (id: number) => `/api/media-distributions/${id}/restore/`,
  PENDING: '/api/media-distributions/pending/',
  READY: '/api/media-distributions/ready/',
} as const;

// Form validation types
export interface MediaRequestFormData {
  patient_search: string;
  selected_studies: StudyForMediaDistribution[]; // Changed to support multiple studies
  media_type: 'CD' | 'DVD' | 'XRAY_FILM' | 'USB' | 'DIGITAL_COPY';
  quantity: number;
  urgency: 'NORMAL' | 'URGENT' | 'STAT';
  comments: string;
}

export interface CollectionFormData {
  collected_by: string;
  collected_by_ic: string;
  relationship_to_patient: string;
  comments: string;
}

// Status display configurations
export const MEDIA_STATUS_CONFIG = {
  REQUESTED: {
    label: 'Requested',
    color: 'bg-blue-100 text-blue-800',
    icon: '📋'
  },
  PREPARING: {
    label: 'Preparing',
    color: 'bg-yellow-100 text-yellow-800',
    icon: '⚙️'
  },
  READY: {
    label: 'Ready',
    color: 'bg-green-100 text-green-800',
    icon: '✅'
  },
  COLLECTED: {
    label: 'Collected',
    color: 'bg-gray-100 text-gray-800',
    icon: '📦'
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-800',
    icon: '❌'
  }
} as const;

export const MEDIA_TYPE_CONFIG = {
  'CD': { label: 'CD', icon: '💿' },
  'DVD': { label: 'DVD', icon: '📀' },
  'XRAY_FILM': { label: 'X-Ray Film', icon: '🎞️' },
  'USB': { label: 'USB Drive', icon: '💾' },
  'DIGITAL_COPY': { label: 'Digital Copy', icon: '📧' }
} as const;

export const URGENCY_CONFIG = {
  'NORMAL': { label: 'Normal', color: 'bg-gray-100 text-gray-800' },
  'URGENT': { label: 'Urgent', color: 'bg-orange-100 text-orange-800' },
  'STAT': { label: 'STAT', color: 'bg-red-100 text-red-800' }
} as const;

// Media capacity and size estimation constants
export const MEDIA_CAPACITY_MB = {
  'CD': 700,
  'DVD': 4700,
  'USB': 32000, // Assuming 32GB USB drives
  'DIGITAL_COPY': Infinity, // No physical limit
  'XRAY_FILM': 1 // Films are counted per study, not by size
} as const;

// Average study sizes by modality (in MB)
export const MODALITY_SIZE_ESTIMATES = {
  'XR': 30,   // X-Ray/CR/DR
  'CR': 30,
  'DR': 30,
  'DX': 30,
  'CT': 300,  // CT scans
  'MR': 500,  // MRI
  'MRI': 500,
  'US': 100,  // Ultrasound
  'MG': 50,   // Mammography
  'RF': 100,  // Fluoroscopy
  'DEFAULT': 50
} as const;

// Utility functions for quantity calculation
const estimateImageCount = (modality?: string, examCount: number = 1): number => {
  const modalityType = modality?.toUpperCase();
  switch (modalityType) {
    case 'CT':
      return examCount * 200; // CT scans typically 100-300 images per series
    case 'MR':
    case 'MRI':
      return examCount * 150; // MRI typically 50-200 images per series
    case 'US':
      return examCount * 50; // Ultrasound varies widely
    case 'MG':
      return examCount * 4; // Mammography typically 4 views
    case 'RF':
      return examCount * 20; // Fluoroscopy varies
    case 'XR':
    case 'CR':
    case 'DR':
    case 'DX':
    default:
      return examCount * 2; // X-rays typically 1-3 images per exam
  }
};

const estimateStudySize = (modality?: string, imageCount?: number): number => {
  const baseSize = MODALITY_SIZE_ESTIMATES[modality as keyof typeof MODALITY_SIZE_ESTIMATES] || MODALITY_SIZE_ESTIMATES.DEFAULT;
  // If we have image count, use it as a multiplier (rough estimation)
  if (imageCount && imageCount > 1) {
    const avgImageSize = modality?.match(/^(CT|MR|MRI)$/) ? 2 : 0.5; // MB per image
    return Math.max(baseSize, imageCount * avgImageSize);
  }
  return baseSize;
};

const calculateTotalSize = (studies: StudyForMediaDistribution[]): number => {
  return studies.reduce((total, study) => {
    const estimatedSize = study.estimated_size_mb || 
      estimateStudySize(study.modality, study.image_count);
    return total + estimatedSize;
  }, 0);
};

const calculateRecommendedQuantity = (studies: StudyForMediaDistribution[], mediaType: keyof typeof MEDIA_CAPACITY_MB): number => {
  if (mediaType === 'XRAY_FILM') {
    // For films, count unique studies (usually 1 film per study for X-rays)
    return studies.filter(study => study.modality?.match(/^(XR|CR|DR|DX)$/)).length || 1;
  }

  if (mediaType === 'DIGITAL_COPY') {
    return 1; // Always 1 for digital copies
  }

  const totalSize = calculateTotalSize(studies);
  const capacity = MEDIA_CAPACITY_MB[mediaType];
  
  if (capacity === Infinity) return 1;
  
  return Math.max(1, Math.ceil(totalSize / capacity));
};

const validateQuantity = (studies: StudyForMediaDistribution[], mediaType: keyof typeof MEDIA_CAPACITY_MB, quantity: number): {
  isValid: boolean;
  message?: string;
  recommendation?: number;
} => {
  const totalSize = calculateTotalSize(studies);
  const capacity = MEDIA_CAPACITY_MB[mediaType];
  const totalCapacity = capacity * quantity;
  
  if (mediaType === 'DIGITAL_COPY') {
    return { isValid: true };
  }

  if (mediaType === 'XRAY_FILM') {
    const xrayStudies = studies.filter(study => study.modality?.match(/^(XR|CR|DR|DX)$/)).length;
    if (quantity < xrayStudies) {
      return {
        isValid: false,
        message: `Need at least ${xrayStudies} films for ${xrayStudies} X-ray studies`,
        recommendation: xrayStudies
      };
    }
    return { isValid: true };
  }

  if (totalSize > totalCapacity) {
    const recommended = Math.ceil(totalSize / capacity);
    return {
      isValid: false,
      message: `Studies total ${Math.round(totalSize)}MB, need ${recommended} ${mediaType}s`,
      recommendation: recommended
    };
  }

  return { isValid: true };
};

export const MediaCalculationUtils = {
  estimateImageCount,
  estimateStudySize,
  calculateTotalSize,
  calculateRecommendedQuantity,
  validateQuantity
} as const;