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

interface BodyPart {
  id: number;
  nama: string;
  singkatan: string;
}

export default function EditBodyPartPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const bodyPartId = params.id;
  
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nama: '',
    singkatan: '',
  });

  useEffect(() => {
    const fetchBodyPart = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/${bodyPartId}/`);
        const data = await res.json();
        setFormData({
          nama: data.nama,
          singkatan: data.singkatan,
        });
      } catch (error) {
        toast.error('Failed to fetch body part');
      } finally {
        setLoading(false);
      }
    };

    if (bodyPartId) {
      fetchBodyPart();
    }
  }, [bodyPartId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/${bodyPartId}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to update body part');
      }

      toast.success('Body part updated successfully');
      router.push('/body-parts');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update body part');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this body part? This may affect associated examinations.')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/${bodyPartId}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete body part');
      }

      toast.success('Body part deleted successfully');
      router.push('/body-parts');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete body part');
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
          <CardTitle>Edit Body Part</CardTitle>
          <CardDescription>
            Update body part information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="body-part-name">Body Part Name *</Label>
              <Input
                id="body-part-name"
                placeholder="e.g., Chest, Abdomen, Head"
                value={formData.nama}
                onChange={(e) => handleInputChange('nama', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="abbreviation">Abbreviation *</Label>
              <Input
                id="abbreviation"
                placeholder="e.g., CHEST, ABD, HEAD"
                value={formData.singkatan}
                onChange={(e) => handleInputChange('singkatan', e.target.value)}
                required
                maxLength={10}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Body Part'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/body-parts')}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={loading}
                className="ml-auto"
              >
                Delete Body Part
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}