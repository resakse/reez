'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, FileText, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRejectStatistics } from '@/hooks/useRejectStatistics';
import RejectStatisticsCard from '@/components/reject-analysis/RejectStatisticsCard';
import RejectTrendsChart from '@/components/reject-analysis/RejectTrendsChart';
import RejectReasonChart from '@/components/reject-analysis/RejectReasonChart';
import { STATUS_CONFIG } from '@/types/reject-analysis';

export default function RejectAnalysisDashboard() {
  const { user } = useAuth();
  const { statistics, trends, loading, error } = useRejectStatistics();
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  
  const isSuperuser = user?.is_superuser || false;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">Failed to load reject analysis data</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Reject Analysis</h1>
          <p className="text-muted-foreground">
            Monitor and analyze image reject rates to improve quality
          </p>
        </div>
        
        <div className="flex gap-2">
          <Link href="/reject-analysis/incidents/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Incident
            </Button>
          </Link>
          
          <Link href="/reject-analysis/monthly/new">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              New Analysis
            </Button>
          </Link>
          
          {isSuperuser && (
            <Link href="/reject-analysis/settings">
              <Button variant="outline">
                <Settings2 className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Key Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RejectStatisticsCard
          title="Current Reject Rate"
          value={statistics?.current_reject_rate || 0}
          format="percentage"
          trend={statistics?.month_to_month_change}
          target={statistics?.target_reject_rate}
          className="col-span-1"
        />
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics?.current_month_rejects || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              rejects out of {statistics?.current_month_exams || 0} exams
            </p>
            <div className="mt-2">
              <Progress 
                value={statistics?.current_reject_rate || 0} 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Reject Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics?.ytd_reject_rate?.toFixed(2) || '0.00'}%
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics?.ytd_rejects || 0} / {statistics?.ytd_examinations || 0} exams
            </p>
            <div className="flex items-center mt-2">
              {statistics?.meets_ytd_target ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  On Target
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Above Target
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Previous Month</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics?.previous_reject_rate?.toFixed(2) || '0.00'}%
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics?.previous_month_rejects || 0} rejects
            </p>
            {statistics?.month_to_month_change !== undefined && (
              <p className={`text-xs mt-1 ${
                statistics.month_to_month_change > 0 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                {statistics.month_to_month_change > 0 ? '+' : ''}
                {statistics.month_to_month_change.toFixed(1)}% from last month
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trends Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Reject Rate Trends</CardTitle>
            <CardDescription>
              Monthly reject rates vs target performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectTrendsChart 
              data={trends || []} 
              period={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Top Reject Reasons</CardTitle>
            <CardDescription>
              Most common causes this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectReasonChart 
              data={statistics?.top_categories || []}
            />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Reject Tracking</CardTitle>
            <CardDescription>
              Log daily reject counts using calendar interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Link href="/reject-analysis/daily" className="flex-1">
                <Button variant="outline" className="w-full">
                  Open Calendar
                </Button>
              </Link>
              <Link href="/reject-analysis/incidents" className="flex-1">
                <Button variant="outline" className="w-full">
                  View Incidents
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Analysis</CardTitle>
            <CardDescription>
              Comprehensive monthly quality reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Link href="/reject-analysis/monthly" className="flex-1">
                <Button variant="outline" className="w-full">
                  View Reports
                </Button>
              </Link>
              <Link href="/reject-analysis/monthly/new">
                <Button>
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Categories</CardTitle>
            <CardDescription>
              Manage reject reason categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reject-analysis/categories">
              <Button variant="outline" className="w-full">
                Manage Categories
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Latest reject incidents and monthly analyses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="incidents" className="w-full">
            <TabsList>
              <TabsTrigger value="incidents">Recent Incidents</TabsTrigger>
              <TabsTrigger value="analyses">Monthly Reports</TabsTrigger>
            </TabsList>
            
            <TabsContent value="incidents" className="mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>Recent incidents will be displayed here</p>
                <Link href="/reject-analysis/incidents">
                  <Button variant="outline" className="mt-2">
                    View All Incidents
                  </Button>
                </Link>
              </div>
            </TabsContent>
            
            <TabsContent value="analyses" className="mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <p>Recent monthly analyses will be displayed here</p>
                <Link href="/reject-analysis/monthly">
                  <Button variant="outline" className="mt-2">
                    View All Reports
                  </Button>
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}