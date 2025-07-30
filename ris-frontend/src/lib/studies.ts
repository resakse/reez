import AuthService from './auth';

export interface Study {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  modality: string;
  accessionNumber: string;
  seriesCount: number;
  imageCount: number;
  institution?: string;
  examinationId?: number;
  registrationId?: number;
}

/**
 * Fetches studies from the backend database
 * This integrates with the Django exam models to get real study data
 */
export async function fetchStudies(): Promise<Study[]> {
  try {
    const response = await AuthService.authenticatedFetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/examinations/list/`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch studies: ${response.statusText}`);
    }
    
    const examinations = await response.json();
    
    // Transform examination data to study format
    const studies: Study[] = examinations.results?.map((exam: any) => {
      const daftar = exam.daftar_info;
      const patient = daftar.pesakit;
      
      return {
        studyInstanceUID: daftar.study_instance_uid || `temp-${exam.id}`,
        patientName: patient.nama || 'Unknown Patient',
        patientID: patient.nric || 'Unknown ID',
        studyDate: daftar.tarikh ? daftar.tarikh.split('T')[0] : new Date().toISOString().split('T')[0],
        studyTime: daftar.tarikh ? daftar.tarikh.split('T')[1]?.split('.')[0] || '00:00:00' : '00:00:00',
        studyDescription: exam.exam?.exam || 'Unknown Study',
        modality: exam.exam?.modaliti?.singkatan || exam.exam?.modaliti?.nama || 'XR',
        accessionNumber: daftar.parent_accession_number || daftar.accession_number || exam.no_xray || 'N/A',
        seriesCount: 1, // Individual examinations are single series
        imageCount: 1, // Estimate - actual count would need PACS integration
        institution: 'Hospital Kuala Lumpur', // Could be made configurable
        examinationId: exam.id,
        registrationId: daftar.id
      };
    }) || [];
    
    return studies;
  } catch (error) {
    // Error fetching studies from backend
    
    // Return empty array on error - UI should handle gracefully
    return [];
  }
}

/**
 * Fetches a specific study by Study Instance UID
 */
export async function fetchStudy(studyInstanceUID: string): Promise<Study | null> {
  try {
    const studies = await fetchStudies();
    return studies.find(study => study.studyInstanceUID === studyInstanceUID) || null;
  } catch (error) {
    // Error fetching study
    return null;
  }
}