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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';
import { Plus, Edit, Save, X, Trash2 } from 'lucide-react';

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nama: '', singkatan: '', detail: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ nama: '', singkatan: '', detail: '' });

  useEffect(() => {
    fetchModalities();
  }, [user]);

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

  const handleAdd = async () => {
    if (!newForm.nama || !newForm.singkatan) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newForm),
      });

      if (!res.ok) {
        throw new Error('Failed to create modality');
      }

      toast.success('Modality created successfully');
      setNewForm({ nama: '', singkatan: '', detail: '' });
      setShowAddForm(false);
      fetchModalities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create modality');
    }
  };

  const handleEdit = (modality: Modality) => {
    setEditingId(modality.id);
    setEditForm({ 
      nama: modality.nama, 
      singkatan: modality.singkatan, 
      detail: modality.detail || ''
    });
  };

  const handleSave = async (id: number) => {
    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/${id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        throw new Error('Failed to update modality');
      }

      toast.success('Modality updated successfully');
      setEditingId(null);
      fetchModalities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update modality');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this modality?')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/${id}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete modality');
      }

      toast.success('Modality deleted successfully');
      fetchModalities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete modality');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({ nama: '', singkatan: '', detail: '' });
  };

  const handleAddCancel = () => {
    setShowAddForm(false);
    setNewForm({ nama: '', singkatan: '', detail: '' });
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
          <h1 className="text-3xl font-bold tracking-tight">Modalities</h1>
          <p className="text-muted-foreground">
            Manage imaging modalities and equipment types.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Modality
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
          
          {showAddForm && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="text-sm font-medium mb-3">Add New Modality</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  placeholder="Modality Name"
                  value={newForm.nama}
                  onChange={(e) => setNewForm({...newForm, nama: e.target.value})}
                />
                <Input
                  placeholder="Abbreviation"
                  value={newForm.singkatan}
                  onChange={(e) => setNewForm({...newForm, singkatan: e.target.value})}
                />
                <Input
                  placeholder="Description"
                  value={newForm.detail}
                  onChange={(e) => setNewForm({...newForm, detail: e.target.value})}
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
                    <TableCell className="font-medium">
                      {editingId === modality.id ? (
                        <Input
                          value={editForm.nama}
                          onChange={(e) => setEditForm({...editForm, nama: e.target.value})}
                        />
                      ) : (
                        modality.nama
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === modality.id ? (
                        <Input
                          value={editForm.singkatan}
                          onChange={(e) => setEditForm({...editForm, singkatan: e.target.value})}
                        />
                      ) : (
                        <Badge variant="outline">{modality.singkatan}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {editingId === modality.id ? (
                        <Input
                          value={editForm.detail}
                          onChange={(e) => setEditForm({...editForm, detail: e.target.value})}
                        />
                      ) : (
                        modality.detail || 'No description'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === modality.id ? (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={() => handleSave(modality.id)}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancel}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(modality)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(modality.id)}>
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