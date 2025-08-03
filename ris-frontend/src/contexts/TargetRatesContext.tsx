'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';

interface TargetRates {
  xray: number;
  ct: number;
  mri: number;
  ultrasound: number;
  mammography: number;
  overall: number;
}

interface TargetRatesContextType {
  targetRates: TargetRates;
  loading: boolean;
  error: string | null;
  refreshTargetRates: () => Promise<void>;
}

const defaultTargetRates: TargetRates = {
  xray: 5.0,
  ct: 1.5,
  mri: 1.0,
  ultrasound: 1.5,
  mammography: 3.0,
  overall: 5.0,
};

const TargetRatesContext = createContext<TargetRatesContextType | undefined>(undefined);

export function TargetRatesProvider({ children }: { children: React.ReactNode }) {
  const [targetRates, setTargetRates] = useState<TargetRates>(defaultTargetRates);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTargetRates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rates = await rejectAnalysisApi.targets.getModalityTargets();
      setTargetRates(rates);
    } catch (err) {
      console.error('Failed to load target rates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load target rates');
      // Keep default values on error
      setTargetRates(defaultTargetRates);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTargetRates = useCallback(async () => {
    await loadTargetRates();
  }, [loadTargetRates]);

  useEffect(() => {
    loadTargetRates();
  }, [loadTargetRates]);

  // Listen for page visibility changes to refresh data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadTargetRates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadTargetRates]);

  return (
    <TargetRatesContext.Provider 
      value={{ 
        targetRates, 
        loading, 
        error, 
        refreshTargetRates 
      }}
    >
      {children}
    </TargetRatesContext.Provider>
  );
}

export function useTargetRates() {
  const context = useContext(TargetRatesContext);
  if (context === undefined) {
    throw new Error('useTargetRates must be used within a TargetRatesProvider');
  }
  return context;
}