'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import AuthService from '@/lib/auth';
import { parseNric, formatNric, type NricInfo } from '@/lib/nric';
import { Search, User, Calendar, MapPin, Phone, Mail, Plus, X, Check, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface Patient {
  id: number;
  nama: string;
  no_kp: string;
  t_lahir: string;
  jantina: string;
  umur: number;
  alamat: string;
  telefon: string;
  email: string;
  wad: {
    id: number;
    wad: string;
  } | null;
}

interface Ward {
  id: number;
  wad: string;
}

interface Discipline {
  id: number;
  disiplin: string;
}

interface Exam {
  id: number;
  exam: string;
  exam_code: string | null;
  contrast: boolean;
  modaliti: {
    id: number;
    nama: string;
    singkatan: string;
  };
  part: {
    id: number;
    part: string;
  } | null;
}

interface SelectedExam {
  exam: number;
  notes: string;
  laterality: string;
  kv: string;
  mas: string;
  mgy: string;
}

export default function RegistrationWorkflowPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('error');

  const showToastNotification = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 5000);
  };
  
  // Patient search/creation states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newPatientData, setNewPatientData] = useState({
    nama: '',
    no_kp: '',
    t_lahir: '',
    jantina: '',
    umur: '',
    alamat: '',
    telefon: '',
    email: '',
    wad: '',
    bangsa: 'Melayu',
    mrn: ''
  });

  // Configuration data
  const [wards, setWards] = useState<Ward[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  
  // Exam search/filter states
  const [examSearchQuery, setExamSearchQuery] = useState('');
  const [filteredExams, setFilteredExams] = useState<Exam[]>([]);
  const [selectedModality, setSelectedModality] = useState<string>('all');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('all');
  const [modalities, setModalities] = useState<any[]>([]);
  const [bodyParts, setBodyParts] = useState<any[]>([]);

  // Registration data - matching legacy form fields
  const [registrationData, setRegistrationData] = useState({
    ward: 'none',
    doctor: '',
    receipt_number: '',
    clinical_notes: '',
    transport: 'Berjalan',
    pregnant: false,
    lmp: '' // Last Menstrual Period - only shown for female patients
  });

  const [selectedExams, setSelectedExams] = useState<SelectedExam[]>([]);
  const [nricInfo, setNricInfo] = useState<NricInfo | null>(null);
  const [nricError, setNricError] = useState('');

  useEffect(() => {
    fetchConfiguration();
  }, [user]);

  const fetchConfiguration = async () => {
    try {
      const [wardsRes, disciplinesRes, examsRes, modalitiesRes, bodyPartsRes] = await Promise.all([
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/disciplines/`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`),
        AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parts/`)
      ]);

      if (wardsRes.ok) setWards(await wardsRes.json());
      if (disciplinesRes.ok) setDisciplines(await disciplinesRes.json());
      if (examsRes.ok) {
        const examsData = await examsRes.json();
        setExams(examsData);
        setFilteredExams(examsData);
      }
      if (modalitiesRes.ok) setModalities(await modalitiesRes.json());
      if (bodyPartsRes.ok) setBodyParts(await bodyPartsRes.json());
    } catch (error) {
      console.error('Error fetching configuration:', error);
      showToastNotification('Failed to load configuration data. Please refresh the page.', 'error');
    }
  };

  const handlePatientSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const res = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/?search=${encodeURIComponent(searchQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || data);
      } else {
        const errorData = await res.json();
        showToastNotification(errorData.detail || 'Failed to search patients', 'error');
      }
    } catch (error) {
      console.error('Error searching patients:', error);
      showToastNotification('Failed to search patients. Please try again.', 'error');
    }
  };

  const handleNricChange = (value: string) => {
    const formatted = formatNric(value);
    setNewPatientData(prev => ({ ...prev, no_kp: formatted }));
    
    if (value.trim()) {
      const info = parseNric(value);
      setNricInfo(info);
      
      if (info.isValid) {
        setNricError('');
        if (info.dateOfBirth) {
          setNewPatientData(prev => ({ 
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

  const createNewPatient = async () => {
    if (!newPatientData.nama || !newPatientData.no_kp) {
      showToastNotification('Please fill in all required fields', 'error');
      return;
    }

    setLoading(true);
    
    try {
      const payload = {
        nama: newPatientData.nama,
        no_kp: newPatientData.no_kp.replace(/[-\s]/g, ''),
        t_lahir: newPatientData.t_lahir,
        jantina: newPatientData.jantina,
        umur: parseInt(newPatientData.umur) || null,
        alamat: newPatientData.alamat,
        telefon: newPatientData.telefon,
        email: newPatientData.email,
        wad: newPatientData.wad ? parseInt(newPatientData.wad) : null,
        bangsa: newPatientData.bangsa,
        mrn: newPatientData.mrn || null
      };

      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const patient = await res.json();
        setSelectedPatient(patient);
        setStep(2);
        showToastNotification('Patient created successfully!', 'success');
      } else {
        const errorData = await res.json();
        showToastNotification(errorData.detail || 'Failed to create patient', 'error');
      }
    } catch (error) {
      console.error('Error creating patient:', error);
      showToastNotification('Failed to create patient. Please check your connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!selectedPatient || selectedExams.length === 0) {
      showToastNotification('Please select at least one examination', 'error');
      return;
    }

    setLoading(true);
    try {
      // Use the registration workflow endpoint to create everything in one transaction
      const workflowData = {
        patient_data: {
          id: selectedPatient.id
        },
        registration_data: {
          pesakit_id: selectedPatient.id,
          rujukan_id: registrationData.ward !== 'none' ? parseInt(registrationData.ward) : null,
          pemohon: registrationData.doctor || 'Unknown',
          no_resit: registrationData.receipt_number || null,
          lmp: registrationData.lmp || null,
          hamil: registrationData.pregnant || false,
          ambulatori: registrationData.transport || 'Berjalan Kaki',
          dcatatan: registrationData.clinical_notes || null,
          study_priority: 'MEDIUM'
        },
        examinations_data: selectedExams.map(ex => ({
          exam_id: ex.exam,
          laterality: ex.laterality !== 'none' ? ex.laterality : null,
          kv: ex.kv ? parseInt(ex.kv) : null,
          mas: ex.mas ? parseInt(ex.mas) : null,
          mgy: ex.mgy ? parseInt(ex.mgy) : null,
          catatan: ex.notes || null
        }))
      };

      const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/registration/workflow/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowData)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to create registration');
      }
      
      const result = await res.json();
      
      showToastNotification('Registration completed successfully!', 'success');
      setTimeout(() => {
        router.push(`/patients/${result.patient.id}`);
      }, 1000);
    } catch (error) {
      console.error('Error completing registration:', error);
      showToastNotification(error instanceof Error ? error.message : 'Failed to complete registration. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = exams;
    
    if (examSearchQuery) {
      filtered = filtered.filter(exam => 
        exam.exam.toLowerCase().includes(examSearchQuery.toLowerCase()) ||
        exam.exam_code?.toLowerCase().includes(examSearchQuery.toLowerCase()) ||
        exam.modaliti.nama.toLowerCase().includes(examSearchQuery.toLowerCase()) ||
        exam.part?.part.toLowerCase().includes(examSearchQuery.toLowerCase())
      );
    }
    
    if (selectedModality && selectedModality !== 'all') {
      filtered = filtered.filter(exam => exam.modaliti.id.toString() === selectedModality);
    }
    
    if (selectedBodyPart && selectedBodyPart !== 'all') {
      filtered = filtered.filter(exam => exam.part?.id.toString() === selectedBodyPart);
    }
    
    setFilteredExams(filtered);
  }, [examSearchQuery, selectedModality, selectedBodyPart, exams]);

  const addExam = (examId: number) => {
    if (!selectedExams.find(e => e.exam === examId)) {
      setSelectedExams([...selectedExams, {
        exam: examId,
        notes: '',
        laterality: 'none',
        kv: '',
        mas: '',
        mgy: ''
      }]);
    }
  };

  const removeExam = (examId: number) => {
    setSelectedExams(selectedExams.filter(e => e.exam !== examId));
  };

  const updateExam = (examId: number, field: keyof SelectedExam, value: string) => {
    setSelectedExams(selectedExams.map(e => 
      e.exam === examId ? { ...e, [field]: value } : e
    ));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Patient Registration Workflow</h1>
        <p className="text-muted-foreground mt-2">Complete patient registration and examination scheduling</p>
      </div>

      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {i}
              </div>
              {i < 3 && <div className={`w-16 h-1 mx-2 ${step > i ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Search Patient</TabsTrigger>
            <TabsTrigger value="new">Create New</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Search Existing Patient</CardTitle>
                <CardDescription>Find patient by name, NRIC, or MRN</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter name, NRIC, or MRN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handlePatientSearch()}
                  />
                  <Button onClick={handlePatientSearch}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>

                <ScrollArea className="h-64">
                  {searchResults.map((patient) => (
                    <div key={patient.id} className="p-4 border rounded-lg mb-2 hover:bg-accent cursor-pointer"
                         onClick={() => { setSelectedPatient(patient); setStep(2); }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{patient.nama}</h4>
                          <p className="text-sm text-muted-foreground">{patient.no_kp}</p>
                          <p className="text-sm">Age: {patient.umur}, Gender: {patient.jantina}</p>
                        </div>
                        <Badge variant="outline">{patient.wad?.wad || 'OPD'}</Badge>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Patient</CardTitle>
                <CardDescription>Enter patient details with NRIC auto-parsing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input
                      value={newPatientData.nama}
                      onChange={(e) => { setNewPatientData({...newPatientData, nama: e.target.value}); setError(null); }}
                      placeholder="Enter patient name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>NRIC Number *</Label>
                    <Input
                      value={newPatientData.no_kp}
                      onChange={(e) => handleNricChange(e.target.value)}
                      placeholder="e.g., 791113-12-3456"
                      maxLength={17}
                    />
                    {nricError && (
                      <Alert variant="destructive" className="py-2">
                        <AlertDescription className="text-sm">{nricError}</AlertDescription>
                      </Alert>
                    )}
                    {nricInfo?.isValid && (
                      <Alert className="py-2 bg-green-50 border-green-200">
                        <AlertDescription className="text-sm">
                          ✓ Valid NRIC - Age: {nricInfo.age}, Gender: {nricInfo.gender === 'male' ? 'L' : 'P'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input
                      type="date"
                      value={newPatientData.t_lahir}
                      onChange={(e) => setNewPatientData({...newPatientData, t_lahir: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={newPatientData.jantina} onValueChange={(value) => setNewPatientData({...newPatientData, jantina: value})}>
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
                    <Label>Age</Label>
                    <Input
                      type="number"
                      value={newPatientData.umur}
                      onChange={(e) => setNewPatientData({...newPatientData, umur: e.target.value})}
                      placeholder="Auto-calculated"
                      readOnly={!!nricInfo?.age}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ward</Label>
                    <Select value={newPatientData.wad} onValueChange={(value) => setNewPatientData({...newPatientData, wad: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ward" />
                      </SelectTrigger>
                      <SelectContent>
                        {wards.map((ward) => (
                          <SelectItem key={ward.id} value={ward.id.toString()}>{ward.wad}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={newPatientData.alamat}
                    onChange={(e) => setNewPatientData({...newPatientData, alamat: e.target.value})}
                    placeholder="Enter patient address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input
                      value={newPatientData.telefon}
                      onChange={(e) => setNewPatientData({...newPatientData, telefon: e.target.value})}
                      placeholder="e.g., +6012-3456789"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={newPatientData.email}
                      onChange={(e) => setNewPatientData({...newPatientData, email: e.target.value})}
                      placeholder="patient@email.com"
                    />
                  </div>
                </div>

                <Button onClick={createNewPatient} disabled={loading || !newPatientData.nama || !newPatientData.no_kp}>
                  {loading ? 'Creating...' : 'Create Patient'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {step === 2 && selectedPatient && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Patient Details</CardTitle>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium">{selectedPatient.nama}</h3>
                  <p className="text-sm text-muted-foreground">{selectedPatient.no_kp}</p>
                  <p className="text-sm">Age: {selectedPatient.umur}, Gender: {selectedPatient.jantina}</p>
                </div>
                <Button variant="outline" onClick={() => setStep(1)}>Change Patient</Button>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registration Details</CardTitle>
              <CardDescription>Enter registration information and clinical notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ward</Label>
                  <Select value={registrationData.ward} onValueChange={(value) => setRegistrationData({...registrationData, ward: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ward" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">OPD/No Ward</SelectItem>
                      {wards.map((ward) => (
                        <SelectItem key={ward.id} value={ward.id.toString()}>{ward.wad}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Referring Physician</Label>
                  <Input
                    value={registrationData.doctor}
                    onChange={(e) => setRegistrationData({...registrationData, doctor: e.target.value})}
                    placeholder="Enter physician's name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Receipt Number</Label>
                  <Input
                    value={registrationData.receipt_number}
                    onChange={(e) => setRegistrationData({...registrationData, receipt_number: e.target.value})}
                    placeholder="Enter receipt number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ambulatory</Label>
                  <Select value={registrationData.transport} onValueChange={(value) => setRegistrationData({...registrationData, transport: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Berjalan">Berjalan</SelectItem>
                      <SelectItem value="Kerusi Roda">Kerusi Roda</SelectItem>
                      <SelectItem value="Troli">Troli</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedPatient?.jantina === 'P' && (
                  <div className="space-y-2">
                    <Label>LMP (Last Menstrual Period)</Label>
                    <Input
                      type="date"
                      value={registrationData.lmp}
                      onChange={(e) => setRegistrationData({...registrationData, lmp: e.target.value})}
                    />
                  </div>
                )}

                {selectedPatient?.jantina === 'P' && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="pregnant"
                        checked={registrationData.pregnant}
                        onChange={(e) => setRegistrationData({...registrationData, pregnant: e.target.checked})}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="pregnant">Pregnant</Label>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Clinical Notes</Label>
                <textarea
                  className="w-full min-h-20 p-2 border rounded-md"
                  value={registrationData.clinical_notes}
                  onChange={(e) => setRegistrationData({...registrationData, clinical_notes: e.target.value})}
                  placeholder="Enter clinical indications and notes..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select Examinations</CardTitle>
              <CardDescription>Choose examinations to schedule for this patient</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-4">
                <Input
                  placeholder="Search exams by name, code, modality, or body part..."
                  value={examSearchQuery}
                  onChange={(e) => setExamSearchQuery(e.target.value)}
                  className="w-full"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select value={selectedModality} onValueChange={setSelectedModality}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by modality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modalities</SelectItem>
                      {modalities.map((modality) => (
                        <SelectItem key={modality.id} value={modality.id.toString()}>
                          {modality.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedBodyPart} onValueChange={setSelectedBodyPart}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by body part" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Body Parts</SelectItem>
                      {bodyParts.map((part) => (
                        <SelectItem key={part.id} value={part.id.toString()}>
                          {part.part}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <ScrollArea className="h-96">
                <div className="grid gap-4">
                  {filteredExams.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No exams found matching your criteria
                    </div>
                  ) : (
                    filteredExams.map((exam) => {
                      const isSelected = selectedExams.find(e => e.exam === exam.id);
                      return (
                        <div key={exam.id} className={`p-4 border rounded-lg ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{exam.exam}</h4>
                              <p className="text-sm text-muted-foreground">
                                {exam.modaliti.nama} ({exam.modaliti.singkatan})
                                {exam.part && ` • ${exam.part.part}`}
                              </p>
                              {exam.contrast && <Badge variant="outline" className="mt-1">Contrast Required</Badge>}
                            </div>
                            <div className="flex items-center space-x-2">
                              {isSelected ? (
                                <Button variant="ghost" size="sm" onClick={() => removeExam(exam.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button size="sm" onClick={() => addExam(exam.id)}>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add
                                </Button>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="mt-4 space-y-2">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div>
                                  <Label className="text-xs">Laterality</Label>
                                  <Select 
                                    value={isSelected.laterality} 
                                    onValueChange={(value) => updateExam(exam.id, 'laterality', value)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      <SelectItem value="Kiri">Kiri</SelectItem>
                                      <SelectItem value="Kanan">Kanan</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">kVp</Label>
                                  <Input
                                    type="number"
                                    placeholder="kV"
                                    value={isSelected.kv}
                                    onChange={(e) => updateExam(exam.id, 'kv', e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">mAs</Label>
                                  <Input
                                    type="number"
                                    placeholder="mAs"
                                    value={isSelected.mas}
                                    onChange={(e) => updateExam(exam.id, 'mas', e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">mGy</Label>
                                  <Input
                                    type="number"
                                    placeholder="mGy"
                                    value={isSelected.mgy}
                                    onChange={(e) => updateExam(exam.id, 'mgy', e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>
                              <Input
                                placeholder="Additional notes for this exam..."
                                value={isSelected.notes}
                                onChange={(e) => updateExam(exam.id, 'notes', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button 
              onClick={completeRegistration} 
              disabled={loading || selectedExams.length === 0}
            >
              {loading ? 'Processing...' : 'Complete Registration'}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {showToast && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`p-4 rounded-lg shadow-lg border flex items-center space-x-3 ${
            toastType === 'error' 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : toastType === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {toastType === 'error' && <AlertCircle className="h-5 w-5" />}
            {toastType === 'success' && <CheckCircle className="h-5 w-5" />}
            {toastType === 'info' && <AlertCircle className="h-5 w-5" />}
            <p className="text-sm font-medium">{toastMessage}</p>
            <button 
              onClick={() => setShowToast(false)} 
              className="ml-4 text-sm font-medium hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}