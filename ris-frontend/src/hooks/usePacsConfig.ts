'use client';

import { useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import { clearPacsConfigCache } from '@/lib/pacs';
import type { PacsServer } from '@/lib/pacs';

/**
 * Hook for managing PACS configuration
 * Provides CRUD operations for PACS servers and connection testing
 */
export function usePacsConfig() {
  const [servers, setServers] = useState<PacsServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<PacsServer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);

  /**
   * Fetch all PACS servers
   */
  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const serversList = await rejectAnalysisApi.pacs.getPacsServers();
      setServers(Array.isArray(serversList) ? serversList : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PACS servers');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new PACS server
   */
  const createServer = useCallback(async (data: Omit<PacsServer, 'id'>) => {
    try {
      setLoading(true);
      setError(null);
      
      const newServer = await rejectAnalysisApi.pacs.createPacsServer(data);
      
      // Clear PACS cache since configuration changed
      clearPacsConfigCache();
      
      // Refresh the list
      await fetchServers();
      
      return newServer;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PACS server');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchServers]);

  /**
   * Update an existing PACS server
   */
  const updateServer = useCallback(async (id: number, data: Partial<Omit<PacsServer, 'id'>>) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedServer = await rejectAnalysisApi.pacs.updatePacsServer(id, data);
      
      // Clear PACS cache since configuration changed
      clearPacsConfigCache();
      
      // Update the selected server if it's the one being updated
      if (selectedServer?.id === id) {
        setSelectedServer(updatedServer);
      }
      
      // Update the server in the list
      setServers(prev => 
        prev.map(server => 
          server.id === id ? updatedServer : server
        )
      );
      
      return updatedServer;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update PACS server');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedServer]);

  /**
   * Delete a PACS server
   */
  const deleteServer = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      await rejectAnalysisApi.pacs.deletePacsServer(id);
      
      // Clear PACS cache since configuration changed
      clearPacsConfigCache();
      
      // Remove from the list
      setServers(prev => prev.filter(server => server.id !== id));
      
      // Clear selected server if it was deleted
      if (selectedServer?.id === id) {
        setSelectedServer(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete PACS server');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedServer]);

  /**
   * Test PACS server connection
   */
  const testConnection = useCallback(async (id: number) => {
    try {
      setTestingConnection(id);
      setError(null);
      
      const result = await rejectAnalysisApi.pacs.testPacsConnection(id);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test connection');
      throw err;
    } finally {
      setTestingConnection(null);
    }
  }, []);

  /**
   * Set a server as primary
   */
  const setPrimaryServer = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      // First, set all servers as non-primary
      const updatePromises = servers.map(server => 
        server.id === id 
          ? rejectAnalysisApi.pacs.updatePacsServer(server.id, { is_primary: true })
          : rejectAnalysisApi.pacs.updatePacsServer(server.id, { is_primary: false })
      );
      
      await Promise.all(updatePromises);
      
      // Clear PACS cache since configuration changed
      clearPacsConfigCache();
      
      // Refresh the list
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary server');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [servers, fetchServers]);

  /**
   * Toggle server active status
   */
  const toggleServerStatus = useCallback(async (id: number) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedServer = await rejectAnalysisApi.pacs.updatePacsServer(id, {
        is_active: !server.is_active,
      });
      
      // Clear PACS cache since configuration changed
      clearPacsConfigCache();
      
      // Update the server in the list
      setServers(prev => 
        prev.map(s => 
          s.id === id ? updatedServer : s
        )
      );
      
      return updatedServer;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle server status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [servers]);

  /**
   * Get the primary server
   */
  const getPrimaryServer = useCallback(() => {
    return servers.find(server => server.is_primary) || null;
  }, [servers]);

  /**
   * Get active servers
   */
  const getActiveServers = useCallback(() => {
    return servers.filter(server => server.is_active);
  }, [servers]);

  /**
   * Get inactive servers
   */
  const getInactiveServers = useCallback(() => {
    return servers.filter(server => !server.is_active);
  }, [servers]);

  /**
   * Validate server configuration
   */
  const validateServerConfig = useCallback((config: Partial<PacsServer>) => {
    const errors: string[] = [];
    
    if (!config.name?.trim()) {
      errors.push('Server name is required');
    }
    
    if (!config.orthancurl?.trim()) {
      errors.push('Orthanc URL is required');
    } else {
      try {
        new URL(config.orthancurl);
      } catch {
        errors.push('Invalid Orthanc URL format');
      }
    }
    
    if (!config.viewrurl?.trim()) {
      errors.push('Viewer URL is required');
    } else {
      try {
        new URL(config.viewrurl);
      } catch {
        errors.push('Invalid Viewer URL format');
      }
    }
    
    if (!config.endpoint_style) {
      errors.push('Endpoint style is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }, []);

  /**
   * Refresh the current data
   */
  const refresh = useCallback(() => {
    fetchServers();
  }, [fetchServers]);

  // Load initial data
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return {
    // Data
    servers,
    selectedServer,
    
    // State
    loading,
    error,
    testingConnection,
    
    // Actions
    fetchServers,
    createServer,
    updateServer,
    deleteServer,
    testConnection,
    setPrimaryServer,
    toggleServerStatus,
    
    // Data getters
    getPrimaryServer,
    getActiveServers,
    getInactiveServers,
    
    // Utilities
    validateServerConfig,
    refresh,
    clearError: () => setError(null),
    setSelectedServer,
  };
}

export default usePacsConfig;