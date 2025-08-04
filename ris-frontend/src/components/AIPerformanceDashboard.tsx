'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Brain, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Activity,
  Users,
  BarChart3,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';

interface DashboardStats {
  basic_stats: {
    total_ai_reports: number;
    pending_review: number;
    approved_reports: number;
    critical_findings: number;
    average_confidence: number;
    average_processing_time: number;
  };
  modality_stats: Array<{
    pemeriksaan__exam__modaliti__nama: string;
    count: number;
    avg_confidence: number;
    critical_count: number;
  }>;
  daily_trend: Array<{
    date: string;
    count: number;
  }>;
  radiologist_stats: Array<{
    radiologist__first_name: string;
    radiologist__last_name: string;
    reports_completed: number;
    avg_time_saved: number;
    avg_ai_adoption: number;
  }>;
  model_performance: Array<{
    model_version: string;
    avg_accuracy: number;
    total_reports: number;
    avg_time_saved: number;
  }>;
  system_health: {
    ai_reporting_enabled: boolean;
    maintenance_mode: boolean;
    qa_validation_enabled: boolean;
    critical_notifications_enabled: boolean;
    last_config_update: string;
  };
  date_range: {
    start_date: string;
    end_date: string;
    days: number;
  };
}

interface PerformanceMetrics {
  overall_performance: {
    avg_accuracy: number;
    avg_processing_time: number;
    avg_time_saved: number;
    total_reports: number;
  };
  modality_performance: Array<{
    modality__nama: string;
    avg_accuracy: number;
    total_reports: number;
  }>;
  ai_reports_stats: {
    total_generated: number;
    pending_review: number;
    approved: number;
    critical_findings: number;
    avg_confidence: number;
  };
}

export default function AIPerformanceDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [performanceData, setPerformanceData] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('30');

  useEffect(() => {
    loadDashboardData();
    loadPerformanceData();
  }, [selectedPeriod]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/dashboard/?days=${selectedPeriod}`);
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        toast.error('Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPerformanceData = async () => {
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/performance/summary/?days=${selectedPeriod}`);
      if (response.ok) {
        const data = await response.json();
        setPerformanceData(data);
      }
    } catch (error) {
      console.error('Error loading performance data:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadDashboardData(), loadPerformanceData()]);
    setIsRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const formatNumber = (value: number, decimals = 0) => {
    if (value === null || value === undefined) return 'N/A';
    return Number(value).toFixed(decimals);
  };

  const formatPercentage = (value: number) => {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading AI Performance Dashboard...</span>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
          <p>Failed to load dashboard data</p>
          <Button onClick={handleRefresh} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8" />
            AI Performance Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monitor AI reporting system performance and analytics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            variant="outline"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dashboardData.system_health.ai_reporting_enabled ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">AI Reporting</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData.system_health.ai_reporting_enabled ? 'Active' : 'Inactive'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${!dashboardData.system_health.maintenance_mode ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium">System Status</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData.system_health.maintenance_mode ? 'Maintenance' : 'Operational'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dashboardData.system_health.qa_validation_enabled ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium">QA Validation</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData.system_health.qa_validation_enabled ? 'Enabled' : 'Disabled'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dashboardData.system_health.critical_notifications_enabled ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium">Alerts</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData.system_health.critical_notifications_enabled ? 'Active' : 'Inactive'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Last Update</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData.system_health.last_config_update ? 
                new Date(dashboardData.system_health.last_config_update).toLocaleDateString() : 
                'Never'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total AI Reports</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.basic_stats.total_ai_reports}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardData.basic_stats.pending_review} pending review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercentage(dashboardData.basic_stats.average_confidence)}
            </div>
            <Progress 
              value={dashboardData.basic_stats.average_confidence * 100} 
              className="mt-2" 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTime(dashboardData.basic_stats.average_processing_time)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average per report
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {dashboardData.basic_stats.critical_findings}
            </div>
            <p className="text-xs text-muted-foreground">
              Require urgent review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="modality" className="space-y-4">
        <TabsList>
          <TabsTrigger value="modality">Modality Performance</TabsTrigger>
          <TabsTrigger value="radiologists">Radiologist Activity</TabsTrigger>
          <TabsTrigger value="models">Model Performance</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="modality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Modality</CardTitle>
              <CardDescription>
                AI report generation statistics grouped by imaging modality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.modality_stats.map((modality, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Badge variant="secondary">
                        {modality.pemeriksaan__exam__modaliti__nama || 'Unknown'}
                      </Badge>
                      <div>
                        <p className="font-medium">{modality.count} reports</p>
                        <p className="text-sm text-muted-foreground">
                          {formatPercentage(modality.avg_confidence)} avg confidence
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {modality.critical_count > 0 && (
                        <Badge variant="destructive">
                          {modality.critical_count} critical
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="radiologists" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Radiologist Activity</CardTitle>
              <CardDescription>
                Report completion and AI adoption statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.radiologist_stats.map((radiologist, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Users className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">
                          {radiologist.radiologist__first_name} {radiologist.radiologist__last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {radiologist.reports_completed} reports completed
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatTime(radiologist.avg_time_saved)} saved avg
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatPercentage(radiologist.avg_ai_adoption)} AI adoption
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Model Performance</CardTitle>
              <CardDescription>
                Performance metrics for different AI model versions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.model_performance.map((model, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <BarChart3 className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">{model.model_version}</p>
                        <p className="text-sm text-muted-foreground">
                          {model.total_reports} reports generated
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatPercentage(model.avg_accuracy)} accuracy
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(model.avg_time_saved)} saved avg
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Report Generation Trend</CardTitle>
              <CardDescription>
                Number of AI reports generated per day over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dashboardData.daily_trend.map((day, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm">
                      {new Date(day.date).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ 
                            width: `${Math.max(5, (day.count / Math.max(...dashboardData.daily_trend.map(d => d.count))) * 100)}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">
                        {day.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Performance Summary */}
      {performanceData && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
            <CardDescription>
              Overall system performance metrics for the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {formatPercentage(performanceData.overall_performance.avg_accuracy)}
                </p>
                <p className="text-sm text-muted-foreground">Average Accuracy</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {formatTime(performanceData.overall_performance.avg_processing_time)}
                </p>
                <p className="text-sm text-muted-foreground">Avg Processing Time</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {formatTime(performanceData.overall_performance.avg_time_saved)}
                </p>
                <p className="text-sm text-muted-foreground">Avg Time Saved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {performanceData.overall_performance.total_reports || 0}
                </p>
                <p className="text-sm text-muted-foreground">Total Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}