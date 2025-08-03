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
  AlertTriangle,
  Eye,
  Edit,
  Download,
  Plus,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import {
  RejectIncident,
  RejectIncidentListResponse,
  RejectIncidentFilters,
  RejectCategory,
  Language,
  SEVERITY_CONFIG
} from '@/types/reject-analysis';

interface RejectIncidentTableProps {
  language?: Language;
  embedded?: boolean;
  limit?: number;
}

const translations = {
  en: {
    title: 'Reject Incidents',
    subtitle: 'View and manage individual image reject incidents',
    searchPlaceholder: 'Search incidents (patient name, accession, etc.)',
    filterByCategory: 'Filter by Category',
    filterByModality: 'Filter by Modality',
    filterBySeverity: 'Filter by Severity',
    filterByRetake: 'Retake Status',
    filterByFollowUp: 'Follow-up Status',
    dateFrom: 'Date From',
    dateTo: 'Date To',
    allCategories: 'All Categories',
    allModalities: 'All Modalities',
    allSeverities: 'All Severities',
    allRetakeStatuses: 'All',
    allFollowUpStatuses: 'All',
    retakeYes: 'Retake Done',
    retakeNo: 'No Retake',
    followUpYes: 'Follow-up Required',
    followUpNo: 'No Follow-up',
    loading: 'Loading incidents...',
    noData: 'No incidents found',
    error: 'Error loading data',
    clear: 'Clear Filters',
    export: 'Export',
    newIncident: 'Log Incident',
    entries: 'entries',
    showing: 'Showing',
    to: 'to',
    of: 'of',
    first: 'First',
    previous: 'Previous',
    next: 'Next',
    last: 'Last',
    patient: 'Patient',
    accession: 'Accession',
    examDate: 'Exam Date',
    incidentDate: 'Incident Date',
    modality: 'Modality',
    category: 'Category',
    severity: 'Severity',
    retake: 'Retake',
    followUp: 'Follow-up',
    reportedBy: 'Reported By',
    actions: 'Actions',
    view: 'View',
    edit: 'Edit',
    yes: 'Yes',
    no: 'No',
    required: 'Required',
    done: 'Done',
    pending: 'Pending',
    severities: {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      CRITICAL: 'Critical'
    }
  },
  ms: {
    title: 'Insiden Penolakan',
    subtitle: 'Lihat dan urus insiden penolakan imej individu',
    searchPlaceholder: 'Cari insiden (nama pesakit, akses, dll.)',
    filterByCategory: 'Tapis mengikut Kategori',
    filterByModality: 'Tapis mengikut Modaliti',
    filterBySeverity: 'Tapis mengikut Keterukan',
    filterByRetake: 'Status Retake',
    filterByFollowUp: 'Status Susulan',
    dateFrom: 'Tarikh Dari',
    dateTo: 'Tarikh Hingga',
    allCategories: 'Semua Kategori',
    allModalities: 'Semua Modaliti',
    allSeverities: 'Semua Keterukan',
    allRetakeStatuses: 'Semua',
    allFollowUpStatuses: 'Semua',
    retakeYes: 'Retake Selesai',
    retakeNo: 'Tiada Retake',
    followUpYes: 'Susulan Diperlukan',
    followUpNo: 'Tiada Susulan',
    loading: 'Memuatkan insiden...',
    noData: 'Tiada insiden dijumpai',
    error: 'Ralat memuatkan data',
    clear: 'Padam Penapis',
    export: 'Eksport',
    newIncident: 'Catat Insiden',
    entries: 'entri',
    showing: 'Menunjukkan',
    to: 'hingga',
    of: 'daripada',
    first: 'Pertama',
    previous: 'Sebelumnya',
    next: 'Seterusnya',
    last: 'Terakhir',
    patient: 'Pesakit',
    accession: 'Akses',
    examDate: 'Tarikh Pemeriksaan',
    incidentDate: 'Tarikh Insiden',
    modality: 'Modaliti',
    category: 'Kategori',
    severity: 'Keterukan',
    retake: 'Retake',
    followUp: 'Susulan',
    reportedBy: 'Dilaporkan Oleh',
    actions: 'Tindakan',
    view: 'Lihat',
    edit: 'Edit',
    yes: 'Ya',
    no: 'Tidak',
    required: 'Diperlukan',
    done: 'Selesai',
    pending: 'Tertunda',
    severities: {
      LOW: 'Rendah',
      MEDIUM: 'Sederhana',
      HIGH: 'Tinggi',
      CRITICAL: 'Kritikal'
    }
  }
};

export default function RejectIncidentTable({ 
  language = 'en',
  embedded = false,
  limit
}: RejectIncidentTableProps) {
  const t = translations[language];
  
  const [incidents, setIncidents] = useState<RejectIncident[]>([]);
  const [categories, setCategories] = useState<RejectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(limit || 25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<RejectIncidentFilters>({
    ordering: '-incident_date'
  });
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('-incident_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const modalities = ['CR', 'CT', 'MR', 'US', 'MG', 'RF', 'XA', 'PT', 'NM', 'DX'];

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchIncidents();
    }, searchTerm === '' ? 0 : 800);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, filters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortField, pageSize]);

  useEffect(() => {
    fetchIncidents();
  }, [currentPage, pageSize, sortField]);

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);

      const data = await rejectAnalysisApi.categories.getCategories({ is_active: true, ordering: 'position' });
      setCategories(data.results || data);
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('ordering', sortField);
      params.append('page', currentPage.toString());
      
      if (!embedded) {
        params.append('page_size', pageSize.toString());
      } else if (limit) {
        params.append('page_size', limit.toString());
      }
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      // Apply filters
      const data: RejectIncidentListResponse = await rejectAnalysisApi.incidents.getIncidents(filters);
      setIncidents(data.results);
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
    setFilters({ ordering: '-incident_date' });
  };

  const getSeverityBadge = (severity: string) => {
    const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
    if (!config) return null;

    return (
      <Badge className={config.color}>
        {language === 'ms' ? config.label_ms : config.label}
      </Badge>
    );
  };

  const getRetakeBadge = (retakePerformed: boolean, retakeDate?: string) => {
    if (retakePerformed) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t.done}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <XCircle className="h-3 w-3 mr-1" />
        {t.no}
      </Badge>
    );
  };

  const getFollowUpBadge = (followUpRequired: boolean, followUpCompleted: boolean) => {
    if (!followUpRequired) {
      return (
        <Badge variant="secondary">
          {t.no}
        </Badge>
      );
    }

    if (followUpCompleted) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t.done}
        </Badge>
      );
    }

    return (
      <Badge className="bg-orange-100 text-orange-800">
        <Clock className="h-3 w-3 mr-1" />
        {t.pending}
      </Badge>
    );
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  if (loading && incidents.length === 0) {
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
              <AlertTriangle className="h-5 w-5" />
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
                <Link href="/reject-analysis/incidents/new">
                  <Plus className="h-4 w-4 mr-2" />
                  {t.newIncident}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-3">
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
                <Label>{t.dateFrom}</Label>
                <Input
                  type="date"
                  value={filters.date_from || ''}
                  onChange={(e) => setFilters({...filters, date_from: e.target.value || undefined})}
                />
              </div>
              
              <div>
                <Label>{t.dateTo}</Label>
                <Input
                  type="date"
                  value={filters.date_to || ''}
                  onChange={(e) => setFilters({...filters, date_to: e.target.value || undefined})}
                />
              </div>
              
              <div>
                <Label>{t.filterByCategory}</Label>
                <Select 
                  value={filters.category_id?.toString() || ''} 
                  onValueChange={(value) => setFilters({...filters, category_id: value && value !== '__all__' ? parseInt(value) : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allCategories} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allCategories}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color_code || '#3b82f6' }}
                          />
                          {language === 'ms' ? category.nama : category.nama_english}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterByModality}</Label>
                <Select 
                  value={filters.modality || ''} 
                  onValueChange={(value) => setFilters({...filters, modality: value && value !== '__all__' ? value : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allModalities} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allModalities}</SelectItem>
                    {modalities.map((modality) => (
                      <SelectItem key={modality} value={modality}>
                        {modality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterBySeverity}</Label>
                <Select 
                  value={filters.severity || ''} 
                  onValueChange={(value) => setFilters({...filters, severity: value as any || undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allSeverities} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allSeverities}</SelectItem>
                    <SelectItem value="LOW">{t.severities.LOW}</SelectItem>
                    <SelectItem value="MEDIUM">{t.severities.MEDIUM}</SelectItem>
                    <SelectItem value="HIGH">{t.severities.HIGH}</SelectItem>
                    <SelectItem value="CRITICAL">{t.severities.CRITICAL}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterByRetake}</Label>
                <Select 
                  value={filters.retake_performed?.toString() || ''} 
                  onValueChange={(value) => setFilters({...filters, retake_performed: value && value !== '__all__' ? value === 'true' : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allRetakeStatuses} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allRetakeStatuses}</SelectItem>
                    <SelectItem value="true">{t.retakeYes}</SelectItem>
                    <SelectItem value="false">{t.retakeNo}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.filterByFollowUp}</Label>
                <Select 
                  value={filters.follow_up_required?.toString() || ''} 
                  onValueChange={(value) => setFilters({...filters, follow_up_required: value && value !== '__all__' ? value === 'true' : undefined})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.allFollowUpStatuses} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.allFollowUpStatuses}</SelectItem>
                    <SelectItem value="true">{t.followUpYes}</SelectItem>
                    <SelectItem value="false">{t.followUpNo}</SelectItem>
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
                    onClick={() => handleSort('patient_name')}
                  >
                    {t.patient}
                    {getSortIcon('patient_name')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('accession_number')}
                  >
                    {t.accession}
                    {getSortIcon('accession_number')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('exam_date')}
                  >
                    {t.examDate}
                    {getSortIcon('exam_date')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('modality')}
                  >
                    {t.modality}
                    {getSortIcon('modality')}
                  </Button>
                </TableHead>
                <TableHead>{t.category}</TableHead>
                <TableHead>{t.severity}</TableHead>
                <TableHead>{t.retake}</TableHead>
                <TableHead>{t.followUp}</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                    onClick={() => handleSort('incident_date')}
                  >
                    {t.incidentDate}
                    {getSortIcon('incident_date')}
                  </Button>
                </TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-6 text-gray-500">
                    {loading ? t.loading : t.noData}
                  </TableCell>
                </TableRow>
              ) : (
                incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{incident.patient_name}</div>
                        {incident.patient_mrn && (
                          <div className="text-sm text-muted-foreground">
                            MRN: {incident.patient_mrn}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{incident.accession_number}</TableCell>
                    <TableCell>{formatDate(incident.exam_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{incident.modality}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: incident.category?.color_code || '#3b82f6' }}
                        />
                        <span className="text-sm">
                          {incident.category 
                            ? (language === 'ms' ? incident.category.nama : incident.category.nama_english)
                            : 'Unknown Category'
                          }
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getSeverityBadge(incident.severity)}
                    </TableCell>
                    <TableCell>
                      {getRetakeBadge(incident.retake_performed, incident.retake_date)}
                    </TableCell>
                    <TableCell>
                      {getFollowUpBadge(incident.follow_up_required, incident.follow_up_completed)}
                    </TableCell>
                    <TableCell>{formatDate(incident.incident_date)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/reject-analysis/incidents/${incident.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/reject-analysis/incidents/${incident.id}/edit`}>
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