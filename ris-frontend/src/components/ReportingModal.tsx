'use client';

import { useState, useEffect, useRef } from 'react';
// Removed Dialog imports - using custom floating modal
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Save, 
  Edit, 
  Clock, 
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Move,
  X,
  Minimize2,
  Maximize2
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

interface ReportingModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyInstanceUID: string;
  examinations: any[];
  studyMetadata?: {
    PatientName?: string;
    PatientID?: string;
    StudyDate?: string;
    StudyDescription?: string;
    Modality?: string;
  };
}

export default function ReportingModal({ 
  isOpen, 
  onClose, 
  studyInstanceUID, 
  examinations,
  studyMetadata 
}: ReportingModalProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [recommendations, setRecommendations] = useState('');

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hasInitialPosition, setHasInitialPosition] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Set initial position to bottom right when modal opens
  useEffect(() => {
    if (isOpen && !hasInitialPosition) {
      const setBottomRightPosition = () => {
        const modalWidth = isMinimized ? 350 : 700;
        const modalHeight = isMinimized ? 200 : 750;
        const padding = 20;
        
        setPosition({
          x: window.innerWidth - modalWidth - padding,
          y: window.innerHeight - modalHeight - padding
        });
        setHasInitialPosition(true);
      };
      
      // Small delay to ensure DOM is ready
      setTimeout(setBottomRightPosition, 100);
    }
  }, [isOpen, hasInitialPosition, isMinimized]);

  // Check if user can report or view reports
  const canReport = user?.can_report || user?.is_staff || user?.is_superuser;
  const canView = user?.can_view_report || user?.is_staff || user?.is_superuser;

  useEffect(() => {
    if (isOpen && canView) {
      loadReports();
    } else if (!isOpen) {
      // Reset position when modal closes so it repositions next time
      setHasInitialPosition(false);
    }
  }, [isOpen, studyInstanceUID, canView]);

  const loadReports = async () => {
    if (!studyInstanceUID || examinations.length === 0) return;
    
    try {
      setLoading(true);
      
      const reportPromises = examinations.map(async (exam) => {
        try {
          const response = await AuthService.authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/manual-reports/?examination_number=${exam.no_xray}`
          );
          if (response.ok) {
            const data = await response.json();
            return data.results || [];
          }
        } catch (error) {
          console.error('Error fetching reports for exam:', exam.no_xray, error);
        }
        return [];
      });
      
      const allReports = await Promise.all(reportPromises);
      const flatReports = allReports.flat();
      
      setReports(flatReports);
      
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
        // Update existing manual report - include pemeriksaan field
        response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/manual-reports/${currentReport.id}/`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...reportData,
              pemeriksaan: examinations[0].id // Include pemeriksaan ID
            })
          }
        );
      } else {
        // Create new manual report - no AI dependency!
        response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/manual-reports/`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...reportData,
              examination_number: examinations[0].no_xray
            })
          }
        );
      }

      if (response.ok) {
        const savedReport = await response.json();
        toast.success(currentReport ? 'Report updated successfully' : 'Report created successfully');
        
        setCurrentReport(savedReport);
        setIsEditing(false);
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/manual-reports/${currentReport.id}/complete/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
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

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return dateString;
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}/${month}/${year}`;
  };

  if (!canView) return null;

  const modalStyle = isMaximized 
    ? { top: 0, left: 0, transform: 'none', width: '100vw', height: '100vh', resize: 'none' }
    : { 
        top: position.y || '10%', 
        left: position.x || '20%', 
        transform: position.x === 0 && position.y === 0 ? 'translate(-50%, -50%)' : 'none',
        width: isMinimized ? '350px' : '700px',
        height: isMinimized ? 'auto' : '750px',
        resize: 'both',
        minWidth: '300px',
        minHeight: '400px',
        maxWidth: '90vw',
        maxHeight: '90vh'
      };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed z-[60] bg-background border shadow-xl rounded-lg overflow-hidden resize-indicator"
      style={modalStyle}
    >
        {/* Header with drag handle and controls */}
        <div 
          className="flex flex-row items-center justify-between p-4 border-b cursor-move bg-muted/30"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Radiology Report
            </h2>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-6 w-6 p-0"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-6 w-6 p-0"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Study Info Bar */}
        {!isMinimized && (
          <div className="px-4 py-2 bg-muted/20 border-b text-xs">
            <div className="flex items-center justify-between">
              <div>
                <strong>{studyMetadata?.PatientName || 'Unknown Patient'}</strong> 
                {studyMetadata?.PatientID && ` (ID: ${studyMetadata.PatientID})`}
              </div>
              <div className="flex items-center gap-4">
                {studyMetadata?.StudyDate && (
                  <span>{formatDate(studyMetadata.StudyDate)}</span>
                )}
                {studyMetadata?.Modality && (
                  <Badge variant="secondary" className="text-xs">
                    {studyMetadata.Modality}
                  </Badge>
                )}
              </div>
            </div>
            {studyMetadata?.StudyDescription && (
              <div className="text-muted-foreground mt-1">
                {studyMetadata.StudyDescription}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {!isMinimized && (
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {/* Report Header */}
                {currentReport && (
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4 text-xs">
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
                    </div>
                    
                    {canReport && !isEditing && (
                      <Button onClick={() => editReport(currentReport)} size="sm">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                )}

                {/* Report Content */}
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
                  <div className="space-y-4">
                    {/* Findings */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Findings</label>
                      {isEditing ? (
                        <Textarea
                          value={findings}
                          onChange={(e) => setFindings(e.target.value)}
                          placeholder="Describe the imaging findings..."
                          className="min-h-[120px] resize-y"
                        />
                      ) : (
                        <div className="text-sm p-3 bg-muted/30 rounded min-h-[80px]">
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
                          className="min-h-[100px] resize-y"
                        />
                      ) : (
                        <div className="text-sm p-3 bg-muted/30 rounded min-h-[60px]">
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
                          className="min-h-[80px] resize-y"
                        />
                      ) : (
                        <div className="text-sm p-3 bg-muted/30 rounded min-h-[50px]">
                          {recommendations || 'No recommendations'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {isEditing && canReport && (
                  <div className="flex gap-2 pt-4 border-t mt-4">
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
          </div>
        )}
    </div>
  );
}