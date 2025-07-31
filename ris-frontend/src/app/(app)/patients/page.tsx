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

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/`);

          if (!res.ok) {
            throw new Error('Failed to fetch patients');
          }

          const data: Patient[] = await res.json();
          setPatients(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
    };

    fetchPatients();
  }, [user]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Patients</CardTitle>
            <CardDescription>A list of all patients in the system.</CardDescription>
        </div>
        <Button asChild>
            <Link href="/patients/new">Add New Patient</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date of Birth</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell>{patient.mrn}</TableCell>
                <TableCell>{patient.nama}</TableCell>
                <TableCell>{formatDate(patient.t_lahir)}</TableCell>
                <TableCell>{calculateAge(patient.t_lahir)}</TableCell>
                <TableCell>{patient.jantina === 'L' ? 'Male' : 'Female'}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/patients/${patient.id}`}>View</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/patients/${patient.id}/edit`}>Edit</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
} 