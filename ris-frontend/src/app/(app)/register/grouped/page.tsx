'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

import { Plus, Trash2, User, FileText, Settings } from 'lucide-react';

import type {
  Patient, Ward, Modaliti, Exam, PositionChoices,
  GroupedRegistrationForm, ExaminationFormData,
  GroupedExaminationRequest, GroupedExaminationResponse
} from '@/types/exam';

export default function GroupedRegistrationPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState<GroupedRegistrationForm>({
    pesakit_id: 0,
    study_description: '',
    modality: 'XR',
    study_priority: 'MEDIUM',
    scheduled_datetime: '',
    study_comments: '',
    rujukan_id: undefined,
    pemohon: '',
    no_resit: '',
    lmp: '',
    ambulatori: 'Berjalan',
    hamil: false,
    examinations: [
      {
        exam_id: 0,
        laterality: '',
        patient_position: '',
        body_position: '',
        catatan: '',
        kv: undefined,
        mas: undefined,
        mgy: undefined,
      }
    ]
  });

  // Master data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [modalities, setModalities] = useState<Modaliti[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [positionChoices, setPositionChoices] = useState<PositionChoices | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Load master data
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [patientsRes, wardsRes, modalitiesRes, examsRes, positionsRes] = await Promise.all([
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rujukan/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/`),
          AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/choices/positions/`)
        ]);

        if (patientsRes.ok) {
          const patientsData = await patientsRes.json();
          setPatients(patientsData.results || patientsData);
        }

        if (wardsRes.ok) {
          const wardsData = await wardsRes.json();
          setWards(wardsData.results || wardsData);
        }

        if (modalitiesRes.ok) {
          const modalitiesData = await modalitiesRes.json();
          setModalities(modalitiesData.results || modalitiesData);
        }

        if (examsRes.ok) {
          const examsData = await examsRes.json();
          setExams(examsData.results || examsData);
        }

        if (positionsRes.ok) {
          const positionsData = await positionsRes.json();
          setPositionChoices(positionsData);
        }
      } catch (error) {
        console.error('Error loading master data:', error);
        toast.error('Failed to load form data');
      }
    };

    loadMasterData();
  }, []);

  // Update study description when modality changes
  useEffect(() => {
    if (formData.modality && modalities.length > 0) {
      const modaliti = modalities.find(m => m.singkatan === formData.modality);
      if (modaliti && formData.examinations.length > 0) {
        setFormData(prev => ({
          ...prev,
          study_description: `${modaliti.singkatan} Series`
        }));
      }
    }
  }, [formData.modality, modalities, formData.examinations.length]);

  // Filter exams by selected modality
  const filteredExams = exams.filter(exam => 
    formData.modality ? exam.modaliti.singkatan === formData.modality : true
  );

  const handlePatientSelect = (patientId: number) => {
    const patient = patients.find(p => p.id === patientId);
    setSelectedPatient(patient || null);
    setFormData(prev => ({ ...prev, pesakit_id: patientId }));
  };

  const addExamination = () => {
    setFormData(prev => ({
      ...prev,
      examinations: [
        ...prev.examinations,
        {
          exam_id: 0,
          laterality: '',
          patient_position: '',
          body_position: '',
          catatan: '',
          kv: undefined,
          mas: undefined,
          mgy: undefined,
        }
      ]
    }));
  };

  const removeExamination = (index: number) => {
    if (formData.examinations.length > 1) {
      setFormData(prev => ({
        ...prev,
        examinations: prev.examinations.filter((_, i) => i !== index)
      }));
    }
  };

  const updateExamination = (index: number, field: keyof ExaminationFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      examinations: prev.examinations.map((exam, i) => 
        i === index ? { ...exam, [field]: value } : exam
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPatient) {
      toast.error('Please select a patient');
      return;
    }

    if (formData.examinations.some(exam => exam.exam_id === 0)) {
      toast.error('Please select examinations for all entries');
      return;
    }

    setLoading(true);

    try {
      // Prepare API request
      const requestData: GroupedExaminationRequest = {
        pesakit_id: formData.pesakit_id,
        modality: formData.modality,
        study_description: formData.study_description,
        study_priority: formData.study_priority,
        scheduled_datetime: formData.scheduled_datetime || undefined,
        study_comments: formData.study_comments || undefined,
        rujukan_id: formData.rujukan_id,
        pemohon: formData.pemohon || undefined,
        no_resit: formData.no_resit || undefined,
        lmp: formData.lmp || undefined,
        ambulatori: formData.ambulatori,
        hamil: formData.hamil,
        examinations: formData.examinations.map(exam => ({
          exam_id: exam.exam_id,
          laterality: exam.laterality || undefined,
          patient_position: exam.patient_position || undefined,
          body_position: exam.body_position || undefined,
          catatan: exam.catatan || undefined,
          kv: exam.kv,
          mas: exam.mas,
          mgy: exam.mgy,
        }))
      };

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/grouped/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        }
      );

      if (response.ok) {
        const result: GroupedExaminationResponse = await response.json();
        toast.success(`Study created: ${result.study.parent_accession_number}`);
        router.push('/examinations');
      } else {
        const errorData = await response.json();
        console.error('Validation errors:', errorData);
        toast.error('Failed to create study. Please check your input.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An error occurred while creating the study');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Grouped Examination Registration</h1>
        <p className="text-muted-foreground">Create multiple examinations under a single study</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Patient</Label>
              <Select value={formData.pesakit_id > 0 ? formData.pesakit_id.toString() : ''} onValueChange={(value) => handlePatientSelect(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Search and select patient..." />
                </SelectTrigger>
                <SelectContent>
                  {patients.filter(patient => patient.id && patient.id > 0).map(patient => (
                    <SelectItem key={patient.id} value={patient.id.toString()}>
                      {patient.nama} - {patient.nric} {patient.mrn && `(${patient.mrn})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPatient && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Name:</strong> {selectedPatient.nama}</div>
                  <div><strong>NRIC:</strong> {selectedPatient.nric}</div>
                  <div><strong>Gender:</strong> {selectedPatient.jantina === 'L' ? 'Male' : 'Female'}</div>
                  <div><strong>Age:</strong> {selectedPatient.kira_umur || selectedPatient.umur || 'N/A'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Study Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Study Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modality</Label>
                <Select value={formData.modality} onValueChange={(value) => setFormData(prev => ({ ...prev, modality: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modalities.map(modaliti => (
                      <SelectItem key={modaliti.id} value={modaliti.singkatan}>
                        {modaliti.nama} ({modaliti.singkatan})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Study Priority</Label>
                <Select value={formData.study_priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, study_priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAT">STAT</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Study Description</Label>
                <Input
                  value={formData.study_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, study_description: e.target.value }))}
                  placeholder="e.g., XR Series, Multi-part study"
                />
              </div>

              <div className="space-y-2">
                <Label>Referring Ward</Label>
                <Select value={formData.rujukan_id?.toString() || ''} onValueChange={(value) => setFormData(prev => ({ ...prev, rujukan_id: value ? parseInt(value) : undefined }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards.filter(ward => ward.id && ward.id.toString() !== '').map(ward => (
                      <SelectItem key={ward.id} value={ward.id.toString()}>
                        {ward.wad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Referring Physician</Label>
                <Input
                  value={formData.pemohon}
                  onChange={(e) => setFormData(prev => ({ ...prev, pemohon: e.target.value }))}
                  placeholder="Doctor name"
                />
              </div>

              <div className="space-y-2">
                <Label>Receipt Number</Label>
                <Input
                  value={formData.no_resit}
                  onChange={(e) => setFormData(prev => ({ ...prev, no_resit: e.target.value }))}
                  placeholder="Payment receipt number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Study Comments</Label>
              <Textarea
                value={formData.study_comments}
                onChange={(e) => setFormData(prev => ({ ...prev, study_comments: e.target.value }))}
                placeholder="Additional study notes..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="hamil"
                checked={formData.hamil}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hamil: !!checked }))}
              />
              <Label htmlFor="hamil">Patient is pregnant</Label>
            </div>
          </CardContent>
        </Card>

        {/* Examinations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Examinations
              </div>
              <Button type="button" onClick={addExamination} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Examination
              </Button>
            </CardTitle>
            <CardDescription>
              Add multiple examinations that will be grouped under this study
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.examinations.map((examination, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <Badge variant="outline">Examination {index + 1}</Badge>
                  {formData.examinations.length > 1 && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => removeExamination(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Examination Type</Label>
                    <Select 
                      value={examination.exam_id.toString()} 
                      onValueChange={(value) => updateExamination(index, 'exam_id', parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select examination" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredExams.map(exam => (
                          <SelectItem key={exam.id} value={exam.id.toString()}>
                            {exam.exam} {exam.part && `(${exam.part.part})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Patient Position</Label>
                    <Select 
                      value={examination.patient_position} 
                      onValueChange={(value) => updateExamination(index, 'patient_position', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {positionChoices?.patient_positions.map(pos => (
                          <SelectItem key={pos.value} value={pos.value}>
                            {pos.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Body Position</Label>
                    <Select 
                      value={examination.body_position} 
                      onValueChange={(value) => updateExamination(index, 'body_position', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select body position" />
                      </SelectTrigger>
                      <SelectContent>
                        {positionChoices?.body_positions.map(pos => (
                          <SelectItem key={pos.value} value={pos.value}>
                            {pos.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Laterality</Label>
                    <Select 
                      value={examination.laterality} 
                      onValueChange={(value) => updateExamination(index, 'laterality', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select laterality" />
                      </SelectTrigger>
                      <SelectContent>
                        {positionChoices?.laterality_choices.map(lat => (
                          <SelectItem key={lat.value} value={lat.value}>
                            {lat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Radiographer Notes</Label>
                  <Textarea
                    value={examination.catatan}
                    onChange={(e) => updateExamination(index, 'catatan', e.target.value)}
                    placeholder="Special notes for this examination..."
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating Study...' : 'Create Grouped Study'}
          </Button>
        </div>
      </form>
    </div>
  );
}