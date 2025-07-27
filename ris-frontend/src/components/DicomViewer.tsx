'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DicomViewerProps {
  studyId: string;
}

const DicomViewer: React.FC<DicomViewerProps> = ({ studyId }) => {
  return (
    <div className="flex items-center justify-center h-96">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Legacy DicomViewer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This component has been deprecated. 
            Please use the SimpleDicomViewer for all DICOM viewing needs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DicomViewer;