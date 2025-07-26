'use client';

import { useState, useEffect } from 'react';
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
import { ArrowLeft, Save, Calendar, User, MapPin, Stethoscope } from 'lucide-react';

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

const statusChoices = [
  { value: 'Registered', label: 'Registered' },
  { value: 'Performed', label: 'Performed' },
  { value: 'Completed', label: 'Completed' }
];

const priorityChoices = [
  { value: 'STAT', label: 'STAT' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' }
];

const positionChoices = [
  { value: 'HFS', label: 'Head First-Supine' },
  { value: 'HFP', label: 'Head First-Prone' },
  { value: 'HFDR', label: 'Head First-Decubitus Right' },
  { value: 'HFDL', label: 'Head First-Decubitus Left' },
  { value: 'FFS', label: 'Feet First-Supine' },
  { value: 'FFP', label: 'Feet First-Prone' },
  { value: 'FFDR', label: 'Feet First-Decubitus Right' },
  { value: 'FFDL', label: 'Feet First-Decubitus Left' }
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

  const studyId = params?.id;

  const [formData, setFormData] = useState({
    no_resit: '',
    accession_number: '',
    pemohon: '',
    ambulatori: 'Berjalan',
    rujukan_id: '',
    hamil: false,
    lmp: '',
    dcatatan: '',
    status: 'Registered',
    study_priority: 'MEDIUM',
    scheduled_datetime: '',
    requested_procedure_description: '',
    study_comments: '',
    patient_position: '',
    modality: ''
  });

  const [examinations, setExaminations] = useState<Array<{
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

  useEffect(() => {
    if (studyId && user) {
      fetchStudyData();
    }
  }, [studyId, user]);

  const fetchStudyData = async () => {
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
        accession_number: studyData.accession_number || '',
        pemohon: studyData.pemohon || '',
        ambulatori: studyData.ambulatori || 'Berjalan',
        rujukan_id: studyData.rujukan?.id?.toString() || 'none',
        hamil: studyData.hamil || false,
        lmp: studyData.lmp || '',
        dcatatan: studyData.dcatatan || '',
        status: studyData.status || 'Registered',
        study_priority: studyData.study_priority || 'MEDIUM',
        scheduled_datetime: studyData.scheduled_datetime || '',
        requested_procedure_description: studyData.requested_procedure_description || '',
        study_comments: studyData.study_comments || '',
        patient_position: studyData.patient_position || '',
        modality: studyData.modality || ''
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      const updateData = {
        no_resit: formData.no_resit || null,
        accession_number: formData.accession_number || null,
        pemohon: formData.pemohon || null,
        ambulatori: formData.ambulatori,
        rujukan_id: formData.rujukan_id ? parseInt(formData.rujukan_id) : null,
        hamil: formData.hamil,
        lmp: formData.lmp || null,
        dcatatan: formData.dcatatan || null,
        status: formData.status,
        study_priority: formData.study_priority,
        scheduled_datetime: formData.scheduled_datetime || null,
        requested_procedure_description: formData.requested_procedure_description || null,
        study_comments: formData.study_comments || null,
        patient_position: formData.patient_position || null,
        modality: formData.modality || null
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

  const handleSaveExamination = async (examId: number, examData: any) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/${examId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kv: examData.kv,
            mas: examData.mas,
            mgy: examData.mgy,
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
                    <Label htmlFor="accession_number">Accession Number *</Label>
                    <Input
                      id="accession_number"
                      value={formData.accession_number}
                      onChange={(e) => handleInputChange('accession_number', e.target.value)}
                      placeholder="Enter accession number"
                    />
                  </div>

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

                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select 
                      value={formData.status} 
                      onValueChange={(value) => handleInputChange('status', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusChoices.map((choice) => (
                          <SelectItem key={choice.value} value={choice.value}>
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="study_priority">Priority</Label>
                    <Select 
                      value={formData.study_priority} 
                      onValueChange={(value) => handleInputChange('study_priority', value)}
                    >
                      <SelectTrigger>
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

                  <div>
                    <Label htmlFor="modality">Modality</Label>
                    <Input
                      id="modality"
                      value={formData.modality}
                      onChange={(e) => handleInputChange('modality', e.target.value)}
                      placeholder="e.g., CR, DX, CT"
                    />
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
                  <Label htmlFor="scheduled_datetime">Scheduled Date & Time</Label>
                  <Input
                    id="scheduled_datetime"
                    type="datetime-local"
                    value={formData.scheduled_datetime}
                    onChange={(e) => handleInputChange('scheduled_datetime', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="patient_position">Patient Position</Label>
                  <Select 
                    value={formData.patient_position} 
                    onValueChange={(value) => handleInputChange('patient_position', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {positionChoices.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="requested_procedure_description">Procedure Description</Label>
                  <Input
                    id="requested_procedure_description"
                    value={formData.requested_procedure_description}
                    onChange={(e) => handleInputChange('requested_procedure_description', e.target.value)}
                    placeholder="Description of the requested procedure"
                  />
                </div>

                <div>
                  <Label htmlFor="dcatatan">Comments</Label>
                  <Textarea
                    id="dcatatan"
                    value={formData.dcatatan}
                    onChange={(e) => handleInputChange('dcatatan', e.target.value)}
                    placeholder="Enter any additional comments or notes..."
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="study_comments">Study Comments</Label>
                  <Textarea
                    id="study_comments"
                    value={formData.study_comments}
                    onChange={(e) => handleInputChange('study_comments', e.target.value)}
                    placeholder="Additional comments for the study"
                    rows={3}
                  />
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
                  <label className="text-sm font-medium">Priority</label>
                  <Badge variant="outline" className="text-xs">
                    {study.study_priority || 'MEDIUM'}
                  </Badge>
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
            Manage individual examinations within this study
          </CardDescription>
        </CardHeader>
        <CardContent>
          {examinations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">X-Ray No</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Exam Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Laterality</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">kVp</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">mAs</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">mGy</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Radiographer</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {examinations.map((exam, index) => (
                    <tr key={exam.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm font-mono font-semibold">{exam.no_xray}</p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm">{exam.exam.exam}</p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm">{exam.laterality || '-'}</p>
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
                        <div className="flex space-x-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-xs"
                            onClick={() => handleSaveExamination(exam.id, {
                              no_xray: exam.no_xray,
                              laterality: exam.laterality,
                              kv: exam.kv,
                              mas: exam.mas,
                              mgy: exam.mgy,
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
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No examinations found for this study</p>
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