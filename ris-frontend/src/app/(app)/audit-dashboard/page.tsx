'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Download, RefreshCw, Users, Activity, AlertTriangle, Eye } from 'lucide-react';

import AuditStatisticsCards from '@/components/audit/AuditStatisticsCards';
import AuditFilters from '@/components/audit/AuditFilters';
import AuditTable from '@/components/audit/AuditTable';
import AuditExportDialog from '@/components/audit/AuditExportDialog';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

// Types for audit data
interface AuditStats {
  total_events: number;
  unique_users: number;
  failed_logins: number;
  patient_accesses: number;
  examination_activities: number;
  api_activities: number;
  top_actions: Array<{action: string; count: number}>;
  top_users: Array<{username: string; count: number}>;
  daily_activity: Array<{date: string; count: number}>;
  date_range_start: string;
  date_range_end: string;
  days_included: number;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  action_display: string;
  action_color: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  timestamp: string;
  formatted_timestamp: string;
  success: boolean;
  ip_address: string;
}

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

export default function AuditDashboard() {
  // Authentication context
  const { user, isLoading: authLoading } = useAuth();
  
  // State management
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filter state
  const [filters, setFilters] = useState<AuditFilters>({
    action: '',
    resource_type: '',
    username: '',
    success: '',
    days: '30',
    start_date: '',
    end_date: ''
  });

  // Load initial data on component mount
  useEffect(() => {
    loadInitialData();
  }, []);

  // Reload data when filters change
  useEffect(() => {
    if (filterOptions) { // Only reload if initial data is loaded
      loadAuditData();
    }
  }, [filters, currentPage]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all initial data in parallel
      const [statsResponse, logsResponse, optionsResponse] = await Promise.all([
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/statistics/?days=30`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/?days=30&page=1`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/filter_options/`)
      ]);

      // Check for authentication/permission errors
      if (statsResponse.status === 403 || logsResponse.status === 403) {
        throw new Error('Access denied. Only superusers can access audit logs.');
      }

      if (!statsResponse.ok || !logsResponse.ok || !optionsResponse.ok) {
        throw new Error('Failed to load audit data');
      }

      const [statsData, logsData, optionsData] = await Promise.all([
        statsResponse.json(),
        logsResponse.json(),
        optionsResponse.json()
      ]);

      setStats(statsData);
      setLogs(logsData.results || []);
      setFilterOptions(optionsData);
      
      // Update pagination info
      if (logsData.count !== undefined) {
        setTotalCount(logsData.count);
        setTotalPages(Math.ceil(logsData.count / 50)); // 50 items per page
      }

    } catch (error) {
      console.error('Failed to load audit data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load audit data');
      toast.error('Failed to load audit dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditData = async () => {
    try {
      setRefreshing(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters.action) params.append('action', filters.action);
      if (filters.resource_type) params.append('resource_type', filters.resource_type);
      if (filters.username) params.append('username', filters.username);
      if (filters.success) params.append('success', filters.success);
      if (filters.days) params.append('days', filters.days);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      params.append('page', currentPage.toString());

      // Load logs and stats in parallel
      const [logsResponse, statsResponse] = await Promise.all([
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/?${params}`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/statistics/?${filters.days ? `days=${filters.days}` : ''}`)
      ]);

      if (!logsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to refresh audit data');
      }

      const [logsData, statsData] = await Promise.all([
        logsResponse.json(),
        statsResponse.json()
      ]);

      setLogs(logsData.results || []);
      setStats(statsData);
      
      // Update pagination
      if (logsData.count !== undefined) {
        setTotalCount(logsData.count);
        setTotalPages(Math.ceil(logsData.count / 50));
      }

    } catch (error) {
      console.error('Failed to refresh audit data:', error);
      toast.error('Failed to refresh audit data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<AuditFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleRefresh = () => {
    loadAuditData();
  };

  const handleExport = () => {
    setShowExportDialog(true);
  };

  // Authentication loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Superuser access check
  if (!user?.is_superuser) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="max-w-2xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            Access Denied: Only superusers can access the audit dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Loading audit dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="max-w-2xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Audit Dashboard</h1>
            <p className="text-muted-foreground">
              Security and compliance monitoring for radiology system
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics Overview */}
      {stats && (
        <AuditStatisticsCards 
          stats={stats} 
          loading={refreshing}
        />
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="logs" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:grid-cols-2">
          <TabsTrigger value="logs" className="flex items-center space-x-2">
            <Eye className="h-4 w-4" />
            <span>Audit Logs</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Audit Logs Tab */}
        <TabsContent value="logs" className="space-y-6">
          {/* Filters */}
          {filterOptions && (
            <AuditFilters
              filters={filters}
              filterOptions={filterOptions}
              onFilterChange={handleFilterChange}
              loading={refreshing}
            />
          )}

          {/* Audit Logs Table */}
          <AuditTable
            logs={logs}
            loading={refreshing}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
          />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Actions */}
            {stats?.top_actions && stats.top_actions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Most Common Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.top_actions.map((item, index) => (
                      <div key={item.action} className="flex justify-between items-center">
                        <span className="font-medium">{item.action}</span>
                        <span className="text-muted-foreground">{item.count} times</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Most Active Users */}
            {stats?.top_users && stats.top_users.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Most Active Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.top_users.map((item, index) => (
                      <div key={item.username} className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.username}</span>
                        </div>
                        <span className="text-muted-foreground">{item.count} actions</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Daily Activity Chart */}
          {stats?.daily_activity && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Activity (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end space-x-2">
                  {stats.daily_activity.map((day, index) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center">
                      <div 
                        className="bg-blue-500 w-full min-h-[4px] rounded-t"
                        style={{ 
                          height: `${Math.max(4, (day.count / Math.max(...stats.daily_activity.map(d => d.count))) * 200)}px` 
                        }}
                      />
                      <div className="text-xs text-muted-foreground mt-2 text-center">
                        <div>{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div className="font-medium">{day.count}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Export Dialog */}
      <AuditExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        filterOptions={filterOptions}
        currentFilters={filters}
      />
    </div>
  );
}