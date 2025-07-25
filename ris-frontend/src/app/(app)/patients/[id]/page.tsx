'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AuthService from '@/lib/auth';
import { ArrowLeft, Calendar, User, MapPin, Phone, Mail, CreditCard, Edit } from 'lucide-react';

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
  created: string;
  modified: string;
}

interface Registration {
  id: number;
  tarikh: string;
  no_resit: string;
  pemohon: string;
  status: string;
  dcadangan: string;
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
  accession_number?: string;
  study_instance_uid?: string;
  performed?: string;
  created: string;
  modified: string;
  pemeriksaan: Examination[];
}

interface Examination {
  id: number;
  no_xray: string;
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
  laterality: string;
  kv: string;
  mas: string;
  mgy: string;
  created: string;
  status: string;
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const patientId = params?.id;

  useEffect(() => {
    if (patientId && user) {
      fetchPatientData();
    }
  }, [patientId, user]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      
      // Fetch patient details
      const patientRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}/`
      );
      
      if (!patientRes.ok) {
        throw new Error('Failed to fetch patient data');
      }
      
      const patientData = await patientRes.json();
      setPatient(patientData);

      // Fetch patient registrations with examinations
      const registrationsRes = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/?pesakit=${patientId}`
      );
      
      if (registrationsRes.ok) {
        const registrationsData = await registrationsRes.json();
        console.log('Registrations API response:', registrationsData);
        
        // Handle both array and paginated response formats
        const registrationsArray = Array.isArray(registrationsData) 
          ? registrationsData 
          : registrationsData.results || registrationsData.items || [];
        
        console.log('Processed registrations:', registrationsArray);
        // Fetch examinations for each registration
        const registrationsWithExams = await Promise.all(
          registrationsArray.map(async (reg: Registration) => {
            try {
              const examsRes = await AuthService.authenticatedFetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/${reg.id}/examinations/`
              );
              if (examsRes.ok) {
                const exams = await examsRes.json();
                console.log(`Exams for registration ${reg.id}:`, exams);
                return { ...reg, pemeriksaan: exams };
              }
            } catch (err) {
              console.error(`Failed to fetch exams for registration ${reg.id}:`, err);
            }
            return { ...reg, pemeriksaan: [] };
          })
        );
        
        console.log('Registrations with examinations:', registrationsWithExams);
        setRegistrations(registrationsWithExams);
      } else {
        console.error('Registrations API failed:', registrationsRes.status);
      }
    } catch (err) {
      console.error('Error loading patient data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'registered':
        return 'default';
      case 'performed':
        return 'secondary';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
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

  const shouldShowLMP = (patient: Patient) => {
    return patient.jantina === 'P';
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

  if (!patient) {
    return (
      <div className="container-fluid px-4 py-8">
        <Alert>
          <AlertDescription>Patient not found</AlertDescription>
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
          Back to Patients
        </Button>
        
        <h1 className="text-3xl font-bold text-gray-900">Patient Details</h1>
      </div>

      {/* Patient Information Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Patient Information
              </CardTitle>
              <CardDescription>
                Basic details and contact information
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href={`/patients/${patient.id}/edit`}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Patient
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <p className="text-lg font-semibold">{patient.nama}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">IC Number</label>
                <p className="text-lg font-semibold">{patient.nric || '-'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Medical Record Number</label>
                <p className="text-lg font-semibold">{patient.mrn || '-'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Gender</label>
                <p className="text-lg">{patient.jantina === 'L' ? 'Male' : patient.jantina === 'P' ? 'Female' : 'Unknown'}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Date of Birth</label>
                <p className="text-lg">{patient.t_lahir ? formatDate(patient.t_lahir) : '-'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Age</label>
                <p className="text-lg">{patient.umur} years</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Race</label>
                <p className="text-lg">{patient.bangsa || '-'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Phone</label>
                <p className="text-lg">{patient.telefon || '-'}</p>
              </div>
            </div>
          </div>
          
          {patient.alamat && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500">Address</label>
              <p className="text-lg">{patient.alamat}</p>
            </div>
          )}
          
          {patient.email && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500">Email</label>
              <p className="text-lg">{patient.email}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Radiology History */}
      <Card>
        <CardHeader>
          <CardTitle>Radiology History</CardTitle>
          <CardDescription>
            Complete examination history ({registrations.reduce((total, reg) => total + (reg.pemeriksaan?.length || 0), 0)} examinations)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-gray-500">No previous examinations found</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="space-y-4">
                {registrations.map((registration) => (
                  <div key={registration.id} className="border rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 text-sm">
                      <div>
                        <label className="font-semibold text-gray-700">Registration Date:</label>
                        <p>{formatDateTime(registration.tarikh)}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Receipt Number:</label>
                        <p className="font-mono">{registration.no_resit || '-'}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Accession Number:</label>
                        <p className="font-mono">{registration.accession_number || registration.no_resit || '-'}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Referring Doctor:</label>
                        <p>{registration.pemohon || '-'}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Ward/Department:</label>
                        <p>{registration.rujukan?.wad || '-'}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Mobility:</label>
                        <p>{registration.ambulatori || '-'}</p>
                      </div>
                      {shouldShowLMP(patient) && (
                        <div>
                          <label className="font-semibold text-gray-700">LMP:</label>
                          <p>{registration.lmp ? formatDate(registration.lmp) : '-'}</p>
                        </div>
                      )}
                      <div>
                        <label className="font-semibold text-gray-700">Radiographer:</label>
                        <p>{getRadiographerName(registration.jxr)}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Performed Date:</label>
                        <p>{registration.performed ? formatDateTime(registration.performed) : formatDateTime(registration.created)}</p>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700">Status:</label>
                        <Badge variant={getStatusBadgeVariant(registration.status)} className="text-xs">
                          {registration.status}
                        </Badge>
                      </div>
                      {registration.study_instance_uid && (
                        <div className="lg:col-span-3">
                          <label className="font-semibold text-gray-700">Study Instance UID:</label>
                          <p className="font-mono text-xs text-gray-600">{registration.study_instance_uid}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">Examinations ({registration.pemeriksaan?.length || 0})</h4>
                      {registration.pemeriksaan?.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-3 font-semibold text-sm">X-Ray No</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Exam Type</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Modality</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Laterality</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">kVp</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">mAs</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">mGy</th>
                                <th className="text-left py-2 px-3 font-semibold text-sm">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {registration.pemeriksaan?.map((exam) => (
                                <tr key={exam.id} className="border-b hover:bg-muted/50 transition-colors">
                                  <td className="py-2 px-3 text-sm font-mono font-semibold">
                                    {exam.no_xray}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.exam.exam}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.exam.modaliti.nama}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.laterality || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.kv || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.mas || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {exam.mgy || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    <div className="flex space-x-1">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => router.push(`/viewer/${exam.id}`)}
                                        className="text-xs"
                                      >
                                        View
                                      </Button>
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => router.push(`/studies/${registration.id}/edit`)}
                                        className="text-xs"
                                      >
                                        Edit
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No examinations for this registration</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}