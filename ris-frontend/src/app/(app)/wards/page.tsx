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

interface Ward {
  id: number;
  wad: string;
  singkatan: string;
  disiplin: {
    id: number;
    disiplin: string;
  };
}

export default function WardsPage() {
  const { user } = useAuth();
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWards = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`);
        if (!res.ok) {
          throw new Error('Failed to fetch wards');
        }
        const data: Ward[] = await res.json();
        setWards(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchWards();
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
          <h1 className="text-3xl font-bold tracking-tight">Wards</h1>
          <p className="text-muted-foreground">Manage hospital wards and their associated disciplines.</p>
        </div>
        <Button asChild>
          <Link href="/wards/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Ward
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ward List</CardTitle>
          <CardDescription>
            A comprehensive list of all hospital wards organized by discipline.
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
                <TableHead>Ward Name</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Discipline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No wards found. Create your first ward to get started.
                  </TableCell>
                </TableRow>
              ) : (
                wards.map((ward) => (
                  <TableRow key={ward.id}>
                    <TableCell className="font-medium">{ward.wad}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ward.singkatan}</Badge>
                    </TableCell>
                    <TableCell>{ward.disiplin.disiplin}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/wards/${ward.id}/edit`}>Edit</Link>
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