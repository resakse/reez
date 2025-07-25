import { OrthancStudy, OrthancSeries, OrthancInstance } from '@/types/orthanc';

const ORTHANC_URL = process.env.NEXT_PUBLIC_ORTHANC_URL;

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
  if (!ORTHANC_URL) {
    throw new Error('NEXT_PUBLIC_ORTHANC_URL is not defined in the environment variables.');
  }

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