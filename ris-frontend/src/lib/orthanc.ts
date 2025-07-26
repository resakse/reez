import { OrthancStudy, OrthancSeries, OrthancInstance } from '@/types/orthanc';
import { getOrthancUrl } from './pacs';

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
}

/**
 * Fetches the complete metadata for a given study from Orthanc,
 * including all series and instances, and constructs the necessary
 * image IDs for the Cornerstone viewer.
 *
 * This function uses the standard Orthanc REST API, not the OHIF plugin.
 *
 * @param studyInstanceUID The DICOM Study Instance UID.
 * @returns A promise that resolves to an array of Cornerstone image IDs (wadouri).
 */
export async function getStudyImageIds(studyInstanceUID: string): Promise<string[]> {
  const ORTHANC_URL = await getOrthancUrl();

  // Step 1: Find the Orthanc internal ID for the study
  const findResponse = await fetch(`${ORTHANC_URL}/tools/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Level: 'Study',
      Query: {
        StudyInstanceUID: studyInstanceUID,
      },
      Expand: true, // Ask Orthanc to expand the details in the response
    }),
  });

  if (!findResponse.ok) {
    throw new Error(`Failed to find study ${studyInstanceUID}. Status: ${findResponse.statusText}`);
  }

  const findResult: OrthancStudy[] = await findResponse.json();

  if (!findResult || findResult.length === 0) {
    throw new Error(`Study not found: ${studyInstanceUID}`);
  }

  const studyData = findResult[0];
  const imageIds: string[] = [];

  // Step 2: Iterate through each series and instance to build the image IDs
  for (const series of studyData.Series) {
    // The 'Expand' flag in the initial query gives us most of what we need.
    // However, we need to fetch each series individually to get its instances.
    const seriesResponse = await fetch(`${ORTHANC_URL}/series/${series.ID}`);
    const seriesData: OrthancSeries = await seriesResponse.json();
    const seriesInstanceUID = seriesData.MainDicomTags.SeriesInstanceUID;

    for (const instance of seriesData.Instances) {
        const instanceResponse = await fetch(`${ORTHANC_URL}/instances/${instance.ID}`);
        const instanceData: OrthancInstance = await instanceResponse.json();
        const sopInstanceUID = instanceData.MainDicomTags.SOPInstanceUID;

        const imageId = `wadouri:${ORTHANC_URL}/dicom-web/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}`;
        imageIds.push(imageId);
    }
  }

  return imageIds;
}

/**
 * Fetches study metadata including patient information and study details
 * from Orthanc PACS server.
 *
 * @param studyInstanceUID The DICOM Study Instance UID.
 * @returns A promise that resolves to study metadata object.
 */
export async function getStudyMetadata(studyInstanceUID: string): Promise<StudyMetadata> {
  const ORTHANC_URL = await getOrthancUrl();

  try {
    // Step 1: Find the Orthanc internal ID for the study
    const findResponse = await fetch(`${ORTHANC_URL}/tools/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Level: 'Study',
        Query: {
          StudyInstanceUID: studyInstanceUID,
        },
        Expand: true,
      }),
    });

    if (!findResponse.ok) {
      throw new Error(`Failed to find study ${studyInstanceUID}. Status: ${findResponse.statusText}`);
    }

    const findResult: OrthancStudy[] = await findResponse.json();

    if (!findResult || findResult.length === 0) {
      throw new Error(`Study not found: ${studyInstanceUID}`);
    }

    const studyData = findResult[0];
    
    // Extract metadata from the study
    const metadata: StudyMetadata = {
      PatientName: studyData.PatientMainDicomTags?.PatientName || 'Unknown',
      PatientID: studyData.PatientMainDicomTags?.PatientID || 'Unknown',
      PatientBirthDate: studyData.PatientMainDicomTags?.PatientBirthDate || undefined,
      PatientSex: studyData.PatientMainDicomTags?.PatientSex || undefined,
      StudyDate: studyData.MainDicomTags?.StudyDate || undefined,
      StudyTime: studyData.MainDicomTags?.StudyTime || undefined,
      StudyDescription: studyData.MainDicomTags?.StudyDescription || undefined,
      InstitutionName: studyData.MainDicomTags?.InstitutionName || undefined,
      SeriesCount: studyData.Series?.length || 0,
      ImageCount: 0
    };

    // Calculate total image count across all series
    let totalImages = 0;
    for (const series of studyData.Series || []) {
      const seriesResponse = await fetch(`${ORTHANC_URL}/series/${series.ID}`);
      if (seriesResponse.ok) {
        const seriesData: OrthancSeries = await seriesResponse.json();
        totalImages += seriesData.Instances?.length || 0;
        
        // Get modality from first series if not in study level
        if (!metadata.Modality && seriesData.MainDicomTags?.Modality) {
          metadata.Modality = seriesData.MainDicomTags.Modality;
        }
      }
    }
    
    metadata.ImageCount = totalImages;

    return metadata;
  } catch (error) {
    console.error('Error fetching study metadata:', error);
    throw error;
  }
} 