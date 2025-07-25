'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';

interface Discipline {
  id: number;
  disiplin: string;
}

export default function NewWardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [formData, setFormData] = useState({
    wad: '',
    singkatan: '',
    disiplin: '',
  });

  // Fetch disciplines on mount
  useState(() => {
    const fetchDisciplines = async () => {
      try {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/`);
        const data = await res.json();
        setDisciplines(data);
      } catch (error) {
        toast.error('Failed to fetch disciplines');
      }
    };
    fetchDisciplines();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wad: formData.wad,
          singkatan: formData.singkatan,
          disiplin: parseInt(formData.disiplin),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create ward');
      }

      toast.success('Ward created successfully');
      router.push('/wards');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create ward');
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
          <CardTitle>Create New Ward</CardTitle>
          <CardDescription>
            Add a new hospital ward to the system and assign it to a discipline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="ward-name">Ward Name *</Label>
              <Input
                id="ward-name"
                placeholder="e.g., Medical Ward 1"
                value={formData.wad}
                onChange={(e) => handleInputChange('wad', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="abbreviation">Abbreviation *</Label>
              <Input
                id="abbreviation"
                placeholder="e.g., MW1"
                value={formData.singkatan}
                onChange={(e) => handleInputChange('singkatan', e.target.value)}
                required
                maxLength={10}
              />
            </div>

            <div>
              <Label htmlFor="discipline">Discipline *</Label>
              <Select
                value={formData.disiplin}
                onValueChange={(value) => handleInputChange('disiplin', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a discipline" />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((discipline) => (
                    <SelectItem key={discipline.id} value={discipline.id.toString()}>
                      {discipline.disiplin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Ward'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/wards')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}