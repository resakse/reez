'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import AuthService from '@/lib/auth';

interface Modality {
  id: number;
  nama: string;
}

interface BodyPart {
  id: number;
  part: string;
}

interface Exam {
  id: number;
  exam: string;
  exam_code: string | null;
  modaliti: {
    id: number;
    nama: string;
  };
  part: {
    id: number;
    part: string;
  } | null;
  catatan: string | null;
  short_desc: string | null;
  contrast: boolean;
  status_ca: string;
}

export default function EditExamPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const examId = params.id;
  
  const [loading, setLoading] = useState(true);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);
  
  const [formData, setFormData] = useState({
    exam: '',
    exam_code: '',
    modaliti: '',
    part: '',
    catatan: '',
    short_desc: '',
    contrast: false,
    status_ca: 'ENABLE',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [examRes, modalitiesRes, bodyPartsRes] = await Promise.all([
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examId}/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/`)
        ]);

        const examData = await examRes.json();
        const modalitiesData = await modalitiesRes.json();
        const bodyPartsData = await bodyPartsRes.json();
        
        setModalities(modalitiesData);
        setBodyParts(bodyPartsData);
        setFormData({
          exam: examData.exam,
          exam_code: examData.exam_code || '',
          modaliti: examData.modaliti.id.toString(),
          part: examData.part?.id?.toString() || '',
          catatan: examData.catatan || '',
          short_desc: examData.short_desc || '',
          contrast: examData.contrast || false,
          status_ca: examData.status_ca || 'ENABLE',
        });
      } catch (error) {
        toast.error('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    if (examId) {
      fetchData();
    }
  }, [examId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examId}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exam: formData.exam,
          exam_code: formData.exam_code || null,
          modaliti_id: parseInt(formData.modaliti),
          part_id: formData.part ? parseInt(formData.part) : null,
          catatan: formData.catatan || null,
          short_desc: formData.short_desc || null,
          contrast: formData.contrast,
          status_ca: formData.status_ca,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update exam');
      }

      toast.success('Exam updated successfully');
      router.push('/exams');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update exam');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this exam? This may affect scheduled examinations.')) return;

    try {
      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examId}/`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete exam');
      }

      toast.success('Exam deleted successfully');
      router.push('/exams');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete exam');
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
          <CardTitle>Edit Exam</CardTitle>
          <CardDescription>
            Update examination type information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="exam-name">Exam Name *</Label>
              <Input
                id="exam-name"
                placeholder="e.g., Chest X-Ray, CT Head, MRI Brain"
                value={formData.exam}
                onChange={(e) => handleInputChange('exam', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="exam-code">Exam Code</Label>
              <Input
                id="exam-code"
                placeholder="e.g., CXR, CT_HEAD, MRI_BRAIN"
                value={formData.exam_code}
                onChange={(e) => handleInputChange('exam_code', e.target.value)}
                maxLength={15}
              />
            </div>

            <div>
              <Label htmlFor="modality">Modality *</Label>
              <Select
                value={formData.modaliti}
                onValueChange={(value) => handleInputChange('modaliti', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a modality" />
                </SelectTrigger>
                <SelectContent>
                  {modalities.map((modality) => (
                    <SelectItem key={modality.id} value={modality.id.toString()}>
                      {modality.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="body-part">Body Part</Label>
              <Select
                value={formData.part}
                onValueChange={(value) => handleInputChange('part', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a body part" />
                </SelectTrigger>
                <SelectContent>
                  {bodyParts.map((part) => (
                    <SelectItem key={part.id} value={part.id.toString()}>
                      {part.part}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="short-desc">Short Description</Label>
              <Input
                id="short-desc"
                placeholder="Short description"
                value={formData.short_desc}
                onChange={(e) => handleInputChange('short_desc', e.target.value)}
                maxLength={50}
              />
            </div>

            <div>
              <Label htmlFor="catatan">Notes</Label>
              <Textarea
                id="catatan"
                placeholder="Additional notes"
                value={formData.catatan}
                onChange={(e) => handleInputChange('catatan', e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="contrast"
                checked={formData.contrast}
                onChange={(e) => handleInputChange('contrast', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="contrast">Requires Contrast</Label>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status_ca}
                onValueChange={(value) => handleInputChange('status_ca', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENABLE">Enable</SelectItem>
                  <SelectItem value="DISABLE">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Exam'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/exams')}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={loading}
                className="ml-auto"
              >
                Delete Exam
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}