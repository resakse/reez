'use client';

import { useEffect, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Calendar, User, Building2, Stethoscope, Eye } from 'lucide-react';
import AuthService from '@/lib/auth';
import Link from 'next/link';

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
  date_from: string;
  date_to: string;
  exam_type: string;
  pemohon: string;
  ward: string;
  klinik: string;
}

export default function ExaminationsPage() {
  const { user } = useAuth();
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterParams>({
    search: '',
    date_from: '',
    date_to: '',
    exam_type: '',
    pemohon: '',
    ward: '',
    klinik: '',
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch exam types and wards for filter dropdowns
        const [examTypesRes, wardsRes] = await Promise.all([
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`)
        ]);

        if (examTypesRes.ok) {
          const examTypesData = await examTypesRes.json();
          setExamTypes(examTypesData);
        }

        if (wardsRes.ok) {
          const wardsData = await wardsRes.json();
          setWards(wardsData);
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

  const fetchExaminations = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('ordering', '-no_xray'); // Sort by x-ray number descending
      if (filters.search) params.append('search', filters.search);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.exam_type) params.append('exam_type', filters.exam_type);
      if (filters.pemohon) params.append('pemohon', filters.pemohon);
      if (filters.ward) params.append('ward', filters.ward);
      if (filters.klinik) params.append('klinik', filters.klinik);

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/?${params.toString()}`;
      const res = await AuthService.authenticatedFetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch examinations');
      }

      const data = await res.json();
      setExaminations(data.results || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: keyof FilterParams, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = () => {
    fetchExaminations();
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      date_from: '',
      date_to: '',
      exam_type: '',
      pemohon: '',
      ward: '',
      klinik: '',
    });
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
              <Label htmlFor="date_from">Date From</Label>
              <Input
                id="date_from"
                type="datetime-local"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="date_to">Date To</Label>
              <Input
                id="date_to"
                type="datetime-local"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="exam_type">Exam Type</Label>
              <Select value={filters.exam_type || 'all'} onValueChange={(value) => handleFilterChange('exam_type', value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {examTypes.filter(exam => exam.id && exam.id.toString() !== '').map((exam) => (
                    <SelectItem key={exam.id} value={exam.id.toString()}>
                      {exam.exam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pemohon">Requesting Doctor</Label>
              <Input
                id="pemohon"
                placeholder="Doctor name..."
                value={filters.pemohon}
                onChange={(e) => handleFilterChange('pemohon', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="ward">Ward</Label>
              <Select value={filters.ward || 'all'} onValueChange={(value) => handleFilterChange('ward', value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  {wards.filter(ward => ward.id && ward.id.toString() !== '').map((ward) => (
                    <SelectItem key={ward.id} value={ward.id.toString()}>
                      {ward.wad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="klinik">Clinic</Label>
              <Input
                id="klinik"
                placeholder="Clinic name..."
                value={filters.klinik}
                onChange={(e) => handleFilterChange('klinik', e.target.value)}
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