'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRejectAnalysis } from '@/hooks/useRejectAnalysis';
import { useTargetRates } from '@/contexts/TargetRatesContext';
import { toast } from '@/lib/toast';
import RejectAnalysisForm from '@/components/reject-analysis/RejectAnalysisForm';
import type { MonthlyAnalysisFormData } from '@/types/reject-analysis';

export default function NewMonthlyAnalysisPage() {
  const router = useRouter();
  const { createAnalysis, loading } = useRejectAnalysis();
  const { targetRates } = useTargetRates();

  const handleSubmit = async (data: MonthlyAnalysisFormData) => {
    try {
      const analysis = await createAnalysis(data);
      toast.success('Monthly analysis created successfully');
      router.push(`/reject-analysis/monthly/${analysis.id}`);
    } catch (error) {
      console.error('Failed to create analysis:', error);
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
        <Link href="/reject-analysis/monthly">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Monthly Analysis
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Monthly Analysis</h1>
          <p className="text-muted-foreground">
            Create a comprehensive monthly reject rate analysis report
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Details</CardTitle>
          <CardDescription>
            Fill in the monthly analysis information. The system will automatically calculate statistics based on logged incidents.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <RejectAnalysisForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Analysis Guidelines</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">What is Included:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Automatic calculation of reject rates and statistics</li>
              <li>Category-wise breakdown of reject reasons</li>
              <li>Modality-specific performance analysis</li>
              <li>Comparison with target rates and previous months</li>
              <li>Trend analysis and performance indicators</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Analysis Process:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Draft:</strong> Analysis is created and can be edited</li>
              <li><strong>Completed:</strong> Analysis is finalized and ready for review</li>
              <li><strong>Approved:</strong> Analysis has been reviewed and approved by supervisor</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Target Reject Rates:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>X-Ray: {targetRates.xray}% or below</li>
              <li>CT Scan: {targetRates.ct}% or below</li>
              <li>MRI: {targetRates.mri}% or below</li>
              <li>Ultrasound: {targetRates.ultrasound}% or below</li>
              <li>Mammography: {targetRates.mammography}% or below</li>
              <li>Overall Department: {targetRates.overall}% or below</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Best Practices:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Complete analysis within 5 days of month end</li>
              <li>Review all incidents logged during the month</li>
              <li>Provide detailed analysis notes and observations</li>
              <li>Include specific action items for improvement</li>
              <li>Submit for approval once completed</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}