'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Save, 
  Eye, 
  Edit, 
  Clock, 
  User,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

interface Report {
  id: number;
  findings: string;
  impression: string;
  recommendations: string;
  report_status: 'draft' | 'completed';
  created: string;
  modified: string;
  radiologist_name: string;
}

interface ReportingPanelProps {
  studyInstanceUID: string;
  examinations: any[];
  onReportChange?: (hasReport: boolean) => void;
}

export default function ReportingPanel({ 
  studyInstanceUID, 
  examinations, 
  onReportChange 
}: ReportingPanelProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [recommendations, setRecommendations] = useState('');

  // Check if user can report or view reports
  const canReport = user?.can_report || user?.is_staff || user?.is_superuser;
  const canView = user?.can_view_report || user?.is_staff || user?.is_superuser;

  useEffect(() => {
    if (canView) {
      loadReports();
    }
  }, [studyInstanceUID, canView]);

  useEffect(() => {
    onReportChange?.(reports.length > 0);
  }, [reports.length, onReportChange]);

  const loadReports = async () => {
    if (!studyInstanceUID) return;
    
    try {
      setLoading(true);
      
      // Find reports for examinations associated with this study
      if (examinations.length === 0) {
        setReports([]);
        return;
      }
      
      const reportPromises = examinations.map(async (exam) => {
        try {
          const response = await AuthService.authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/radiologist-reports/`
          );
          if (response.ok) {
            const data = await response.json();
            // Filter reports that match this examination
            const examReports = (data.results || []).filter((report: any) => 
              report.ai_report_details?.pemeriksaan?.id === exam.id
            );
            return examReports;
          }
        } catch (error) {
          console.error('Error fetching reports for exam:', exam.id, error);
        }
        return [];
      });
      
      const allReports = await Promise.all(reportPromises);
      const flatReports = allReports.flat();
      
      setReports(flatReports);
      
      // Set current report to the most recent one
      if (flatReports.length > 0) {
        const mostRecent = flatReports.sort((a, b) => 
          new Date(b.modified).getTime() - new Date(a.modified).getTime()
        )[0];
        setCurrentReport(mostRecent);
        setFindings(mostRecent.findings || '');
        setImpression(mostRecent.impression || '');
        setRecommendations(mostRecent.recommendations || '');
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const startNewReport = () => {
    setCurrentReport(null);
    setFindings('');
    setImpression('');
    setRecommendations('');
    setIsEditing(true);
  };

  const editReport = (report: Report) => {
    setCurrentReport(report);
    setFindings(report.findings || '');
    setImpression(report.impression || '');
    setRecommendations(report.recommendations || '');
    setIsEditing(true);
  };

  const saveReport = async () => {
    if (!examinations.length) {
      toast.error('No examinations found for this study');
      return;
    }

    setSaving(true);
    try {
      const reportData = {
        findings,
        impression,
        recommendations,
        report_status: 'draft'
      };

      let response;
      if (currentReport) {
        // Update existing report
        response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/radiologist-reports/${currentReport.id}/`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reportData)
          }
        );
      } else {
        // Create new report - first need to create or find an AI report for this examination
        try {
          // Try to create an AI report first (this will create a placeholder)
          const aiReportResponse = await AuthService.authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/generate/`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                examination_number: examinations[0].no_xray,
                force_regenerate: false
              })
            }
          );
          
          let aiReportId;
          if (aiReportResponse.ok) {
            const aiReportData = await aiReportResponse.json();
            aiReportId = aiReportData.report.id;
          } else {
            // If AI report creation fails, we can't create a radiologist report
            toast.error('Unable to create report. AI reporting system required.');
            return;
          }
          
          // Now create the radiologist report
          response = await AuthService.authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/radiologist-reports/`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...reportData,
                ai_report_id: aiReportId
              })
            }
          );
        } catch (createError) {
          console.error('Error creating AI report:', createError);
          toast.error('Failed to initialize report');
          return;
        }
      }

      if (response.ok) {
        const savedReport = await response.json();
        toast.success(currentReport ? 'Report updated successfully' : 'Report created successfully');
        
        setCurrentReport(savedReport);
        setIsEditing(false);
        
        // Reload reports to get updated list
        await loadReports();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save report');
      }
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const completeReport = async () => {
    if (!currentReport) return;

    setSaving(true);
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/radiologist-reports/${currentReport.id}/complete_report/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            radiologist_confidence: 0.9
          })
        }
      );

      if (response.ok) {
        toast.success('Report completed successfully');
        await loadReports();
        setIsEditing(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to complete report');
      }
    } catch (error) {
      console.error('Error completing report:', error);
      toast.error('Failed to complete report');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to view reports.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Radiology Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Radiology Report
          </CardTitle>
          
          {canReport && (
            <div className="flex gap-2">
              {!isEditing && (
                <>
                  {currentReport ? (
                    <Button
                      onClick={() => editReport(currentReport)}
                      size="sm"
                      variant="outline"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <Button
                      onClick={startNewReport}
                      size="sm"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      New Report
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        {currentReport && (
          <CardDescription className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {currentReport.radiologist_name || 'Unknown User'}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(currentReport.modified).toLocaleDateString()}
            </div>
            <Badge 
              variant={currentReport.report_status === 'completed' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {currentReport.report_status === 'completed' ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : (
                <Edit className="h-3 w-3 mr-1" />
              )}
              {currentReport.report_status === 'completed' ? 'Completed' : 'Draft'}
            </Badge>
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!currentReport && !isEditing ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No reports found for this study</p>
            {canReport && (
              <Button onClick={startNewReport}>
                <FileText className="h-4 w-4 mr-2" />
                Create Report
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Findings */}
            <div>
              <label className="text-sm font-medium mb-2 block">Findings</label>
              {isEditing ? (
                <Textarea
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="Describe the imaging findings..."
                  className="min-h-[100px]"
                />
              ) : (
                <div className="text-sm p-3 bg-muted/30 rounded min-h-[100px]">
                  {findings || 'No findings recorded'}
                </div>
              )}
            </div>

            <Separator />

            {/* Impression */}
            <div>
              <label className="text-sm font-medium mb-2 block">Impression</label>
              {isEditing ? (
                <Textarea
                  value={impression}
                  onChange={(e) => setImpression(e.target.value)}
                  placeholder="Clinical impression and diagnosis..."
                  className="min-h-[80px]"
                />
              ) : (
                <div className="text-sm p-3 bg-muted/30 rounded min-h-[80px]">
                  {impression || 'No impression recorded'}
                </div>
              )}
            </div>

            <Separator />

            {/* Recommendations */}
            <div>
              <label className="text-sm font-medium mb-2 block">Recommendations</label>
              {isEditing ? (
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Clinical recommendations..."
                  className="min-h-[60px]"
                />
              ) : (
                <div className="text-sm p-3 bg-muted/30 rounded min-h-[60px]">
                  {recommendations || 'No recommendations'}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {isEditing && canReport && (
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={saveReport}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Draft
                </Button>
                
                {currentReport && findings && impression && (
                  <Button
                    onClick={completeReport}
                    disabled={saving}
                    variant="outline"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Complete
                  </Button>
                )}
                
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="ghost"
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}