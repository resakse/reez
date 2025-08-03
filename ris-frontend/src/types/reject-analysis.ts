// Types for the reject analysis system

export interface RejectCategory {
  id: number;
  nama: string;
  nama_english: string;
  keterangan?: string;
  description?: string;
  color_code?: string;
  position: number;
  is_active: boolean;
  created: string;
  modified: string;
}

export interface RejectIncident {
  id: number;
  study_instance_uid: string;
  accession_number: string;
  patient_name: string;
  patient_mrn?: string;
  exam_date: string;
  modality: string;
  exam_description: string;
  
  // Reject details
  category: RejectCategory;
  subcategory?: string;
  reason_detail: string;
  reason_detail_english: string;
  
  // Staff and timing
  reported_by: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  incident_date: string;
  retake_performed: boolean;
  retake_date?: string;
  
  // Analysis
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  corrective_action?: string;
  corrective_action_english?: string;
  follow_up_required: boolean;
  follow_up_completed: boolean;
  follow_up_date?: string;
  
  // Metadata
  created: string;
  modified: string;
}

export interface MonthlyRejectAnalysis {
  id: number;
  year: number;
  month: number;
  month_name: string;
  
  // Statistics
  total_examinations: number;
  total_rejects: number;
  total_retakes: number;
  reject_rate: number;
  retake_rate: number;
  
  // Category breakdown
  category_breakdown: Array<{
    category: RejectCategory;
    count: number;
    percentage: number;
    trend_change?: number; // Percentage change from previous month
  }>;
  
  // Modality breakdown
  modality_breakdown: Array<{
    modality: string;
    total_exams: number;
    rejects: number;
    reject_rate: number;
  }>;
  
  // Quality metrics
  target_reject_rate: number;
  meets_target: boolean;
  improvement_rate?: number; // Percentage improvement from previous month
  
  // Analysis notes
  analysis_notes?: string;
  analysis_notes_english?: string;
  action_items?: string;
  action_items_english?: string;
  
  // Staff who performed analysis
  analyzed_by?: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  analysis_date?: string;
  
  // Status
  status: 'DRAFT' | 'COMPLETED' | 'APPROVED';
  approved_by?: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  approval_date?: string;
  
  // Metadata
  created: string;
  modified: string;
}

export interface RejectTrendData {
  month: string;
  year: number;
  month_num: number;
  total_examinations: number;
  total_rejects: number;
  reject_rate: number;
  target_rate: number;
  meets_target: boolean;
}

export interface RejectStatistics {
  // Current month
  current_month_rejects: number;
  current_month_exams: number;
  current_reject_rate: number;
  
  // Previous month comparison
  previous_month_rejects: number;
  previous_month_exams: number;
  previous_reject_rate: number;
  month_to_month_change: number;
  
  // Year to date
  ytd_rejects: number;
  ytd_examinations: number;
  ytd_reject_rate: number;
  
  // Target comparison
  target_reject_rate: number;
  meets_current_target: boolean;
  meets_ytd_target: boolean;
  
  // Top categories this month
  top_categories: Array<{
    category: RejectCategory;
    count: number;
    percentage: number;
  }>;
  
  // Worst performing modalities
  worst_modalities: Array<{
    modality: string;
    reject_rate: number;
    count: number;
  }>;
}

// Form types
export interface RejectCategoryFormData {
  nama: string;
  nama_english: string;
  keterangan?: string;
  description?: string;
  color_code?: string;
  is_active: boolean;
}

export interface RejectIncidentFormData {
  study_instance_uid: string;
  accession_number: string;
  patient_name: string;
  patient_mrn?: string;
  exam_date: string;
  modality: string;
  exam_description: string;
  
  category_id: number;
  subcategory?: string;
  reason_detail: string;
  reason_detail_english: string;
  
  incident_date: string;
  retake_performed: boolean;
  retake_date?: string;
  
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  corrective_action?: string;
  corrective_action_english?: string;
  follow_up_required: boolean;
}

export interface MonthlyAnalysisFormData {
  year: number;
  month: number;
  target_reject_rate: number;
  analysis_notes?: string;
  analysis_notes_english?: string;
  action_items?: string;
  action_items_english?: string;
  status: 'DRAFT' | 'COMPLETED';
}

// API response types
export interface RejectAnalysisListResponse {
  count: number;
  next?: string;
  previous?: string;
  results: MonthlyRejectAnalysis[];
}

export interface RejectIncidentListResponse {
  count: number;
  next?: string;
  previous?: string;
  results: RejectIncident[];
}

export interface RejectCategoryListResponse {
  count: number;
  next?: string;
  previous?: string;
  results: RejectCategory[];
}

// Search and filter types
export interface RejectAnalysisFilters {
  year?: number;
  month?: number;
  status?: 'DRAFT' | 'COMPLETED' | 'APPROVED';
  meets_target?: boolean;
  ordering?: string;
}

export interface RejectIncidentFilters {
  date_from?: string;
  date_to?: string;
  category_id?: number;
  modality?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  retake_performed?: boolean;
  follow_up_required?: boolean;
  ordering?: string;
  search?: string;
}

// Language support
export interface BilingualText {
  en: string;
  ms: string;
}

export type Language = 'en' | 'ms';

// Chart data types
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  percentage?: number;
}

export interface TrendChartData {
  month: string;
  reject_rate: number;
  target_rate: number;
  total_rejects: number;
  total_examinations: number;
}

// API endpoints

// Severity colors and labels
export const SEVERITY_CONFIG = {
  LOW: {
    label: 'Low',
    label_ms: 'Rendah',
    color: 'bg-green-100 text-green-800',
    badge_color: 'bg-green-500',
  },
  MEDIUM: {
    label: 'Medium',
    label_ms: 'Sederhana',
    color: 'bg-yellow-100 text-yellow-800',
    badge_color: 'bg-yellow-500',
  },
  HIGH: {
    label: 'High',
    label_ms: 'Tinggi',
    color: 'bg-orange-100 text-orange-800',
    badge_color: 'bg-orange-500',
  },
  CRITICAL: {
    label: 'Critical',
    label_ms: 'Kritikal',
    color: 'bg-red-100 text-red-800',
    badge_color: 'bg-red-500',
  },
} as const;

// Status colors and labels
export const STATUS_CONFIG = {
  DRAFT: {
    label: 'Draft',
    label_ms: 'Draf',
    color: 'bg-gray-100 text-gray-800',
  },
  COMPLETED: {
    label: 'Completed',
    label_ms: 'Selesai',
    color: 'bg-blue-100 text-blue-800',
  },
  APPROVED: {
    label: 'Approved',
    label_ms: 'Diluluskan',
    color: 'bg-green-100 text-green-800',
  },
} as const;

// Default reject rate targets
export const DEFAULT_TARGET_RATES = {
  XRAY: 5.0, // 5% for X-Ray
  CT: 1.5,   // 1.5% for CT
  MRI: 1.0,  // 1% for MRI
  ULTRASOUND: 1.5, // 1.5% for Ultrasound
  MAMMOGRAPHY: 3.0, // 3% for Mammography
  OVERALL: 5.0, // 5% overall target
} as const;