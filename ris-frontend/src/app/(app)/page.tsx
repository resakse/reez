'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, FileText, Activity, HardDrive, Calendar, TrendingUp } from 'lucide-react';
import AuthService from '@/lib/auth';

type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all_time';

interface DashboardStats {
  patients: number;
  registrations: number;
  examinations: number;
  studies_completed: number;
}

interface Demographics {
  age_groups: { range: string; count: number; percentage: number }[];
  gender: { gender: string; count: number; percentage: number }[];
  race: { race: string; count: number; percentage: number }[];
}

interface ModalityStats {
  modality: string;
  count: number;
  percentage: number;
}

interface StorageInfo {
  primary_storage: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percentage: number;
  };
  growth_analysis: {
    daily_growth_gb: number;
    monthly_growth_gb: number;
    days_until_full: number;
    months_until_full: number;
    daily_exam_count: number;
  };
}

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('today');
  const [stats, setStats] = useState<Record<TimePeriod, DashboardStats>>({
    today: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0 },
    week: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0 },
    month: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0 },
    year: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0 },
    all_time: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0 },
  });
  
  const [demographics, setDemographics] = useState<Record<TimePeriod, Demographics>>({
    today: { age_groups: [], gender: [], race: [] },
    week: { age_groups: [], gender: [], race: [] },
    month: { age_groups: [], gender: [], race: [] },
    year: { age_groups: [], gender: [], race: [] },
    all_time: { age_groups: [], gender: [], race: [] },
  });

  const [modalityStats, setModalityStats] = useState<Record<TimePeriod, ModalityStats[]>>({
    today: [],
    week: [],
    month: [],
    year: [],
    all_time: [],
  });

  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    primary_storage: { total_gb: 0, used_gb: 0, free_gb: 0, usage_percentage: 0 },
    growth_analysis: { daily_growth_gb: 0, monthly_growth_gb: 0, days_until_full: 0, months_until_full: 0, daily_exam_count: 0 }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use absolute URLs to Django backend API directly
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      console.log('API_BASE:', API_BASE);
      
      const [statsRes, demographicsRes, modalityRes, storageRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/stats/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE}/api/dashboard/demographics/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE}/api/dashboard/modality-stats/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE}/api/dashboard/storage/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!statsRes.ok || !demographicsRes.ok || !modalityRes.ok || !storageRes.ok) {
        // Check for specific error responses
        const errors = await Promise.all([
          statsRes.ok ? null : statsRes.text(),
          demographicsRes.ok ? null : demographicsRes.text(),
          modalityRes.ok ? null : modalityRes.text(),
          storageRes.ok ? null : storageRes.text()
        ]);
        
        const errorMsg = errors.filter(e => e).join(', ') || 'Failed to fetch dashboard data';
        throw new Error(errorMsg);
      }

      const [statsData, demographicsData, modalityData, storageData] = await Promise.all([
        statsRes.json(),
        demographicsRes.json(),
        modalityRes.json(),
        storageRes.json()
      ]);

      setStats(statsData);
      setDemographics(demographicsData.by_period || {});
      setModalityStats(modalityData.by_period || {});
      setStorageInfo(storageData);

    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const currentStats = stats[selectedPeriod];
  const currentDemographics = demographics[selectedPeriod];
  const currentModalities = modalityStats[selectedPeriod];

  const getPeriodLabel = (period: TimePeriod) => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'year': return 'This Year';
      case 'all_time': return 'All Time';
      default: return 'Today';
    }
  };

  const getGenderRatio = () => {
    if (!currentDemographics.gender.length) return 'N/A';
    const male = currentDemographics.gender.find(g => g.gender === 'M');
    const female = currentDemographics.gender.find(g => g.gender === 'F');
    return `${male?.percentage || 0}%M / ${female?.percentage || 0}%F`;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">RIS Dashboard</h1>
          <p className="text-muted-foreground">
            Radiology Information System Statistics and Analytics
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={(value: TimePeriod) => setSelectedPeriod(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchDashboardData}
            className="ml-2"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentStats.patients}</div>
            <p className="text-xs text-muted-foreground">
              {getPeriodLabel(selectedPeriod)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cases</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentStats.examinations}</div>
            <p className="text-xs text-muted-foreground">
              {getPeriodLabel(selectedPeriod)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Studies</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentStats.studies_completed}</div>
            <p className="text-xs text-muted-foreground">
              Completed {getPeriodLabel(selectedPeriod).toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gender Ratio</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{getGenderRatio()}</div>
            <p className="text-xs text-muted-foreground">
              Male / Female distribution
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modality Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Modality Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {currentModalities.length > 0 ? (
              <div className="space-y-3">
                {currentModalities.map((modality, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium">{modality.modality}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-sm text-muted-foreground">
                        {modality.count} ({modality.percentage}%)
                      </div>
                      <div className="w-20 h-2 bg-muted rounded-full">
                        <div 
                          className="h-2 bg-primary rounded-full" 
                          style={{ width: `${modality.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No data available for {getPeriodLabel(selectedPeriod).toLowerCase()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Age Demographics */}
        <Card>
          <CardHeader>
            <CardTitle>Age Demographics</CardTitle>
          </CardHeader>
          <CardContent>
            {currentDemographics.age_groups.length > 0 ? (
              <div className="space-y-3">
                {currentDemographics.age_groups.map((age_group, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium">{age_group.range}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-sm text-muted-foreground">
                        {age_group.count} ({age_group.percentage}%)
                      </div>
                      <div className="w-20 h-2 bg-muted rounded-full">
                        <div 
                          className="h-2 bg-blue-500 rounded-full" 
                          style={{ width: `${age_group.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No data available for {getPeriodLabel(selectedPeriod).toLowerCase()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row - Race Distribution and Storage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Race Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Race Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {currentDemographics.race.length > 0 ? (
              <div className="space-y-3">
                {currentDemographics.race.map((race, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium">{race.race}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-sm text-muted-foreground">
                        {race.count} ({race.percentage}%)
                      </div>
                      <div className="w-20 h-2 bg-muted rounded-full">
                        <div 
                          className="h-2 bg-green-500 rounded-full" 
                          style={{ width: `${race.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No data available for {getPeriodLabel(selectedPeriod).toLowerCase()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Storage Management</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span>Storage Usage</span>
                  <span>{storageInfo.primary_storage.usage_percentage}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full mt-2">
                  <div 
                    className={`h-2 rounded-full ${
                      storageInfo.primary_storage.usage_percentage > 90 
                        ? 'bg-red-500' 
                        : storageInfo.primary_storage.usage_percentage > 80 
                        ? 'bg-yellow-500' 
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(storageInfo.primary_storage.usage_percentage, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {storageInfo.primary_storage.used_gb.toFixed(1)}GB / {storageInfo.primary_storage.total_gb.toFixed(1)}GB
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Daily Growth</div>
                  <div className="font-medium">{storageInfo.growth_analysis.daily_growth_gb.toFixed(2)}GB</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Daily Cases</div>
                  <div className="font-medium">{storageInfo.growth_analysis.daily_exam_count.toFixed(0)}</div>
                </div>
              </div>

              <div className="text-sm">
                <div className="text-muted-foreground">Estimated time until full:</div>
                <div className="font-medium">
                  {storageInfo.growth_analysis.days_until_full > 0 
                    ? `${storageInfo.growth_analysis.days_until_full} days (${storageInfo.growth_analysis.months_until_full.toFixed(1)} months)`
                    : 'Storage is full or no growth data'
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
