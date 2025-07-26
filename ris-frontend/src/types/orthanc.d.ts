/**
 * Type definitions for the JSON responses from the standard Orthanc REST API.
 * These are not comprehensive but cover the fields needed for the viewer.
 */

export interface OrthancMainDicomTags {
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyInstanceUID?: string;
  StudyDescription?: string;
  StudyDate?: string;
  StudyTime?: string;
  InstitutionName?: string;
  Modality?: string;
  SeriesInstanceUID?: string;
  SeriesDescription?: string;
  SeriesNumber?: string;
  SOPInstanceUID?: string;
  InstanceNumber?: string;
}

export interface OrthancInstance {
  ID: string;
  MainDicomTags: Pick<OrthancMainDicomTags, 'SOPInstanceUID' | 'InstanceNumber'>;
  FileSize: number;
  IndexInSeries: number;
}

export interface OrthancSeries {
  ID: string;
  MainDicomTags: Pick<OrthancMainDicomTags, 'SeriesInstanceUID' | 'SeriesDescription' | 'SeriesNumber' | 'Modality'>;
  Instances?: OrthancInstance[];
  PatientID?: string;
  Study?: string;
}

export interface OrthancStudy {
  ID: string;
  MainDicomTags?: Pick<OrthancMainDicomTags, 'PatientName' | 'PatientID' | 'StudyInstanceUID' | 'StudyDescription' | 'StudyDate' | 'StudyTime' | 'InstitutionName'>;
  PatientMainDicomTags?: Pick<OrthancMainDicomTags, 'PatientName' | 'PatientID' | 'PatientBirthDate' | 'PatientSex'>;
  Series?: OrthancSeries[];
  IsStable?: boolean;
  LastUpdate?: string;
} 