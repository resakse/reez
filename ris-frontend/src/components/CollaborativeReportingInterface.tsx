'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SimpleDicomViewer from '@/components/SimpleDicomViewer';
import { useAISettings } from '@/contexts/AISettingsContext';
import { 
  Brain, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';

interface AIReport {
  id: string;
  report: string;
  confidence: number;
  findings: any[];
}

interface AISuggestion {
  id: string;
  section: 'clinical_history' | 'technique' | 'findings' | 'impression' | 'recommendations';
  text: string;
  confidence: number;
}

interface RadiologistReport {
  clinical_history: string;
  technique: string;
  findings: string;
  impression: string;
  recommendations: string;
}

interface CollaborativeReportingProps {
  examinationId: string;
  aiReportId?: string;
}

export function CollaborativeReportingInterface({ 
  examinationId, 
  aiReportId 
}: CollaborativeReportingProps) {
  const { isAIEnabled } = useAISettings();
  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<string[]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [aiPanelMinimized, setAiPanelMinimized] = useState(false);
  
  const [radiologistReport, setRadiologistReport] = useState<RadiologistReport>({
    clinical_history: '',
    technique: '',
    findings: '',
    impression: '',
    recommendations: ''
  });

  useEffect(() => {
    if (aiReportId) {
      loadAIReport();
      loadAISuggestions();
    }
  }, [aiReportId]);

  const loadAIReport = async () => {
    if (!aiReportId) return;
    
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/${aiReportId}/`);
      if (response.ok) {
        const data = await response.json();
        setAiReport(data);
      }
    } catch (error) {
      console.error('Failed to load AI report:', error);
    }
  };

  const loadAISuggestions = async () => {
    if (!aiReportId) return;
    
    try {
      const response = await AuthService.authenticatedFetch(`/api/ai-reporting/ai-reports/${aiReportId}/`);
      if (response.ok) {
        const data = await response.json();
        // Extract suggestions from report data - this would need to be implemented in the backend
        setAiSuggestions(data.ai_suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
    }
  };

  const generateAIReport = async () => {
    if (!isAIEnabled) return;
    
    setIsGeneratingAI(true);
    try {
      const response = await AuthService.authenticatedFetch('/api/ai-reporting/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examination_number: examinationId })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAiReport(result);
        
        // Load suggestions for the new report
        setTimeout(() => {
          loadAISuggestions();
        }, 1000);
        
        toast.success('AI report generated successfully');
      } else {
        toast.error('Failed to generate AI report');
      }
    } catch (error) {
      toast.error('Failed to generate AI report');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAcceptSuggestion = (suggestionId: string, suggestionText: string) => {
    setAcceptedSuggestions([...acceptedSuggestions, suggestionId]);
    
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      setRadiologistReport(prev => ({
        ...prev,
        [suggestion.section]: prev[suggestion.section] + 
          (prev[suggestion.section] ? '\n\n' : '') + suggestionText
      }));
    }
    
    toast.success('AI suggestion accepted');
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    // Track rejection for learning
    AuthService.authenticatedFetch('/api/ai-reporting/collaborations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_type: 'reject_ai_finding',
        ai_suggestion: suggestionId,
        radiologist_action: 'Rejected',
        feedback_category: 'not_applicable'
      })
    });
    
    toast.success('AI suggestion rejected');
  };

  const saveCollaborativeReport = async () => {
    const reportData = {
      ai_report_id: aiReportId,
      examination_id: examinationId,
      radiologist_report: radiologistReport,
      ai_suggestions_used: acceptedSuggestions,
      complexity_level: calculateComplexity(),
      radiologist_confidence: calculateConfidence()
    };

    try {
      const response = await AuthService.authenticatedFetch('/api/ai-reporting/radiologist-reports/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_report: aiReportId,
          clinical_history: radiologistReport.clinical_history,
          technique: radiologistReport.technique,
          findings: radiologistReport.findings,
          impression: radiologistReport.impression,
          recommendations: radiologistReport.recommendations,
          complexity_level: calculateComplexity(),
          radiologist_confidence: calculateConfidence()
        })
      });

      if (response.ok) {
        setIsComplete(true);
        toast.success('Collaborative report saved successfully');
      } else {
        toast.error('Failed to save report');
      }
    } catch (error) {
      toast.error('Failed to save report');
    }
  };

  const calculateComplexity = (): 'routine' | 'complex' | 'critical' => {
    const findingsLength = radiologistReport.findings.length;
    const impressionLength = radiologistReport.impression.length;
    
    if (findingsLength > 500 || impressionLength > 200) return 'complex';
    if (radiologistReport.findings.toLowerCase().includes('urgent') || 
        radiologistReport.impression.toLowerCase().includes('critical')) return 'critical';
    return 'routine';
  };

  const calculateConfidence = (): number => {
    // Simple confidence calculation based on report completeness
    let score = 0;
    if (radiologistReport.clinical_history) score += 0.1;
    if (radiologistReport.technique) score += 0.1;
    if (radiologistReport.findings) score += 0.4;
    if (radiologistReport.impression) score += 0.3;
    if (radiologistReport.recommendations) score += 0.1;
    return score;
  };

  // Determine layout classes based on AI enabled state and panel minimization
  const getLayoutClasses = () => {
    if (!isAIEnabled) {
      return "grid grid-cols-2 gap-6 h-screen p-4"; // 2-panel layout
    }
    
    if (aiPanelMinimized) {
      return "grid grid-cols-[1fr_auto_1fr] gap-6 h-screen p-4"; // Minimized AI panel
    }
    
    return "grid grid-cols-3 gap-6 h-screen p-4"; // Full 3-panel layout
  };

  return (
    <div className={getLayoutClasses()}>
      {/* DICOM Viewer - Always present */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">DICOM Viewer</h3>
          <div className="flex gap-2">
            {isAIEnabled && !aiReport && (
              <Button
                onClick={generateAIReport}
                disabled={isGeneratingAI}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Generate AI Report
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <SimpleDicomViewer studyId={examinationId} />
      </div>
      
      {/* AI Suggestions Panel - Only when AI is enabled */}
      {isAIEnabled && (
        <div className={`border rounded-lg ${aiPanelMinimized ? 'w-12' : 'w-full'} transition-all duration-300`}>
          {aiPanelMinimized ? (
            // Minimized AI Panel
            <div className="h-full flex flex-col items-center justify-start p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiPanelMinimized(false)}
                className="mb-4"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="writing-mode-vertical text-sm text-muted-foreground">
                AI Suggestions
              </div>
              {aiSuggestions.length > 0 && (
                <Badge variant="secondary" className="mt-2 rotate-90">
                  {aiSuggestions.length}
                </Badge>
              )}
            </div>
          ) : (
            // Full AI Panel
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Suggestions
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiPanelMinimized(true)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4">
                {aiSuggestions.length === 0 && aiReport && (
                  <Alert>
                    <Brain className="h-4 w-4" />
                    <AlertDescription>
                      No AI suggestions available. Generate an AI report first.
                    </AlertDescription>
                  </Alert>
                )}
                
                {aiSuggestions.map((suggestion) => (
                  <Card key={suggestion.id} className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {suggestion.section.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <Badge 
                        variant={suggestion.confidence > 0.8 ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {(suggestion.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    
                    <p className="text-sm mb-3 text-gray-700">
                      {suggestion.text}
                    </p>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptSuggestion(suggestion.id, suggestion.text)}
                        disabled={acceptedSuggestions.includes(suggestion.id)}
                        className="text-xs"
                      >
                        {acceptedSuggestions.includes(suggestion.id) ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Accepted
                          </>
                        ) : (
                          'Accept'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectSuggestion(suggestion.id)}
                        className="text-xs"
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Radiologist Report Editor - Always present */}
      <div className="border rounded-lg p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Radiology Report</h3>
          {isAIEnabled && (
            <Badge variant="outline" className="text-xs">
              AI-Assisted
            </Badge>
          )}
        </div>
        
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div>
            <Label htmlFor="clinical-history" className="text-sm font-medium">Clinical History</Label>
            <Textarea
              id="clinical-history"
              value={radiologistReport.clinical_history}
              onChange={(e) => setRadiologistReport(prev => ({
                ...prev, clinical_history: e.target.value
              }))}
              placeholder="Clinical indication and patient history..."
              rows={3}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="technique" className="text-sm font-medium">Technique</Label>
            <Textarea
              id="technique"
              value={radiologistReport.technique}
              onChange={(e) => setRadiologistReport(prev => ({
                ...prev, technique: e.target.value
              }))}
              placeholder="Imaging technique and parameters..."
              rows={2}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="findings" className="text-sm font-medium">Findings</Label>
            <Textarea
              id="findings"
              value={radiologistReport.findings}
              onChange={(e) => setRadiologistReport(prev => ({
                ...prev, findings: e.target.value
              }))}
              placeholder="Detailed imaging findings..."
              rows={6}
              className="mt-1 font-mono text-sm"
            />
          </div>
          
          <div>
            <Label htmlFor="impression" className="text-sm font-medium">Impression</Label>
            <Textarea
              id="impression"
              value={radiologistReport.impression}
              onChange={(e) => setRadiologistReport(prev => ({
                ...prev, impression: e.target.value
              }))}
              placeholder="Clinical impression and diagnosis..."
              rows={4}
              className="mt-1 font-mono text-sm"
            />
          </div>
          
          <div>
            <Label htmlFor="recommendations" className="text-sm font-medium">Recommendations</Label>
            <Textarea
              id="recommendations"
              value={radiologistReport.recommendations}
              onChange={(e) => setRadiologistReport(prev => ({
                ...prev, recommendations: e.target.value
              }))}
              placeholder="Follow-up recommendations..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={saveCollaborativeReport}
              disabled={!radiologistReport.findings || !radiologistReport.impression}
              className="bg-green-600 hover:bg-green-700"
            >
              Save Report
            </Button>
            {isAIEnabled && aiReport && (
              <Button 
                variant="outline"
                onClick={() => {
                  // Request AI second opinion functionality
                  toast.info('AI second opinion requested');
                }}
              >
                AI Second Opinion
              </Button>
            )}
          </div>
          
          {isComplete && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ Report saved successfully. 
                {isAIEnabled && (
                  <>AI suggestions used: {acceptedSuggestions.length}/{aiSuggestions.length}</>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}