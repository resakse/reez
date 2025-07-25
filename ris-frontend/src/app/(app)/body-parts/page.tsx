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
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';
import { Plus, Edit, Save, X, Trash2 } from 'lucide-react';

interface BodyPart {
  id: number;
  part: string;
}

export default function BodyPartsPage() {
  const { user } = useAuth();
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ part: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ part: '' });

  useEffect(() => {
    fetchBodyParts();
  }, [user]);

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

  const handleAdd = async () => {
    if (!newForm.part) {
      toast.error('Please fill in the body part name');
      return;
    }

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newForm),
      });

      if (!res.ok) {
        throw new Error('Failed to create body part');
      }

      toast.success('Body part created successfully');
      setNewForm({ part: '' });
      setShowAddForm(false);
      fetchBodyParts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create body part');
    }
  };

  const handleEdit = (bodyPart: BodyPart) => {
    setEditingId(bodyPart.id);
    setEditForm({ part: bodyPart.part });
  };

  const handleSave = async (id: number) => {
    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/${id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        throw new Error('Failed to update body part');
      }

      toast.success('Body part updated successfully');
      setEditingId(null);
      fetchBodyParts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update body part');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this body part?')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/${id}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete body part');
      }

      toast.success('Body part deleted successfully');
      fetchBodyParts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete body part');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({ part: '' });
  };

  const handleAddCancel = () => {
    setShowAddForm(false);
    setNewForm({ part: '' });
  };

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
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Body Part
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
          
          {showAddForm && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="text-sm font-medium mb-3">Add New Body Part</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Body Part Name"
                  value={newForm.part}
                  onChange={(e) => setNewForm({...newForm, part: e.target.value})}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" onClick={handleAdd}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleAddCancel}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
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
                    <TableCell className="font-medium">
                      {editingId === part.id ? (
                        <Input
                          value={editForm.part}
                          onChange={(e) => setEditForm({...editForm, part: e.target.value})}
                        />
                      ) : (
                        part.part
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === part.id ? (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={() => handleSave(part.id)}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancel}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(part)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(part.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
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