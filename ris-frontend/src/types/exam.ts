// Types for the updated examination system with parent-child hierarchy

export interface Patient {
  id: number;
  nama: string;
  nric: string;
  mrn?: string;
  jantina: 'L' | 'P';
  bangsa: string;
  umur?: string;
  alamat?: string;
  telefon?: string;
  email?: string;
  catatan?: string;
  t_lahir?: string;
  kira_umur?: number;
}

export interface Ward {
  id: number;
  wad: string;
}

export interface Modaliti {
  id: number;
  nama: string;
  singkatan: string;
  detail?: string;
}

export interface Part {
  id: number;
  part: string;
}

export interface Exam {
  id: number;
  exam: string;
  short_desc?: string;
  part?: Part;
  modaliti: Modaliti;
  catatan?: string;
  contrast: boolean;
  status_ca: 'ENABLE' | 'DISABLE';
}

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

// Study (formerly Daftar) with parent-child hierarchy
export interface Study {
  id: number;
  tarikh: string;
  pesakit: Patient;
  
  // Basic study information
  no_resit?: string;
  lmp?: string;
  rujukan?: Ward;
  ambulatori: string;
  pemohon?: string;
  hamil: boolean;
  jxr?: User;
  
  // Parent-child hierarchy fields
  parent_accession_number: string;
  requested_procedure_id: string;
  study_description?: string;
  study_status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  
  // MWL integration fields
  study_instance_uid: string;
  accession_number?: string; // Legacy field
  scheduled_datetime?: string;
  study_priority: 'STAT' | 'HIGH' | 'MEDIUM' | 'LOW';
  requested_procedure_description?: string;
  study_comments?: string;
  patient_position?: string;
  modality?: string;
  
  // Child examinations
  pemeriksaan?: Examination[];
  
  // Timestamps
  created: string;
  modified: string;
}

// Examination (Pemeriksaan) with positioning and status
export interface Examination {
  id: number;
  daftar: number; // Study ID
  
  // Individual examination identifiers
  accession_number: string;
  no_xray?: string; // Legacy field
  scheduled_step_id: string;
  
  // Examination details
  exam: Exam;
  laterality?: 'Kiri' | 'Kanan';
  
  // Positioning information
  patient_position?: 'AP' | 'PA' | 'LAT' | 'LATERAL_LEFT' | 'LATERAL_RIGHT' | 'OBLIQUE';
  body_position?: 'ERECT' | 'SUPINE' | 'PRONE' | 'DECUBITUS_LEFT' | 'DECUBITUS_RIGHT';
  
  // Technical parameters
  kv?: number;
  mas?: number;
  mgy?: number;
  
  // Status and metadata
  exam_status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  sequence_number: number;
  catatan?: string; // Radiographer comments
  
  // Staff and timestamps
  jxr?: User;
  created: string;
  modified: string;
}

// Position choices for dropdowns
export interface PositionChoices {
  patient_positions: Array<{
    value: string;
    label: string;
  }>;
  body_positions: Array<{
    value: string;
    label: string;
  }>;
  laterality_choices: Array<{
    value: string;
    label: string;
  }>;
}

// API request/response types

export interface GroupedExaminationRequest {
  // Study data
  study_description?: string;
  modality: string;
  study_priority?: 'STAT' | 'HIGH' | 'MEDIUM' | 'LOW';
  scheduled_datetime?: string;
  study_comments?: string;
  
  // Patient and study metadata
  pesakit_id: number;
  rujukan_id?: number;
  pemohon?: string;
  no_resit?: string;
  lmp?: string;
  ambulatori?: string;
  hamil?: boolean;
  
  // Multiple examinations
  examinations: Array<{
    exam_id: number;
    laterality?: 'Kiri' | 'Kanan';
    patient_position?: 'AP' | 'PA' | 'LAT' | 'LATERAL_LEFT' | 'LATERAL_RIGHT' | 'OBLIQUE';
    body_position?: 'ERECT' | 'SUPINE' | 'PRONE' | 'DECUBITUS_LEFT' | 'DECUBITUS_RIGHT';
    catatan?: string;
    kv?: number;
    mas?: number;
    mgy?: number;
  }>;
}

export interface GroupedExaminationResponse {
  study: Study;
  examinations: Examination[];
  message: string;
}

// MWL (Modality Worklist) types for CR machine integration

export interface MWLExamination {
  accession_number: string;
  scheduled_step_id: string;
  exam_description: string;
  exam_short_desc?: string;
  body_part?: string;
  patient_position?: string;
  body_position?: string;
  laterality?: string;
  sequence_number: number;
  exam_status: string;
  catatan?: string;
}

export interface GroupedMWLEntry {
  id: number;
  patient_name: string;
  patient_id: string;
  patient_birth_date?: string;
  patient_gender: string;
  
  // Parent study information
  parent_accession_number: string;
  study_description?: string;
  study_instance_uid: string;
  study_status: string;
  study_priority: string;
  
  // Study metadata
  tarikh: string;
  referring_physician?: string;
  scheduled_datetime?: string;
  modality?: string;
  
  // Child examinations
  examinations: MWLExamination[];
}

export interface GroupedMWLResponse {
  count: number;
  results: GroupedMWLEntry[];
}

// Form types for registration

export interface ExaminationFormData {
  exam_id: number;
  laterality?: string;
  patient_position?: string;
  body_position?: string;
  catatan?: string;
  kv?: number;
  mas?: number;
  mgy?: number;
}

export interface GroupedRegistrationForm {
  // Patient selection
  pesakit_id: number;
  
  // Study information
  study_description: string;
  modality: string;
  study_priority: 'STAT' | 'HIGH' | 'MEDIUM' | 'LOW';
  scheduled_datetime?: string;
  study_comments?: string;
  
  // Registration metadata
  rujukan_id?: number;
  pemohon?: string;
  no_resit?: string;
  lmp?: string;
  ambulatori: string;
  hamil: boolean;
  
  // Multiple examinations
  examinations: ExaminationFormData[];
}

// API endpoints
export const API_ENDPOINTS = {
  // Grouped examinations
  GROUPED_EXAMINATIONS: '/api/examinations/grouped/',
  GROUPED_MWL: '/api/mwl/grouped/',
  POSITION_CHOICES: '/api/choices/positions/',
  
  // Legacy endpoints (for compatibility)
  MWL_WORKLIST: '/api/mwl/worklist/',
  REGISTRATION_WORKFLOW: '/api/registration/workflow/',
  
  // Master data
  MODALITIES: '/api/modalities/',
  PARTS: '/api/parts/',
  EXAMS: '/api/exams/',
  PATIENTS: '/api/patients/',
  WARDS: '/api/rujukan/',
} as const;