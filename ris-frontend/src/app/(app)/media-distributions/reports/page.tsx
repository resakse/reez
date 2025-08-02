'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, BarChart3, RefreshCw, Loader2, TrendingUp, Package, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  LabelList
} from 'recharts';
import { MediaDistributionStats, MEDIA_STATUS_CONFIG, MEDIA_TYPE_CONFIG, URGENCY_CONFIG } from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

const COLORS = {
  REQUESTED: '#3b82f6',
  PREPARING: '#f59e0b',
  READY: '#10b981',
  COLLECTED: '#6b7280',
  CANCELLED: '#ef4444',
};

const MEDIA_COLORS = {
  CD: '#8b5cf6',
  DVD: '#06b6d4',
  XRAY_FILM: '#f97316',
  USB: '#84cc16',
  DIGITAL_COPY: '#ec4899',
};

const URGENCY_COLORS = {
  NORMAL: '#6b7280',
  URGENT: '#f59e0b',
  STAT: '#ef4444',
};

export default function MediaDistributionReportsPage() {
  const [stats, setStats] = useState<MediaDistributionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await MediaDistributionAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
      toast.error('Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStats = async () => {
    try {
      setIsRefreshing(true);
      const data = await MediaDistributionAPI.getStats();
      setStats(data);
      toast.success('Statistics refreshed');
    } catch (error) {
      console.error('Failed to refresh statistics:', error);
      toast.error('Failed to refresh statistics');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Prepare chart data - include all entries to show zero values
  const statusChartData = stats ? Object.entries(stats.status_breakdown).map(([status, count]) => ({
    status: MEDIA_STATUS_CONFIG[status as keyof typeof MEDIA_STATUS_CONFIG]?.label || status,
    count,
    color: COLORS[status as keyof typeof COLORS]
  })) : [];

  const mediaTypeChartData = stats ? Object.entries(stats.media_type_breakdown)
    .filter(([type, count]) => count > 0) // Only show media types that have been used
    .map(([type, count]) => ({
      type: MEDIA_TYPE_CONFIG[type as keyof typeof MEDIA_TYPE_CONFIG]?.label || type,
      count,
      color: MEDIA_COLORS[type as keyof typeof MEDIA_COLORS]
    })) : [];

  const urgencyChartData = stats?.urgency_breakdown ? Object.entries(stats.urgency_breakdown).map(([urgency, count]) => ({
    urgency: URGENCY_CONFIG[urgency as keyof typeof URGENCY_CONFIG]?.label || urgency,
    count,
    color: URGENCY_COLORS[urgency as keyof typeof URGENCY_COLORS]
  })) : [];

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="container mx-auto py-6">
          <div className="flex items-center justify-center min-h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <Link href="/media-distributions">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Distributions
                </Button>
              </Link>
            </div>
            
            <h1 className="text-3xl font-bold tracking-tight">Media Distribution Reports</h1>
            <p className="text-muted-foreground mt-2">
              Analytics and statistics for media distribution requests
            </p>
          </div>
          
          <Button 
            variant="outline" 
            onClick={refreshStats}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {stats && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_distributions}</div>
                  <p className="text-xs text-muted-foreground">
                    All time requests
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.status_breakdown.REQUESTED + stats.status_breakdown.PREPARING}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting preparation
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ready</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.status_breakdown.READY}</div>
                  <p className="text-xs text-muted-foreground">
                    Ready for collection
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Collected</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.status_breakdown.COLLECTED}</div>
                  <p className="text-xs text-muted-foreground">
                    Successfully distributed
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribution by Status</CardTitle>
                  <CardDescription>
                    Current status breakdown of all media distributions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {statusChartData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No status data available</p>
                      <p className="text-sm">Create some media distribution requests to see data</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={statusChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="status" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8884d8">
                          {statusChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                          <LabelList dataKey="count" position="center" style={{ fontSize: '14px', fontWeight: 'bold', fill: 'white' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Media Type Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribution by Media Type</CardTitle>
                  <CardDescription>
                    Breakdown of requested media types
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {mediaTypeChartData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No media type data available</p>
                      <p className="text-sm">Create some media distribution requests to see data</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={mediaTypeChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ type, count, percent }) => `${MEDIA_TYPE_CONFIG[type as keyof typeof MEDIA_TYPE_CONFIG]?.label || type}\n${count} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={80}
                          innerRadius={20}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {mediaTypeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Urgency Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribution by Urgency</CardTitle>
                  <CardDescription>
                    Priority levels of media distribution requests
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {urgencyChartData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No urgency data available</p>
                      <p className="text-sm">Create some media distribution requests to see data</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={urgencyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="urgency" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8884d8" minPointSize={10}>
                          {urgencyChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                          <LabelList dataKey="count" position="center" style={{ fontSize: '14px', fontWeight: 'bold', fill: 'white' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>
                    Activity summary for the last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">New Requests</p>
                        <p className="text-xs text-muted-foreground">Last 30 days</p>
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        {stats.recent_activity.requests_last_30_days}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Collections</p>
                        <p className="text-xs text-muted-foreground">Last 30 days</p>
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {stats.recent_activity.collections_last_30_days}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed Breakdown</CardTitle>
                <CardDescription>
                  Comprehensive statistics overview
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Status Counts</h4>
                    <div className="space-y-2">
                      {Object.entries(stats.status_breakdown).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={MEDIA_STATUS_CONFIG[status as keyof typeof MEDIA_STATUS_CONFIG]?.color}>
                              {MEDIA_STATUS_CONFIG[status as keyof typeof MEDIA_STATUS_CONFIG]?.label || status}
                            </Badge>
                          </div>
                          <span className="font-mono text-sm">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Media Types</h4>
                    <div className="space-y-2">
                      {Object.entries(stats.media_type_breakdown).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{MEDIA_TYPE_CONFIG[type as keyof typeof MEDIA_TYPE_CONFIG]?.icon}</span>
                            <span className="text-sm">{MEDIA_TYPE_CONFIG[type as keyof typeof MEDIA_TYPE_CONFIG]?.label || type}</span>
                          </div>
                          <span className="font-mono text-sm">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Urgency Levels</h4>
                    <div className="space-y-2">
                      {Object.entries(stats.urgency_breakdown).map(([urgency, count]) => (
                        <div key={urgency} className="flex items-center justify-between">
                          <Badge className={URGENCY_CONFIG[urgency as keyof typeof URGENCY_CONFIG]?.color}>
                            {urgency}
                          </Badge>
                          <span className="font-mono text-sm">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}