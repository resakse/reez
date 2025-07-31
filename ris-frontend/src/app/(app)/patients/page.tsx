'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
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
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, UserPlus, Edit } from 'lucide-react';
import Link from 'next/link';
import AuthService from '@/lib/auth';

interface Patient {
  id: number;
  mrn: string;
  nama: string;
  t_lahir: string; // Assuming the API will provide this field
  jantina: string;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error("Failed to format date:", dateString, error);
    return dateString; // Return original string if formatting fails
  }
}

function calculateAge(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    const birthDate = new Date(dateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return `${age} years`;
  } catch (error) {
    console.error("Failed to calculate age:", dateString, error);
    return 'N/A';
  }
}

export default function PatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('-id'); // Default sort by ID descending
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when searching
      fetchPatients();
    }, searchTerm === '' ? 0 : 800);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Reset to page 1 when sorting changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortField, pageSize]);

  // Fetch data when pagination or sorting changes
  useEffect(() => {
    if (user) {
      fetchPatients();
    }
  }, [currentPage, pageSize, sortField, user]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('ordering', sortField);
      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/patients/?${params.toString()}`;
      const res = await AuthService.authenticatedFetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch patients');
      }

      const data = await res.json();
      
      // Handle both paginated response and direct array
      if (data.results && Array.isArray(data.results)) {
        // Paginated response
        setPatients(data.results);
        setTotalCount(data.count || 0);
        setTotalPages(Math.ceil((data.count || 0) / pageSize));
      } else if (Array.isArray(data)) {
        // Direct array response
        setPatients(data);
        setTotalCount(data.length);
        setTotalPages(1);
      } else {
        console.error('Unexpected API response format:', data);
        setError('Invalid data format received from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
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

  if (loading && patients.length === 0) {
    return (
      <ProtectedRoute requireStaff={true}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Patients
            </CardTitle>
            <CardDescription>Loading patients...</CardDescription>
          </CardHeader>
        </Card>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireStaff={true}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Patients
              </CardTitle>
              <CardDescription>View and search all patients in the system.</CardDescription>
            </div>
            <Button asChild>
              <Link href="/patients/new">
                <UserPlus className="h-4 w-4 mr-2" />
                Add New Patient
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-6 p-4 border rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="MRN, NRIC, patient name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => setSearchTerm('')} variant="outline">
                    Clear
                  </Button>
                </div>
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
                        onClick={() => handleSort('mrn')}
                      >
                        Patient ID (MRN)
                        {getSortIcon('mrn')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                        onClick={() => handleSort('nama')}
                      >
                        Name
                        {getSortIcon('nama')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                        onClick={() => handleSort('t_lahir')}
                      >
                        Date of Birth
                        {getSortIcon('t_lahir')}
                      </Button>
                    </TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="font-medium hover:bg-transparent p-0 h-auto justify-start"
                        onClick={() => handleSort('jantina')}
                      >
                        Gender
                        {getSortIcon('jantina')}
                      </Button>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                        {loading ? 'Loading patients...' : 'No patients found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    patients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.mrn}</TableCell>
                        <TableCell>{patient.nama}</TableCell>
                        <TableCell>{formatDate(patient.t_lahir)}</TableCell>
                        <TableCell>{calculateAge(patient.t_lahir)}</TableCell>
                        <TableCell>{patient.jantina === 'L' ? 'Male' : 'Female'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/patients/${patient.id}`}>
                                <UserPlus className="h-4 w-4 mr-1" />
                                View
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/patients/${patient.id}/edit`}>
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
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
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} patients
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
                            onClick={() => setCurrentPage(page as number)}
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
                    onClick={() => setCurrentPage(currentPage + 1)}
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
    </ProtectedRoute>
  );
} 