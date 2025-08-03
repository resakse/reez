'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
  Edit,
  Download,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import {
  MonthlyRejectAnalysis,
  RejectAnalysisListResponse,
  RejectAnalysisFilters,
  Language,
  STATUS_CONFIG
} from '@/types/reject-analysis';
import rejectAnalysisApi from '@/lib/reject-analysis-api';

interface RejectAnalysisTableProps {
  language?: Language;
  embedded?: boolean;
  limit?: number;
}

const translations = {
  en: {
    title: 'Monthly Reject Analyses',
    subtitle: 'View and manage monthly image reject analysis reports',
    searchPlaceholder: 'Search analyses...',
    filterByYear: 'Filter by Year',
    filterByMonth: 'Filter by Month',
    filterByStatus: 'Filter by Status',
    filterByTarget: 'Target Achievement',
    allYears: 'All Years',
    allMonths: 'All Months',
    allStatuses: 'All Statuses',
    allTargets: 'All',
    meetsTarget: 'Meets Target',
    aboveTarget: 'Above Target',
    loading: 'Loading analyses...',
    noData: 'No analyses found',
    error: 'Error loading data',
    clear: 'Clear Filters',
    export: 'Export',
    newAnalysis: 'New Analysis',
    entries: 'entries',
    showing: 'Showing',
    to: 'to',
    of: 'of',
    first: 'First',
    previous: 'Previous',
    next: 'Next',
    last: 'Last',
    month: 'Month',
    year: 'Year',
    status: 'Status',
    rejectRate: 'Reject Rate',
    target: 'Target',
    totalExams: 'Total Exams',
    totalRejects: 'Total Rejects',
    improvement: 'Improvement',
    analysisDate: 'Analysis Date',
    actions: 'Actions',
    view: 'View',
    edit: 'Edit',
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ],
    statuses: {
      DRAFT: 'Draft',
      COMPLETED: 'Completed',
      APPROVED: 'Approved'
    }
  },
  ms: {
    title: 'Analisis Penolakan Bulanan',
    subtitle: 'Lihat dan urus laporan analisis penolakan imej bulanan',
    searchPlaceholder: 'Cari analisis...',
    filterByYear: 'Tapis mengikut Tahun',
    filterByMonth: 'Tapis mengikut Bulan',
    filterByStatus: 'Tapis mengikut Status',
    filterByTarget: 'Pencapaian Sasaran',
    allYears: 'Semua Tahun',
    allMonths: 'Semua Bulan',
    allStatuses: 'Semua Status',
    allTargets: 'Semua',
    meetsTarget: 'Mencapai Sasaran',
    aboveTarget: 'Melebihi Sasaran',
    loading: 'Memuatkan analisis...',
    noData: 'Tiada analisis dijumpai',
    error: 'Ralat memuatkan data',
    clear: 'Padam Penapis',
    export: 'Eksport',
    newAnalysis: 'Analisis Baru',
    entries: 'entri',
    showing: 'Menunjukkan',
    to: 'hingga',
    of: 'daripada',
    first: 'Pertama',
    previous: 'Sebelumnya',
    next: 'Seterusnya',
    last: 'Terakhir',
    month: 'Bulan',
    year: 'Tahun',
    status: 'Status',
    rejectRate: 'Kadar Penolakan',
    target: 'Sasaran',
    totalExams: 'Jumlah Pemeriksaan',
    totalRejects: 'Jumlah Penolakan',
    improvement: 'Penambahbaikan',
    analysisDate: 'Tarikh Analisis',
    actions: 'Tindakan',
    view: 'Lihat',
    edit: 'Edit',
    months: [
      'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
      'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
    ],
    statuses: {
      DRAFT: 'Draf',
      COMPLETED: 'Selesai',
      APPROVED: 'Diluluskan'
    }
  }
};

export default function RejectAnalysisTable({ 
  language = 'en',
  embedded = false,
  limit
}: RejectAnalysisTableProps) {
  const t = translations[language];
  
  const [analyses, setAnalyses] = useState<MonthlyRejectAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(limit || 25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<RejectAnalysisFilters>({
    ordering: '-year,-month'
  });
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('-year,-month');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchAnalyses();
    }, searchTerm === '' ? 0 : 800);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, filters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortField, pageSize]);

  useEffect(() => {
    fetchAnalyses();
  }, [currentPage, pageSize, sortField]);

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const apiFilters: RejectAnalysisFilters = {
        ...filters,
        ordering: sortField,
        page: currentPage,
        search: searchTerm || undefined
      };
      
      if (!embedded) {
        apiFilters.page_size = pageSize;
      } else if (limit) {
        apiFilters.page_size = limit;
      }

      const data = await rejectAnalysisApi.monthly.getAnalyses(apiFilters);
      setAnalyses(data.results);
      setTotalCount(data.count);
      setTotalPages(Math.ceil(data.count / pageSize));
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    let newSortField = field;
    let newDirection: 'asc' | 'desc' = 'asc';
    
    if (sortField === field || sortField === `-${field}`) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    if (newDirection === 'desc') {
      newSortField = `-${field}`;
    }
    
    setSortField(newSortField);
    setSortDirection(newDirection);
  };

  const getSortIcon = (field: string) => {
    const currentField = sortField.replace('-', '');
    if (currentField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilters({ ordering: '-year,-month' });
  };

  const formatMonth = (month: number): string => {
    return t.months[month - 1] || month.toString();
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
        {meetsTarget ? (
          <CheckCircle className="h-3 w-3 mr-1" />
        ) : (
          <AlertCircle className="h-3 w-3 mr-1" />
        )}
        {meetsTarget ? t.meetsTarget : t.aboveTarget}
      </Badge>
    );
  };

  const getImprovementIndicator = (rate?: number) => {
    if (!rate) return '-';
    
    const isImprovement = rate < 0;
    return (
      <div className={`flex items-center gap-1 text-sm ${isImprovement ? 'text-green-600' : 'text-red-600'}`}>
        {isImprovement ? (
          <TrendingDown className="h-4 w-4" />
        ) : (
          <TrendingUp className="h-4 w-4" />
        )}
        <span>{Math.abs(rate).toFixed(1)}%</span>
      </div>
    );
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '-';
    }
  };

  if (loading && analyses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={embedded ? "pb-4" : ""}>
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t.title}
            </CardTitle>
            {!embedded && <CardDescription>{t.subtitle}</CardDescription>}
          </div>
          
          {!embedded && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                {t.export}
              </Button>
              
              <Button asChild>
                <Link href="/reject-analysis/monthly/new">
                  <FileText className="h-4 w-4 mr-2" />
                  {t.newAnalysis}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Search and Filters */}
        {!embedded && (
          <div className="mb-6 p-4 border rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">{t.searchPlaceholder}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder={t.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              <div>
                <Label>{t.filterByYear}</Label>
                <Select 
                  value={filters.year?.toString() || ''} 
                  onValueChange={(value) => setFilters({...filters, year: value && value !== '__all__' ? parseInt(value) : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allYears} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allYears}</SelectItem>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterByMonth}</Label>
                <Select 
                  value={filters.month?.toString() || ''} 
                  onValueChange={(value) => setFilters({...filters, month: value && value !== '__all__' ? parseInt(value) : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allMonths} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allMonths}</SelectItem>
                    {t.months.map((month, index) => (
                      <SelectItem key={index + 1} value={(index + 1).toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterByStatus}</Label>
                <Select 
                  value={filters.status || ''} 
                  onValueChange={(value) => setFilters({...filters, status: value && value !== '__all__' ? value as any : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allStatuses} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allStatuses}</SelectItem>
                    <SelectItem value="DRAFT">{t.statuses.DRAFT}</SelectItem>
                    <SelectItem value="COMPLETED">{t.statuses.COMPLETED}</SelectItem>
                    <SelectItem value="APPROVED">{t.statuses.APPROVED}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button onClick={clearFilters} variant="outline" size="sm">
                {t.clear}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-center py-4">{error}</div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('year')}
                  >
                    {t.year} / {t.month}
                    {getSortIcon('year')}
                  </Button>
                </TableHead>
                <TableHead>{t.status}</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('reject_rate')}
                  >
                    {t.rejectRate}
                    {getSortIcon('reject_rate')}
                  </Button>
                </TableHead>
                <TableHead>{t.target}</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('total_examinations')}
                  >
                    {t.totalExams}
                    {getSortIcon('total_examinations')}
                  </Button>
                </TableHead>
                <TableHead>{t.improvement}</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('analysis_date')}
                  >
                    {t.analysisDate}
                    {getSortIcon('analysis_date')}
                  </Button>
                </TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-gray-500">
                    {loading ? t.loading : t.noData}
                  </TableCell>
                </TableRow>
              ) : (
                analyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{formatMonth(analysis.month)} {analysis.year}</div>
                        <div className="text-sm text-muted-foreground">
                          {analysis.total_rejects.toLocaleString()} {t.totalRejects.toLowerCase()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(analysis.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{analysis.reject_rate.toFixed(2)}%</span>
                        {getTargetBadge(analysis.reject_rate, analysis.target_reject_rate)}
                      </div>
                    </TableCell>
                    <TableCell>{analysis.target_reject_rate}%</TableCell>
                    <TableCell>{analysis.total_examinations.toLocaleString()}</TableCell>
                    <TableCell>
                      {getImprovementIndicator(analysis.improvement_rate)}
                    </TableCell>
                    <TableCell>
                      {formatDate(analysis.analysis_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/reject-analysis/monthly/${analysis.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/reject-analysis/monthly/${analysis.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!embedded && totalCount > 0 && (
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="pageSize" className="text-sm">{t.showing}</Label>
              <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">{t.entries}</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              {t.showing} {((currentPage - 1) * pageSize) + 1} {t.to} {Math.min(currentPage * pageSize, totalCount)} {t.of} {totalCount}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {t.first}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                {t.previous}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                {t.next}
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                {t.last}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}