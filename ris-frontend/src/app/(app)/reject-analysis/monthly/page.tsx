'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search, Download, AlertTriangle, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRejectAnalysis } from '@/hooks/useRejectAnalysis';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_CONFIG } from '@/types/reject-analysis';
import type { RejectAnalysisFilters } from '@/types/reject-analysis';

export default function MonthlyAnalysisPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<RejectAnalysisFilters>({});
  
  const {
    analyses,
    loading,
    error,
    totalCount,
    currentPage,
    totalPages,
    updateFilters,
    setCurrentPage,
    deleteAnalysis,
    approveAnalysis,
    exportAnalysis,
  } = useRejectAnalysis();
  
  const isSuperuser = user?.is_superuser || false;

  const handleFilterChange = (key: keyof RejectAnalysisFilters, value: any) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    updateFilters(newFilters);
  };

  const resetFilters = () => {
    setFilters({});
    updateFilters({});
  };

  const handleApprove = async (id: number) => {
    if (confirm('Are you sure you want to approve this analysis?')) {
      try {
        await approveAnalysis(id);
      } catch (error) {
        console.error('Failed to approve analysis:', error);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) {
      try {
        await deleteAnalysis(id);
      } catch (error) {
        console.error('Failed to delete analysis:', error);
      }
    }
  };

  const handleExport = async (id: number, format: 'pdf' | 'excel') => {
    try {
      await exportAnalysis(id, format);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Analysis</h1>
          <p className="text-muted-foreground">
            Comprehensive monthly reject rate analysis and reporting
          </p>
        </div>
        
        <Link href="/reject-analysis/monthly/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Analysis
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
          <CardDescription>
            Filter monthly analyses by year, status, and performance
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Input
                type="number"
                placeholder="e.g., 2024"
                value={filters.year || ''}
                onChange={(e) => handleFilterChange('year', e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select
                value={filters.month?.toString() || ''}
                onValueChange={(value) => handleFilterChange('month', value && value !== '__all__' ? parseInt(value) : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All months</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select
                value={filters.status || ''}
                onValueChange={(value) => handleFilterChange('status', value && value !== '__all__' ? value : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <Badge className={config.color}>
                        {config.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Target Performance</label>
              <Select
                value={filters.meets_target?.toString() || ''}
                onValueChange={(value) => handleFilterChange('meets_target', value === 'true' ? true : value === 'false' ? false : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="true">Meets Target</SelectItem>
                  <SelectItem value="false">Above Target</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {Object.keys(filters).length > 0 && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear Filters
              </Button>
              <div className="flex flex-wrap gap-2">
                {Object.entries(filters).map(([key, value]) => {
                  if (!value) return null;
                  return (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {key}: {value.toString()}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${totalCount} analyses found`}
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1 || loading}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Analysis Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : analyses.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No analyses found</h3>
            <p className="text-muted-foreground mb-4">
              No monthly analyses match your current filters.
            </p>
            <Link href="/reject-analysis/monthly/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Analysis
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {analyses.map((analysis) => (
            <Card key={analysis.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {analysis.month_name} {analysis.year}
                      <Badge className={STATUS_CONFIG[analysis.status].color}>
                        {STATUS_CONFIG[analysis.status].label}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Created {new Date(analysis.created).toLocaleDateString()}
                      {analysis.analyzed_by && (
                        <> • By {analysis.analyzed_by.first_name} {analysis.analyzed_by.last_name}</>
                      )}
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {analysis.meets_target ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        On Target
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Above Target
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 mb-4">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {analysis.reject_rate.toFixed(2)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Reject Rate</div>
                  </div>
                  
                  <div>
                    <div className="text-2xl font-bold">
                      {analysis.total_rejects}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Rejects</div>
                  </div>
                  
                  <div>
                    <div className="text-2xl font-bold">
                      {analysis.total_examinations}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Exams</div>
                  </div>
                  
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {analysis.target_reject_rate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Target Rate</div>
                  </div>
                </div>
                
                {analysis.improvement_rate !== undefined && (
                  <div className="mb-4">
                    <div className={`text-sm ${
                      analysis.improvement_rate > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {analysis.improvement_rate > 0 ? '↓' : '↑'} 
                      {Math.abs(analysis.improvement_rate).toFixed(1)}% from previous month
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Link href={`/reject-analysis/monthly/${analysis.id}`}>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </Link>
                  
                  <Link href={`/reject-analysis/monthly/${analysis.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport(analysis.id, 'pdf')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    PDF
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport(analysis.id, 'excel')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Excel
                  </Button>
                  
                  {isSuperuser && analysis.status === 'COMPLETED' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(analysis.id)}
                    >
                      Approve
                    </Button>
                  )}
                  
                  {analysis.status === 'DRAFT' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(analysis.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}