'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';
import { ArrowLeft, Save, Calendar, User, Stethoscope, MessageSquare } from 'lucide-react';

interface Study {
  id: number;
  tarikh: string;
  no_resit: string;
  accession_number: string;
  study_instance_uid: string;
  pemohon: string;
  ambulatori: string;
  lmp?: string;
  hamil: boolean;
  dcatatan: string;
  status: string;
  rujukan: {
    id: number;
    wad: string;
  };
  pesakit: {
    id: number;
    nama: string;
    nric: string;
    jantina: string;
  };
  pemeriksaan: Array<{
    id: number;
    no_xray: string;
    exam: {
      id: number;
      exam: string;
      modaliti: {
        id: number;
        nama: string;
      };
    };
    laterality?: string;
    jxr?: {
      id: number;
      username: string;
      first_name: string;
      last_name: string;
    };
  }>;
}

interface Ward {
  id: number;
  wad: string;
}

interface Radiographer {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

const ambulatoriChoices = [
  { value: 'Berjalan', label: 'Berjalan' },
  { value: 'Kerusi Roda', label: 'Kerusi Roda' },
  { value: 'Troli', label: 'Troli' }
];

// Study status is now automatically derived from examination statuses

const examStatusChoices = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

const priorityChoices = [
  { value: 'STAT', label: 'STAT' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' }
];

export default function EditStudyPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [study, setStudy] = useState<Study | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [radiographers, setRadiographers] = useState<Radiographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());

  const studyId = params?.id;

  const [formData, setFormData] = useState({
    no_resit: '',
    pemohon: '',
    ambulatori: 'Berjalan',
    rujukan_id: '',
    hamil: false,
    lmp: '',
    study_description: '',
    study_priority: 'MEDIUM',
    study_status: 'SCHEDULED',
    study_comments: ''
  });

  const [examinations, setExaminations] = useState<Array<{
    id: number;
    no_xray: string;
    accession_number?: string;
    exam: {
      id: number;
      exam: string;
      modaliti: {
        id: number;
        nama: string;
      };
    };
    laterality?: string;
    catatan?: string;
    patient_position?: string;
    body_position?: string;
    exam_status?: string;
    kv?: number;
    mas?: number;
    mgy?: number;
    jxr?: {
      id: number;
      username: string;
      first_name: string;
      last_name: string;
    };
  }>>([]);

  const fetchStudyData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch study details
      const studyRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/${studyId}/`
      );
      
      if (!studyRes.ok) {
        throw new Error('Failed to fetch study data');
      }
      
      const studyData = await studyRes.json();
      setStudy(studyData);

      // Set form data
      setFormData({
        no_resit: studyData.no_resit || '',
        pemohon: studyData.pemohon || '',
        ambulatori: studyData.ambulatori || 'Berjalan',
        rujukan_id: studyData.rujukan?.id?.toString() || 'none',
        hamil: studyData.hamil || false,
        lmp: studyData.lmp || '',
        study_description: studyData.study_description || '',
        study_priority: studyData.study_priority || 'MEDIUM',
        study_status: studyData.study_status || 'SCHEDULED',
        study_comments: studyData.study_comments || ''
      });

      // Set examinations data for editable table
      setExaminations(studyData.pemeriksaan || []);

      // Fetch available wards for dropdown
      const wardsRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/wards/`
      );
      
      if (wardsRes.ok) {
        const wardsData = await wardsRes.json();
        setWards(Array.isArray(wardsData) ? wardsData : wardsData.results || []);
      }

      // Fetch radiographers
      const radiographersRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/staff/?jawatan=Juru X-Ray`
      );
      
      if (radiographersRes.ok) {
        const radiographersData = await radiographersRes.json();
        setRadiographers(Array.isArray(radiographersData) ? radiographersData : radiographersData.results || []);
      }
    } catch (err) {
      console.error('Error loading study data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load study data');
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    if (studyId && user) {
      // Check if user has permission to edit studies
      if (!user.is_superuser && !user.is_staff) {
        setError('Access denied. Only staff members can edit studies.');
        return;
      }
      fetchStudyData();
    }
  }, [studyId, user, fetchStudyData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      const updateData = {
        pesakit_id: study.pesakit.id,
        no_resit: formData.no_resit || null,
        pemohon: formData.pemohon || null,
        ambulatori: formData.ambulatori,
        rujukan_id: formData.rujukan_id ? parseInt(formData.rujukan_id) : null,
        hamil: formData.hamil,
        lmp: formData.lmp || null,
        study_description: formData.study_description || null,
        study_priority: formData.study_priority,
        study_status: formData.study_status,
        study_comments: formData.study_comments || null
      };

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/${studyId}/`,
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
        throw new Error(errorData.detail || 'Failed to update study');
      }

      // Redirect to study details page
      router.push(`/studies/${studyId}`);
      toast.success('Study updated successfully');
    } catch (err) {
      console.error('Error updating study:', err);
      setError(err instanceof Error ? err.message : 'Failed to update study');
      toast.error(err instanceof Error ? err.message : 'Failed to update study');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-MY');
  };

  const formatDateTime = (dateString: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-MY');
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleExaminationChange = (index: number, field: string, value: string | number | undefined) => {
    setExaminations(prev => {
      const newExams = [...prev];
      if (field === 'jxr') {
        const radiographer = radiographers.find(r => r.id === value);
        newExams[index] = {
          ...newExams[index],
          jxr: radiographer || null
        };
      } else {
        newExams[index] = {
          ...newExams[index],
          [field]: value === '' ? undefined : value
        };
      }
      return newExams;
    });
  };

  // Calculate derived study status from examination statuses
  const calculateStudyStatus = (examinations: typeof examinations): string => {
    if (!examinations || examinations.length === 0) return 'SCHEDULED';
    
    const statuses = examinations.map(exam => exam.exam_status || 'SCHEDULED');
    
    // If all examinations are cancelled, study is cancelled
    if (statuses.every(status => status === 'CANCELLED')) return 'CANCELLED';
    
    // If all examinations are completed or cancelled, study is completed
    if (statuses.every(status => status === 'COMPLETED' || status === 'CANCELLED')) return 'COMPLETED';
    
    // If any examination is in progress, study is in progress
    if (statuses.some(status => status === 'IN_PROGRESS')) return 'IN_PROGRESS';
    
    // Default to scheduled
    return 'SCHEDULED';
  };

  const derivedStudyStatus = calculateStudyStatus(examinations);

  const handleSaveExamination = async (examId: number, examData: { catatan?: string; kv?: number; mas?: number; mgy?: number; exam_status?: string; jxr_id?: number | null }) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/${examId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            catatan: examData.catatan,
            kv: examData.kv,
            mas: examData.mas,
            mgy: examData.mgy,
            exam_status: examData.exam_status,
            jxr_id: examData.jxr_id
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update examination');
      }

      // Show success toast without full reload
      toast.success('Examination updated successfully');
    } catch (err) {
      console.error('Error updating examination:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update examination');
    }
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

  if (!study) {
    return (
      <div className="container-fluid px-4 py-8">
        <Alert>
          <AlertDescription>Study not found</AlertDescription>
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
        
        <h1 className="text-3xl font-bold">Edit Study</h1>
        <p className="mt-2">
          {study.pesakit.nama} - {formatDate(study.tarikh)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study Details */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Study Details
              </CardTitle>
              <CardDescription>
                Update the study information and identifiers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div>
                    <Label htmlFor="no_resit">Receipt Number</Label>
                    <Input
                      id="no_resit"
                      value={formData.no_resit}
                      onChange={(e) => handleInputChange('no_resit', e.target.value)}
                      placeholder="Enter receipt number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="pemohon">Requesting Doctor</Label>
                    <Input
                      id="pemohon"
                      value={formData.pemohon}
                      onChange={(e) => handleInputChange('pemohon', e.target.value)}
                      placeholder="Enter requesting doctor name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="rujukan_id">Ward/Department</Label>
                    <Select 
                      value={formData.rujukan_id} 
                      onValueChange={(value) => handleInputChange('rujukan_id', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select ward/department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {wards.map((ward) => (
                          <SelectItem key={ward.id} value={ward.id.toString()}>
                            {ward.wad}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ambulatori">Patient Mobility</Label>
                    <Select 
                      value={formData.ambulatori} 
                      onValueChange={(value) => handleInputChange('ambulatori', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select mobility" />
                      </SelectTrigger>
                      <SelectContent>
                        {ambulatoriChoices.map((choice) => (
                          <SelectItem key={choice.value} value={choice.value}>
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>


                  {study.pesakit.jantina === 'P' && (
                    <div>
                      <Label htmlFor="lmp">LMP (Last Menstrual Period)</Label>
                      <Input
                        id="lmp"
                        type="date"
                        value={formData.lmp}
                        onChange={(e) => handleInputChange('lmp', e.target.value)}
                      />
                    </div>
                  )}

                  {study.pesakit.jantina === 'P' && (
                    <div>
                      <Label htmlFor="hamil">Pregnancy Status</Label>
                      <Select 
                        value={formData.hamil ? 'true' : 'false'} 
                        onValueChange={(value) => handleInputChange('hamil', value === 'true')}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select pregnancy status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Not Pregnant</SelectItem>
                          <SelectItem value="true">Pregnant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>


                <div>
                  <Label htmlFor="study_comments">Study Comments</Label>
                  <Textarea
                    id="study_comments"
                    value={formData.study_comments}
                    onChange={(e) => handleInputChange('study_comments', e.target.value)}
                    placeholder="Clinical information, special instructions, study-level notes..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Study-level comments for clinical information and general notes
                  </p>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

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

        {/* Study Summary */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <p className="text-lg">{study.pesakit.nama}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">IC Number</label>
                  <p className="text-lg font-mono">{study.pesakit.nric}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Gender</label>
                  <p className="text-lg">{study.pesakit.jantina === 'L' ? 'Male' : 'Female'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Registration Date</label>
                  <p className="text-lg">{formatDateTime(study.tarikh)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DICOM Details Card */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                DICOM Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Study Instance UID</label>
                  <p className="text-sm font-mono break-all">{study.study_instance_uid || '-'}</p>
                </div>
                {study.accession_number && (
                  <div>
                    <label className="text-sm font-medium">Accession Number</label>
                    <p className="text-sm font-mono">{study.accession_number}</p>
                  </div>
                )}
                {study.scheduled_datetime && (
                  <div>
                    <label className="text-sm font-medium">Scheduled Date</label>
                    <p className="text-sm">{formatDateTime(study.scheduled_datetime)}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Study Status (Auto-calculated)</label>
                  <div className="mt-1">
                    <Badge 
                      variant={derivedStudyStatus === 'CANCELLED' ? 'destructive' : 
                              derivedStudyStatus === 'COMPLETED' ? 'default' : 
                              derivedStudyStatus === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {derivedStudyStatus === 'SCHEDULED' && '📅 Scheduled'}
                      {derivedStudyStatus === 'IN_PROGRESS' && '⚡ In Progress'}
                      {derivedStudyStatus === 'COMPLETED' && '✅ Completed'}
                      {derivedStudyStatus === 'CANCELLED' && '❌ Cancelled'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-calculated from examinations
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Select 
                    value={formData.study_priority} 
                    onValueChange={(value) => handleInputChange('study_priority', value)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityChoices.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Examinations Table at Bottom */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Examinations ({examinations.length})
              <Badge 
                variant={derivedStudyStatus === 'CANCELLED' ? 'destructive' : 
                        derivedStudyStatus === 'COMPLETED' ? 'default' : 
                        derivedStudyStatus === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                className="text-xs ml-2"
              >
                Study: {derivedStudyStatus}
              </Badge>
            </span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => alert('Add new examination - implementation needed')}
            >
              Add Examination
            </Button>
          </CardTitle>
          <CardDescription>
            Manage individual examinations within this study. Study status is automatically calculated from examination statuses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {examinations.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Accession No</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Exam Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Position</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">kVp</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">mAs</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">mGy</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Radiographer</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Comments</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {examinations.map((exam, index) => (
                    <tr key={exam.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm font-mono font-semibold">{exam.accession_number || exam.no_xray}</p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm">{exam.exam.exam}</p>
                        {exam.laterality && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {exam.laterality}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="space-y-1">
                          {exam.patient_position && (
                            <Badge variant="outline" className="text-xs block">
                              {exam.patient_position}
                            </Badge>
                          )}
                          {exam.body_position && (
                            <Badge variant="outline" className="text-xs block">
                              {exam.body_position}
                            </Badge>
                          )}
                          {!exam.patient_position && !exam.body_position && '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Input 
                          type="number" 
                          className="w-20 h-8 text-sm"
                          placeholder="kVp"
                          value={exam.kv || ''}
                          onChange={(e) => handleExaminationChange(index, 'kv', e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Input 
                          type="number" 
                          className="w-20 h-8 text-sm"
                          placeholder="mAs"
                          value={exam.mas || ''}
                          onChange={(e) => handleExaminationChange(index, 'mas', e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Input 
                          type="number" 
                          className="w-20 h-8 text-sm"
                          placeholder="mGy"
                          value={exam.mgy || ''}
                          onChange={(e) => handleExaminationChange(index, 'mgy', e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Select
                          value={exam.exam_status || 'SCHEDULED'}
                          onValueChange={(value) => handleExaminationChange(index, 'exam_status', value)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {examStatusChoices.map((choice) => (
                              <SelectItem key={choice.value} value={choice.value}>
                                {choice.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Select
                          value={exam.jxr?.id?.toString() || ''}
                          onValueChange={(value) => handleExaminationChange(index, 'jxr', value === 'none' ? undefined : parseInt(value))}
                        >
                          <SelectTrigger className="w-32 h-8 text-sm">
                            <SelectValue placeholder="Select radiographer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {radiographers.map((radiographer) => (
                              <SelectItem key={radiographer.id} value={radiographer.id.toString()}>
                                {radiographer.first_name} {radiographer.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="relative">
                          <Textarea
                            className="w-32 text-xs resize-none"
                            placeholder="Technical notes..."
                            value={exam.catatan || ''}
                            onChange={(e) => handleExaminationChange(index, 'catatan', e.target.value)}
                            rows={expandedComments.has(exam.id) ? 4 : 1}
                            onFocus={() => {
                              setExpandedComments(prev => new Set([...prev, exam.id]));
                            }}
                            onBlur={() => {
                              if (!exam.catatan || exam.catatan.trim() === '') {
                                setExpandedComments(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(exam.id);
                                  return newSet;
                                });
                              }
                            }}
                            title="Examination-level technical notes and radiographer comments"
                          />
                          {(exam.catatan && exam.catatan.trim() !== '') && (
                            <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs">
                              <MessageSquare className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex space-x-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-xs"
                            onClick={() => handleSaveExamination(exam.id, {
                              catatan: exam.catatan,
                              kv: exam.kv,
                              mas: exam.mas,
                              mgy: exam.mgy,
                              exam_status: exam.exam_status,
                              jxr_id: exam.jxr?.id || null
                            })}
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 p-4 bg-muted/20 rounded-lg">
              <h4 className="text-sm font-semibold mb-2">📊 Status Calculation Logic</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <Badge variant="outline" className="text-xs mb-1">📅 SCHEDULED</Badge>
                  <p>When at least one exam is scheduled</p>
                </div>
                <div>
                  <Badge variant="secondary" className="text-xs mb-1">⚡ IN_PROGRESS</Badge>
                  <p>When any exam is in progress</p>
                </div>
                <div>
                  <Badge variant="default" className="text-xs mb-1">✅ COMPLETED</Badge>
                  <p>When all exams are completed/cancelled</p>
                </div>
                <div>
                  <Badge variant="destructive" className="text-xs mb-1">❌ CANCELLED</Badge>
                  <p>When all exams are cancelled</p>
                </div>
              </div>
            </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No examinations found for this study</p>
              <Badge variant="outline" className="mb-4">Study Status: {derivedStudyStatus}</Badge>
              <br />
              <Button 
                variant="outline"
                onClick={() => alert('Add first examination - implementation needed')}
              >
                Add First Examination
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}