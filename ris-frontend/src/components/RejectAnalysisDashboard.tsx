'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, TrendingUp, TrendingDown, Eye, FileText, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import {
  RejectStatistics,
  MonthlyRejectAnalysis,
  RejectTrendData,
  Language,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
} from '@/types/reject-analysis';
import rejectAnalysisApi from '@/lib/reject-analysis-api';
import RejectStatisticsCard from '@/components/reject-analysis/RejectStatisticsCard';
import RejectTrendsChart from '@/components/reject-analysis/RejectTrendsChart';
import RejectReasonChart from '@/components/reject-analysis/RejectReasonChart';

interface RejectAnalysisDashboardProps {
  language?: Language;
}

const translations = {
  en: {
    title: 'Reject Analysis Dashboard',
    subtitle: 'Monitor image quality and reject rates across all modalities',
    currentStats: 'Current Month Statistics',
    monthlyTrends: 'Monthly Trends',
    rejectReasons: 'Reject Reasons Distribution',
    recentAnalyses: 'Recent Monthly Analyses',
    quickActions: 'Quick Actions',
    viewYear: 'View Year',
    noData: 'No data available',
    loading: 'Loading...',
    error: 'Error loading data',
    refresh: 'Refresh',
    newIncident: 'Log Reject Incident',
    newAnalysis: 'Create Monthly Analysis',
    manageCategories: 'Manage Categories',
    viewAllIncidents: 'View All Incidents',
    viewAllAnalyses: 'View All Analyses',
    settings: 'Settings',
    selectYear: 'Select Year',
    status: 'Status',
    rejectRate: 'Reject Rate',
    target: 'Target',
    actions: 'Actions',
    view: 'View',
    edit: 'Edit',
    meetsTarget: 'Meets Target',
    aboveTarget: 'Above Target',
    draft: 'Draft',
    completed: 'Completed',
    approved: 'Approved',
  },
  ms: {
    title: 'Papan Pemuka Analisis Penolakan',
    subtitle: 'Memantau kualiti imej dan kadar penolakan merentas semua modaliti',
    currentStats: 'Statistik Bulan Semasa',
    monthlyTrends: 'Trend Bulanan',
    rejectReasons: 'Taburan Sebab Penolakan',
    recentAnalyses: 'Analisis Bulanan Terkini',
    quickActions: 'Tindakan Pantas',
    viewYear: 'Lihat Tahun',
    noData: 'Tiada data tersedia',
    loading: 'Memuatkan...',
    error: 'Ralat memuatkan data',
    refresh: 'Muat Semula',
    newIncident: 'Catat Insiden Penolakan',
    newAnalysis: 'Cipta Analisis Bulanan',
    manageCategories: 'Urus Kategori',
    viewAllIncidents: 'Lihat Semua Insiden',
    viewAllAnalyses: 'Lihat Semua Analisis',
    settings: 'Tetapan',
    selectYear: 'Pilih Tahun',
    status: 'Status',
    rejectRate: 'Kadar Penolakan',
    target: 'Sasaran',
    actions: 'Tindakan',
    view: 'Lihat',
    edit: 'Edit',
    meetsTarget: 'Mencapai Sasaran',
    aboveTarget: 'Melebihi Sasaran',
    draft: 'Draf',
    completed: 'Selesai',
    approved: 'Diluluskan',
  }
};

export default function RejectAnalysisDashboard({ language = 'en' }: RejectAnalysisDashboardProps) {
  const t = translations[language];
  
  const [statistics, setStatistics] = useState<RejectStatistics | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<MonthlyRejectAnalysis[]>([]);
  const [trendData, setTrendData] = useState<RejectTrendData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load data in parallel - API methods return parsed data directly
      const [statsData, analysesData, trendsData] = await Promise.all([
        rejectAnalysisApi.statistics.getStatistics(),
        rejectAnalysisApi.monthly.getAnalyses({ ordering: '-year,-month', page_size: 6 }),
        rejectAnalysisApi.statistics.getTrends({ year: selectedYear })
      ]);

      setStatistics(statsData);
      setRecentAnalyses(analysesData.results || []);
      setTrendData(trendsData.results || trendsData);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  const formatMonth = (month: number): string => {
    const monthNames = language === 'ms' 
      ? ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return monthNames[month - 1] || month.toString();
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
    if (!config) return null;

    return (
      <Badge variant="secondary" className={config.color}>
        {language === 'ms' ? config.label_ms : config.label}
      </Badge>
    );
  };

  const getTargetBadge = (rejectRate: number, targetRate: number) => {
    const meetsTarget = rejectRate <= targetRate;
    return (
      <Badge variant={meetsTarget ? "default" : "destructive"} className="text-xs">
        {meetsTarget ? t.meetsTarget : t.aboveTarget}
      </Badge>
    );
  };

  if (loading && !statistics) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-96 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Statistics Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error && !statistics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {t.error}
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRefresh} variant="outline">
            {t.refresh}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t.selectYear} />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={handleRefresh} variant="outline" size="sm">
            {t.refresh}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <RejectStatisticsCard
            title={language === 'ms' ? 'Kadar Penolakan Semasa' : 'Current Reject Rate'}
            value={`${statistics.current_reject_rate.toFixed(2)}%`}
            trend={statistics.month_to_month_change}
            target={statistics.target_reject_rate}
            meetsTarget={statistics.meets_current_target}
            language={language}
          />
          
          <RejectStatisticsCard
            title={language === 'ms' ? 'Jumlah Penolakan Bulan Ini' : 'This Month Rejects'}
            value={statistics.current_month_rejects.toString()}
            change={statistics.current_month_rejects - statistics.previous_month_rejects}
            language={language}
          />
          
          <RejectStatisticsCard
            title={language === 'ms' ? 'Kadar YTD' : 'YTD Reject Rate'}
            value={`${statistics.ytd_reject_rate.toFixed(2)}%`}
            target={statistics.target_reject_rate}
            meetsTarget={statistics.meets_ytd_target}
            language={language}
          />
          
          <RejectStatisticsCard
            title={language === 'ms' ? 'Jumlah Pemeriksaan Bulan Ini' : 'This Month Examinations'}
            value={statistics.current_month_exams.toString()}
            change={statistics.current_month_exams - statistics.previous_month_exams}
            language={language}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.monthlyTrends}</CardTitle>
            <CardDescription>
              {language === 'ms' 
                ? `Trend kadar penolakan untuk tahun ${selectedYear}`
                : `Reject rate trends for ${selectedYear}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectTrendsChart data={trendData} language={language} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.rejectReasons}</CardTitle>
            <CardDescription>
              {language === 'ms' 
                ? 'Taburan kategori penolakan bulan semasa'
                : 'Current month reject categories distribution'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RejectReasonChart 
              data={statistics?.top_categories || []} 
              language={language} 
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Analyses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t.recentAnalyses}</CardTitle>
            <CardDescription>
              {language === 'ms' 
                ? 'Analisis bulanan terkini dan statusnya'
                : 'Latest monthly analyses and their status'
              }
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/reject-analysis/monthly">
              {t.viewAllAnalyses}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentAnalyses.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">{t.noData}</p>
          ) : (
            <div className="space-y-4">
              {recentAnalyses.map((analysis) => (
                <div key={analysis.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <h4 className="font-medium">
                        {formatMonth(analysis.month)} {analysis.year}
                      </h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{t.rejectRate}: {analysis.reject_rate.toFixed(2)}%</span>
                        <span>•</span>
                        <span>{t.target}: {analysis.target_reject_rate}%</span>
                        {getTargetBadge(analysis.reject_rate, analysis.target_reject_rate)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getStatusBadge(analysis.status)}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/reject-analysis/monthly/${analysis.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        {t.view}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t.quickActions}</CardTitle>
          <CardDescription>
            {language === 'ms' 
              ? 'Tindakan pantas untuk pengurusan analisis penolakan'
              : 'Quick actions for reject analysis management'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button asChild className="h-auto p-4">
              <Link href="/reject-analysis/incidents/new">
                <div className="flex flex-col items-center gap-2">
                  <Plus className="h-6 w-6" />
                  <span className="text-sm font-medium">{t.newIncident}</span>
                </div>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-auto p-4">
              <Link href="/reject-analysis/monthly/new">
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-6 w-6" />
                  <span className="text-sm font-medium">{t.newAnalysis}</span>
                </div>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-auto p-4">
              <Link href="/reject-analysis/categories">
                <div className="flex flex-col items-center gap-2">
                  <Settings className="h-6 w-6" />
                  <span className="text-sm font-medium">{t.manageCategories}</span>
                </div>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-auto p-4">
              <Link href="/reject-analysis/incidents">
                <div className="flex flex-col items-center gap-2">
                  <Eye className="h-6 w-6" />
                  <span className="text-sm font-medium">{t.viewAllIncidents}</span>
                </div>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}