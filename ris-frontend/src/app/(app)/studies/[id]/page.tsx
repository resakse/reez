'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AuthService from '@/lib/auth';
import { ArrowLeft, Edit, Calendar, User, Stethoscope, Eye, FileText } from 'lucide-react';

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
  study_description?: string;
  study_priority?: string;
  study_comments?: string;
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
  }>;
}

export default function StudyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [study, setStudy] = useState<Study | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studyId = params?.id;

  const fetchStudyData = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/${studyId}/`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch study data');
      }
      
      const studyData = await response.json();
      setStudy(studyData);
    } catch (err) {
      console.error('Error loading study data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load study data');
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    if (studyId && user) {
      fetchStudyData();
    }
  }, [studyId, user, fetchStudyData]);

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-MY');
  };

  const formatDateTime = (dateString: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-MY');
  };

  // Calculate derived study status from examination statuses
  const calculateStudyStatus = (examinations: Study['pemeriksaan'] | undefined): string => {
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

  const derivedStudyStatus = calculateStudyStatus(study.pemeriksaan);

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
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Study Details</h1>
            <p className="mt-2 text-muted-foreground">
              {study.pesakit.nama} - {formatDate(study.tarikh)}
            </p>
          </div>
          <div className="flex space-x-2">
            <Button 
              onClick={() => router.push(`/studies/${studyId}/edit`)}
              variant="outline"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Study
            </Button>
            <Button 
              onClick={() => {
                if (study.study_instance_uid) {
                  router.push(`/pacs-browser/${study.study_instance_uid}`);
                } else {
                  alert('No DICOM study found for this registration');
                }
              }}
              variant="default"
              disabled={!study.study_instance_uid}
            >
              <Eye className="w-4 h-4 mr-2" />
              View DICOM
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study Information */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Study Information
              </CardTitle>
              <CardDescription>
                Complete study details and clinical information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Receipt Number</label>
                  <p className="text-lg">{study.no_resit || '-'}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Requesting Doctor</label>
                  <p className="text-lg">{study.pemohon || '-'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ward/Department</label>
                  <p className="text-lg">{study.rujukan?.wad || '-'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Patient Mobility</label>
                  <Badge variant="outline">{study.ambulatori}</Badge>
                </div>

                {study.pesakit.jantina === 'P' && study.lmp && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">LMP</label>
                    <p className="text-lg">{formatDate(study.lmp)}</p>
                  </div>
                )}

                {study.pesakit.jantina === 'P' && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Pregnancy Status</label>
                    <Badge variant={study.hamil ? "secondary" : "outline"}>
                      {study.hamil ? 'Pregnant' : 'Not Pregnant'}
                    </Badge>
                  </div>
                )}
              </div>

              {study.study_comments && (
                <div className="mt-6 pt-6 border-t">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Study Comments
                  </label>
                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm">{study.study_comments}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Patient & DICOM Info Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="text-lg font-semibold">{study.pesakit.nama}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IC Number</label>
                  <p className="text-lg font-mono">{study.pesakit.nric}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Gender</label>
                  <p className="text-lg">{study.pesakit.jantina === 'L' ? 'Male' : 'Female'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Registration Date</label>
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
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Study Instance UID</label>
                  <p className="text-xs font-mono break-all bg-muted/50 p-2 rounded">{study.study_instance_uid || '-'}</p>
                </div>
                {study.accession_number && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Accession Number</label>
                    <p className="text-sm font-mono">{study.accession_number}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Study Status</label>
                  <div className="mt-1">
                    <Badge 
                      variant={derivedStudyStatus === 'CANCELLED' ? 'destructive' : 
                              derivedStudyStatus === 'COMPLETED' ? 'default' : 
                              derivedStudyStatus === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                      className="text-sm"
                    >
                      {derivedStudyStatus === 'SCHEDULED' && '📅 Scheduled'}
                      {derivedStudyStatus === 'IN_PROGRESS' && '⚡ In Progress'}
                      {derivedStudyStatus === 'COMPLETED' && '✅ Completed'}
                      {derivedStudyStatus === 'CANCELLED' && '❌ Cancelled'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-calculated from examination statuses
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Priority</label>
                  <Badge variant="outline">{study.study_priority || 'MEDIUM'}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Examinations Table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Examinations ({study.pemeriksaan.length})
              <Badge 
                variant={derivedStudyStatus === 'CANCELLED' ? 'destructive' : 
                        derivedStudyStatus === 'COMPLETED' ? 'default' : 
                        derivedStudyStatus === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                className="text-xs ml-2"
              >
                Study: {derivedStudyStatus}
              </Badge>
            </span>
          </CardTitle>
          <CardDescription>
            Individual examinations within this study
          </CardDescription>
        </CardHeader>
        <CardContent>
          {study.pemeriksaan.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Accession No</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Exam Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Technical Params</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Radiographer</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {study.pemeriksaan.map((exam) => (
                    <tr key={exam.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <p className="text-sm font-mono font-semibold">{exam.accession_number || exam.no_xray}</p>
                        {exam.laterality && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {exam.laterality}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="font-medium">{exam.exam.exam}</p>
                        <p className="text-xs text-muted-foreground">{exam.exam.modaliti.nama}</p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge 
                          variant={exam.exam_status === 'CANCELLED' ? 'destructive' : 
                                  exam.exam_status === 'COMPLETED' ? 'default' : 
                                  exam.exam_status === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {exam.exam_status || 'SCHEDULED'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="text-xs space-y-1">
                          {exam.kv && <div>kVp: {exam.kv}</div>}
                          {exam.mas && <div>mAs: {exam.mas}</div>}
                          {exam.mgy && <div>mGy: {exam.mgy}</div>}
                          {!exam.kv && !exam.mas && !exam.mgy && '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {exam.jxr ? (
                          <div>
                            <p className="text-sm">{exam.jxr.first_name} {exam.jxr.last_name}</p>
                            <p className="text-xs text-muted-foreground">@{exam.jxr.username}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {exam.catatan ? (
                          <div className="max-w-xs">
                            <p className="text-xs bg-muted/50 p-2 rounded line-clamp-2">{exam.catatan}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No examinations found for this study</p>
              <Badge variant="outline" className="mb-4">Study Status: {derivedStudyStatus}</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}