'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const DicomViewer = dynamic(() => import('@/components/DicomViewer'), {
  ssr: false,
});

export default function ViewerPage() {
  const params = useParams();
  const studyId = params.studyId as string;

  if (!studyId) {
    return <div>No Study ID provided.</div>;
  }

  return <DicomViewer studyId={studyId} />;
} 