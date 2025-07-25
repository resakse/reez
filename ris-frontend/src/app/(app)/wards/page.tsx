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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';
import { Plus, Edit, Save, X, Trash2 } from 'lucide-react';

interface Discipline {
  id: number;
  disiplin: string;
}

interface Ward {
  id: number;
  wad: string;
  singkatan: string;
  disiplin: {
    id: number;
    disiplin: string;
  };
  disiplin_id: number;
}

export default function WardsDisciplinesPage() {
  const { user } = useAuth();
  const [wards, setWards] = useState<Ward[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Discipline states
  const [editingDisciplineId, setEditingDisciplineId] = useState<number | null>(null);
  const [editDisciplineForm, setEditDisciplineForm] = useState({ disiplin: '' });
  const [showAddDisciplineForm, setShowAddDisciplineForm] = useState(false);
  const [newDisciplineForm, setNewDisciplineForm] = useState({ disiplin: '' });

  // Ward states
  const [editingWardId, setEditingWardId] = useState<number | null>(null);
  const [editWardForm, setEditWardForm] = useState({ wad: '', singkatan: '', disiplin_id: '' });
  const [showAddWardForm, setShowAddWardForm] = useState(false);
  const [newWardForm, setNewWardForm] = useState({ wad: '', singkatan: '', disiplin_id: '' });

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [wardsRes, disciplinesRes] = await Promise.all([
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/`)
      ]);

      if (!wardsRes.ok || !disciplinesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const wardsData = await wardsRes.json();
      const disciplinesData = await disciplinesRes.json();
      
      setWards(wardsData);
      setDisciplines(disciplinesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Discipline CRUD operations
  const handleAddDiscipline = async () => {
    if (!newDisciplineForm.disiplin) {
      toast.error('Please fill in the discipline name');
      return;
    }

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDisciplineForm),
      });

      if (!res.ok) {
        throw new Error('Failed to create discipline');
      }

      toast.success('Discipline created successfully');
      setNewDisciplineForm({ disiplin: '' });
      setShowAddDisciplineForm(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create discipline');
    }
  };

  const handleEditDiscipline = (discipline: Discipline) => {
    setEditingDisciplineId(discipline.id);
    setEditDisciplineForm({ disiplin: discipline.disiplin });
  };

  const handleSaveDiscipline = async (id: number) => {
    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/${id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editDisciplineForm),
      });

      if (!res.ok) {
        throw new Error('Failed to update discipline');
      }

      toast.success('Discipline updated successfully');
      setEditingDisciplineId(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update discipline');
    }
  };

  const handleDeleteDiscipline = async (id: number) => {
    if (!confirm('Are you sure you want to delete this discipline?')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/${id}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete discipline');
      }

      toast.success('Discipline deleted successfully');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete discipline');
    }
  };

  // Ward CRUD operations
  const handleAddWard = async () => {
    if (!newWardForm.wad || !newWardForm.singkatan || !newWardForm.disiplin_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wad: newWardForm.wad,
          singkatan: newWardForm.singkatan,
          disiplin_id: parseInt(newWardForm.disiplin_id),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create ward');
      }

      toast.success('Ward created successfully');
      setNewWardForm({ wad: '', singkatan: '', disiplin_id: '' });
      setShowAddWardForm(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ward');
    }
  };

  const handleEditWard = (ward: Ward) => {
    setEditingWardId(ward.id);
    setEditWardForm({ 
      wad: ward.wad, 
      singkatan: ward.singkatan, 
      disiplin_id: ward.disiplin.id.toString()
    });
  };

  const handleSaveWard = async (id: number) => {
    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/${id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wad: editWardForm.wad,
          singkatan: editWardForm.singkatan,
          disiplin_id: parseInt(editWardForm.disiplin_id),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update ward');
      }

      toast.success('Ward updated successfully');
      setEditingWardId(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update ward');
    }
  };

  const handleDeleteWard = async (id: number) => {
    if (!confirm('Are you sure you want to delete this ward?')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/${id}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete ward');
      }

      toast.success('Ward deleted successfully');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete ward');
    }
  };

  const handleDisciplineCancel = () => {
    setEditingDisciplineId(null);
    setEditDisciplineForm({ disiplin: '' });
  };

  const handleDisciplineAddCancel = () => {
    setShowAddDisciplineForm(false);
    setNewDisciplineForm({ disiplin: '' });
  };

  const handleWardCancel = () => {
    setEditingWardId(null);
    setEditWardForm({ wad: '', singkatan: '', disiplin_id: '' });
  };

  const handleWardAddCancel = () => {
    setShowAddWardForm(false);
    setNewWardForm({ wad: '', singkatan: '', disiplin_id: '' });
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wards & Disciplines</h1>
        <p className="text-muted-foreground">
          Manage hospital wards and their associated disciplines
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disciplines Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Disciplines</CardTitle>
                <CardDescription>
                  Manage medical disciplines and specialties
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowAddDisciplineForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            
            {showAddDisciplineForm && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                <h3 className="text-sm font-medium mb-3">Add New Discipline</h3>
                <div className="flex gap-3">
                  <Input
                    placeholder="Discipline Name"
                    value={newDisciplineForm.disiplin}
                    onChange={(e) => setNewDisciplineForm({disiplin: e.target.value})}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddDiscipline}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDisciplineAddCancel}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Discipline Name</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disciplines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        No disciplines found
                      </TableCell>
                    </TableRow>
                  ) : (
                    disciplines.map((discipline) => (
                      <TableRow key={discipline.id}>
                        <TableCell className="font-medium">
                          {editingDisciplineId === discipline.id ? (
                            <Input
                              value={editDisciplineForm.disiplin}
                              onChange={(e) => setEditDisciplineForm({disiplin: e.target.value})}
                            />
                          ) : (
                            discipline.disiplin
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingDisciplineId === discipline.id ? (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" onClick={() => handleSaveDiscipline(discipline.id)}>
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleDisciplineCancel}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => handleEditDiscipline(discipline)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteDiscipline(discipline.id)}>
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
            </div>
          </CardContent>
        </Card>

        {/* Wards Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Wards</CardTitle>
                <CardDescription>
                  Manage hospital wards and units
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowAddWardForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            
            {showAddWardForm && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                <h3 className="text-sm font-medium mb-3">Add New Ward</h3>
                <div className="space-y-3">
                  <Input
                    placeholder="Ward Name"
                    value={newWardForm.wad}
                    onChange={(e) => setNewWardForm({...newWardForm, wad: e.target.value})}
                  />
                  <Input
                    placeholder="Abbreviation"
                    value={newWardForm.singkatan}
                    onChange={(e) => setNewWardForm({...newWardForm, singkatan: e.target.value})}
                  />
                  <Select
                    value={newWardForm.disiplin_id}
                    onValueChange={(value) => setNewWardForm({...newWardForm, disiplin_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      {disciplines.map((discipline) => (
                        <SelectItem key={discipline.id} value={discipline.id.toString()}>
                          {discipline.disiplin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddWard}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleWardAddCancel}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="overflow-x-auto">
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
                        No wards found
                      </TableCell>
                    </TableRow>
                  ) : (
                    wards.map((ward) => (
                      <TableRow key={ward.id}>
                        <TableCell className="font-medium">
                          {editingWardId === ward.id ? (
                            <Input
                              value={editWardForm.wad}
                              onChange={(e) => setEditWardForm({...editWardForm, wad: e.target.value})}
                            />
                          ) : (
                            ward.wad
                          )}
                        </TableCell>
                        <TableCell>
                          {editingWardId === ward.id ? (
                            <Input
                              value={editWardForm.singkatan}
                              onChange={(e) => setEditWardForm({...editWardForm, singkatan: e.target.value})}
                            />
                          ) : (
                            ward.singkatan
                          )}
                        </TableCell>
                        <TableCell>
                          {editingWardId === ward.id ? (
                            <Select
                              value={editWardForm.disiplin_id}
                              onValueChange={(value) => setEditWardForm({...editWardForm, disiplin_id: value})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {disciplines.map((discipline) => (
                                  <SelectItem key={discipline.id} value={discipline.id.toString()}>
                                    {discipline.disiplin}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            ward.disiplin.disiplin
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingWardId === ward.id ? (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" onClick={() => handleSaveWard(ward.id)}>
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleWardCancel}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => handleEditWard(ward)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteWard(ward.id)}>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}