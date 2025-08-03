'use client';

import { useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import type {
  MonthlyRejectAnalysis,
  MonthlyAnalysisFormData,
  RejectAnalysisFilters,
  RejectAnalysisListResponse,
} from '@/types/reject-analysis';

/**
 * Hook for managing monthly reject analysis data
 * Provides CRUD operations and data fetching with loading states
 */
export function useRejectAnalysis(initialFilters?: RejectAnalysisFilters) {
  const [analyses, setAnalyses] = useState<MonthlyRejectAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<MonthlyRejectAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RejectAnalysisFilters>(initialFilters || {});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  /**
   * Fetch analyses with current filters and pagination
   */
  const fetchAnalyses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryFilters = {
        ...filters,
        page: currentPage,
        page_size: pageSize,
      };
      
      const response: RejectAnalysisListResponse = await rejectAnalysisApi.monthly.getAnalyses(queryFilters);
      
      setAnalyses(response.results);
      setTotalCount(response.count);
      setTotalPages(Math.ceil(response.count / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analyses');
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, pageSize]);

  /**
   * Fetch a single analysis by ID
   */
  const fetchAnalysis = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const analysis = await rejectAnalysisApi.monthly.getAnalysis(id);
      setSelectedAnalysis(analysis);
      return analysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new monthly analysis
   */
  const createAnalysis = useCallback(async (data: MonthlyAnalysisFormData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newAnalysis = await rejectAnalysisApi.monthly.createAnalysis(data);
      
      // Refresh the list
      await fetchAnalyses();
      
      return newAnalysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAnalyses]);

  /**
   * Update an existing analysis
   */
  const updateAnalysis = useCallback(async (id: number, data: Partial<MonthlyAnalysisFormData>) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedAnalysis = await rejectAnalysisApi.monthly.updateAnalysis(id, data);
      
      // Update the selected analysis if it's the one being updated
      if (selectedAnalysis?.id === id) {
        setSelectedAnalysis(updatedAnalysis);
      }
      
      // Update the analysis in the list
      setAnalyses(prev => 
        prev.map(analysis => 
          analysis.id === id ? updatedAnalysis : analysis
        )
      );
      
      return updatedAnalysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedAnalysis]);

  /**
   * Approve an analysis (superuser only)
   */
  const approveAnalysis = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const approvedAnalysis = await rejectAnalysisApi.monthly.approveAnalysis(id);
      
      // Update the selected analysis if it's the one being approved
      if (selectedAnalysis?.id === id) {
        setSelectedAnalysis(approvedAnalysis);
      }
      
      // Update the analysis in the list
      setAnalyses(prev => 
        prev.map(analysis => 
          analysis.id === id ? approvedAnalysis : analysis
        )
      );
      
      return approvedAnalysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedAnalysis]);

  /**
   * Delete an analysis
   */
  const deleteAnalysis = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      await rejectAnalysisApi.monthly.deleteAnalysis(id);
      
      // Remove from the list
      setAnalyses(prev => prev.filter(analysis => analysis.id !== id));
      
      // Clear selected analysis if it was deleted
      if (selectedAnalysis?.id === id) {
        setSelectedAnalysis(null);
      }
      
      // Update total count
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedAnalysis]);

  /**
   * Export analysis to file
   */
  const exportAnalysis = useCallback(async (id: number, format: 'pdf' | 'excel' = 'pdf') => {
    try {
      setLoading(true);
      setError(null);
      
      const blob = await rejectAnalysisApi.monthly.exportAnalysis(id, format);
      
      // Download the file
      const filename = `monthly-analysis-${id}.${format}`;
      rejectAnalysisApi.utils.downloadBlob(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update filters and reset pagination
   */
  const updateFilters = useCallback((newFilters: RejectAnalysisFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  /**
   * Reset all filters
   */
  const resetFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(1);
  }, []);

  /**
   * Refresh the current data
   */
  const refresh = useCallback(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  // Load initial data
  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  return {
    // Data
    analyses,
    selectedAnalysis,
    totalCount,
    totalPages,
    currentPage,
    pageSize,
    filters,
    
    // State
    loading,
    error,
    
    // Actions
    fetchAnalyses,
    fetchAnalysis,
    createAnalysis,
    updateAnalysis,
    approveAnalysis,
    deleteAnalysis,
    exportAnalysis,
    
    // Filters and pagination
    updateFilters,
    resetFilters,
    setCurrentPage,
    setPageSize,
    
    // Utilities
    refresh,
    clearError: () => setError(null),
    clearSelected: () => setSelectedAnalysis(null),
  };
}

export default useRejectAnalysis;