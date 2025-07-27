import { OrthancStudy, OrthancSeries, OrthancInstance } from '@/types/orthanc';
import { getOrthancUrl } from './pacs';
import AuthService from './auth';

interface StudyMetadata {
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  Modality?: string;
  InstitutionName?: string;
  SeriesCount?: number;
  ImageCount?: number;
  AccessionNumber?: string;
  ReferringPhysicianName?: string;
  OperatorsName?: string;
}

// DICOM text decoder utility
function decodeDicomText(text: string): string {
  if (!text) return '';
  
  // Handle DICOM Person Name format (Family^Given^Middle^Prefix^Suffix)
  if (text.includes('^')) {
    const nameParts = text.split('^');
    const family = nameParts[0] || '';
    const given = nameParts[1] || '';
    const middle = nameParts[2] || '';
    
    // Combine name parts with spaces
    return [family, given, middle]
      .filter(part => part.trim())
      .join(' ')
      .trim();
  }
  
  // For other DICOM text, just return as-is (could add more formatting here)
  return text.trim();
}

/**
 * Fetches the complete metadata for a given study from Orthanc,
 * including all series and instances, and constructs the necessary
 * image IDs for the Cornerstone viewer.
 *
 * This function uses the Django proxy API to avoid CORS issues.
 *
 * @param studyInstanceUID The DICOM Study Instance UID.
 * @returns A promise that resolves to an array of Cornerstone image IDs (wadouri).
 */
export async function getStudyImageIds(studyInstanceUID: string): Promise<string[]> {
  try {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    console.log('Fetching image IDs for study:', studyInstanceUID);
    
    const response = await AuthService.authenticatedFetch(
      `${API_URL}/api/pacs/studies/${studyInstanceUID}/image-ids/`
    );

    if (!response.ok) {
      console.warn('API endpoint not available, returning empty array');
      return [];
    }

    const result = await response.json();
    console.log('Received image IDs:', result);

    return result.imageIds || [];
  } catch (error) {
    console.error('Error fetching image IDs:', error);
    // Return empty array instead of throwing to prevent infinite loading
    return [];
  }
}

/**
 * Fetches study metadata including patient information and study details
 * from Orthanc PACS server.
 *
 * @param studyInstanceUID The DICOM Study Instance UID.
 * @returns A promise that resolves to study metadata object.
 */
export async function getStudyMetadata(studyInstanceUID: string): Promise<StudyMetadata> {
  // Use Django API proxy to avoid CORS issues
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  try {
    // Search for the study using Django PACS search API
    const response = await AuthService.authenticatedFetch(`${API_URL}/api/pacs/search/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Search by exact Study Instance UID
        studyInstanceUid: studyInstanceUID
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to find study ${studyInstanceUID}. Status: ${response.statusText}`);
    }

    const searchResult = await response.json();

    if (!searchResult.success || !searchResult.studies || searchResult.studies.length === 0) {
      throw new Error(`Study not found: ${studyInstanceUID}`);
    }

    const study = searchResult.studies[0];
    
    // Convert search result format to StudyMetadata format with DICOM decoding
    const metadata: StudyMetadata = {
      PatientName: decodeDicomText(study.patientName || 'Unknown'),
      PatientID: study.patientId || 'Unknown',
      PatientBirthDate: study.patientBirthDate || undefined,
      PatientSex: study.patientSex || undefined,
      StudyDate: study.studyDate || undefined,
      StudyTime: study.studyTime || undefined,
      StudyDescription: study.studyDescription || undefined,
      Modality: study.modality || undefined,
      InstitutionName: decodeDicomText(study.institutionName || ''),
      SeriesCount: study.seriesCount || 0,
      ImageCount: study.imageCount || 0,
      AccessionNumber: study.accessionNumber || undefined,
      ReferringPhysicianName: decodeDicomText(study.referringPhysicianName || ''),
      OperatorsName: decodeDicomText(study.operatorsName || '')
    };

    return metadata;
  } catch (error) {
    console.error('Error fetching study metadata:', error);
    throw error;
  }
} 