'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, FileText, Activity, HardDrive, Calendar, TrendingUp } from 'lucide-react';
import AuthService from '@/lib/auth';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import SettingsModal from '@/components/SettingsModal';

type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all_time';

interface DashboardStats {
  patients: number;
  registrations: number;
  examinations: number;
  studies_completed: number;
  cases_per_day: number;
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
  system_resources: {
    cpu_usage_percent: number;
    ram_total_gb: number;
    ram_used_gb: number;
    ram_available_gb: number;
    ram_usage_percent: number;
    disk_read_mb: number;
    disk_write_mb: number;
  };
}

interface BodypartsExamTypes {
  bodyparts: { bodypart: string; count: number; percentage: number }[];
  exam_types: { exam_type: string; count: number; percentage: number }[];
}

// Memoized chart components to prevent re-renders when only system resources change
const ModalityChart = memo(({ data, period }: { data: ModalityStats[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Modality Distribution</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="modality"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                label={({modality, count, percentage}) => `${modality}: ${count} (${percentage}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${index * 137.5 % 360}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `${name} examinations`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

const AgeChart = memo(({ data, period }: { data: any[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Age Demographics</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip formatter={(value, name) => [value, name === 'count' ? 'Patients' : name]} />
              <Bar dataKey="count" fill="#3b82f6">
                <LabelList dataKey="count" position="top" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

const GenderChart = memo(({ data, period }: { data: any[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Gender Distribution</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="gender"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                label={({gender, count, percentage}) => `${gender === 'M' ? 'Male' : 'Female'}: ${count} (${percentage}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.gender === 'M' ? '#3b82f6' : '#ec4899'} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `${name === 'M' ? 'Male' : 'Female'} patients`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

const RaceChart = memo(({ data, period }: { data: any[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Race Distribution</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="race"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                label={({race, count, percentage}) => `${race || 'Unknown'}: ${count} (${percentage}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${160 + index * 60}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `${name} patients`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

const BodypartsChart = memo(({ data, period }: { data: any[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Body Parts Distribution</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="bodypart"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                label={({bodypart, count, percentage}) => `${bodypart}: ${count} (${percentage}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${200 + index * 45}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `${name} examinations`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

const ExamTypesChart = memo(({ data, period }: { data: any[], period: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>Exam Types Distribution</CardTitle>
    </CardHeader>
    <CardContent>
      {data && data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="exam_type"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                label={({exam_type, count, percentage}) => `${exam_type}: ${count} (${percentage}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${280 + index * 50}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `${name} examinations`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No data available for {period.toLowerCase()}
        </div>
      )}
    </CardContent>
  </Card>
));

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('today');
  const [stats, setStats] = useState<Record<TimePeriod, DashboardStats>>({
    today: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0, cases_per_day: 0 },
    week: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0, cases_per_day: 0 },
    month: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0, cases_per_day: 0 },
    year: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0, cases_per_day: 0 },
    all_time: { patients: 0, registrations: 0, examinations: 0, studies_completed: 0, cases_per_day: 0 },
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
    growth_analysis: { daily_growth_gb: 0, monthly_growth_gb: 0, days_until_full: 0, months_until_full: 0, daily_exam_count: 0 },
    system_resources: { cpu_usage_percent: 0, ram_total_gb: 0, ram_used_gb: 0, ram_available_gb: 0, ram_usage_percent: 0, disk_read_mb: 0, disk_write_mb: 0 }
  });

  const [bodypartsExamTypes, setBodypartsExamTypes] = useState<Record<TimePeriod, BodypartsExamTypes>>({
    today: { bodyparts: [], exam_types: [] },
    week: { bodyparts: [], exam_types: [] },
    month: { bodyparts: [], exam_types: [] },
    year: { bodyparts: [], exam_types: [] },
    all_time: { bodyparts: [], exam_types: [] },
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    // Only fetch initial data once
    if (!dataLoaded) {
      fetchDashboardData();
    }
    
    // Set up WebSocket connection for ALL live dashboard updates
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsUrl = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/dashboard/';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected for live dashboard updates');
    };
    
    ws.onmessage = (event) => {
      try {
        const dashboardUpdate = JSON.parse(event.data);
        
        // ONLY update system resources and storage - NEVER touch chart data
        if (dashboardUpdate.type === 'system_resources') {
          setStorageInfo(prev => ({
            ...prev,
            system_resources: dashboardUpdate.data
          }));
        } else if (dashboardUpdate.type === 'storage_info') {
          setStorageInfo(prev => ({
            ...prev,
            primary_storage: dashboardUpdate.data.primary_storage,
            growth_analysis: dashboardUpdate.data.growth_analysis
          }));
        }
        // Explicitly ignore all chart-related updates to prevent flashing
        
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };
    
    ws.onerror = (error) => {
      console.warn('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
    
    return () => {
      ws.close();
    };
  }, [dataLoaded]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use absolute URLs to Django backend API directly
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      console.log('API_BASE:', API_BASE);
      
      const [statsRes, demographicsRes, modalityRes, storageRes, bodypartsRes] = await Promise.all([
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
        }),
        fetch(`${API_BASE}/api/dashboard/bodyparts-examtypes/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!statsRes.ok || !demographicsRes.ok || !modalityRes.ok || !storageRes.ok || !bodypartsRes.ok) {
        // Check for specific error responses
        const errors = await Promise.all([
          statsRes.ok ? null : statsRes.text(),
          demographicsRes.ok ? null : demographicsRes.text(),
          modalityRes.ok ? null : modalityRes.text(),
          storageRes.ok ? null : storageRes.text(),
          bodypartsRes.ok ? null : bodypartsRes.text()
        ]);
        
        const errorMsg = errors.filter(e => e).join(', ') || 'Failed to fetch dashboard data';
        throw new Error(errorMsg);
      }

      const [statsData, demographicsData, modalityData, storageData, bodypartsData] = await Promise.all([
        statsRes.json(),
        demographicsRes.json(),
        modalityRes.json(),
        storageRes.json(),
        bodypartsRes.json()
      ]);

      // Update stats (metric cards)
      setStats(statsData || {});
      
      // Check if chart data has actually changed before updating
      const periods: TimePeriod[] = ['today', 'week', 'month', 'year', 'all_time'];
      
      // Handle demographics data structure
      const demographicsWithDefaults: Record<TimePeriod, Demographics> = {} as Record<TimePeriod, Demographics>;
      periods.forEach(period => {
        demographicsWithDefaults[period] = demographicsData.by_period?.[period] || { age_groups: [], gender: [], race: [] };
      });
      
      // Compare actual data values from API, not current state
      const currentDemographicsStr = JSON.stringify(demographics);
      const newDemographicsStr = JSON.stringify(demographicsWithDefaults);
      
      console.log('Current demographics:', currentDemographicsStr.substring(0, 100));
      console.log('New demographics:', newDemographicsStr.substring(0, 100));
      console.log('Are they equal?', currentDemographicsStr === newDemographicsStr);
      
      // Only update if the stringified data is actually different
      if (currentDemographicsStr !== newDemographicsStr) {
        console.log('Demographics data ACTUALLY changed, updating charts');
        setDemographics(demographicsWithDefaults);
      } else {
        console.log('Demographics data is SAME, NOT updating');
      }
      
      // Handle modality stats data structure  
      const modalityWithDefaults: Record<TimePeriod, ModalityStats[]> = {} as Record<TimePeriod, ModalityStats[]>;
      periods.forEach(period => {
        modalityWithDefaults[period] = modalityData.by_period?.[period] || [];
      });
      
      const currentModalityStr = JSON.stringify(modalityStats);
      const newModalityStr = JSON.stringify(modalityWithDefaults);
      
      if (currentModalityStr !== newModalityStr) {
        console.log('Modality data ACTUALLY changed, updating charts');
        setModalityStats(modalityWithDefaults);
      } else {
        console.log('Modality data is SAME, NOT updating');
      }

      // Handle bodyparts and exam types data structure
      const bodypartsWithDefaults: Record<TimePeriod, BodypartsExamTypes> = {} as Record<TimePeriod, BodypartsExamTypes>;
      periods.forEach(period => {
        bodypartsWithDefaults[period] = bodypartsData.by_period?.[period] || { bodyparts: [], exam_types: [] };
      });
      
      const currentBodypartsStr = JSON.stringify(bodypartsExamTypes);
      const newBodypartsStr = JSON.stringify(bodypartsWithDefaults);
      
      if (currentBodypartsStr !== newBodypartsStr) {
        console.log('Bodyparts data ACTUALLY changed, updating charts');
        setBodypartsExamTypes(bodypartsWithDefaults);
      } else {
        console.log('Bodyparts data is SAME, NOT updating');
      }
      
      // ALWAYS set storage info (but only non-system-resources parts on initial load)
      setStorageInfo(prev => ({
        primary_storage: storageData.primary_storage || prev.primary_storage,
        growth_analysis: storageData.growth_analysis || prev.growth_analysis,
        system_resources: prev.system_resources // Keep existing system resources from WebSocket
      }));

    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };


  const currentStats = stats[selectedPeriod];
  const currentDemographics = demographics[selectedPeriod];
  const currentModalities = modalityStats[selectedPeriod];
  const currentBodypartsExamTypes = bodypartsExamTypes[selectedPeriod];

  // Memoize chart data to prevent re-renders when only system resources change
  const memoizedChartData = useMemo(() => ({
    demographics: currentDemographics,
    modalities: currentModalities,
    bodypartsExamTypes: currentBodypartsExamTypes
  }), [currentDemographics, currentModalities, currentBodypartsExamTypes]);

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
    if (!currentDemographics || !currentDemographics.gender || !currentDemographics.gender.length) return 'N/A';
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
            onClick={() => {
              console.log('Manual refresh clicked');
              fetchDashboardData();
            }}
            className="ml-2"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <SettingsModal onConfigUpdate={fetchDashboardData} />
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
            <CardTitle className="text-sm font-medium">Cases Per Day</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentStats.cases_per_day}</div>
            <p className="text-xs text-muted-foreground">
              Average daily examinations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modality Distribution */}
        <ModalityChart 
          data={memoizedChartData.modalities} 
          period={getPeriodLabel(selectedPeriod)}
        />

        {/* Age Demographics */}
        <AgeChart 
          data={memoizedChartData.demographics?.age_groups || []} 
          period={getPeriodLabel(selectedPeriod)}
        />
      </div>

      {/* Demographics Row - Gender and Race Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gender Distribution */}
        <GenderChart 
          data={memoizedChartData.demographics?.gender || []} 
          period={getPeriodLabel(selectedPeriod)}
        />

        {/* Race Distribution */}
        <RaceChart 
          data={memoizedChartData.demographics?.race || []} 
          period={getPeriodLabel(selectedPeriod)}
        />
      </div>

      {/* Body Parts and Exam Types Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BodypartsChart 
          data={memoizedChartData.bodypartsExamTypes?.bodyparts || []} 
          period={getPeriodLabel(selectedPeriod)}
        />
        
        <ExamTypesChart 
          data={memoizedChartData.bodypartsExamTypes?.exam_types || []} 
          period={getPeriodLabel(selectedPeriod)}
        />
      </div>

      {/* Storage Management Row - Bottom */}
      <div className="grid grid-cols-1 gap-6">
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

              {/* System Resources Section */}
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-3">System Resources</div>
                
                {/* CPU Usage */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>CPU Usage</span>
                    <span>{storageInfo.system_resources.cpu_usage_percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full mt-1">
                    <div 
                      className={`h-2 rounded-full ${
                        storageInfo.system_resources.cpu_usage_percent > 90 
                          ? 'bg-red-500' 
                          : storageInfo.system_resources.cpu_usage_percent > 70 
                          ? 'bg-yellow-500' 
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(storageInfo.system_resources.cpu_usage_percent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* RAM Usage */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>RAM Usage</span>
                    <span>{storageInfo.system_resources.ram_usage_percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full mt-1">
                    <div 
                      className={`h-2 rounded-full ${
                        storageInfo.system_resources.ram_usage_percent > 90 
                          ? 'bg-red-500' 
                          : storageInfo.system_resources.ram_usage_percent > 80 
                          ? 'bg-yellow-500' 
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(storageInfo.system_resources.ram_usage_percent, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {storageInfo.system_resources.ram_used_gb.toFixed(1)}GB / {storageInfo.system_resources.ram_total_gb.toFixed(1)}GB
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
