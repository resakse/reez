'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, User, Building2, Stethoscope, Settings, FileText, Edit, Eye, Monitor } from 'lucide-react';
import AuthService from '@/lib/auth';


interface ExaminationDetail {
  id: number;
  no_xray: string;
  exam: {
    id: number;
    exam: string;
    exam_code?: string;
    modaliti: {
      id: number;
      nama: string;
      singkatan?: string;
    };
    part?: {
      id: number;
      part: string;
    };
    catatan?: string;
    contrast: boolean;
  };
  laterality?: string;
  kv?: number;
  mas?: number;
  mgy?: number;
  created: string;
  modified: string;
  daftar_info: {
    id: number;
    tarikh: string;
    no_resit?: string;
    accession_number?: string;
    study_instance_uid?: string;
    pemohon?: string;
    ambulatori?: string;
    lmp?: string;
    hamil?: boolean;
    dcatatan?: string;
    rujukan?: {
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
}

export default function ExaminationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examinationId = params?.id as string;
  
  const [examination, setExamination] = useState<ExaminationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExamination = async () => {
      try {
        const res = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/${examinationId}/`
        );

        if (!res.ok) {
          throw new Error('Failed to fetch examination details');
        }

        const data: ExaminationDetail = await res.json();
        setExamination(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load examination details');
      } finally {
        setLoading(false);
      }
    };

    if (examinationId) {
      fetchExamination();
    }
  }, [examinationId]);

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
          <CardDescription>Loading examination details...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !examination) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error || 'Examination not found'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push('/examinations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Examinations
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasStudyInstanceUID = examination.daftar_info.study_instance_uid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/examinations')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Examinations
        </Button>
        <div className="flex gap-2">
          {examination.study_instance_uid || examination.daftar_info.study_instance_uid ? (
            <Button 
              onClick={() => router.push(`/pacs-browser/${examination.study_instance_uid || examination.daftar_info.study_instance_uid}`)}
              variant="default"
              title="View DICOM Images"
            >
              <Eye className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              disabled
              variant="default"
              title="No DICOM images available"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button 
            onClick={() => router.push(`/studies/${examination.daftar_info.id}/edit`)}
            variant="outline"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Study
          </Button>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="w-full">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Examination Details
            </TabsTrigger>
            <TabsTrigger 
              value="viewer" 
              className="flex items-center gap-2"
            >
              <Monitor className="h-4 w-4" />
              Collaborative Viewer
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" />
                  Examination Details
                </CardTitle>
                <CardDescription>
                  Detailed information for X-Ray #{examination.no_xray}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
          {/* X-Ray Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              X-Ray Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">X-Ray Number</label>
                <div className="mt-1">
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {examination.no_xray}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Examination Type</label>
                <p className="text-sm mt-1">{examination.exam.exam}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Modality</label>
                <div className="mt-1">
                  <Badge variant="secondary">
                    {examination.exam.modaliti.nama}
                  </Badge>
                </div>
              </div>
              {examination.exam.part && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Body Part</label>
                  <p className="text-sm mt-1">{examination.exam.part.part}</p>
                </div>
              )}
              {examination.laterality && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Laterality</label>
                  <div className="mt-1">
                    <Badge variant="outline">{examination.laterality}</Badge>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Contrast</label>
                <div className="mt-1">
                  <Badge variant={examination.exam.contrast ? "default" : "secondary"}>
                    {examination.exam.contrast ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Technical Parameters */}
          {(examination.kv || examination.mas || examination.mgy) && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Technical Parameters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {examination.kv && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">kVp</label>
                      <p className="text-sm mt-1">{examination.kv}</p>
                    </div>
                  )}
                  {examination.mas && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">mAs</label>
                      <p className="text-sm mt-1">{examination.mas}</p>
                    </div>
                  )}
                  {examination.mgy && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">mGy</label>
                      <p className="text-sm mt-1">{examination.mgy}</p>
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Patient Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Patient Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Patient Name</label>
                <p className="text-sm mt-1 font-medium">{examination.daftar_info.pesakit.nama}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">IC/Passport</label>
                <p className="text-sm mt-1">{examination.daftar_info.pesakit.nric}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Gender</label>
                <p className="text-sm mt-1">{examination.daftar_info.pesakit.jantina === 'L' ? 'Male' : 'Female'}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Registration Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Registration Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Registration Date</label>
                <p className="text-sm mt-1">{formatDate(examination.daftar_info.tarikh)}</p>
              </div>
              {examination.daftar_info.no_resit && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Receipt Number</label>
                  <p className="text-sm mt-1">{examination.daftar_info.no_resit}</p>
                </div>
              )}
              {examination.daftar_info.pemohon && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Requesting Doctor</label>
                  <p className="text-sm mt-1">{examination.daftar_info.pemohon}</p>
                </div>
              )}
              {examination.daftar_info.rujukan && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Referring Ward</label>
                  <p className="text-sm mt-1">{examination.daftar_info.rujukan.wad}</p>
                </div>
              )}
              {examination.daftar_info.jxr && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Radiographer</label>
                  <p className="text-sm mt-1">
                    {examination.daftar_info.jxr.first_name} {examination.daftar_info.jxr.last_name}
                  </p>
                </div>
              )}
              {examination.daftar_info.ambulatori && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Patient Mobility</label>
                  <p className="text-sm mt-1">{examination.daftar_info.ambulatori}</p>
                </div>
              )}
              {examination.daftar_info.pesakit.jantina === 'P' && examination.daftar_info.lmp && (
                <div>
                  <label className="text-sm font-medium text-gray-600">LMP (Last Menstrual Period)</label>
                  <p className="text-sm mt-1">{examination.daftar_info.lmp}</p>
                </div>
              )}
              {examination.daftar_info.pesakit.jantina === 'P' && examination.daftar_info.hamil !== undefined && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Pregnancy Status</label>
                  <div className="mt-1">
                    <Badge variant={examination.daftar_info.hamil ? "destructive" : "default"}>
                      {examination.daftar_info.hamil ? "Pregnant" : "Not Pregnant"}
                    </Badge>
                  </div>
                </div>
              )}
              {examination.daftar_info.dcatatan && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-600">Registration Comments</label>
                  <div className="bg-gray-50 p-3 rounded-md mt-1">
                    <p className="text-sm whitespace-pre-wrap">{examination.daftar_info.dcatatan}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* DICOM Information */}
          {(examination.daftar_info.accession_number || examination.daftar_info.study_instance_uid) && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                DICOM Information
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {examination.daftar_info.accession_number && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Accession Number</label>
                    <p className="text-sm mt-1 font-mono">{examination.daftar_info.accession_number}</p>
                  </div>
                )}
                {examination.daftar_info.study_instance_uid && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Study Instance UID</label>
                    <p className="text-sm mt-1 font-mono break-all">{examination.daftar_info.study_instance_uid}</p>
                  </div>
                )}
              </div>
            </div>
          )}

                {/* Timestamps */}
                <div className="text-xs text-gray-500 pt-4 border-t">
                  <div className="flex justify-between">
                    <span>Created: {formatDate(examination.created)}</span>
                    <span>Modified: {formatDate(examination.modified)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="viewer" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Collaborative Viewer
                </CardTitle>
                <CardDescription>
                  View DICOM images and create radiology reports in a unified interface
                  {examination.daftar_info.study_instance_uid && (
                    <> - Study: {examination.daftar_info.study_instance_uid}</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="flex justify-center items-center gap-4 mb-6">
                    <div className="flex flex-col items-center">
                      <Monitor className="h-8 w-8 mb-2 text-blue-600" />
                      <span className="text-sm font-medium">DICOM Viewing</span>
                    </div>
                    <div className="w-8 h-0.5 bg-border"></div>
                    <div className="flex flex-col items-center">
                      <FileText className="h-8 w-8 mb-2 text-green-600" />
                      <span className="text-sm font-medium">Report Editor</span>
                    </div>
                    <div className="w-8 h-0.5 bg-border"></div>
                    <div className="flex flex-col items-center">
                      <Stethoscope className="h-8 w-8 mb-2 text-purple-600" />
                      <span className="text-sm font-medium">AI Assistance</span>
                    </div>
                  </div>
                  
                  <p className="text-lg font-semibold mb-2">Integrated Collaborative Reporting</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    View DICOM images and write radiology reports in a single seamless interface.
                    {!examination.daftar_info.study_instance_uid && (
                      <> Note: This examination has no DICOM images, but you can still create reports.</>
                    )}
                  </p>
                  
                  <Button 
                    onClick={() => router.push(`/collaborative-viewer/${examinationId}`)}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Open Collaborative Viewer
                  </Button>
                  
                  {examination.daftar_info.study_instance_uid && (
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg text-left">
                      <p className="text-xs">
                        <strong>Study Instance UID:</strong> {examination.daftar_info.study_instance_uid}
                      </p>
                      {examination.daftar_info.accession_number && (
                        <p className="text-xs mt-1">
                          <strong>Accession Number:</strong> {examination.daftar_info.accession_number}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}