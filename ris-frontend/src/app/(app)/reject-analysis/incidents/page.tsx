'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, Download, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRejectIncidents } from '@/hooks/useRejectIncidents';
import { useRejectCategories } from '@/hooks/useRejectCategories';
import RejectIncidentTable from '@/components/reject-analysis/RejectIncidentTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SEVERITY_CONFIG } from '@/types/reject-analysis';
import type { RejectIncidentFilters } from '@/types/reject-analysis';

export default function RejectIncidentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<RejectIncidentFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  
  const {
    incidents,
    loading,
    error,
    totalCount,
    currentPage,
    totalPages,
    updateFilters,
    setCurrentPage,
    deleteIncident,
    exportIncidents,
  } = useRejectIncidents();
  
  const { categories } = useRejectCategories();

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    updateFilters({ ...filters, search: value || undefined });
  };

  const handleFilterChange = (key: keyof RejectIncidentFilters, value: any) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    updateFilters(newFilters);
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      await exportIncidents(filters, format);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const resetFilters = () => {
    setFilters({});
    setSearchTerm('');
    updateFilters({});
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
          <h1 className="text-3xl font-bold tracking-tight">Reject Incidents</h1>
          <p className="text-muted-foreground">
            Log and manage individual image reject incidents
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('csv')}
            disabled={loading || totalCount === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handleExport('excel')}
            disabled={loading || totalCount === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          
          <Link href="/reject-analysis/incidents/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Incident
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Search & Filter</CardTitle>
              <CardDescription>
                Find specific incidents and apply filters
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient name, MRN, accession number..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium mb-2 block">Date From</label>
                <Input
                  type="date"
                  value={filters.date_from || ''}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Date To</label>
                <Input
                  type="date"
                  value={filters.date_to || ''}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select
                  value={filters.category_id?.toString() || ''}
                  onValueChange={(value) => handleFilterChange('category_id', value && value !== '__all__' ? parseInt(value) : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.nama_english}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Modality</label>
                <Input
                  placeholder="e.g., XR, CT, MRI"
                  value={filters.modality || ''}
                  onChange={(e) => handleFilterChange('modality', e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Severity</label>
                <Select
                  value={filters.severity || ''}
                  onValueChange={(value) => handleFilterChange('severity', value && value !== '__all__' ? value : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All severities</SelectItem>
                    {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
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
                <label className="text-sm font-medium mb-2 block">Retake Performed</label>
                <Select
                  value={filters.retake_performed?.toString() || ''}
                  onValueChange={(value) => handleFilterChange('retake_performed', value === 'true' ? true : value === 'false' ? false : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Follow-up Required</label>
                <Select
                  value={filters.follow_up_required?.toString() || ''}
                  onValueChange={(value) => handleFilterChange('follow_up_required', value === 'true' ? true : value === 'false' ? false : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Button variant="outline" onClick={resetFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          )}

          {/* Active Filters Display */}
          {Object.keys(filters).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-sm font-medium">Active filters:</span>
              {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;
                return (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key}: {value.toString()}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${totalCount} incidents found`}
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

      {/* Incidents Table */}
      <Card>
        <CardContent className="p-0">
          <RejectIncidentTable
            incidents={incidents}
            loading={loading}
            onEdit={(incident) => {
              // Navigate to edit page
              window.location.href = `/reject-analysis/incidents/${incident.id}/edit`;
            }}
            onDelete={async (incident) => {
              if (confirm('Are you sure you want to delete this incident?')) {
                await deleteIncident(incident.id);
              }
            }}
            onView={(incident) => {
              // Navigate to view page
              window.location.href = `/reject-analysis/incidents/${incident.id}`;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}