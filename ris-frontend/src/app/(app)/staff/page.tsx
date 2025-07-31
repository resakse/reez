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
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import AuthService from '@/lib/auth';

interface Staff {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  jawatan: string;
  klinik: string;
  is_active: boolean;
  komen?: string;
  kemaskini: string;
  nama: string;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  } catch (error) {
    console.error("Failed to format date:", dateString, error);
    return dateString;
  }
}

export default function StaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        setLoading(true);
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff/`);

        if (!res.ok) {
          throw new Error(`Failed to fetch staff: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        
        // Handle paginated response
        if (data && Array.isArray(data.results)) {
          setStaff(data.results);
        } else if (Array.isArray(data)) {
          // Handle direct array response
          setStaff(data);
        } else {
          console.error('Expected array or paginated response but got:', typeof data, data);
          setError('Invalid data format received from server');
          setStaff([]);
        }
      } catch (err) {
        console.error('Staff fetch error:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setStaff([]); // Ensure staff is always an array
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, [user]);

  const handleToggleActive = async (staffId: number, currentStatus: boolean) => {
    try {
      const res = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/staff/${staffId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_active: !currentStatus }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update staff status');
      }

      // Refresh the staff list
      setStaff(prevStaff => 
        Array.isArray(prevStaff) 
          ? prevStaff.map(s => s.id === staffId ? { ...s, is_active: !currentStatus } : s)
          : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff status');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff Management</CardTitle>
          <CardDescription>Loading staff data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ProtectedRoute requireStaff={true}>
      <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Staff Management</CardTitle>
          <CardDescription>Manage staff members and their roles.</CardDescription>
        </div>
        <Button asChild>
          <Link href="/staff/new">Add New Staff</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Clinic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.isArray(staff) && staff.map((staffMember) => (
              <TableRow key={staffMember.id}>
                <TableCell className="font-medium">{staffMember.username}</TableCell>
                <TableCell>{staffMember.nama}</TableCell>
                <TableCell>{staffMember.email || 'N/A'}</TableCell>
                <TableCell>{staffMember.jawatan}</TableCell>
                <TableCell>{staffMember.klinik}</TableCell>
                <TableCell>
                  <Badge variant={staffMember.is_active ? "default" : "secondary"}>
                    {staffMember.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(staffMember.kemaskini)}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/staff/${staffMember.id}/edit`}>Edit</Link>
                    </Button>
                    <Button 
                      variant={staffMember.is_active ? "destructive" : "default"} 
                      size="sm"
                      onClick={() => handleToggleActive(staffMember.id, staffMember.is_active)}
                    >
                      {staffMember.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {Array.isArray(staff) && staff.length === 0 && !loading && (
          <div className="text-center py-4 text-gray-500">
            No staff members found.
          </div>
        )}
      </CardContent>
      </Card>
    </ProtectedRoute>
  );
}