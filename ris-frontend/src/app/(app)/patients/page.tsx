'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
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

interface Patient {
  id: number;
  mrn: string;
  nama: string;
  t_lahir: string; // Assuming the API will provide this field
  jantina: string;
}

export default function PatientsPage() {
  const { data: session } = useSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatients = async () => {
      if (session?.user?.accessToken) {
        try {
          const res = await fetch('/api/patients/', {
            headers: {
              'Authorization': `Bearer ${session.user.accessToken}`,
            },
          });

          if (!res.ok) {
            throw new Error('Failed to fetch patients');
          }

          const data: Patient[] = await res.json();
          setPatients(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      }
    };

    fetchPatients();
  }, [session]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Patients</CardTitle>
            <CardDescription>A list of all patients in the system.</CardDescription>
        </div>
        <Button>Add New Patient</Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date of Birth</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell>{patient.mrn}</TableCell>
                <TableCell>{patient.nama}</TableCell>
                <TableCell>{patient.t_lahir}</TableCell>
                <TableCell>{patient.jantina === 'L' ? 'Male' : 'Female'}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm">View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
} 