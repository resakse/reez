'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';

export default function NewModalityPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    modality: '',
    description: '',
    station_name: '',
    aetitle: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to create modality');
      }

      toast.success('Modality created successfully');
      router.push('/modalities');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create modality');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Modality</CardTitle>
          <CardDescription>
            Add a new imaging modality to the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="modality-name">Modality Name *</Label>
              <Input
                id="modality-name"
                placeholder="e.g., CT Scanner, X-Ray, MRI"
                value={formData.modality}
                onChange={(e) => handleInputChange('modality', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of the modality"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="station-name">Station Name</Label>
              <Input
                id="station-name"
                placeholder="e.g., CT01, XR01"
                value={formData.station_name}
                onChange={(e) => handleInputChange('station_name', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="aetitle">AE Title</Label>
              <Input
                id="aetitle"
                placeholder="DICOM AE Title (e.g., CT_STATION_1)"
                value={formData.aetitle}
                onChange={(e) => handleInputChange('aetitle', e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Modality'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/modalities')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}