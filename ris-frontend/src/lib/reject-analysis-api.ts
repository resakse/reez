import AuthService from './auth';
import { toast } from './toast';
import type {
  RejectCategory,
  RejectCategoryFormData,
  RejectIncident,
  RejectIncidentFormData,
  RejectIncidentFilters,
  MonthlyRejectAnalysis,
  MonthlyAnalysisFormData,
  RejectAnalysisFilters,
  RejectStatistics,
  RejectTrendData,
  RejectCategoryListResponse,
  RejectIncidentListResponse,
  RejectAnalysisListResponse,
} from '@/types/reject-analysis';
import type { PacsServer } from './pacs';

/**
 * API service for reject analysis system
 * Provides CRUD operations and data fetching for reject categories, incidents, and monthly analysis
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

// API endpoints for reject analysis
const REJECT_ANALYSIS_ENDPOINTS = {
  CATEGORIES: '/api/reject-categories/',
  INCIDENTS: '/api/reject-incidents/',
  MONTHLY_ANALYSIS: '/api/reject-analyses/',
  STATISTICS: '/api/reject-analysis/statistics/',
  TRENDS: '/api/reject-analysis/trends/',
  CATEGORY_REORDER: '/api/reject-categories/reorder/',
  REASON_REORDER: '/api/reject-reasons/reorder/',
  TARGET_SETTINGS: '/api/reject-analysis-target-settings/',
  // Export endpoints would be added here when implemented
} as const;

/**
 * Helper function to build query parameters
 */
function buildQueryParams(params: Record<string, any>): string {
  const urlParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      urlParams.append(key, value.toString());
    }
  });
  
  return urlParams.toString();
}

/**
 * Reject Categories API
 */
export const rejectCategoriesApi = {
  /**
   * Get all reject categories with optional filtering
   */
  async getCategories(filters?: { 
    is_active?: boolean; 
    search?: string; 
    ordering?: string;
    page?: number;
    page_size?: number;
  }): Promise<RejectCategoryListResponse> {
    try {
      const params = buildQueryParams(filters || {});
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORIES}${params ? `?${params}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reject categories: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching reject categories:', error);
      toast.error('Failed to load reject categories');
      throw error;
    }
  },

  /**
   * Get a single reject category by ID
   */
  async getCategory(id: number): Promise<RejectCategory> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORIES}${id}/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reject category: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching reject category:', error);
      toast.error('Failed to load reject category');
      throw error;
    }
  },

  /**
   * Create a new reject category
   */
  async createCategory(data: RejectCategoryFormData): Promise<RejectCategory> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORIES}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create reject category: ${response.statusText}`);
      }
      
      const category = await response.json();
      toast.success('Reject category created successfully');
      return category;
    } catch (error) {
      console.error('Error creating reject category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create reject category');
      throw error;
    }
  },

  /**
   * Update an existing reject category
   */
  async updateCategory(id: number, data: RejectCategoryFormData): Promise<RejectCategory> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORIES}${id}/`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update reject category: ${response.statusText}`);
      }
      
      const category = await response.json();
      toast.success('Reject category updated successfully');
      return category;
    } catch (error) {
      console.error('Error updating reject category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update reject category');
      throw error;
    }
  },

  /**
   * Delete a reject category
   */
  async deleteCategory(id: number): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORIES}${id}/`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete reject category: ${response.statusText}`);
      }
      
      toast.success('Reject category deleted successfully');
    } catch (error) {
      console.error('Error deleting reject category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete reject category');
      throw error;
    }
  },

  /**
   * Reorder reject categories
   */
  async reorderCategories(categories: Array<{id: number; position: number}>): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.CATEGORY_REORDER}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category_orders: categories }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to reorder categories: ${response.statusText}`);
      }
      
      toast.success('Category order updated successfully');
    } catch (error) {
      console.error('Error reordering categories:', error);
      toast.error('Failed to update category order');
      throw error;
    }
  },

  /**
   * Reorder reasons within a category
   */
  async reorderReasons(categoryId: number, reasons: Array<{id: number; position: number}>): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.REASON_REORDER}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            category_id: categoryId,
            reason_orders: reasons 
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to reorder reasons: ${response.statusText}`);
      }
      
      toast.success('Reason order updated successfully');
    } catch (error) {
      console.error('Error reordering reasons:', error);
      toast.error('Failed to update reason order');
      throw error;
    }
  },
};

/**
 * Reject Reasons API
 */
export const rejectReasonsApi = {
  /**
   * Create a new reject reason
   */
  async createReason(data: any): Promise<any> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/reject-reasons/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create reason: ${response.statusText}`);
      }
      
      const reason = await response.json();
      toast.success('Reason created successfully');
      return reason;
    } catch (error) {
      console.error('Error creating reason:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create reason');
      throw error;
    }
  },

  /**
   * Update an existing reject reason
   */
  async updateReason(id: number, data: any): Promise<any> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/reject-reasons/${id}/`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update reason: ${response.statusText}`);
      }
      
      const reason = await response.json();
      toast.success('Reason updated successfully');
      return reason;
    } catch (error) {
      console.error('Error updating reason:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update reason');
      throw error;
    }
  },

  /**
   * Delete a reject reason
   */
  async deleteReason(id: number): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/reject-reasons/${id}/`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete reason: ${response.statusText}`);
      }
      
      toast.success('Reason deleted successfully');
    } catch (error) {
      console.error('Error deleting reason:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete reason');
      throw error;
    }
  },
};

/**
 * Reject Incidents API
 */
export const rejectIncidentsApi = {
  /**
   * Get reject incidents with filtering and pagination
   */
  async getIncidents(filters?: RejectIncidentFilters): Promise<RejectIncidentListResponse> {
    try {
      const params = buildQueryParams(filters || {});
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}${params ? `?${params}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reject incidents: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching reject incidents:', error);
      toast.error('Failed to load reject incidents');
      throw error;
    }
  },

  /**
   * Get a single reject incident by ID
   */
  async getIncident(id: number): Promise<RejectIncident> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}${id}/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reject incident: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching reject incident:', error);
      toast.error('Failed to load reject incident');
      throw error;
    }
  },

  /**
   * Create multiple reject incidents for a single date (bulk creation)
   */
  async createBulkDailyIncidents(data: {
    date: string;
    rejects: Record<string, number>; // reason_id -> count
  }): Promise<{
    success: boolean;
    message: string;
    incidents_created: number;
    date: string;
  }> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}bulk-daily-create/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create bulk incidents: ${response.statusText}`);
      }
      
      const result = await response.json();
      // Don't show toast here since the calling component will handle it
      return result;
    } catch (error) {
      console.error('Error creating bulk incidents:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to log daily rejects');
      throw error;
    }
  },

  /**
   * Create a new reject incident
   */
  async createIncident(data: RejectIncidentFormData): Promise<RejectIncident> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create reject incident: ${response.statusText}`);
      }
      
      const incident = await response.json();
      toast.success('Reject incident logged successfully');
      return incident;
    } catch (error) {
      console.error('Error creating reject incident:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to log reject incident');
      throw error;
    }
  },

  /**
   * Update an existing reject incident
   */
  async updateIncident(id: number, data: Partial<RejectIncidentFormData>): Promise<RejectIncident> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}${id}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update reject incident: ${response.statusText}`);
      }
      
      const incident = await response.json();
      toast.success('Reject incident updated successfully');
      return incident;
    } catch (error) {
      console.error('Error updating reject incident:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update reject incident');
      throw error;
    }
  },

  /**
   * Delete a reject incident
   */
  async deleteIncident(id: number): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}${id}/`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete reject incident: ${response.statusText}`);
      }
      
      toast.success('Reject incident deleted successfully');
    } catch (error) {
      console.error('Error deleting reject incident:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete reject incident');
      throw error;
    }
  },

  /**
   * Get daily reject summaries for calendar display
   */
  async getDailySummaries(filters?: { 
    start_date?: string; 
    end_date?: string; 
    month?: string;
    year?: number;
  }): Promise<Array<{
    date: string;
    total_rejects: number;
    categories: Array<{
      category_name: string;
      count: number;
    }>;
  }>> {
    try {
      const params = buildQueryParams(filters || {});
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.INCIDENTS}daily-summary/${params ? `?${params}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch daily summaries: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching daily summaries:', error);
      // Don't show toast error for this since it might not exist yet
      return [];
    }
  },

  /**
   * Export reject incidents to CSV/Excel
   */
  async exportIncidents(filters?: RejectIncidentFilters, format: 'csv' | 'excel' = 'csv'): Promise<Blob> {
    try {
      const params = buildQueryParams({ ...filters, format });
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.EXPORT_INCIDENTS}${params ? `?${params}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to export incidents: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      toast.success('Incidents exported successfully');
      return blob;
    } catch (error) {
      console.error('Error exporting incidents:', error);
      toast.error('Failed to export incidents');
      throw error;
    }
  },
};

/**
 * Monthly Reject Analysis API
 */
export const monthlyAnalysisApi = {
  /**
   * Get monthly reject analyses with filtering
   */
  async getAnalyses(filters?: RejectAnalysisFilters): Promise<RejectAnalysisListResponse> {
    try {
      const params = buildQueryParams(filters || {});
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}${params ? `?${params}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch monthly analyses: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching monthly analyses:', error);
      toast.error('Failed to load monthly analyses');
      throw error;
    }
  },

  /**
   * Get a single monthly analysis by ID
   */
  async getAnalysis(id: number): Promise<MonthlyRejectAnalysis> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}${id}/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch monthly analysis: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching monthly analysis:', error);
      toast.error('Failed to load monthly analysis');
      throw error;
    }
  },

  /**
   * Create a new monthly analysis
   */
  async createAnalysis(data: MonthlyAnalysisFormData): Promise<MonthlyRejectAnalysis> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create monthly analysis: ${response.statusText}`);
      }
      
      const analysis = await response.json();
      toast.success('Monthly analysis created successfully');
      return analysis;
    } catch (error) {
      console.error('Error creating monthly analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create monthly analysis');
      throw error;
    }
  },

  /**
   * Update an existing monthly analysis
   */
  async updateAnalysis(id: number, data: Partial<MonthlyAnalysisFormData>): Promise<MonthlyRejectAnalysis> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}${id}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update monthly analysis: ${response.statusText}`);
      }
      
      const analysis = await response.json();
      toast.success('Monthly analysis updated successfully');
      return analysis;
    } catch (error) {
      console.error('Error updating monthly analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update monthly analysis');
      throw error;
    }
  },

  /**
   * Approve a monthly analysis (superuser only)
   */
  async approveAnalysis(id: number): Promise<MonthlyRejectAnalysis> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}${id}/approve/`,
        {
          method: 'POST',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to approve monthly analysis: ${response.statusText}`);
      }
      
      const analysis = await response.json();
      toast.success('Monthly analysis approved successfully');
      return analysis;
    } catch (error) {
      console.error('Error approving monthly analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to approve monthly analysis');
      throw error;
    }
  },

  /**
   * Delete a monthly analysis
   */
  async deleteAnalysis(id: number): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.MONTHLY_ANALYSIS}${id}/`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete monthly analysis: ${response.statusText}`);
      }
      
      toast.success('Monthly analysis deleted successfully');
    } catch (error) {
      console.error('Error deleting monthly analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete monthly analysis');
      throw error;
    }
  },

  /**
   * Export monthly analysis to PDF/Excel
   */
  async exportAnalysis(id: number, format: 'pdf' | 'excel' = 'pdf'): Promise<Blob> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.EXPORT_ANALYSIS}${id}/?format=${format}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to export analysis: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      toast.success('Analysis exported successfully');
      return blob;
    } catch (error) {
      console.error('Error exporting analysis:', error);
      toast.error('Failed to export analysis');
      throw error;
    }
  },
};

/**
 * Statistics and Trends API
 */
export const statisticsApi = {
  /**
   * Get current reject statistics
   */
  async getStatistics(): Promise<RejectStatistics> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.STATISTICS}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching statistics:', error);
      toast.error('Failed to load statistics');
      throw error;
    }
  },

  /**
   * Get reject trends data for charts
   */
  async getTrends(params?: {
    months?: number;
    year?: number;
    modality?: string;
  }): Promise<RejectTrendData[]> {
    try {
      const queryParams = buildQueryParams(params || {});
      const url = `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.TRENDS}${queryParams ? `?${queryParams}` : ''}`;
      
      const response = await AuthService.authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch trends: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast.error('Failed to load trends data');
      throw error;
    }
  },
};

/**
 * PACS Configuration API (for reject analysis PACS settings)
 */
export const pacsConfigApi = {
  /**
   * Get all PACS servers
   */
  async getPacsServers(): Promise<PacsServer[]> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/pacs-servers/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PACS servers: ${response.statusText}`);
      }
      
      const data = await response.json();
      // Handle paginated response - return results array or the data itself if not paginated
      return data.results || data;
    } catch (error) {
      console.error('Error fetching PACS servers:', error);
      toast.error('Failed to load PACS servers');
      throw error;
    }
  },

  /**
   * Create a new PACS server configuration
   */
  async createPacsServer(data: Omit<PacsServer, 'id'>): Promise<PacsServer> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/pacs-servers/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create PACS server: ${response.statusText}`);
      }
      
      const server = await response.json();
      toast.success('PACS server created successfully');
      return server;
    } catch (error) {
      console.error('Error creating PACS server:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create PACS server');
      throw error;
    }
  },

  /**
   * Update a PACS server configuration
   */
  async updatePacsServer(id: number, data: Partial<Omit<PacsServer, 'id'>>): Promise<PacsServer> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/pacs-servers/${id}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update PACS server: ${response.statusText}`);
      }
      
      const server = await response.json();
      toast.success('PACS server updated successfully');
      return server;
    } catch (error) {
      console.error('Error updating PACS server:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update PACS server');
      throw error;
    }
  },

  /**
   * Delete a PACS server
   */
  async deletePacsServer(id: number): Promise<void> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/pacs-servers/${id}/`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete PACS server: ${response.statusText}`);
      }
      
      toast.success('PACS server deleted successfully');
    } catch (error) {
      console.error('Error deleting PACS server:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete PACS server');
      throw error;
    }
  },

  /**
   * Test PACS server connection
   */
  async testPacsConnection(id: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}/api/pacs-servers/${id}/test-connection/`,
        {
          method: 'POST',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to test PACS connection: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`PACS connection successful: ${result.message}`);
      } else {
        toast.warning(`PACS connection failed: ${result.message}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error testing PACS connection:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to test PACS connection');
      throw error;
    }
  },
};

/**
 * Utility functions for file downloads
 */
export const downloadUtils = {
  /**
   * Download a blob as a file
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Generate filename for exports
   */
  generateExportFilename(type: 'incidents' | 'analysis', format: string, date?: Date): string {
    const timestamp = (date || new Date()).toISOString().split('T')[0];
    return `${type}-export-${timestamp}.${format}`;
  },
};

/**
 * Target Settings API
 */
export const targetSettingsApi = {
  /**
   * Get current target settings
   */
  async getTargetSettings(): Promise<{
    id: number;
    xray_target: number;
    ct_target: number;
    mri_target: number;
    ultrasound_target: number;
    mammography_target: number;
    overall_target: number;
    drl_compliance_enabled: boolean;
    warning_threshold_multiplier: number;
    critical_threshold_multiplier: number;
    enable_notifications: boolean;
    notification_emails: string[];
    created: string;
    modified: string;
  }> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.TARGET_SETTINGS}current/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch target settings: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching target settings:', error);
      toast.error('Failed to load target settings');
      throw error;
    }
  },

  /**
   * Update target settings
   */
  async updateTargetSettings(data: {
    xray_target?: number;
    ct_target?: number;
    mri_target?: number;
    ultrasound_target?: number;
    mammography_target?: number;
    overall_target?: number;
    drl_compliance_enabled?: boolean;
    warning_threshold_multiplier?: number;
    critical_threshold_multiplier?: number;
    enable_notifications?: boolean;
    notification_emails?: string[];
  }): Promise<any> {
    try {
      // Use POST to create/update since it's a singleton resource
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.TARGET_SETTINGS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update target settings: ${response.statusText}`);
      }
      
      const settings = await response.json();
      toast.success('Target reject rates updated successfully');
      return settings;
    } catch (error) {
      console.error('Error updating target settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update target settings');
      throw error;
    }
  },

  /**
   * Get modality targets in simple format
   */
  async getModalityTargets(): Promise<{
    xray: number;
    ct: number;
    mri: number;
    ultrasound: number;
    mammography: number;
    overall: number;
  }> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.TARGET_SETTINGS}modality_targets/`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch modality targets: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching modality targets:', error);
      // Return defaults on error instead of showing toast
      return {
        xray: 2.0,
        ct: 1.5,
        mri: 1.0,
        ultrasound: 1.5,
        mammography: 3.0,
        overall: 2.0
      };
    }
  },

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<any> {
    try {
      const response = await AuthService.authenticatedFetch(
        `${API_BASE}${REJECT_ANALYSIS_ENDPOINTS.TARGET_SETTINGS}reset_to_defaults/`,
        {
          method: 'POST',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to reset target settings: ${response.statusText}`);
      }
      
      const settings = await response.json();
      toast.success('Target settings reset to defaults');
      return settings;
    } catch (error) {
      console.error('Error resetting target settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reset target settings');
      throw error;
    }
  },
};

// Export all APIs as a single object for convenience
export const rejectAnalysisApi = {
  categories: rejectCategoriesApi,
  reasons: rejectReasonsApi,
  incidents: rejectIncidentsApi,
  monthly: monthlyAnalysisApi,
  statistics: statisticsApi,
  pacs: pacsConfigApi,
  targets: targetSettingsApi,
  utils: downloadUtils,
};

export default rejectAnalysisApi;