/**
 * Type definitions for the JSON responses from the standard Orthanc REST API.
 * These are not comprehensive but cover the fields needed for the viewer.
 */

export interface OrthancMainDicomTags {
  PatientName: string;
  PatientID: string;
  StudyInstanceUID: string;
  StudyDescription: string;
  StudyDate: string;
  SeriesInstanceUID: string;
  SeriesDescription: string;
  SeriesNumber: string;
  SOPInstanceUID: string;
  InstanceNumber: string;
}

export interface OrthancInstance {
  ID: string;
  MainDicomTags: Pick<OrthancMainDicomTags, 'SOPInstanceUID' | 'InstanceNumber'>;
  FileSize: number;
  IndexInSeries: number;
}

export interface OrthancSeries {
  ID: string;
  MainDicomTags: Pick<OrthancMainDicomTags, 'SeriesInstanceUID' | 'SeriesDescription' | 'SeriesNumber'>;
  Instances: OrthancInstance[];
  PatientID: string;
  Study: string;
}

export interface OrthancStudy {
  ID: string;
  MainDicomTags: Pick<OrthancMainDicomTags, 'PatientName' | 'PatientID' | 'StudyInstanceUID' | 'StudyDescription' | 'StudyDate'>;
  PatientMainDicomTags: Pick<OrthancMainDicomTags, 'PatientName' | 'PatientID'>;
  Series: OrthancSeries[];
  IsStable: boolean;
  LastUpdate: string;
} 