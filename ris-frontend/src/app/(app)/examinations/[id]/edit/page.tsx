'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AuthService from '@/lib/auth';
import { ArrowLeft, Save } from 'lucide-react';

interface Examination {
  id: number;
  no_xray: string;
  laterality: string | null;
  kv: number | null;
  mas: number | null;
  mgy: number | null;
  exam: {
    id: number;
    exam: string;
    exam_code: string;
    modaliti: {
      id: number;
      nama: string;
      singkatan: string;
    };
  };
  daftar_info: {
    id: number;
    tarikh: string;
    no_resit: string;
    accession_number: string;
    study_instance_uid: string;
    pemohon: string;
    ambulatori: string;
    lmp?: string;
    rujukan: {
      id: number;
      wad: string;
    };
    jxr?: {
      id: number;
      username: string;
      first_name: string;
      last_name: string;
    };
    pesakit: {
      id: number;
      nama: string;
      nric: string;
      jantina: string;
    };
  };
  created: string;
  modified: string;
}

interface ExamType {
  id: number;
  exam: string;
  exam_code: string;
  modaliti: {
    id: number;
    nama: string;
    singkatan: string;
  };
}

export default function EditExaminationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [examination, setExamination] = useState<Examination | null>(null);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examId = params?.id;

  const [formData, setFormData] = useState({
    exam_id: '',
    laterality: '',
    kv: '',
    mas: '',
    mgy: ''
  });

  useEffect(() => {
    if (examId && user) {
      fetchExaminationData();
    }
  }, [examId, user]);

  const fetchExaminationData = async () => {
    try {
      setLoading(true);
      
      // Fetch examination details
      const examRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/${examId}/`
      );
      
      if (!examRes.ok) {
        throw new Error('Failed to fetch examination data');
      }
      
      const examData = await examRes.json();
      setExamination(examData);

      // Set form data
      setFormData({
        exam_id: examData.exam.id.toString(),
        laterality: examData.laterality || 'none',
        kv: examData.kv?.toString() || '',
        mas: examData.mas?.toString() || '',
        mgy: examData.mgy?.toString() || ''
      });

      // Fetch available exams for dropdown
      const examsRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/`
      );
      
      if (examsRes.ok) {
        const examsData = await examsRes.json();
        setExams(Array.isArray(examsData) ? examsData : examsData.results || []);
      }
    } catch (err) {
      console.error('Error loading examination data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load examination data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      const updateData = {
        exam_id: parseInt(formData.exam_id),
        laterality: formData.laterality === 'none' ? null : formData.laterality,
        kv: formData.kv ? parseInt(formData.kv) : null,
        mas: formData.mas ? parseInt(formData.mas) : null,
        mgy: formData.mgy ? parseInt(formData.mgy) : null
      };

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/${examId}/`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update examination');
      }

      // Redirect back to previous page
      router.back();
    } catch (err) {
      console.error('Error updating examination:', err);
      setError(err instanceof Error ? err.message : 'Failed to update examination');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRadiographerName = (jxr: any) => {
    if (!jxr) return '-';
    if (jxr.first_name && jxr.last_name) {
      return `${jxr.first_name} ${jxr.last_name}`;
    }
    return jxr.username || '-';
  };

  const shouldShowLMP = (patient: any) => {
    return patient.jantina === 'P';
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="container-fluid px-4 py-8">
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
      <div className="container-fluid px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          onClick={() => router.back()} 
          className="mt-4"
          variant="outline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!examination) {
    return (
      <div className="container-fluid px-4 py-8">
        <Alert>
          <AlertDescription>Examination not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 py-8">
      <div className="mb-6">
        <Button 
          onClick={() => router.back()} 
          variant="outline"
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <h1 className="text-3xl font-bold text-gray-900">Edit Examination</h1>
        <p className="text-gray-600 mt-2">
          {examination.exam.exam} - {examination.daftar_info.pesakit.nama}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Examination Details</CardTitle>
          <CardDescription>
            Current examination information and identifiers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">X-Ray Number</label>
              <p className="text-lg font-mono font-semibold text-blue-600">{examination.no_xray}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Accession Number</label>
              <p className="text-lg font-mono">{examination.daftar_info.accession_number || examination.daftar_info.no_resit || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Receipt Number</label>
              <p className="text-lg font-mono">{examination.daftar_info.no_resit || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Patient Name</label>
              <p className="text-lg">{examination.daftar_info.pesakit.nama}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">IC Number</label>
              <p className="text-lg font-mono">{examination.daftar_info.pesakit.nric}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Gender</label>
              <p className="text-lg">{examination.daftar_info.pesakit.jantina === 'L' ? 'Male' : examination.daftar_info.pesakit.jantina === 'P' ? 'Female' : 'Unknown'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Referring Doctor</label>
              <p className="text-lg">{examination.daftar_info.pemohon || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Ward/Department</label>
              <p className="text-lg">{examination.daftar_info.rujukan?.wad || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Mobility</label>
              <p className="text-lg">{examination.daftar_info.ambulatori || '-'}</p>
            </div>
            {shouldShowLMP(examination.daftar_info.pesakit) && (
              <div>
                <label className="text-sm font-medium text-gray-500">LMP</label>
                <p className="text-lg">{examination.daftar_info.lmp ? formatDate(examination.daftar_info.lmp) : '-'}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-500">Radiographer</label>
              <p className="text-lg">{getRadiographerName(examination.daftar_info.jxr)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Registration Date</label>
              <p className="text-lg">{formatDateTime(examination.daftar_info.tarikh)}</p>
            </div>
            <div className="lg:col-span-3">
              <label className="text-sm font-medium text-gray-500">Study Instance UID</label>
              <p className="text-sm font-mono text-gray-600">{examination.daftar_info.study_instance_uid || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit Examination</CardTitle>
          <CardDescription>
            Update the examination parameters below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exam">Examination Type</Label>
                <Select 
                  value={formData.exam_id} 
                  onValueChange={(value) => handleInputChange('exam_id', value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select exam type" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.exam} ({exam.modaliti.nama})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="laterality">Laterality</Label>
                <Select 
                  value={formData.laterality} 
                  onValueChange={(value) => handleInputChange('laterality', value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select laterality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="Kiri">Left</SelectItem>
                    <SelectItem value="Kanan">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="kv">kVp</Label>
                <Input
                  type="number"
                  value={formData.kv}
                  onChange={(e) => handleInputChange('kv', e.target.value)}
                  placeholder="kVp value"
                  min="0"
                  max="150"
                />
              </div>

              <div>
                <Label htmlFor="mas">mAs</Label>
                <Input
                  type="number"
                  value={formData.mas}
                  onChange={(e) => handleInputChange('mas', e.target.value)}
                  placeholder="mAs value"
                  min="0"
                  max="1000"
                />
              </div>

              <div>
                <Label htmlFor="mgy">mGy</Label>
                <Input
                  type="number"
                  value={formData.mgy}
                  onChange={(e) => handleInputChange('mgy', e.target.value)}
                  placeholder="mGy value"
                  min="0"
                  max="50"
                />
              </div>
            </div>

            <div className="flex space-x-4 pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => router.back()}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}