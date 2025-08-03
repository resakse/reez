'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { ArrowLeft, Save, User } from 'lucide-react';
import Link from 'next/link';

const jawatanChoices = [
  { value: 'Juru X-Ray', label: 'Juru X-Ray' },
  { value: 'Pegawai Perubatan', label: 'Pegawai Perubatan' },
  { value: 'Penolong Pegawai Perubatan', label: 'Penolong Pegawai Perubatan' },
  { value: 'Jururawat', label: 'Jururawat' },
];

export default function EditProfilePage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    ...(user?.is_staff || user?.is_superuser ? {
      jawatan: user?.jawatan || 'Juru X-Ray',
      klinik: user?.klinik || '',
      komen: user?.komen || '',
    } : {})
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Please log in to edit your profile.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      // Prepare form data - exclude klinik as it's readonly, only include jawatan and komen for staff/superuser
      const submitData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        ...(user.is_staff || user.is_superuser ? {
          jawatan: formData.jawatan,
          komen: formData.komen,
          // klinik is readonly, don't include it
        } : {})
      };

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff/${user.id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        toast.success('Profile updated successfully');
        await refreshUser(); // Refresh user data in context
        router.push('/profile');
      } else {
        const errorData = await response.json();
        if (response.status === 400) {
          setErrors(errorData);
        } else {
          toast.error('Failed to update profile');
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('An error occurred while updating your profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
          <p className="text-muted-foreground">
            Update your personal information and preferences
          </p>
        </div>
        
        <Link href="/profile">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Profile
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Update your personal details below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  placeholder="Enter your first name"
                />
                {errors.first_name && (
                  <p className="text-sm text-red-500">{errors.first_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  placeholder="Enter your last name"
                />
                {errors.last_name && (
                  <p className="text-sm text-red-500">{errors.last_name}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter your email address"
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {(user.is_staff || user.is_superuser) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jawatan">Position (Jawatan)</Label>
                  <Select 
                    value={formData.jawatan} 
                    onValueChange={(value) => handleInputChange('jawatan', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your position" />
                    </SelectTrigger>
                    <SelectContent>
                      {jawatanChoices.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.jawatan && (
                    <p className="text-sm text-red-500">{errors.jawatan}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="klinik">Clinic (Klinik)</Label>
                  <Input
                    id="klinik"
                    value={formData.klinik}
                    readOnly
                    className="bg-muted"
                    placeholder="Clinic name (readonly)"
                  />
                  <p className="text-sm text-muted-foreground">
                    Clinic name cannot be changed
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Link href="/profile">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Comments Section - Separate Card */}
      {(user.is_staff || user.is_superuser) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Comments
            </CardTitle>
            <CardDescription>
              Additional notes and comments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="komen">Comments (Komen)</Label>
              <Textarea
                id="komen"
                value={formData.komen}
                onChange={(e) => handleInputChange('komen', e.target.value)}
                placeholder="Enter any comments or notes..."
                rows={4}
              />
              {errors.komen && (
                <p className="text-sm text-red-500">{errors.komen}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}