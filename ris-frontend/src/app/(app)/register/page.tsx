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
import { Search, User, Calendar, MapPin, Phone, Mail, Plus, X, Check } from 'lucide-react';

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
    nama: string;
  } | null;
}

interface Ward {
  id: number;
  nama: string;
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
  priority: string;
  notes: string;
}

export default function RegistrationWorkflowPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
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
    clinical_notes: '',
    transport: 'Berjalan Kaki',
    pregnant: false,
    lmp: '' // Last Menstrual Period
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
      }
    } catch (error) {
      console.error('Error searching patients:', error);
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
      }
    } catch (error) {
      console.error('Error creating patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!selectedPatient || selectedExams.length === 0) return;

    setLoading(true);
    try {
      // Create registration for each selected exam
      const registrations = selectedExams.map(ex => {
        const examData = exams.find(e => e.id === ex.exam);
        return {
          pesakit: selectedPatient.id,
          rujukan: registrationData.ward !== 'none' ? parseInt(registrationData.ward) : null,
          pemohon: registrationData.doctor,
          no_resit: registrationData.receipt_number || null,
          lmp: registrationData.lmp || null,
          study_priority: registrationData.priority,
          study_comments: registrationData.clinical_notes || null,
          requested_procedure_description: registrationData.procedure_description || examData?.exam || null,
          patient_position: registrationData.patient_position || null,
          modality: registrationData.modality || examData?.modaliti?.singkatan || null,
          hamil: registrationData.pregnant || false,
          ambulatori: registrationData.transport || 'Berjalan Kaki',
          dcatatan: registrationData.additional_notes || ex.notes || null
        };
      });

      // Create registrations one by one for each exam
      const results = [];
      for (const registration of registrations) {
        const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/daftar/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registration)
        });
        
        if (!res.ok) {
          throw new Error(`Failed to create registration: ${await res.text()}`);
        }
        
        const result = await res.json();
        results.push(result);
      }

      // Redirect to patient page after successful registration
      router.push(`/patients/${selectedPatient.id}`);
    } catch (error) {
      console.error('Error completing registration:', error);
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
        priority: 'ROUTINE',
        notes: ''
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
                        <Badge variant="outline">{patient.wad?.nama || 'OPD'}</Badge>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input
                      value={newPatientData.nama}
                      onChange={(e) => setNewPatientData({...newPatientData, nama: e.target.value})}
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
                          <SelectItem key={ward.id} value={ward.id.toString()}>{ward.nama}</SelectItem>
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
                        <SelectItem key={ward.id} value={ward.id.toString()}>{ward.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Referring Physician *</Label>
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
                  <Label>LMP (Last Menstrual Period)</Label>
                  <Input
                    type="date"
                    value={registrationData.lmp}
                    onChange={(e) => setRegistrationData({...registrationData, lmp: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={registrationData.priority} onValueChange={(value) => setRegistrationData({...registrationData, priority: value})}>
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
                  <Label>How Patient Came</Label>
                  <Select value={registrationData.transport} onValueChange={(value) => setRegistrationData({...registrationData, transport: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Berjalan Kaki">Berjalan Kaki</SelectItem>
                      <SelectItem value="Kerusi Roda">Kerusi Roda</SelectItem>
                      <SelectItem value="Troli">Troli</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Patient Position</Label>
                  <Select value={registrationData.patient_position} onValueChange={(value) => setRegistrationData({...registrationData, patient_position: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto/Not specified</SelectItem>
                      <SelectItem value="HFS">Head First-Supine</SelectItem>
                      <SelectItem value="HFP">Head First-Prone</SelectItem>
                      <SelectItem value="HFDR">Head First-Decubitus Right</SelectItem>
                      <SelectItem value="HFDL">Head First-Decubitus Left</SelectItem>
                      <SelectItem value="FFS">Feet First-Supine</SelectItem>
                      <SelectItem value="FFP">Feet First-Prone</SelectItem>
                      <SelectItem value="FFDR">Feet First-Decubitus Right</SelectItem>
                      <SelectItem value="FFDL">Feet First-Decubitus Left</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Modality</Label>
                  <Select value={registrationData.modality} onValueChange={(value) => setRegistrationData({...registrationData, modality: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select modality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto/From exam</SelectItem>
                      <SelectItem value="CR">CR</SelectItem>
                      <SelectItem value="DX">DX</SelectItem>
                      <SelectItem value="CT">CT</SelectItem>
                      <SelectItem value="MR">MR</SelectItem>
                      <SelectItem value="US">US</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Clinical Notes</Label>
                <Input
                  type="text"
                  className="w-full min-h-20 p-2 border rounded-md"
                  value={registrationData.clinical_notes}
                  onChange={(e) => setRegistrationData({...registrationData, clinical_notes: e.target.value})}
                  placeholder="Enter clinical indications and notes..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Procedure Description</Label>
                  <Input
                    value={registrationData.procedure_description}
                    onChange={(e) => setRegistrationData({...registrationData, procedure_description: e.target.value})}
                    placeholder="Override exam name if needed"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Input
                    value={registrationData.additional_notes}
                    onChange={(e) => setRegistrationData({...registrationData, additional_notes: e.target.value})}
                    placeholder="Additional registration notes"
                  />
                </div>
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
                                <>
                                  <Select
                                    value={isSelected.priority}
                                    onValueChange={(value) => updateExam(exam.id, 'priority', value)}
                                  >
                                    <SelectTrigger className="w-32 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="STAT">STAT</SelectItem>
                                      <SelectItem value="HIGH">High</SelectItem>
                                      <SelectItem value="MEDIUM">Medium</SelectItem>
                                      <SelectItem value="LOW">Low</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button variant="ghost" size="sm" onClick={() => removeExam(exam.id)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" onClick={() => addExam(exam.id)}>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add
                                </Button>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="mt-2">
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
              disabled={loading || selectedExams.length === 0 || !registrationData.discipline}
            >
              {loading ? 'Processing...' : 'Complete Registration'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}