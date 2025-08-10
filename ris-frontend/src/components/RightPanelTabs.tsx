'use client';

import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { User, FileText, Ruler, AlertCircle } from 'lucide-react';
import { AnnotationPanel } from './AnnotationPanel';
import { useAnnotations } from '@/hooks/useAnnotations';
import { Alert } from '@/components/ui/alert';
import dynamic from 'next/dynamic';

// Dynamically import ReportingPanel to avoid SSR issues
const ReportingPanel = dynamic(() => import('./ReportingPanel'), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-20 bg-muted rounded"></div>
        <div className="h-20 bg-muted rounded"></div>
      </div>
    </div>
  ),
});
import type { RightPanelTabsProps } from '@/types/annotations';

// Patient/Studies Panel Component
const PatientInfoPanel: React.FC<{
  patientData?: any;
  studyData?: any;
}> = ({ patientData, studyData }) => {
  return (
    <div className="p-4 space-y-6">
      {/* Patient Information */}
      {patientData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <User className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Patient Information</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {patientData.name && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <p className="font-medium">{patientData.name}</p>
              </div>
            )}
            
            {patientData.patientId && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Patient ID</label>
                <p className="font-mono text-sm">{patientData.patientId}</p>
              </div>
            )}
            
            {patientData.birthDate && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                <p>{new Date(patientData.birthDate).toLocaleDateString()}</p>
              </div>
            )}
            
            {patientData.gender && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Gender</label>
                <p className="capitalize">{patientData.gender}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Study Information */}
      {studyData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Study Information</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {studyData.studyDescription && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Study Description</label>
                <p className="font-medium">{studyData.studyDescription}</p>
              </div>
            )}
            
            {studyData.studyDate && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Study Date</label>
                <p>{new Date(studyData.studyDate).toLocaleDateString()}</p>
              </div>
            )}
            
            {studyData.modality && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Modality</label>
                <Badge variant="outline">{studyData.modality}</Badge>
              </div>
            )}
            
            {studyData.accessionNumber && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Accession Number</label>
                <p className="font-mono text-sm">{studyData.accessionNumber}</p>
              </div>
            )}
            
            {studyData.studyInstanceUid && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Study Instance UID</label>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {studyData.studyInstanceUid}
                </p>
              </div>
            )}
            
            {studyData.numberOfSeries && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Series Count</label>
                <p>{studyData.numberOfSeries}</p>
              </div>
            )}
            
            {studyData.numberOfInstances && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Images Count</label>
                <p>{studyData.numberOfInstances}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fallback when no data is available */}
      {!patientData && !studyData && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <User className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="font-medium text-foreground mb-2">No patient data available</h3>
          <p className="text-sm text-muted-foreground">
            Patient and study information will appear here when available.
          </p>
        </div>
      )}
    </div>
  );
};

// Report Panel Component
const ReportPanel: React.FC<{
  studyUid: string;
  examinations?: any[];
}> = ({ studyUid, examinations = [] }) => {
  return (
    <div className="h-full">
      <ReportingPanel
        studyInstanceUID={studyUid}
        examinations={examinations}
        showHeader={false}
      />
    </div>
  );
};

// Main RightPanelTabs Component
export const RightPanelTabs: React.FC<RightPanelTabsProps> = ({
  studyUid,
  patientData,
  studyData,
  activeTab = 'patient',
  onTabChange,
  annotationCount,
  examinations
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(activeTab);
  
  // Use annotation hook to get real-time count (no polling needed - using custom events)
  const { stats, loading: annotationLoading } = useAnnotations({ 
    studyUid
  });

  // Determine which tab is currently active
  const currentTab = onTabChange ? activeTab : internalActiveTab;

  const handleTabChange = (value: string) => {
    if (onTabChange) {
      onTabChange(value);
    } else {
      setInternalActiveTab(value);
    }
  };

  // Determine annotation count to display
  const displayAnnotationCount = useMemo(() => {
    if (annotationLoading) return '';
    return annotationCount ?? stats.total;
  }, [annotationCount, stats.total, annotationLoading]);

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs 
        value={currentTab} 
        onValueChange={handleTabChange}
        className="h-full flex flex-col"
      >
        <div className="border-b border-border bg-background">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger 
              value="patient" 
              className="flex items-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Patient</span>
              <span className="sm:hidden">Info</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="report" 
              className="flex items-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <FileText className="w-4 h-4" />
              <span>Report</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="annotations" 
              className="flex items-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Ruler className="w-4 h-4" />
              <span className="hidden sm:inline">Annotations</span>
              <span className="sm:hidden">Notes</span>
              {displayAnnotationCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="text-xs h-5 px-1.5 ml-1"
                >
                  {displayAnnotationCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent 
            value="patient" 
            className="h-full m-0 overflow-auto"
            forceMount={false}
          >
            <PatientInfoPanel 
              patientData={patientData} 
              studyData={studyData} 
            />
          </TabsContent>
          
          <TabsContent 
            value="report" 
            className="h-full m-0 overflow-auto"
            forceMount={false}
          >
            <ReportPanel studyUid={studyUid} examinations={examinations} />
          </TabsContent>
          
          <TabsContent 
            value="annotations" 
            className="h-full m-0 p-0"
            forceMount={true} // Keep annotations mounted for better UX
          >
            <AnnotationPanel 
              studyUid={studyUid}
              isVisible={currentTab === 'annotations'}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default RightPanelTabs;