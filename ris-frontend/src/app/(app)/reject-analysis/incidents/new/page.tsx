'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RejectIncidentForm from '@/components/reject-analysis/RejectIncidentForm';
import { useRejectIncidents } from '@/hooks/useRejectIncidents';
import { toast } from '@/lib/toast';
import type { RejectIncidentFormData } from '@/types/reject-analysis';

export default function NewRejectIncidentPage() {
  const router = useRouter();
  const { createIncident, loading } = useRejectIncidents();

  const handleSubmit = async (data: RejectIncidentFormData) => {
    try {
      const incident = await createIncident(data);
      toast.success('Reject incident logged successfully');
      router.push(`/reject-analysis/incidents/${incident.id}`);
    } catch (error) {
      console.error('Failed to create incident:', error);
      // Error handling is done in the hook
    }
  };

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      router.back();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reject-analysis/incidents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Incidents
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Reject Incident</h1>
          <p className="text-muted-foreground">
            Quick reject logging for quality analysis (anonymous)
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reject Entry</CardTitle>
          <CardDescription>
            Simple form for logging image rejects. Only essential information required.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <RejectIncidentForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Incident Logging Guidelines</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">When to Log a Reject:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Technical errors (positioning, exposure, motion)</li>
              <li>Equipment malfunctions</li>
              <li>Processing artifacts</li>
              <li>Any image requiring retake</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Severity Levels:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Low:</strong> Minor issues that don't significantly impact workflow</li>
              <li><strong>Medium:</strong> Issues requiring attention but not urgent</li>
              <li><strong>High:</strong> Significant problems that may affect patient care</li>
              <li><strong>Critical:</strong> Severe issues requiring immediate action</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Best Practices:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Log rejects immediately</li>
              <li>Select correct category and modality</li>
              <li>Brief but clear reject reason</li>
              <li>No patient details needed</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}