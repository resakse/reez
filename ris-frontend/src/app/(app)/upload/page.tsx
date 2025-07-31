'use client';

import React from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useRouter } from 'next/navigation';
import DicomUpload from '@/components/DicomUpload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Upload, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UploadPage() {
  const router = useRouter();

  const handleUploadComplete = (result: any) => {
    // Navigate to the created study or patient
    if (result.study_id) {
      router.push(`/studies/${result.study_id}`);
    } else if (result.patient_id) {
      router.push(`/patients/${result.patient_id}`);
    }
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <ProtectedRoute requireStaff={true}>
      <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Upload DICOM Images</h1>
          <p className="text-muted-foreground">
            Upload DICOM files and register them in the RIS system
          </p>
        </div>
      </div>

      {/* Information Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>1. Upload:</strong> Select or drag DICOM files (.dcm, .dicom) to upload
          </p>
          <p>
            <strong>2. Patient Matching:</strong> Choose an existing patient or let the system create a new one from DICOM metadata
          </p>
          <p>
            <strong>3. Study Registration:</strong> The system automatically creates a study registration in the RIS
          </p>
          <p>
            <strong>4. PACS Storage:</strong> Files are stored in the Orthanc PACS server for viewing
          </p>
          <div className="mt-3 p-3 border rounded border-l-4">
            <p className="text-xs">
              <strong>Note:</strong> Uploaded studies will be immediately available for viewing in the DICOM viewer.
              All patient information is extracted from DICOM metadata when available.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Component */}
      <DicomUpload 
        onUploadComplete={handleUploadComplete}
        onClose={handleClose}
      />
      </div>
    </ProtectedRoute>
  );
}