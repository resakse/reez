// Types for Media Distribution (CD/Film) system

export interface MediaDistribution {
  id: number;
  request_date: string;
  daftar: {
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
  collection_datetime?: string;
  patient_name: string;
  patient_mrn?: string;
  study_accession: string;
  study_date: string;
  study_description?: string;
  prepared_by_name?: string;
  handed_over_by_name?: string;
}

export interface MediaDistributionRequest {
  daftar_id: number;
  media_type: 'CD' | 'DVD' | 'X-Ray Film' | 'USB' | 'Digital Copy';
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
}

// API endpoints
export const MEDIA_DISTRIBUTION_ENDPOINTS = {
  LIST: '/api/media-distributions/',
  STATS: '/api/media-distributions/stats/',
  COLLECT: (id: number) => `/api/media-distributions/${id}/collect/`,
  MARK_READY: (id: number) => `/api/media-distributions/${id}/mark-ready/`,
  CANCEL: (id: number) => `/api/media-distributions/${id}/cancel/`,
  PENDING: '/api/media-distributions/pending/',
  READY: '/api/media-distributions/ready/',
} as const;

// Form validation types
export interface MediaRequestFormData {
  patient_search: string;
  selected_study?: StudyForMediaDistribution;
  media_type: 'CD' | 'DVD' | 'X-Ray Film' | 'USB' | 'Digital Copy';
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