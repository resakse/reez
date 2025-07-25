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
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import AuthService from '@/lib/auth';
import { Plus } from 'lucide-react';

interface Modality {
  id: number;
  nama: string;
  singkatan: string;
  detail: string | null;
}

export default function ModalitiesPage() {
  const { user } = useAuth();
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModalities = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`);
        if (!res.ok) {
          throw new Error('Failed to fetch modalities');
        }
        const data: Modality[] = await res.json();
        setModalities(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchModalities();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Modalities</h1>
          <p className="text-muted-foreground">
            Manage imaging modalities and equipment types.
          </p>
        </div>
        <Button asChild>
          <Link href="/modalities/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Modality
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modality List</CardTitle>
          <CardDescription>
            All imaging modalities available for examinations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modality Name</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modalities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No modalities found. Create your first modality to get started.
                  </TableCell>
                </TableRow>
              ) : (
                modalities.map((modality) => (
                  <TableRow key={modality.id}>
                    <TableCell className="font-medium">{modality.nama}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{modality.singkatan}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {modality.detail || 'No description'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/modalities/${modality.id}/edit`}>Edit</Link>
                        </Button>
                        <Button variant="ghost" size="sm">Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}