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
import { Search, Filter, Calendar, User, Building2, Stethoscope, Eye } from 'lucide-react';
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
  daftar_info: {
    id: number;
    tarikh: string;
    pemohon?: string;
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
  const [dateRange, setDateRange] = useState<string[]>([]);
  const dateRangeRef = useRef<HTMLInputElement>(null);

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
          console.log('Exam Names:', examTypesData.map(exam => exam.exam));
          setExamTypes(examTypesData);
        }

        if (wardsRes.ok) {
          const wardsData = await wardsRes.json();
          setWards(wardsData);
        }

        if (modalitiesRes.ok) {
          const modalitiesData = await modalitiesRes.json();
          setModalities(modalitiesData);
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
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('ordering', '-no_xray'); // Sort by x-ray number descending
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
      const results = data.results || data;
      setExaminations(results);
      
      // Extract unique pemohon values
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
                  <TableHead>X-Ray No.</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Exam Type</TableHead>
                  <TableHead>Modality</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Requesting Doctor</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Radiographer</TableHead>
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
                      <TableCell className="font-medium">
                        <Badge variant="outline">{exam.no_xray}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{exam.daftar_info.pesakit.nama}</div>
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
                      <TableCell>{formatDateOnly(exam.daftar_info.tarikh)}</TableCell>
                      <TableCell>{exam.daftar_info.pemohon || 'N/A'}</TableCell>
                      <TableCell>{exam.daftar_info.rujukan?.wad || 'N/A'}</TableCell>
                      <TableCell>
                        {exam.daftar_info.jxr ? 
                          `${exam.daftar_info.jxr.first_name} ${exam.daftar_info.jxr.last_name}` : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/examinations/${exam.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {examinations.length > 0 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-gray-600">
                Showing {examinations.length} examination(s)
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}