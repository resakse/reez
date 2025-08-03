'use client';

import { useState, useEffect, useCallback } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import type {
  RejectCategory,
  RejectCategoryFormData,
  RejectCategoryListResponse,
} from '@/types/reject-analysis';

/**
 * Hook for managing reject categories
 * Provides CRUD operations for categories with drag-and-drop reordering support
 */
export function useRejectCategories() {
  const [categories, setCategories] = useState<RejectCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<RejectCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50); // Higher default for categories
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Filter state
  const [showInactive, setShowInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * Fetch categories with current filters
   */
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const filters = {
        is_active: showInactive ? undefined : true,
        search: searchTerm || undefined,
        ordering: 'position,nama', // Order by position first, then name
        page: currentPage,
        page_size: pageSize,
      };
      
      const response: RejectCategoryListResponse = await rejectAnalysisApi.categories.getCategories(filters);
      
      setCategories(response.results);
      setTotalCount(response.count);
      setTotalPages(Math.ceil(response.count / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [showInactive, searchTerm, currentPage, pageSize]);

  /**
   * Fetch all active categories for dropdowns (no pagination)
   */
  const fetchActiveCategories = useCallback(async () => {
    try {
      const response: RejectCategoryListResponse = await rejectAnalysisApi.categories.getCategories({
        is_active: true,
        ordering: 'position,nama',
        page_size: 1000, // Get all active categories
      });
      
      return response.results;
    } catch (err) {
      console.error('Failed to fetch active categories:', err);
      return [];
    }
  }, []);

  /**
   * Fetch a single category by ID
   */
  const fetchCategory = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const category = await rejectAnalysisApi.categories.getCategory(id);
      setSelectedCategory(category);
      return category;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new category
   */
  const createCategory = useCallback(async (data: RejectCategoryFormData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newCategory = await rejectAnalysisApi.categories.createCategory(data);
      
      // Refresh the list
      await fetchCategories();
      
      return newCategory;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchCategories]);

  /**
   * Update an existing category
   */
  const updateCategory = useCallback(async (id: number, data: RejectCategoryFormData) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedCategory = await rejectAnalysisApi.categories.updateCategory(id, data);
      
      // Update the selected category if it's the one being updated
      if (selectedCategory?.id === id) {
        setSelectedCategory(updatedCategory);
      }
      
      // Update the category in the list
      setCategories(prev => 
        prev.map(category => 
          category.id === id ? updatedCategory : category
        )
      );
      
      return updatedCategory;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  /**
   * Delete a category
   */
  const deleteCategory = useCallback(async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      
      await rejectAnalysisApi.categories.deleteCategory(id);
      
      // Remove from the list
      setCategories(prev => prev.filter(category => category.id !== id));
      
      // Clear selected category if it was deleted
      if (selectedCategory?.id === id) {
        setSelectedCategory(null);
      }
      
      // Update total count
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  /**
   * Reorder categories (for drag-and-drop)
   */
  const reorderCategories = useCallback(async (reorderedCategories: RejectCategory[]) => {
    try {
      setLoading(true);
      setError(null);
      
      // Update local state immediately for better UX
      setCategories(reorderedCategories);
      
      // Prepare data for API call
      const reorderData = reorderedCategories.map((category, index) => ({
        id: category.id,
        position: index + 1,
      }));
      
      await rejectAnalysisApi.categories.reorderCategories(reorderData);
      
      // Refresh to get server state
      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder categories');
      // Revert local changes on error
      await fetchCategories();
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchCategories]);

  /**
   * Toggle category active status
   */
  const toggleCategoryStatus = useCallback(async (id: number) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const updatedCategory = await rejectAnalysisApi.categories.updateCategory(id, {
        nama: category.nama,
        nama_english: category.nama_english,
        keterangan: category.keterangan,
        description: category.description,
        color_code: category.color_code,
        is_active: !category.is_active,
      });
      
      // Update the category in the list
      setCategories(prev => 
        prev.map(cat => 
          cat.id === id ? updatedCategory : cat
        )
      );
      
      return updatedCategory;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle category status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [categories]);

  /**
   * Search categories
   */
  const searchCategories = useCallback((term: string) => {
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  /**
   * Reset all filters
   */
  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setShowInactive(false);
    setCurrentPage(1);
  }, []);

  /**
   * Refresh the current data
   */
  const refresh = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Load initial data
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm !== '') {
        fetchCategories();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchCategories]);

  return {
    // Data
    categories,
    selectedCategory,
    totalCount,
    totalPages,
    currentPage,
    pageSize,
    searchTerm,
    showInactive,
    
    // State
    loading,
    error,
    
    // Actions
    fetchCategories,
    fetchActiveCategories,
    fetchCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    toggleCategoryStatus,
    
    // Filters and search
    searchCategories,
    setShowInactive,
    resetFilters,
    setCurrentPage,
    setPageSize,
    
    // Utilities
    refresh,
    clearError: () => setError(null),
    clearSelected: () => setSelectedCategory(null),
  };
}

export default useRejectCategories;