'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Calendar, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import DailyRejectCalendar from '@/components/reject-analysis/DailyRejectCalendar';

export default function DailyRejectTrackingPage() {
  const [targetRate, setTargetRate] = useState<number>(2.0);
  const [loading, setLoading] = useState(true);

  // Load target rates from backend API
  useEffect(() => {
    const loadTargets = async () => {
      try {
        const targets = await rejectAnalysisApi.targets.getModalityTargets();
        setTargetRate(targets.overall);
        console.log('DAILY PAGE: Loaded target rate:', targets.overall);
      } catch (error) {
        console.error('DAILY PAGE: Failed to load target rates:', error);
        // Keep default 2.0 if API fails
      } finally {
        setLoading(false);
      }
    };

    loadTargets();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reject-analysis">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Reject Tracking</h1>
          <p className="text-muted-foreground">
            Log daily reject incidents by clicking on calendar days
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Rejects</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">No rejects logged today</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground">+2 from last week</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">25</div>
            <p className="text-xs text-muted-foreground">1.8% reject rate</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Target</CardTitle>
            <div className="h-4 w-4 rounded-full bg-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : `${targetRate}%`}
            </div>
            <p className="text-xs text-green-600">Current target</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <DailyRejectCalendar />

    </div>
  );
}