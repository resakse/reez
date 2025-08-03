'use client';

import { useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import type {
  RejectIncident,
  RejectIncidentFormData,
  RejectIncidentFilters,
  RejectIncidentListResponse,
} from '@/types/reject-analysis';

/**
 * Hook for managing reject incidents
 * Provides CRUD operations and filtering for incident tracking
 */
export function useRejectIncidents(initialFilters?: RejectIncidentFilters) {
  const [incidents, setIncidents] = useState<RejectIncident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<RejectIncident | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RejectIncidentFilters>(initialFilters || {});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  /**
   * Fetch incidents with current filters and pagination
   */
  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryFilters = {
        ...filters,
        page: currentPage,
        page_size: pageSize,
      };
      
      const response: RejectIncidentListResponse = await rejectAnalysisApi.incidents.getIncidents(queryFilters);
      
      setIncidents(response.results);
      setTotalCount(response.count);
      setTotalPages(Math.ceil(response.count / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch incidents');
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, pageSize]);

  /**
   * Fetch a single incident by ID
   */
  const fetchIncident = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const incident = await rejectAnalysisApi.incidents.getIncident(id);
      setSelectedIncident(incident);
      return incident;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch incident');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new incident
   */
  const createIncident = useCallback(async (data: RejectIncidentFormData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newIncident = await rejectAnalysisApi.incidents.createIncident(data);
      
      // Refresh the list
      await fetchIncidents();
      
      return newIncident;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create incident');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchIncidents]);

  /**
   * Update an existing incident
   */
  const updateIncident = useCallback(async (id: number, data: Partial<RejectIncidentFormData>) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedIncident = await rejectAnalysisApi.incidents.updateIncident(id, data);
      
      // Update the selected incident if it's the one being updated
      if (selectedIncident?.id === id) {
        setSelectedIncident(updatedIncident);
      }
      
      // Update the incident in the list
      setIncidents(prev => 
        prev.map(incident => 
          incident.id === id ? updatedIncident : incident
        )
      );
      
      return updatedIncident;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update incident');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedIncident]);

  /**
   * Delete an incident
   */
  const deleteIncident = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      await rejectAnalysisApi.incidents.deleteIncident(id);
      
      // Remove from the list
      setIncidents(prev => prev.filter(incident => incident.id !== id));
      
      // Clear selected incident if it was deleted
      if (selectedIncident?.id === id) {
        setSelectedIncident(null);
      }
      
      // Update total count
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete incident');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedIncident]);

  /**
   * Mark incident follow-up as completed
   */
  const completeFollowUp = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedIncident = await rejectAnalysisApi.incidents.updateIncident(id, {
        follow_up_completed: true,
        follow_up_date: new Date().toISOString().split('T')[0],
      });
      
      // Update the selected incident if it's the one being updated
      if (selectedIncident?.id === id) {
        setSelectedIncident(updatedIncident);
      }
      
      // Update the incident in the list
      setIncidents(prev => 
        prev.map(incident => 
          incident.id === id ? updatedIncident : incident
        )
      );
      
      return updatedIncident;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete follow-up');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedIncident]);

  /**
   * Export incidents to CSV/Excel
   */
  const exportIncidents = useCallback(async (format: 'csv' | 'excel' = 'csv') => {
    try {
      setLoading(true);
      setError(null);
      
      const blob = await rejectAnalysisApi.incidents.exportIncidents(filters, format);
      
      // Download the file
      const filename = rejectAnalysisApi.utils.generateExportFilename('incidents', format);
      rejectAnalysisApi.utils.downloadBlob(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export incidents');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Update filters and reset pagination
   */
  const updateFilters = useCallback((newFilters: RejectIncidentFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  /**
   * Update a single filter
   */
  const updateFilter = useCallback((key: keyof RejectIncidentFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setCurrentPage(1);
  }, [filters]);

  /**
   * Reset all filters
   */
  const resetFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(1);
  }, []);

  /**
   * Search incidents
   */
  const searchIncidents = useCallback((searchTerm: string) => {
    updateFilter('search', searchTerm);
  }, [updateFilter]);

  /**
   * Filter by date range
   */
  const filterByDateRange = useCallback((dateFrom?: string, dateTo?: string) => {
    const newFilters = { ...filters };
    
    if (dateFrom) {
      newFilters.date_from = dateFrom;
    } else {
      delete newFilters.date_from;
    }
    
    if (dateTo) {
      newFilters.date_to = dateTo;
    } else {
      delete newFilters.date_to;
    }
    
    updateFilters(newFilters);
  }, [filters, updateFilters]);

  /**
   * Filter by category
   */
  const filterByCategory = useCallback((categoryId?: number) => {
    updateFilter('category_id', categoryId);
  }, [updateFilter]);

  /**
   * Filter by modality
   */
  const filterByModality = useCallback((modality?: string) => {
    updateFilter('modality', modality);
  }, [updateFilter]);

  /**
   * Filter by severity
   */
  const filterBySeverity = useCallback((severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') => {
    updateFilter('severity', severity);
  }, [updateFilter]);

  /**
   * Filter by follow-up status
   */
  const filterByFollowUp = useCallback((followUpRequired?: boolean) => {
    updateFilter('follow_up_required', followUpRequired);
  }, [updateFilter]);

  /**
   * Refresh the current data
   */
  const refresh = useCallback(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Load initial data
  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  /**
   * Get incidents that need follow-up
   */
  const getIncidentsNeedingFollowUp = useCallback(() => {
    return incidents.filter(incident => 
      incident.follow_up_required && !incident.follow_up_completed
    );
  }, [incidents]);

  /**
   * Get incidents by severity
   */
  const getIncidentsBySeverity = useCallback((severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') => {
    return incidents.filter(incident => incident.severity === severity);
  }, [incidents]);

  /**
   * Get recent incidents (last 7 days)
   */
  const getRecentIncidents = useCallback(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return incidents.filter(incident => {
      const incidentDate = new Date(incident.incident_date);
      return incidentDate >= sevenDaysAgo;
    });
  }, [incidents]);

  return {
    // Data
    incidents,
    selectedIncident,
    totalCount,
    totalPages,
    currentPage,
    pageSize,
    filters,
    
    // State
    loading,
    error,
    
    // Actions
    fetchIncidents,
    fetchIncident,
    createIncident,
    updateIncident,
    deleteIncident,
    completeFollowUp,
    exportIncidents,
    
    // Filters
    updateFilters,
    updateFilter,
    resetFilters,
    searchIncidents,
    filterByDateRange,
    filterByCategory,
    filterByModality,
    filterBySeverity,
    filterByFollowUp,
    
    // Pagination
    setCurrentPage,
    setPageSize,
    
    // Data analysis
    getIncidentsNeedingFollowUp,
    getIncidentsBySeverity,
    getRecentIncidents,
    
    // Utilities
    refresh,
    clearError: () => setError(null),
    clearSelected: () => setSelectedIncident(null),
  };
}

export default useRejectIncidents;