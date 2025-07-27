'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = params.studyId as string;

  useEffect(() => {
    if (studyId) {
      // Redirect to the PACS browser which has the proper SimpleDicomViewer
      router.replace(`/pacs-browser/${studyId}`);
    }
  }, [studyId, router]);

  if (!studyId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">No Study ID provided</h2>
          <p className="text-muted-foreground">Please provide a valid Study Instance UID</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Redirecting to DICOM Viewer...</p>
      </div>
    </div>
  );
} 