import { OrthancStudy, OrthancSeries, OrthancInstance } from '@/types/orthanc';
import { getOrthancUrl } from './pacs';
import AuthService from './auth';

// Request throttling to prevent hammering the server
const requestCache = new Map<string, Promise<any>>();
const REQUEST_THROTTLE_MS = 500; // Minimum time between identical requests

function throttleRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  // If request is already in progress, return the existing promise
  if (requestCache.has(key)) {
    return requestCache.get(key)!;
  }

  // Execute the request and cache the promise
  const promise = requestFn().finally(() => {
    // Remove from cache after throttle period to allow future requests
    const timer = setTimeout(() => {
      requestCache.delete(key);
    }, REQUEST_THROTTLE_MS);
  });

  requestCache.set(key, promise);
  return promise;
}

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

interface SeriesInfo {
  seriesId: string;
  seriesInstanceUID: string;
  seriesDescription: string;
  instanceCount: number;
}

interface StudyImageData {
  imageIds: string[];
  seriesInfo: SeriesInfo[];
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
 * @returns A promise that resolves to study image data with imageIds and series information.
 */
export async function getStudyImageIds(studyInstanceUID: string): Promise<StudyImageData> {
  const requestKey = `image-ids-${studyInstanceUID}`;
  
  return throttleRequest(requestKey, async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Fetching image IDs for study
      
      const response = await AuthService.authenticatedFetch(
        `${API_URL}/api/pacs/studies/${studyInstanceUID}/image-ids/`
      );

    if (!response.ok) {
      // API endpoint not available, returning empty data
      return { imageIds: [], seriesInfo: [] };
    }

    const result = await response.json();
    // Received study data

    // Check for warnings about stale metadata or storage issues
    if (result.warning) {
      // DICOM Study Warning
      if (result.debug_info?.database_inconsistency) {
        // Orthanc database inconsistency detected
        // Show user-friendly error for database issues
        throw new Error('The PACS server has database inconsistency issues. DICOM instances are listed but not accessible. Contact your system administrator to repair the Orthanc database.');
      } else if (result.debug_info?.systemic_storage_issue) {
        // Systemic Orthanc storage issue detected
        // Show user-friendly error for storage issues
        throw new Error('The PACS server has storage configuration issues. Contact your system administrator to resolve Orthanc storage problems.');
      } else if (result.debug_info?.instance_verification_failed) {
        // Instance verification failed - likely stale Orthanc metadata
        // Show user-friendly error
        throw new Error('This study contains invalid or deleted DICOM files. The study may need to be re-imported to PACS.');
      }
    }

    // Validate and filter image IDs to prevent corrupted data issues
    const validImageIds = (result.imageIds || []).filter((imageId: string) => {
      if (!imageId || typeof imageId !== 'string') {
        // Invalid image ID found
        return false;
      }
      
      // Basic validation for WADO URI or WADO-RS format
      if (!imageId.startsWith('wadouri:') && !imageId.startsWith('wadors:')) {
        // Invalid WADO format - must start with wadouri: or wadors:
        return false;
      }
      
      // Additional validation - check if URL looks reasonable
      try {
        const url = new URL(imageId.replace(/^(wadouri:|wadors:)/, ''));
        if (!url.pathname.includes('/api/pacs/instances/')) {
          // Unexpected DICOM proxy URL format
          return false;
        }
      } catch (e) {
        // Invalid URL in image ID
        return false;
      }
      
      return true;
    });
    
    // Validated image IDs
    
    // Extract series information
    const seriesInfo: SeriesInfo[] = result.series_info || [];
    // Found series in study
    
      return {
        imageIds: validImageIds,
        seriesInfo: seriesInfo
      };
    } catch (error) {
      // Error fetching image IDs
      // Return empty data instead of throwing to prevent infinite loading
      return { imageIds: [], seriesInfo: [] };
    }
  });
}

/**
 * Fetches study metadata including patient information and study details
 * from Orthanc PACS server.
 *
 * @param studyInstanceUID The DICOM Study Instance UID.
 * @returns A promise that resolves to study metadata object.
 */
export async function getStudyMetadata(studyInstanceUID: string): Promise<StudyMetadata> {
  const requestKey = `metadata-${studyInstanceUID}`;
  
  return throttleRequest(requestKey, async () => {
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
      // Error fetching study metadata
      throw error;
    }
  });
}