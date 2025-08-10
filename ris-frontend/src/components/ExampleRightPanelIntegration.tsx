'use client';

/**
 * Example integration file showing how to replace the existing right panel in PACS browser
 * with the new RightPanelTabs component that includes annotation functionality.
 * 
 * This file demonstrates how to integrate the annotation UI components into the existing
 * DICOM viewer page structure. To use this integration:
 * 
 * 1. Import RightPanelTabs into your PACS browser page
 * 2. Replace the existing right panel content with RightPanelTabs
 * 3. Pass the required props (studyUid, patientData, studyData)
 * 
 * File: /home/resakse/Coding/reez/ris-frontend/src/components/ExampleRightPanelIntegration.tsx
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RightPanelTabs } from './RightPanelTabs';

interface ExampleRightPanelIntegrationProps {
  studyUid: string;
  metadata: any; // DICOM study metadata
  risExaminations?: any[]; // RIS examination data
  user?: any; // Current user information
}

/**
 * Example component showing how to integrate RightPanelTabs into the PACS browser page.
 * This replaces the existing right panel content with a tabbed interface that includes
 * Patient/Studies info, Reports, and Annotations.
 */
export const ExampleRightPanelIntegration: React.FC<ExampleRightPanelIntegrationProps> = ({
  studyUid,
  metadata,
  risExaminations = [],
  user
}) => {
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('patient');

  // Transform metadata into the format expected by RightPanelTabs
  const patientData = metadata ? {
    name: metadata.PatientName?.Alphabetic || metadata.PatientName || 'Unknown',
    patientId: metadata.PatientID || 'Unknown',
    birthDate: metadata.PatientBirthDate,
    gender: metadata.PatientSex,
  } : null;

  const studyData = metadata ? {
    studyDescription: metadata.StudyDescription || 'Unknown Study',
    studyDate: metadata.StudyDate,
    modality: metadata.ModalitiesInStudy || metadata.Modality || 'Unknown',
    accessionNumber: metadata.AccessionNumber,
    studyInstanceUid: metadata.StudyInstanceUID || studyUid,
    numberOfSeries: metadata.NumberOfStudyRelatedSeries,
    numberOfInstances: metadata.NumberOfStudyRelatedInstances,
    // Add RIS examination data if available
    risExaminations: risExaminations
  } : null;

  // Get annotation count for tab badge (this will be handled internally by RightPanelTabs)
  // But you could also pass it explicitly if you have the data elsewhere
  const annotationCount = undefined; // Let RightPanelTabs fetch this internally

  return (
    <>
      {/* Collapsible Right Panel - Maintains existing behavior */}
      <div className={`${
        isPanelCollapsed ? 'w-12' : 'w-80'
      } border-l bg-muted/5 overflow-hidden transition-all duration-300 ease-in-out relative`}>
        
        {/* Panel Toggle Button - Maintains existing UI pattern */}
        <div className="absolute top-4 left-1 z-20 flex flex-col gap-1">
          <Button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className="bg-background border shadow-sm"
            size="sm"
            variant="outline"
          >
            {isPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Panel Content - Only show when not collapsed */}
        {!isPanelCollapsed && (
          <div className="h-full overflow-hidden">
            <RightPanelTabs
              studyUid={studyUid}
              patientData={patientData}
              studyData={studyData}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              annotationCount={annotationCount}
            />
          </div>
        )}
      </div>
    </>
  );
};

/**
 * Integration Instructions:
 * 
 * To integrate this into the existing PACS browser page 
 * (/src/app/(app)/pacs-browser/[studyUid]/page.tsx), replace the existing right panel code:
 * 
 * FROM:
 * ```tsx
 * <div className={`${isPanelCollapsed ? 'w-12' : 'w-80'} border-l bg-muted/5 overflow-hidden transition-all duration-300 ease-in-out relative`}>
 *   {/* Existing panel toggle and content *}
 *   <div className="overflow-y-auto h-full">
 *     {showReporting ? (
 *       <div className="p-4">
 *         <ReportingPanel ... />
 *       </div>
 *     ) : (
 *       <div className="p-4 space-y-4">
 *         {/* Patient and study info *}
 *       </div>
 *     )}
 *   </div>
 * </div>
 * ```
 * 
 * TO:
 * ```tsx
 * <ExampleRightPanelIntegration
 *   studyUid={studyUid}
 *   metadata={metadata}
 *   risExaminations={risExaminations}
 *   user={user}
 * />
 * ```
 * 
 * Required Changes to PACS Browser Page:
 * 1. Import the RightPanelTabs component
 * 2. Remove the showReporting state (now handled by tabs)
 * 3. Replace the right panel JSX with RightPanelTabs
 * 4. Update any report-related logic to work with the tabbed interface
 * 
 * Benefits of this integration:
 * - Cleaner tabbed interface for different types of information
 * - Persistent annotations with auto-save functionality
 * - User ownership of annotations with delete permissions
 * - Consistent UI patterns with rest of application
 * - Better organization of patient info, reports, and annotations
 */

export default ExampleRightPanelIntegration;