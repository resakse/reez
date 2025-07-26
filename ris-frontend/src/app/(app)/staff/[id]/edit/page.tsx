'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import AuthService from '@/lib/auth';

const jawatanChoices = [
  'Juru X-Ray',
  'Pegawai Perubatan',
  'Penolong Pegawai Perubatan',
  'Jururawat',
];

interface StaffFormData {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  jawatan: string;
  klinik: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  komen: string;
  password?: string;
}

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params?.id as string;
  const { user } = useAuth();
  const isCurrentSuperuser = user?.is_superuser || false;
  
  const [formData, setFormData] = useState<StaffFormData>({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    jawatan: 'Juru X-Ray',
    klinik: '',
    is_active: true,
    is_staff: false,
    is_superuser: false,
    komen: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const fetchStaffMember = async () => {
      try {
        const res = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/staff/${staffId}/`
        );

        if (!res.ok) {
          throw new Error('Failed to fetch staff member');
        }

        const staff = await res.json();
        setFormData({
          username: staff.username,
          first_name: staff.first_name,
          last_name: staff.last_name,
          email: staff.email || '',
          jawatan: staff.jawatan,
          klinik: staff.klinik,
          is_active: staff.is_active,
          is_staff: staff.is_staff || false,
          is_superuser: staff.is_superuser || false,
          komen: staff.komen || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load staff member');
      } finally {
        setInitialLoading(false);
      }
    };

    if (staffId) {
      fetchStaffMember();
    }
  }, [staffId]);

  const handleInputChange = (field: keyof StaffFormData, value: string | boolean) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      
      // Auto-check Staff checkbox when Position = Juru X-Ray
      if (field === 'jawatan' && value === 'Juru X-Ray') {
        updated.is_staff = true;
      }
      
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const updateData = { ...formData };
      // Only include password if it's provided
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password;
      }

      const res = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/staff/${staffId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to update staff member');
      }

      router.push('/staff');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading staff member data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Edit Staff Member</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">New Password (leave blank to keep current)</Label>
              <Input
                id="password"
                type="password"
                value={formData.password || ''}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Enter new password or leave blank"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                type="text"
                value={formData.first_name}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                type="text"
                value={formData.last_name}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="jawatan">Position *</Label>
            <Select value={formData.jawatan} onValueChange={(value) => handleInputChange('jawatan', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jawatanChoices.map((jawatan) => (
                  <SelectItem key={jawatan} value={jawatan}>
                    {jawatan}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="klinik">Clinic *</Label>
            <Input
              id="klinik"
              type="text"
              value={formData.klinik}
              onChange={(e) => handleInputChange('klinik', e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="komen">Comments</Label>
            <Textarea
              id="komen"
              value={formData.komen}
              onChange={(e) => handleInputChange('komen', e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleInputChange('is_active', checked as boolean)}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_staff"
                checked={formData.is_staff}
                onCheckedChange={(checked) => handleInputChange('is_staff', checked as boolean)}
              />
              <Label htmlFor="is_staff">Staff (Can access staff management)</Label>
            </div>
            
            {isCurrentSuperuser && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_superuser"
                  checked={formData.is_superuser}
                  onCheckedChange={(checked) => handleInputChange('is_superuser', checked as boolean)}
                />
                <Label htmlFor="is_superuser">Superuser (Can access settings)</Label>
              </div>
            )}
          </div>

          <div className="flex space-x-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Staff Member'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => router.push('/staff')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}