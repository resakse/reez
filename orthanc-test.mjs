import fetch from 'node-fetch';

// --- Configuration ---
const ORTHANC_URL = 'http://172.25.96.1:8043';
const STUDY_INSTANCE_UID = '1.2.392.200036.9125.2.24457931233239.6576684260.61529'; // The study we want to test

async function testOrthancStudy(studyId) {
  console.log(`\n--- Starting test for Study ID: ${studyId} ---`);

  try {
    // Step 1: Find the Orthanc internal ID for the study using its StudyInstanceUID
    console.log(`1. Finding Orthanc study with StudyInstanceUID: ${studyId}`);
    const findResponse = await fetch(`${ORTHANC_URL}/tools/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Level: 'Study',
        Query: {
          StudyInstanceUID: studyId,
        },
      }),
    });

    if (!findResponse.ok) {
      throw new Error(`Failed to find study. Status: ${findResponse.status} ${findResponse.statusText}`);
    }
    const findResult = await findResponse.json();
    if (!findResult || findResult.length === 0) {
      throw new Error(`Study not found in Orthanc: ${studyId}`);
    }
    const orthancStudyId = findResult[0];
    console.log(`   - Found Orthanc Study ID: ${orthancStudyId}`);

    // Step 2: Fetch the study details to get the list of series
    console.log(`2. Fetching study details from: ${ORTHANC_URL}/studies/${orthancStudyId}`);
    const studyResponse = await fetch(`${ORTHANC_URL}/studies/${orthancStudyId}`);
    if (!studyResponse.ok) {
      throw new Error(`Failed to fetch study details. Status: ${studyResponse.status} ${studyResponse.statusText}`);
    }
    const studyData = await studyResponse.json();
    console.log(`   - Study contains ${studyData.Series.length} series.`);

    // Step 3: Iterate through each series to get instance information
    console.log('3. Fetching series and instance details to build image IDs...');
    let imageIdCount = 0;
    for (const orthancSeriesId of studyData.Series) {
      const seriesResponse = await fetch(`${ORTHANC_URL}/series/${orthancSeriesId}`);
      const seriesData = await seriesResponse.json();
      const seriesInstanceUID = seriesData.MainDicomTags.SeriesInstanceUID;

      for (const orthancInstanceId of seriesData.Instances) {
        const instanceResponse = await fetch(`${ORTHANC_URL}/instances/${orthancInstanceId}`);
        const instanceData = await instanceResponse.json();
        const sopInstanceUID = instanceData.MainDicomTags.SOPInstanceUID;

        // Construct the WADO-URI for Cornerstone
        const imageId = `wadouri:${ORTHANC_URL}/dicom-web/studies/${studyId}/series/${seriesInstanceUID}/instances/${sopInstanceUID}`;
        console.log(`   - ${imageId}`);
        imageIdCount++;
      }
    }

    if (imageIdCount > 0) {
        console.log(`\n✅ SUCCESS: Successfully constructed ${imageIdCount} image IDs.`);
    } else {
        console.log(`\n⚠️ WARNING: Test completed but no image IDs were generated.`);
    }

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    if (error.cause) {
        console.error('   Cause:', error.cause);
    }
    process.exit(1);
  }
}

// --- Run the test ---
testOrthancStudy(STUDY_INSTANCE_UID);
