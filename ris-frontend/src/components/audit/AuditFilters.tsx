'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Filter, RotateCcw } from 'lucide-react';

interface AuditFilters {
  action: string;
  resource_type: string;
  username: string;
  success: string;
  days: string;
  start_date: string;
  end_date: string;
}

interface FilterOptions {
  actions: string[];
  resource_types: string[];
  active_users: Array<{id: number; username: string}>;
}

interface AuditFiltersProps {
  filters: AuditFilters;
  filterOptions: FilterOptions;
  onFilterChange: (filters: Partial<AuditFilters>) => void;
  loading?: boolean;
}

export default function AuditFilters({ 
  filters, 
  filterOptions, 
  onFilterChange, 
  loading = false 
}: AuditFiltersProps) {
  
  const handleClearFilters = () => {
    onFilterChange({
      action: '',
      resource_type: '',
      username: '',
      success: '',
      days: '30',
      start_date: '',
      end_date: ''
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.action) count++;
    if (filters.resource_type) count++;
    if (filters.username) count++;
    if (filters.success) count++;
    if (filters.start_date || filters.end_date) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filter Audit Logs</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount} active
              </Badge>
            )}
          </CardTitle>
          {activeFiltersCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearFilters}
              disabled={loading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          
          {/* Action Filter */}
          <div className="space-y-2">
            <Label htmlFor="action-filter">Action</Label>
            <Select 
              value={filters.action || '__all__'} 
              onValueChange={(value) => onFilterChange({ action: value === '__all__' ? '' : value })}
              disabled={loading}
            >
              <SelectTrigger id="action-filter">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Actions</SelectItem>
                {filterOptions.actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resource Type Filter */}
          <div className="space-y-2">
            <Label htmlFor="resource-filter">Resource Type</Label>
            <Select 
              value={filters.resource_type || '__all__'} 
              onValueChange={(value) => onFilterChange({ resource_type: value === '__all__' ? '' : value })}
              disabled={loading}
            >
              <SelectTrigger id="resource-filter">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Resources</SelectItem>
                {filterOptions.resource_types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User Filter */}
          <div className="space-y-2">
            <Label htmlFor="username-filter">Username</Label>
            <Input
              id="username-filter"
              placeholder="Filter by username"
              value={filters.username}
              onChange={(e) => onFilterChange({ username: e.target.value })}
              disabled={loading}
            />
          </div>

          {/* Success Filter */}
          <div className="space-y-2">
            <Label htmlFor="success-filter">Status</Label>
            <Select 
              value={filters.success || '__all__'} 
              onValueChange={(value) => onFilterChange({ success: value === '__all__' ? '' : value })}
              disabled={loading}
            >
              <SelectTrigger id="success-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="true">Success</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Range Filter */}
          <div className="space-y-2">
            <Label htmlFor="days-filter">Time Range</Label>
            <Select 
              value={filters.days || (filters.start_date || filters.end_date ? 'custom' : '30')} 
              onValueChange={(value) => {
                if (value === 'custom') {
                  onFilterChange({ days: '', start_date: '', end_date: '' });
                } else {
                  onFilterChange({ days: value, start_date: '', end_date: '' });
                }
              }}
              disabled={loading}
            >
              <SelectTrigger id="days-filter">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range - only show if "Custom range" is selected */}
          {filters.days === '' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => onFilterChange({ start_date: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => onFilterChange({ end_date: e.target.value })}
                  disabled={loading}
                />
              </div>
            </>
          )}
        </div>

        {/* Active Filters Display */}
        {activeFiltersCount > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Active filters:</span>
              
              {filters.action && (
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <span>Action: {filters.action.replace('_', ' ')}</span>
                  <button 
                    onClick={() => onFilterChange({ action: '' })}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {filters.resource_type && (
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <span>Resource: {filters.resource_type}</span>
                  <button 
                    onClick={() => onFilterChange({ resource_type: '' })}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {filters.username && (
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <span>User: {filters.username}</span>
                  <button 
                    onClick={() => onFilterChange({ username: '' })}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {filters.success && (
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <span>Status: {filters.success === 'true' ? 'Success' : 'Failed'}</span>
                  <button 
                    onClick={() => onFilterChange({ success: '' })}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {(filters.start_date || filters.end_date) && (
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <span>
                    Custom: {filters.start_date || '...'} to {filters.end_date || '...'}
                  </span>
                  <button 
                    onClick={() => onFilterChange({ start_date: '', end_date: '', days: '30' })}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}