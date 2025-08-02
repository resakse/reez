import AuthService from './auth';
import { 
  MediaDistribution, 
  MediaDistributionRequest, 
  MediaDistributionStats, 
  MediaDistributionFilters,
  CollectionDetails,
  StudyForMediaDistribution,
  MEDIA_DISTRIBUTION_ENDPOINTS,
  MediaCalculationUtils
} from '@/types/media-distribution';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class MediaDistributionAPI {
  
  // Get all media distributions with optional filters
  static async getMediaDistributions(filters?: MediaDistributionFilters): Promise<{
    count: number;
    results: MediaDistribution[];
  }> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    
    const url = `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.LIST}${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await AuthService.authenticatedFetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch media distributions');
    }
    
    return await response.json();
  }

  // Get a specific media distribution
  static async getMediaDistribution(id: number): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.LIST}${id}/`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch media distribution');
    }
    
    return await response.json();
  }

  // Create a new media distribution request
  static async createMediaDistribution(request: MediaDistributionRequest): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.LIST}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to create media distribution request');
    }
    
    return await response.json();
  }

  // Update media distribution
  static async updateMediaDistribution(id: number, updates: Partial<MediaDistributionRequest>): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.LIST}${id}/`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to update media distribution');
    }
    
    return await response.json();
  }

  // Delete media distribution
  static async deleteMediaDistribution(id: number): Promise<void> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.LIST}${id}/`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to delete media distribution');
    }
  }

  // Mark media distribution as ready for collection
  static async markReady(id: number): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.MARK_READY(id)}`,
      {
        method: 'PATCH',
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to mark media distribution as ready');
    }
    
    return await response.json();
  }

  // Record collection of media distribution
  static async recordCollection(id: number, collectionDetails: CollectionDetails): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.COLLECT(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(collectionDetails),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to record collection');
    }
    
    return await response.json();
  }

  // Cancel media distribution
  static async cancelDistribution(id: number, reason?: string): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.CANCEL(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to cancel media distribution');
    }
    
    return await response.json();
  }

  // Restore cancelled media distribution
  static async restoreDistribution(id: number): Promise<MediaDistribution> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.RESTORE(id)}`,
      {
        method: 'PATCH',
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to restore media distribution');
    }
    
    return await response.json();
  }

  // Get pending distributions (REQUESTED + PREPARING)
  static async getPendingDistributions(): Promise<MediaDistribution[]> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.PENDING}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch pending distributions');
    }
    
    return await response.json();
  }

  // Get ready distributions
  static async getReadyDistributions(): Promise<MediaDistribution[]> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.READY}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch ready distributions');
    }
    
    return await response.json();
  }

  // Get statistics
  static async getStats(): Promise<MediaDistributionStats> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}${MEDIA_DISTRIBUTION_ENDPOINTS.STATS}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch statistics');
    }
    
    return await response.json();
  }

  // Search studies for media distribution (patient studies)
  static async searchStudiesForMedia(patientSearch: string): Promise<StudyForMediaDistribution[]> {
    const params = new URLSearchParams({
      search: patientSearch,
      limit: '20', // Increased limit to show more options
      study_status: 'COMPLETED' // Only completed studies can have media distributed
    });
    
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}/api/registrations/?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to search studies');
    }
    
    const data = await response.json();
    
    // Transform the data to include exam details and estimated information
    const results = (data.results || []).map((study: any) => {
      // Calculate estimated size based on exams and modality
      const examDetails = study.pemeriksaan?.map((exam: any) => ({
        exam_name: exam.exam?.exam || 'Unknown Exam',
        body_part: exam.exam?.part?.part || null,
        laterality: exam.laterality || null,
        modality: exam.exam?.modaliti?.singkatan || study.modality,
        status: exam.exam_status,
        xray_number: exam.no_xray,
        technical_params: {
          kv: exam.kv,
          mas: exam.mas,
          mgy: exam.mgy
        }
      })) || [];
      
      // Estimate image count based on exam types and modality
      const modalityType = study.modality || examDetails[0]?.modality || 'XR';
      const imageCount = MediaCalculationUtils.estimateImageCount(modalityType, examDetails.length);
      const estimatedSize = MediaCalculationUtils.estimateStudySize(modalityType, imageCount);
      
      return {
        ...study,
        exam_details: examDetails,
        image_count: imageCount,
        series_count: examDetails.length || 1,
        estimated_size_mb: estimatedSize,
        // Add formatted study time for same-day differentiation
        study_time: study.tarikh ? new Date(study.tarikh).toLocaleTimeString('en-MY', {
          hour: '2-digit',
          minute: '2-digit'
        }) : null
      };
    });
    
    return results;
  }

  // Get studies for a specific patient
  static async getPatientStudies(patientId: number): Promise<StudyForMediaDistribution[]> {
    const response = await AuthService.authenticatedFetch(
      `${API_BASE_URL}/api/registrations/?pesakit=${patientId}&study_status=COMPLETED`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch patient studies');
    }
    
    const data = await response.json();
    return data.results || [];
  }
}

// Utility functions for formatting and validation
export const MediaDistributionUtils = {
  
  // Format dates consistently
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Validate Malaysian IC or passport format
  validateIC(ic: string): boolean {
    // Malaysian IC format: 123456-12-1234
    const icRegex = /^\d{6}-\d{2}-\d{4}$/;
    // Passport format: Allow alphanumeric, 6-15 characters
    const passportRegex = /^[A-Z0-9]{6,15}$/i;
    
    return icRegex.test(ic) || passportRegex.test(ic);
  },

  // Format IC number (only format Malaysian IC, leave passports as-is)
  formatIC(ic: string): string {
    // Check if it looks like a Malaysian IC (all digits)
    const cleaned = ic.replace(/\D/g, '');
    if (cleaned.length === 12 && /^\d+$/.test(ic.replace(/-/g, ''))) {
      return `${cleaned.slice(0, 6)}-${cleaned.slice(6, 8)}-${cleaned.slice(8, 12)}`;
    }
    // For passports and other formats, return as-is but uppercase
    return ic.toUpperCase().trim();
  },

  // Get urgency priority for sorting
  getUrgencyPriority(urgency: string): number {
    switch (urgency) {
      case 'STAT': return 3;
      case 'URGENT': return 2;
      case 'NORMAL': return 1;
      default: return 0;
    }
  },

  // Get status priority for sorting
  getStatusPriority(status: string): number {
    switch (status) {
      case 'REQUESTED': return 4;
      case 'PREPARING': return 3;
      case 'READY': return 2;
      case 'COLLECTED': return 1;
      case 'CANCELLED': return 0;
      default: return 0;
    }
  },

  // Generate collection receipt text
  generateReceiptText(distribution: MediaDistribution): string {
    const { daftar, media_type, quantity, collected_by, collected_by_ic, collection_datetime } = distribution;
    
    return `
Media Distribution Receipt
========================

Patient: ${daftar.pesakit.nama}
MRN: ${daftar.pesakit.mrn || 'N/A'}
Study Date: ${new Date(daftar.tarikh).toLocaleDateString()}
Study: ${daftar.study_description || 'N/A'}

Media Type: ${media_type}
Quantity: ${quantity}

Collected By: ${collected_by}
IC Number: ${collected_by_ic}
Collection Date: ${collection_datetime ? new Date(collection_datetime).toLocaleDateString() : 'N/A'}

========================
Thank you for using our service.
    `.trim();
  }
};