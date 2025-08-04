'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Calendar, Filter } from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';

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

interface ExportFilters {
  start_date: string;
  end_date: string;
  user_id: string;
  action: string;
  resource_type: string;
  success: string;
  limit: string;
}

interface AuditExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterOptions: FilterOptions | null;
  currentFilters: AuditFilters;
}

export default function AuditExportDialog({ 
  open, 
  onOpenChange, 
  filterOptions,
  currentFilters 
}: AuditExportDialogProps) {
  
  const [exportFilters, setExportFilters] = useState<ExportFilters>({
    start_date: currentFilters.start_date,
    end_date: currentFilters.end_date,
    user_id: '',
    action: currentFilters.action,
    resource_type: currentFilters.resource_type,
    success: currentFilters.success,
    limit: '1000'
  });
  
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Build export parameters
      const exportParams = new URLSearchParams();
      
      if (exportFilters.start_date) exportParams.append('start_date', exportFilters.start_date);
      if (exportFilters.end_date) exportParams.append('end_date', exportFilters.end_date);
      if (exportFilters.user_id && exportFilters.user_id !== '__all__') exportParams.append('user_id', exportFilters.user_id);
      if (exportFilters.action && exportFilters.action !== '__all__') exportParams.append('action', exportFilters.action);
      if (exportFilters.resource_type && exportFilters.resource_type !== '__all__') exportParams.append('resource_type', exportFilters.resource_type);
      if (exportFilters.success && exportFilters.success !== '__all__') exportParams.append('success', exportFilters.success);
      if (exportFilters.limit) exportParams.append('limit', exportFilters.limit);

      // Create download link
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/export_csv/?${exportParams}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `audit_logs_${timestamp}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Audit logs exported successfully');
      onOpenChange(false);

    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export audit logs');
    } finally {
      setIsExporting(false);
    }
  };

  const getActiveExportFiltersCount = () => {
    let count = 0;
    if (exportFilters.start_date || exportFilters.end_date) count++;
    if (exportFilters.user_id) count++;
    if (exportFilters.action) count++;
    if (exportFilters.resource_type) count++;
    if (exportFilters.success) count++;
    return count;
  };

  const handleClearFilters = () => {
    setExportFilters({
      start_date: '',
      end_date: '',
      user_id: '',
      action: '',
      resource_type: '',
      success: '',
      limit: '1000'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Export Audit Logs</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Export Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Export audit logs to CSV format for compliance reporting and analysis.
              </p>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Includes timestamps, user actions, and resource information</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">CSV Format</Badge>
                <Badge variant="outline">HIPAA Compliant</Badge>
                <Badge variant="outline">Masked Sensitive Data</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Export Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center space-x-2">
                  <Filter className="h-4 w-4" />
                  <span>Export Filters</span>
                  {getActiveExportFiltersCount() > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {getActiveExportFiltersCount()} active
                    </Badge>
                  )}
                </CardTitle>
                {getActiveExportFiltersCount() > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Date Range */}
                <div className="space-y-2">
                  <Label htmlFor="export-start-date">Start Date</Label>
                  <Input
                    id="export-start-date"
                    type="date"
                    value={exportFilters.start_date}
                    onChange={(e) => setExportFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="export-end-date">End Date</Label>
                  <Input
                    id="export-end-date"
                    type="date"
                    value={exportFilters.end_date}
                    onChange={(e) => setExportFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>

                {/* User Filter */}
                <div className="space-y-2">
                  <Label htmlFor="export-user">User</Label>
                  <Select 
                    value={exportFilters.user_id} 
                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, user_id: value }))}
                  >
                    <SelectTrigger id="export-user">
                      <SelectValue placeholder="All Users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Users</SelectItem>
                      {filterOptions?.active_users.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Filter */}
                <div className="space-y-2">
                  <Label htmlFor="export-action">Action</Label>
                  <Select 
                    value={exportFilters.action} 
                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, action: value }))}
                  >
                    <SelectTrigger id="export-action">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Actions</SelectItem>
                      {filterOptions?.actions.map((action) => (
                        <SelectItem key={action} value={action}>
                          {action.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Resource Type Filter */}
                <div className="space-y-2">
                  <Label htmlFor="export-resource">Resource Type</Label>
                  <Select 
                    value={exportFilters.resource_type} 
                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, resource_type: value }))}
                  >
                    <SelectTrigger id="export-resource">
                      <SelectValue placeholder="All Resources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Resources</SelectItem>
                      {filterOptions?.resource_types.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Success Filter */}
                <div className="space-y-2">
                  <Label htmlFor="export-success">Status</Label>
                  <Select 
                    value={exportFilters.success} 
                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, success: value }))}
                  >
                    <SelectTrigger id="export-success">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Status</SelectItem>
                      <SelectItem value="true">Success Only</SelectItem>
                      <SelectItem value="false">Failed Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Limit */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="export-limit">Maximum Records</Label>
                  <Select 
                    value={exportFilters.limit} 
                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, limit: value }))}
                  >
                    <SelectTrigger id="export-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100 records</SelectItem>
                      <SelectItem value="500">500 records</SelectItem>
                      <SelectItem value="1000">1,000 records</SelectItem>
                      <SelectItem value="5000">5,000 records</SelectItem>
                      <SelectItem value="10000">10,000 records (max)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}