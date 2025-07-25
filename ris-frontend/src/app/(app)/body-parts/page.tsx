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
import { Plus } from 'lucide-react';

interface BodyPart {
  id: number;
  part: string;
}

export default function BodyPartsPage() {
  const { user } = useAuth();
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBodyParts = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/`);
        if (!res.ok) {
          throw new Error('Failed to fetch body parts');
        }
        const data: BodyPart[] = await res.json();
        setBodyParts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchBodyParts();
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
          <h1 className="text-3xl font-bold tracking-tight">Body Parts</h1>
          <p className="text-muted-foreground">
            Manage anatomical regions for examination classification.
          </p>
        </div>
        <Button asChild>
          <Link href="/body-parts/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Body Part
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Body Part List</CardTitle>
          <CardDescription>
            All anatomical regions available for examinations.
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
                <TableHead>Body Part</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bodyParts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                    No body parts found. Create your first body part to get started.
                  </TableCell>
                </TableRow>
              ) : (
                bodyParts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-medium">{part.part}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/body-parts/${part.id}/edit`}>Edit</Link>
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