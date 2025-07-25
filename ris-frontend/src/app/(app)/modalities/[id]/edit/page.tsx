'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';

interface Modality {
  id: number;
  nama: string;
  singkatan: string;
  detail: string | null;
}

export default function EditModalityPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const modalityId = params.id;
  
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nama: '',
    singkatan: '',
    detail: '',
  });

  useEffect(() => {
    const fetchModality = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/${modalityId}/`);
        const data = await res.json();
        setFormData({
          nama: data.nama,
          singkatan: data.singkatan,
          detail: data.detail || '',
        });
      } catch (error) {
        toast.error('Failed to fetch modality');
      } finally {
        setLoading(false);
      }
    };

    if (modalityId) {
      fetchModality();
    }
  }, [modalityId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/${modalityId}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nama: formData.nama,
          singkatan: formData.singkatan,
          detail: formData.detail || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update modality');
      }

      toast.success('Modality updated successfully');
      router.push('/modalities');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update modality');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this modality? This may affect associated examinations.')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/${modalityId}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete modality');
      }

      toast.success('Modality deleted successfully');
      router.push('/modalities');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete modality');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Edit Modality</CardTitle>
          <CardDescription>
            Update modality information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="modality-name">Modality Name *</Label>
              <Input
                id="modality-name"
                placeholder="e.g., CT Scanner, X-Ray, MRI"
                value={formData.nama}
                onChange={(e) => handleInputChange('nama', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="abbreviation">Abbreviation *</Label>
              <Input
                id="abbreviation"
                placeholder="e.g., CT, XR, MR"
                value={formData.singkatan}
                onChange={(e) => handleInputChange('singkatan', e.target.value)}
                required
                maxLength={10}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of the modality"
                value={formData.detail}
                onChange={(e) => handleInputChange('detail', e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Modality'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/modalities')}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={loading}
                className="ml-auto"
              >
                Delete Modality
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}