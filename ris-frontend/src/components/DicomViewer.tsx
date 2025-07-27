'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Eye } from 'lucide-react';

interface DicomViewerProps {
  studyId: string;
}

/**
 * @deprecated This component has been deprecated. Use SimpleDicomViewer via PACS browser instead.
 */
const DicomViewer: React.FC<DicomViewerProps> = ({ studyId }) => {
  const router = useRouter();

  useEffect(() => {
    console.warn('DicomViewer is deprecated. Redirecting to PACS browser with SimpleDicomViewer.');
  }, []);

  const handleRedirect = () => {
    router.push(`/pacs-browser/${studyId}`);
  };

  return (
    <div className="flex items-center justify-center h-96">
      <Card className="w-96">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-5 w-5" />
            Deprecated Component
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This legacy DicomViewer component has been deprecated. 
            Please use the new SimpleDicomViewer via the PACS browser for the best viewing experience.
          </p>
          <Button onClick={handleRedirect} className="w-full">
            <Eye className="h-4 w-4 mr-2" />
            Open in PACS Browser
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DicomViewer;