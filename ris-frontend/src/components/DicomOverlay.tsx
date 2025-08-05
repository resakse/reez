'use client';

import React from 'react';

interface DicomOverlayProps {
  isVisible: boolean;
  studyMetadata?: {
    PatientName?: string;
    PatientID?: string;
    PatientBirthDate?: string;
    StudyDate?: string;
    StudyTime?: string;
    StudyDescription?: string;
    Modality?: string;
    InstitutionName?: string;
    OperatorsName?: string;
    Manufacturer?: string;
    ManufacturerModelName?: string;
  };
  examinations?: any[];
  enhancedDicomData?: any[];
  className?: string;
}

export default function DicomOverlay({ 
  isVisible, 
  studyMetadata, 
  examinations = [], 
  enhancedDicomData = [],
  className = ""
}: DicomOverlayProps) {
  if (!isVisible) return null;

  // Helper function to format date
  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return '';
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}/${month}/${year}`;
  };

  // Helper function to format time to 12-hour format
  const formatTime = (timeString: string): string => {
    if (!timeString || timeString.length < 6) return '';
    const hours = parseInt(timeString.substring(0, 2), 10);
    const minutes = timeString.substring(2, 4);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  // Helper function to format date and time together
  const formatDateTime = (dateString: string, timeString: string): string => {
    const date = formatDate(dateString);
    const time = formatTime(timeString);
    if (!date) return '';
    if (!time) return date;
    return `${date} ${time}`;
  };

  // Get examination details
  const getExaminationDetails = () => {
    if (examinations.length > 0) {
      const exam = examinations[0];
      const radiographer = exam.jxr ? `${exam.jxr.first_name} ${exam.jxr.last_name}`.trim() : 
                          (exam.radiographer_name || studyMetadata?.OperatorsName || '');
      
      return {
        examination: exam.exam?.exam || exam.exam_type || studyMetadata?.StudyDescription || '',
        laterality: exam.laterality || '',
        position: exam.patient_position || exam.position || '',
        kv: exam.kv || exam.kvp || '',
        mAs: exam.mas || exam.mAs || '',
        radiographer: radiographer,
        institution: exam.institution?.name || exam.institution_name || studyMetadata?.InstitutionName || '',
        machine: getMachineInfo(exam)
      };
    } else if (enhancedDicomData.length > 0) {
      const data = enhancedDicomData[0];
      return {
        examination: data.exam_type || studyMetadata?.StudyDescription || '',
        laterality: data.laterality || '',
        position: data.position || '',
        kv: data.kv || data.kvp || '',
        mAs: data.mas || data.mAs || '',
        radiographer: data.radiographer_name || studyMetadata?.OperatorsName || '',
        institution: data.institution_name || studyMetadata?.InstitutionName || '',
        machine: getMachineInfo(data)
      };
    }
    return {
      examination: studyMetadata?.StudyDescription || '',
      laterality: '',
      position: '',
      kv: '',
      mAs: '',
      radiographer: studyMetadata?.OperatorsName || '',
      institution: studyMetadata?.InstitutionName || '',
      machine: getMachineInfo()
    };
  };

  // Helper function to get machine information
  const getMachineInfo = (examData?: any): string => {
    // Try to get manufacturer and model from exam data first
    if (examData) {
      const manufacturer = examData.manufacturer || examData.Manufacturer || '';
      const model = examData.manufacturer_model_name || examData.ManufacturerModelName || examData.model || '';
      
      if (manufacturer && model) {
        return `${manufacturer} ${model}`;
      } else if (manufacturer) {
        return manufacturer;
      } else if (model) {
        return model;
      }
    }
    
    // Fallback to study metadata
    const manufacturer = studyMetadata?.Manufacturer || '';
    const model = studyMetadata?.ManufacturerModelName || '';
    
    if (manufacturer && model) {
      return `${manufacturer} ${model}`;
    } else if (manufacturer) {
      return manufacturer;
    } else if (model) {
      return model;
    }
    
    return '';
  };

  const examDetails = getExaminationDetails();
  const noXray = examinations.length > 0 ? (examinations[0].no_xray || '') : '';

  return (
    <div className={`absolute inset-0 pointer-events-none z-10 ${className}`}>
      {/* Top Left - Patient Info */}
      <div className="absolute top-4 left-4 text-white text-sm font-mono bg-black/20 p-2 rounded">
        {studyMetadata?.PatientName?.replace(/\^/g, ' ') && (
          <div>{studyMetadata.PatientName.replace(/\^/g, ' ')}</div>
        )}
        {studyMetadata?.PatientID && (
          <div>{studyMetadata.PatientID}</div>
        )}
        {noXray && (
          <div>{noXray}</div>
        )}
        {formatDateTime(studyMetadata?.StudyDate || '', studyMetadata?.StudyTime || '') && (
          <div>{formatDateTime(studyMetadata?.StudyDate || '', studyMetadata?.StudyTime || '')}</div>
        )}
      </div>

      {/* Top Right - Examination Info */}
      <div className="absolute top-4 right-4 text-white text-sm font-mono bg-black/20 p-2 rounded text-right">
        {examDetails.examination && (
          <div>{examDetails.examination}</div>
        )}
        {(examDetails.laterality || examDetails.position) && (
          <div>{[examDetails.laterality, examDetails.position].filter(Boolean).join(' ')}</div>
        )}
        {examDetails.kv && (
          <div>{examDetails.kv} kV</div>
        )}
        {examDetails.mAs && (
          <div>{examDetails.mAs} mAs</div>
        )}
      </div>

      {/* Bottom Left - Institution Info */}
      <div className="absolute bottom-4 left-4 text-white text-sm font-mono bg-black/20 p-2 rounded">
        {examDetails.institution && (
          <div>{examDetails.institution}</div>
        )}
        {examDetails.radiographer && (
          <div>{examDetails.radiographer}</div>
        )}
      </div>

      {/* Bottom Right - Technical Info */}
      <div className="absolute bottom-4 right-4 text-white text-sm font-mono bg-black/20 p-2 rounded text-right">
        {examDetails.machine && (
          <div>{examDetails.machine}</div>
        )}
        <div>W/L: Auto</div>
        {studyMetadata?.Modality === 'CT' && (
          <>
            <div>Slice: 1.0mm</div>
            <div>Pos: 0.0mm</div>
          </>
        )}
      </div>
    </div>
  );
}