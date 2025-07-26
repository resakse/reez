'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import AuthService from '@/lib/auth';
import { parseNric, formatNric, type NricInfo } from '@/lib/nric';
import { ArrowLeft, User, Calendar, MapPin, Phone, Mail, Edit, Save, X } from 'lucide-react';

interface Patient {
  id: number;
  nama: string;
  nric: string;
  t_lahir: string;
  jantina: string;
  umur: number;
  alamat: string;
  telefon: string;
  email: string;
  bangsa: string;
  mrn: string;
  catatan: string;
  created: string;
  modified: string;
}

export default function EditPatientPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const patientId = params?.id;
  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    nama: '',
    nric: '',
    t_lahir: '',
    jantina: '',
    umur: '',
    alamat: '',
    telefon: '',
    email: '',
    bangsa: 'Melayu',
    mrn: '',
    catatan: ''
  });
  
  const [nricInfo, setNricInfo] = useState<NricInfo | null>(null);
  const [nricError, setNricError] = useState('');

  useEffect(() => {
    if (user && patientId) {
      fetchPatientData();
    }
  }, [user, patientId]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const res = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/`
      );
      
      if (!res.ok) {
        throw new Error('Failed to fetch patient data');
      }
      
      const patientData = await res.json();
      setPatient(patientData);
      
      // Populate form with existing data
      setFormData({
        nama: patientData.nama || '',
        nric: formatNric(patientData.nric || ''),
        t_lahir: patientData.t_lahir || '',
        jantina: patientData.jantina || '',
        umur: patientData.umur?.toString() || '',
        alamat: patientData.alamat || '',
        telefon: patientData.telefon || '',
        email: patientData.email || '',
        bangsa: patientData.bangsa || 'Melayu',
        mrn: patientData.mrn || '',
        catatan: patientData.catatan || ''
      });
      
      // Parse NRIC info
      if (patientData.nric) {
        const info = parseNric(patientData.nric);
        setNricInfo(info);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleNricChange = (value: string) => {
    const formatted = formatNric(value);
    setFormData(prev => ({ ...prev, nric: formatted }));
    
    if (value.trim()) {
      const info = parseNric(value);
      setNricInfo(info);
      
      if (info.isValid) {
        setNricError('');
        if (info.dateOfBirth) {
          setFormData(prev => ({ 
            ...prev, 
            t_lahir: info.dateOfBirth!,
            jantina: info.gender === 'male' ? 'L' : 'P',
            umur: info.age?.toString() || ''
          }));
        }
      } else {
        setNricError(info.error || 'Invalid NRIC format');
      }
    } else {
      setNricInfo(null);
      setNricError('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSelectChange = (id: string, value: string) => {
    setFormData({ ...formData, [id]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setError(null);

    try {
      const payload = {
        nama: formData.nama,
        no_kp: formData.nric.replace(/[-\s]/g, ''),
        t_lahir: formData.t_lahir,
        jantina: formData.jantina,
        umur: parseInt(formData.umur) || null,
        alamat: formData.alamat,
        telefon: formData.telefon,
        email: formData.email,
        bangsa: formData.bangsa,
        mrn: formData.mrn || null,
        catatan: formData.catatan || null
      };

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = Object.values(errorData).flat().join(' ');
        throw new Error(errorMessage || 'Failed to update patient');
      }

      const updatedPatient = await response.json();
      router.push(`/patients/${updatedPatient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          onClick={() => router.back()} 
          variant="outline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>Patient not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Patient</h1>
          <p className="text-muted-foreground">
            Update patient information for {patient.nama}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Details
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Edit className="w-5 h-5 mr-2" />
              Patient Information
            </CardTitle>
            <CardDescription>
              Update patient details. NRIC will automatically populate age and gender.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nama">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nama"
                    placeholder="Enter patient name"
                    value={formData.nama}
                    onChange={handleChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nric">NRIC Number *</Label>
                <Input
                  id="nric"
                  placeholder="e.g., 791113-12-3456"
                  value={formData.nric}
                  onChange={(e) => handleNricChange(e.target.value)}
                  maxLength={17}
                  className={nricError ? 'border-red-500' : nricInfo?.isValid ? 'border-green-500' : ''}
                  required
                />
                {nricError && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-sm">{nricError}</AlertDescription>
                  </Alert>
                )}
                {nricInfo?.isValid && (
                  <Alert className="py-2 bg-green-200/80 border-green-400 text-green-800">
                    <AlertDescription className="text-sm font-medium">
                      {nricInfo.type === 'nric' 
                        ? `✓ Valid NRIC - Age: ${nricInfo.age}, Gender: ${nricInfo.gender === 'male' ? 'L' : 'P'}`
                        : '✓ Valid Passport Format'
                      }
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mrn">Medical Record Number</Label>
                <Input
                  id="mrn"
                  placeholder="e.g., MRN-2024-0001"
                  value={formData.mrn}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="t_lahir">Date of Birth</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="t_lahir"
                    type="date"
                    value={formData.t_lahir}
                    onChange={(e) => handleSelectChange('t_lahir', e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jantina">Gender</Label>
                <Select
                  value={formData.jantina}
                  onValueChange={(value) => handleSelectChange('jantina', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Male (L)</SelectItem>
                    <SelectItem value="P">Female (P)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bangsa">Race</Label>
                <Select
                  value={formData.bangsa}
                  onValueChange={(value) => handleSelectChange('bangsa', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select race" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Melayu">Melayu</SelectItem>
                    <SelectItem value="Cina">Cina</SelectItem>
                    <SelectItem value="India">India</SelectItem>
                    <SelectItem value="Lain-Lain">Lain-Lain</SelectItem>
                    <SelectItem value="Warga Asing">Warga Asing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="umur">Age</Label>
                <Input
                  id="umur"
                  type="number"
                  value={formData.umur}
                  onChange={(e) => handleSelectChange('umur', e.target.value)}
                  placeholder="Auto-calculated from NRIC"
                  readOnly={!!nricInfo?.age}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="alamat">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="alamat"
                  placeholder="Enter patient address"
                  value={formData.alamat}
                  onChange={handleChange}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefon">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="telefon"
                    type="tel"
                    placeholder="e.g., +6012-3456789"
                    value={formData.telefon}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="patient@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catatan">Notes</Label>
              <Textarea
                id="catatan"
                placeholder="Enter any additional notes or medical information..."
                value={formData.catatan}
                onChange={(e) => handleChange(e)}
                rows={4}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => router.back()}
            disabled={isUpdating}
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isUpdating || (!!nricError && !!formData.nric)}
          >
            <Save className="w-4 h-4 mr-2" />
            {isUpdating ? 'Updating...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}