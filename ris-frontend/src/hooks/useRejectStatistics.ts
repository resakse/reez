'use client';

import { useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import type {
  RejectStatistics,
  RejectTrendData,
} from '@/types/reject-analysis';

/**
 * Hook for managing reject statistics and trends data
 * Provides dashboard statistics and chart data
 */
export function useRejectStatistics() {
  const [statistics, setStatistics] = useState<RejectStatistics | null>(null);
  const [trends, setTrends] = useState<RejectTrendData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Trend filters
  const [trendMonths, setTrendMonths] = useState(12); // Default to 12 months
  const [trendYear, setTrendYear] = useState<number>(new Date().getFullYear());
  const [trendModality, setTrendModality] = useState<string | undefined>(undefined);

  /**
   * Fetch current statistics
   */
  const fetchStatistics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const stats = await rejectAnalysisApi.statistics.getStatistics();
      setStatistics(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics');
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch trends data
   */
  const fetchTrends = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const trendParams = {
        months: trendMonths,
        year: trendYear,
        modality: trendModality,
      };
      
      const trendsData = await rejectAnalysisApi.statistics.getTrends(trendParams);
      setTrends(trendsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trends');
      setTrends([]);
    } finally {
      setLoading(false);
    }
  }, [trendMonths, trendYear, trendModality]);

  /**
   * Fetch both statistics and trends
   */
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [stats, trendsData] = await Promise.all([
        rejectAnalysisApi.statistics.getStatistics(),
        rejectAnalysisApi.statistics.getTrends({
          months: trendMonths,
          year: trendYear,
          modality: trendModality,
        }),
      ]);
      
      setStatistics(stats);
      setTrends(trendsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setStatistics(null);
      setTrends([]);
    } finally {
      setLoading(false);
    }
  }, [trendMonths, trendYear, trendModality]);

  /**
   * Update trend filters
   */
  const updateTrendFilters = useCallback((
    months?: number,
    year?: number,
    modality?: string
  ) => {
    if (months !== undefined) setTrendMonths(months);
    if (year !== undefined) setTrendYear(year);
    if (modality !== undefined) setTrendModality(modality);
  }, []);

  /**
   * Reset trend filters to defaults
   */
  const resetTrendFilters = useCallback(() => {
    setTrendMonths(12);
    setTrendYear(new Date().getFullYear());
    setTrendModality(undefined);
  }, []);

  /**
   * Refresh all data
   */
  const refresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  // Load initial data
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Computed statistics
  const computedStats = {
    /**
     * Get month-over-month change percentage
     */
    getMonthOverMonthChange: () => {
      if (!statistics) return 0;
      return statistics.month_to_month_change;
    },

    /**
     * Check if current month meets target
     */
    meetsCurrentTarget: () => {
      if (!statistics) return false;
      return statistics.meets_current_target;
    },

    /**
     * Check if YTD meets target
     */
    meetsYtdTarget: () => {
      if (!statistics) return false;
      return statistics.meets_ytd_target;
    },

    /**
     * Get target vs actual difference
     */
    getTargetDifference: () => {
      if (!statistics) return 0;
      return statistics.current_reject_rate - statistics.target_reject_rate;
    },

    /**
     * Get improvement needed to meet target
     */
    getImprovementNeeded: () => {
      if (!statistics) return 0;
      const diff = statistics.current_reject_rate - statistics.target_reject_rate;
      return Math.max(0, diff);
    },

    /**
     * Get trend direction for current month
     */
    getTrendDirection: (): 'up' | 'down' | 'stable' => {
      if (!statistics) return 'stable';
      const change = statistics.month_to_month_change;
      if (change > 0.1) return 'up';
      if (change < -0.1) return 'down';
      return 'stable';
    },

    /**
     * Get performance status
     */
    getPerformanceStatus: (): 'excellent' | 'good' | 'warning' | 'critical' => {
      if (!statistics) return 'warning';
      
      const rate = statistics.current_reject_rate;
      const target = statistics.target_reject_rate;
      
      if (rate <= target * 0.8) return 'excellent'; // 20% below target
      if (rate <= target) return 'good'; // At or below target
      if (rate <= target * 1.5) return 'warning'; // Up to 50% above target
      return 'critical'; // More than 50% above target
    },
  };

  // Trend analysis utilities
  const trendAnalysis = {
    /**
     * Get average reject rate for the trend period
     */
    getAverageRejectRate: () => {
      if (trends.length === 0) return 0;
      const total = trends.reduce((sum, trend) => sum + trend.reject_rate, 0);
      return total / trends.length;
    },

    /**
     * Get highest reject rate month
     */
    getHighestRejectRateMonth: () => {
      if (trends.length === 0) return null;
      return trends.reduce((highest, trend) => 
        trend.reject_rate > highest.reject_rate ? trend : highest
      );
    },

    /**
     * Get lowest reject rate month
     */
    getLowestRejectRateMonth: () => {
      if (trends.length === 0) return null;
      return trends.reduce((lowest, trend) => 
        trend.reject_rate < lowest.reject_rate ? trend : lowest
      );
    },

    /**
     * Get trend slope (positive = improving, negative = worsening)
     */
    getTrendSlope: () => {
      if (trends.length < 2) return 0;
      
      const recent = trends.slice(-3); // Last 3 months
      const older = trends.slice(0, Math.min(3, trends.length - 3)); // First 3 months
      
      if (older.length === 0) return 0;
      
      const recentAvg = recent.reduce((sum, t) => sum + t.reject_rate, 0) / recent.length;
      const olderAvg = older.reduce((sum, t) => sum + t.reject_rate, 0) / older.length;
      
      return olderAvg - recentAvg; // Positive means improvement (lower reject rate)
    },

    /**
     * Get months that exceeded target
     */
    getMonthsExceedingTarget: () => {
      return trends.filter(trend => !trend.meets_target);
    },

    /**
     * Get consecutive months of improvement
     */
    getConsecutiveImprovementMonths: () => {
      let count = 0;
      for (let i = trends.length - 1; i > 0; i--) {
        if (trends[i].reject_rate < trends[i - 1].reject_rate) {
          count++;
        } else {
          break;
        }
      }
      return count;
    },
  };

  return {
    // Data
    statistics,
    trends,
    trendMonths,
    trendYear,
    trendModality,
    
    // State
    loading,
    error,
    
    // Actions
    fetchStatistics,
    fetchTrends,
    fetchAll,
    updateTrendFilters,
    resetTrendFilters,
    refresh,
    
    // Computed statistics
    computedStats,
    trendAnalysis,
    
    // Utilities
    clearError: () => setError(null),
  };
}

export default useRejectStatistics;