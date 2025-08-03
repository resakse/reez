'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Calendar, User, Building2, Stethoscope, Eye, Edit, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import AuthService from '@/lib/auth';
import Link from 'next/link';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/dark.css';

interface Examination {
  id: number;
  no_xray: string;
  exam: {
    id: number;
    exam: string;
    modaliti: {
      id: number;
      nama: string;
    };
  };
  laterality?: string;
  created: string;
  modified: string;
  study_instance_uid?: string;
  // DICOM Content Date/Time fields
  content_date?: string;
  content_time?: string;
  content_datetime?: string;
  content_datetime_source?: string;
  daftar_info: {
    id: number;
    tarikh: string;
    pemohon?: string;
    study_instance_uid?: string;
    rujukan?: {
      id: number;
      wad: string;
    };
    jxr?: {
      id: number;
      username: string;
      first_name: string;
      last_name: string;
    };
    pesakit: {
      id: number;
      nama: string;
      nric: string;
      jantina: string;
    };
  };
}

interface ExamType {
  id: number;
  exam: string;
}

interface Ward {
  id: number;
  wad: string;
}

interface FilterParams {
  search: string;
  date_range: string[];
  exam_type: string;
  pemohon: string;
  ward: string;
  modality: string;
}

export default function ExaminationsPage() {
  const { user } = useAuth();
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [modalities, setModalities] = useState<any[]>([]);
  const [uniquePemohon, setUniquePemohon] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterParams>({
    search: '',
    date_range: [],
    exam_type: '',
    pemohon: '',
    ward: '',
    modality: '',
  });
  
  const [dateRange, setDateRange] = useState<string[]>([]);
  const dateRangeRef = useRef<HTMLInputElement>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('-content_datetime'); // Default sort by DICOM content datetime descending
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Debounced search effect for search field
  useEffect(() => {
    if (filters.search === '') {
      // If search is empty, trigger immediately
      fetchExaminationsWithFilters(filters);
      return;
    }
    
    // Debounce search input
    const timeoutId = setTimeout(() => {
      fetchExaminationsWithFilters(filters);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [filters.search]);

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize, sortField]);

  // Fetch data when filters or sorting change
  useEffect(() => {
    if (user) {
      fetchExaminationsWithFilters(filters);
    }
  }, [user, filters, sortField]);

  // Fetch data when page or pageSize changes
  useEffect(() => {
    if (user) {
      fetchExaminationsWithFilters(filters);
    }
  }, [currentPage, pageSize, user]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch exam types, wards, and modalities for filter dropdowns
        const [examTypesRes, wardsRes, modalitiesRes] = await Promise.all([
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`)
        ]);

        if (examTypesRes.ok) {
          const examTypesData = await examTypesRes.json();
          console.log('Exam Types Data:', examTypesData);
          
          // Handle paginated response
          const examTypesArray = examTypesData.results || examTypesData;
          if (Array.isArray(examTypesArray)) {
            console.log('Exam Names:', examTypesArray.map(exam => exam.exam));
            setExamTypes(examTypesArray);
          } else {
            console.error('Exam Types API did not return an array:', examTypesData);
            setExamTypes([]);
          }
        }

        if (wardsRes.ok) {
          const wardsData = await wardsRes.json();
          const wardsArray = wardsData.results || wardsData;
          setWards(Array.isArray(wardsArray) ? wardsArray : []);
        }

        if (modalitiesRes.ok) {
          const modalitiesData = await modalitiesRes.json();
          const modalitiesArray = modalitiesData.results || modalitiesData;
          setModalities(Array.isArray(modalitiesArray) ? modalitiesArray : []);
        }

        // Fetch examinations
        await fetchExaminations();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Initialize flatpickr for date range (copied from pacs-browser)
  useEffect(() => {
    if (dateRangeRef.current) {
      // Check if dark mode is enabled
      const isDarkMode = document.documentElement.classList.contains('dark');
      
      const fp = flatpickr(dateRangeRef.current, {
        mode: 'range',
        dateFormat: 'd/m/Y',
        placeholder: 'Select date range...',
        allowInput: true,
        theme: isDarkMode ? 'dark' : 'light',
        onChange: (selectedDates) => {
          const dates = selectedDates.map(date => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${day}/${month}/${year}`;
          });
          setDateRange(dates);
          setFilters(prev => ({
            ...prev,
            date_range: dates
          }));
        }
      });

      // Listen for theme changes and update flatpickr theme
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const isDark = document.documentElement.classList.contains('dark');
            fp.set('theme', isDark ? 'dark' : 'light');
          }
        });
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });

      return () => {
        fp.destroy();
        observer.disconnect();
      };
    }
  }, [loading]); // Add loading dependency to retry after data loads

  const fetchExaminationsWithFilters = async (filtersToUse: FilterParams = filters) => {
    try {
      console.log('fetchExaminations called with filters:', filtersToUse);
      setLoading(true);
      
      // Build query parameters with proper pagination
      const params = new URLSearchParams();
      params.append('ordering', sortField); // Use current sort field
      
      // Add pagination parameters
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());
      
      if (filtersToUse.search) params.append('search', filtersToUse.search);
      
      // Handle date range
      if (filtersToUse.date_range && filtersToUse.date_range.length === 2) {
        const [startDateStr, endDateStr] = filtersToUse.date_range;
        // Convert from dd/mm/yyyy to yyyy-mm-dd
        const startParts = startDateStr.split('/');
        const endParts = endDateStr.split('/');
        if (startParts.length === 3 && endParts.length === 3) {
          const startDate = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
          const endDate = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
          params.append('date_from', startDate);
          params.append('date_to', endDate);
        }
      }
      
      if (filtersToUse.exam_type) params.append('exam_type', filtersToUse.exam_type);
      if (filtersToUse.pemohon) params.append('pemohon', filtersToUse.pemohon);
      if (filtersToUse.ward) params.append('ward', filtersToUse.ward);
      if (filtersToUse.modality) params.append('modality', filtersToUse.modality);

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/?${params.toString()}`;
      const res = await AuthService.authenticatedFetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch examinations');
      }

      const data = await res.json();
      console.log('Raw API response:', data);
      
      const results = data.results || data;
      console.log('Results array length:', results.length);
      console.log('First few results:', results.slice(0, 3));
      
      setExaminations(results);
      
      // Update pagination info from API response
      if (data.count !== undefined) {
        console.log('Server-side pagination - API returned count:', data.count, 'pageSize:', pageSize);
        console.log('Setting examinations to', results.length, 'items');
        setTotalCount(data.count);
        setTotalPages(Math.ceil(data.count / pageSize));
      } else {
        // Fallback if API doesn't provide count
        console.log('No count in API response, using results length:', results.length);
        setTotalCount(results.length);
        setTotalPages(1);
      }
      
      console.log('Final state - examinations:', results.length, 'totalCount:', data.count || results.length, 'totalPages:', Math.ceil((data.count || results.length) / pageSize));
      
      // Extract unique pemohon values from current page results
      const pemohonSet = new Set<string>();
      
      results.forEach((exam: Examination) => {
        if (exam.daftar_info.pemohon && exam.daftar_info.pemohon.trim()) {
          pemohonSet.add(exam.daftar_info.pemohon.trim());
        }
      });
      
      setUniquePemohon(Array.from(pemohonSet).sort());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  };

  const fetchExaminations = () => fetchExaminationsWithFilters();

  const handleFilterChange = (field: keyof FilterParams, value: string) => {
    const newFilters = {
      ...filters,
      [field]: value
    };
    
    setFilters(newFilters);
    
    // Auto-trigger search for non-search fields with updated filters
    if (field !== 'search') {
      fetchExaminationsWithFilters(newFilters);
    }
  };

  const handleSearch = (e?: React.MouseEvent) => {
    e?.preventDefault();
    console.log('Apply Filters clicked, current filters:', filters);
    fetchExaminations();
  };

  const clearFilters = (e?: React.MouseEvent) => {
    e?.preventDefault();
    console.log('Clear Filters clicked');
    const clearedFilters = {
      search: '',
      date_range: [],
      exam_type: '',
      pemohon: '',
      ward: '',
      modality: '',
    };
    
    setFilters(clearedFilters);
    setDateRange([]);
    
    // Clear flatpickr instance (same method as pacs-browser)
    if (dateRangeRef.current && (dateRangeRef.current as any)._flatpickr) {
      (dateRangeRef.current as any)._flatpickr.clear();
    }
    
    // Immediately fetch results with cleared filters
    fetchExaminationsWithFilters(clearedFilters);
  };

  const handleSort = (field: string) => {
    let newSortField = field;
    let newDirection: 'asc' | 'desc' = 'asc';
    
    // If clicking the same field, toggle direction
    if (sortField === field || sortField === `-${field}`) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    // Add minus prefix for descending order (Django REST Framework convention)
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

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateString;
    }
  };

  const formatDateOnly = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB');
    } catch {
      return dateString;
    }
  };

  const getExaminationDateTime = (exam: Examination): string => {
    // Prefer DICOM content_datetime if available, otherwise fall back to registration date
    if (exam.content_datetime) {
      return exam.content_datetime;
    }
    return exam.daftar_info.tarikh;
  };

  if (loading && examinations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Examinations
          </CardTitle>
          <CardDescription>Loading examinations...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Examinations
          </CardTitle>
          <CardDescription>
            View and search all radiological examinations in the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="X-ray no, patient name..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="dateRange">Date Range</Label>
              <div className="relative">
                <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  ref={dateRangeRef}
                  id="dateRange"
                  placeholder="Select date range..."
                  className="pl-8 cursor-pointer"
                  readOnly
                />
              </div>
            </div>

            <div>
              <Label htmlFor="exam_type">Exam Type</Label>
              <SearchableSelect
                options={[
                  { value: 'all', label: 'All Types' },
                  ...examTypes.filter(exam => exam.id && exam.id.toString() !== '').map((exam) => ({
                    value: exam.id.toString(),
                    label: exam.exam
                  }))
                ]}
                value={filters.exam_type || 'all'}
                onValueChange={(value) => handleFilterChange('exam_type', value === 'all' ? '' : value)}
                placeholder="Select exam type"
                searchPlaceholder="Search exam types..."
              />
            </div>

            <div>
              <Label htmlFor="pemohon">Requesting Doctor</Label>
              <SearchableSelect
                options={[
                  { value: 'all', label: 'All Doctors' },
                  ...uniquePemohon.map((doctor) => ({
                    value: doctor,
                    label: doctor
                  }))
                ]}
                value={filters.pemohon || 'all'}
                onValueChange={(value) => handleFilterChange('pemohon', value === 'all' ? '' : value)}
                placeholder="Select requesting doctor"
                searchPlaceholder="Search doctors..."
              />
            </div>

            <div>
              <Label htmlFor="ward">Ward</Label>
              <SearchableSelect
                options={[
                  { value: 'all', label: 'All Wards' },
                  ...wards.filter(ward => ward.id && ward.id.toString() !== '').map((ward) => ({
                    value: ward.id.toString(),
                    label: ward.wad
                  }))
                ]}
                value={filters.ward || 'all'}
                onValueChange={(value) => handleFilterChange('ward', value === 'all' ? '' : value)}
                placeholder="Select ward"
                searchPlaceholder="Search wards..."
              />
            </div>

            <div>
              <Label htmlFor="modality">Modality</Label>
              <SearchableSelect
                options={[
                  { value: 'all', label: 'All Modalities' },
                  ...modalities.filter(modality => modality.id && modality.id.toString() !== '').map((modality) => ({
                    value: modality.id.toString(),
                    label: modality.nama
                  }))
                ]}
                value={filters.modality || 'all'}
                onValueChange={(value) => handleFilterChange('modality', value === 'all' ? '' : value)}
                placeholder="Select modality"
                searchPlaceholder="Search modalities..."
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} className="flex-1">
                <Filter className="h-4 w-4 mr-2" />
                Apply Filters
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>

          {error && <p className="text-red-500 mb-4">{error}</p>}

          {/* Results */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('content_datetime')}
                    >
                      Date & Time
                      {getSortIcon('content_datetime')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('no_xray')}
                    >
                      X-Ray No.
                      {getSortIcon('no_xray')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('daftar__pesakit__nama')}
                    >
                      Patient
                      {getSortIcon('daftar__pesakit__nama')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('exam__exam')}
                    >
                      Exam Type
                      {getSortIcon('exam__exam')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('exam__modaliti__nama')}
                    >
                      Modality
                      {getSortIcon('exam__modaliti__nama')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('daftar__pemohon')}
                    >
                      Requesting Doctor
                      {getSortIcon('daftar__pemohon')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('daftar__rujukan__wad')}
                    >
                      Ward
                      {getSortIcon('daftar__rujukan__wad')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                      onClick={() => handleSort('daftar__jxr__first_name')}
                    >
                      Radiographer
                      {getSortIcon('daftar__jxr__first_name')}
                    </Button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examinations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-gray-500">
                      {loading ? 'Loading examinations...' : 'No examinations found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  examinations.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell>
                        {formatDate(getExaminationDateTime(exam))}
                        {exam.content_datetime && (
                          <div className="text-xs text-muted-foreground">
                            {exam.content_datetime_source || 'DICOM'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Badge variant="outline">{exam.no_xray}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="font-medium truncate cursor-help">
                                {exam.daftar_info.pesakit.nama}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{exam.daftar_info.pesakit.nama}</p>
                            </TooltipContent>
                          </Tooltip>
                          <div className="text-sm text-gray-500">{exam.daftar_info.pesakit.nric}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{exam.exam.exam}</div>
                          {exam.laterality && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {exam.laterality}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{exam.exam.modaliti.nama}</Badge>
                      </TableCell>
                      <TableCell>{exam.daftar_info.pemohon || 'N/A'}</TableCell>
                      <TableCell>{exam.daftar_info.rujukan?.wad || 'N/A'}</TableCell>
                      <TableCell>
                        {exam.daftar_info.jxr ? 
                          `${exam.daftar_info.jxr.first_name} ${exam.daftar_info.jxr.last_name}` : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {exam.daftar_info.study_instance_uid ? (
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/pacs-browser/${exam.daftar_info.study_instance_uid}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Link>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          )}
                          {(user?.is_superuser || user?.is_staff) && (
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/studies/${exam.daftar_info.id}/edit`}>
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls - Bottom (DataTable Style) */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="pageSize" className="text-sm">Show</Label>
                <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                  <SelectTrigger id="pageSize" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} examinations
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                {/* Page numbers with ellipsis */}
                <div className="flex items-center gap-1">
                  {(() => {
                    const delta = 2; // Number of pages to show around current page
                    const range = [];
                    const rangeWithDots = [];

                    // Always show first page
                    range.push(1);

                    // Add pages around current page
                    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
                      range.push(i);
                    }

                    // Always show last page (if more than 1 page)
                    if (totalPages > 1) {
                      range.push(totalPages);
                    }

                    // Remove duplicates and sort
                    const uniqueRange = [...new Set(range)].sort((a, b) => a - b);

                    // Add ellipsis where there are gaps
                    let prev = 0;
                    for (const page of uniqueRange) {
                      if (page - prev > 1) {
                        rangeWithDots.push('...');
                      }
                      rangeWithDots.push(page);
                      prev = page;
                    }

                    return rangeWithDots.map((page, index) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-2 py-1 text-sm text-muted-foreground">
                            ...
                          </span>
                        );
                      }

                      return (
                        <Button
                          key={`page-${page}`}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => {
                            console.log('Clicking page:', page);
                            setCurrentPage(page as number);
                          }}
                        >
                          {page}
                        </Button>
                      );
                    });
                  })()}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log('Next clicked - currentPage:', currentPage, 'totalPages:', totalPages);
                    setCurrentPage(currentPage + 1);
                  }}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}