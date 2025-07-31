"""
PACS Browser API Views
Provides REST API endpoints for browsing legacy DICOM studies in Orthanc PACS
"""

import requests
import json
from django.http import HttpResponse, StreamingHttpResponse
from django.db import IntegrityError
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import PacsConfig
from custom.katanama import titlecase
from .utils import (
    find_or_create_patient, 
    create_daftar_for_study, 
    create_pemeriksaan_from_dicom,
    parse_dicom_examination_details,
    generate_custom_accession
)


class PacsSearchView(APIView):
    """
    API endpoint for searching legacy DICOM studies in Orthanc PACS
    Proxies requests to Orthanc REST API to avoid CORS issues
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Search for DICOM studies in Orthanc PACS
        
        Expected POST body:
        {
            "patientName": "search term",
            "patientId": "search term", 
            "dateFrom": "YYYY-MM-DD",
            "dateTo": "YYYY-MM-DD",
            "modality": "CT|MR|CR|DR|etc",
            "studyDescription": "search term"
        }
        """
        try:
            
            # Get Orthanc URL from configuration
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            orthanc_url = pacs_config.orthancurl
            
            # Parse request data
            search_params = request.data
            
            # Build Orthanc query
            query = {}
            
            # Patient name search (wildcard)
            if search_params.get('patientName'):
                query['PatientName'] = f"*{search_params['patientName'].strip()}*"
            
            # Patient ID search (wildcard)
            if search_params.get('patientId'):
                query['PatientID'] = f"*{search_params['patientId'].strip()}*"
            
            # Date range search
            date_from = search_params.get('dateFrom')
            date_to = search_params.get('dateTo')
            if date_from or date_to:
                if date_from and date_to:
                    # Convert YYYY-MM-DD to YYYYMMDD
                    from_date = date_from.replace('-', '')
                    to_date = date_to.replace('-', '')
                    query['StudyDate'] = f"{from_date}-{to_date}"
                elif date_from:
                    from_date = date_from.replace('-', '')
                    query['StudyDate'] = f"{from_date}-"
                elif date_to:
                    to_date = date_to.replace('-', '')
                    query['StudyDate'] = f"-{to_date}"
            
            # Note: Modality filtering is now done client-side after series-level extraction
            # modality = search_params.get('modality')
            # if modality and modality != 'ALL':
            #     query['ModalitiesInStudy'] = modality
            
            # Study description search (wildcard)
            if search_params.get('studyDescription'):
                query['StudyDescription'] = f"*{search_params['studyDescription'].strip()}*"
            
            # Study Instance UID search (exact match)
            if search_params.get('studyInstanceUid'):
                query['StudyInstanceUID'] = search_params['studyInstanceUid']
            
            # Prepare Orthanc request
            orthanc_request = {
                'Level': 'Study',
                'Query': query,
                'Expand': True,
                'Limit': search_params.get('limit', 100)
            }
            
            # Query Orthanc
            orthanc_response = requests.post(
                f"{orthanc_url}/tools/find",
                headers={'Content-Type': 'application/json'},
                json=orthanc_request,
                timeout=30
            )
            
            if not orthanc_response.ok:
                return Response({
                    'error': f'Orthanc query failed: {orthanc_response.status_code} {orthanc_response.text}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            orthanc_results = orthanc_response.json()
            
            # Debug: Print first study structure to understand available fields
            if orthanc_results:
                print(f"Sample Orthanc study structure: {orthanc_results[0]}")
            
            # Format results for frontend
            formatted_studies = []
            for study in orthanc_results:
                # Extract modality from series (DICOM tag 0008,0060 is series-level)
                modality = 'Unknown'
                series_list = study.get('Series', [])
                
                # Try study-level ModalitiesInStudy first
                study_modalities = study.get('MainDicomTags', {}).get('ModalitiesInStudy', '')
                if study_modalities:
                    modality = study_modalities.split(',')[0].strip()
                elif series_list:
                    # If no study-level modality, try to get from first series
                    try:
                        first_series_id = series_list[0]
                        series_response = requests.get(
                            f"{orthanc_url}/series/{first_series_id}",
                            timeout=5
                        )
                        if series_response.ok:
                            series_data = series_response.json()
                            series_modality = series_data.get('MainDicomTags', {}).get('Modality', '')
                            if series_modality:
                                modality = series_modality
                    except Exception as e:
                        print(f"Failed to fetch series modality: {e}")
                        # Keep modality as 'Unknown'
                        pass
                
                formatted_study = {
                    'id': study.get('ID', ''),
                    'studyInstanceUid': study.get('MainDicomTags', {}).get('StudyInstanceUID', ''),
                    'patientName': study.get('PatientMainDicomTags', {}).get('PatientName', 'Unknown'),
                    'patientId': study.get('PatientMainDicomTags', {}).get('PatientID', 'Unknown'),
                    'patientBirthDate': study.get('PatientMainDicomTags', {}).get('PatientBirthDate', ''),
                    'patientSex': study.get('PatientMainDicomTags', {}).get('PatientSex', ''),
                    'studyDate': study.get('MainDicomTags', {}).get('StudyDate', ''),
                    'studyTime': study.get('MainDicomTags', {}).get('StudyTime', ''),
                    'studyDescription': study.get('MainDicomTags', {}).get('StudyDescription', ''),
                    'modality': modality,
                    'seriesCount': len(series_list),
                    'imageCount': 0,  # Could be calculated if needed
                    'institutionName': study.get('MainDicomTags', {}).get('InstitutionName', ''),
                    'accessionNumber': study.get('MainDicomTags', {}).get('AccessionNumber', ''),
                    'referringPhysicianName': study.get('MainDicomTags', {}).get('ReferringPhysicianName', ''),
                    'operatorsName': study.get('MainDicomTags', {}).get('OperatorsName', '')
                }
                formatted_studies.append(formatted_study)
            
            return Response({
                'studies': formatted_studies,
                'total': len(formatted_studies),
                'query': query,
                'success': True
            })
            
        except requests.exceptions.RequestException as e:
            return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pacs_stats(request):
    """
    Get basic statistics about the PACS archive
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Get statistics from Orthanc
        stats_response = requests.get(f"{orthanc_url}/statistics", timeout=10)
        
        if stats_response.ok:
            stats = stats_response.json()
            return Response({
                'totalStudies': stats.get('CountStudies', 0),
                'totalSeries': stats.get('CountSeries', 0), 
                'totalInstances': stats.get('CountInstances', 0),
                'totalPatients': stats.get('CountPatients', 0),
                'diskUsage': stats.get('TotalDiskSize', 0),
                'success': True
            })
        else:
            return Response({'error': 'Failed to get PACS statistics'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_legacy_study(request):
    """
    Import a legacy DICOM study into the RIS database
    
    Expected POST body:
    {
        "studyInstanceUid": "1.2.3.4.5...",
        "createPatient": true/false
    }
    """
    # Check if user is superuser
    if not request.user.is_superuser:
        return Response({'error': 'Only superusers can import legacy studies'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        from django.db import transaction
        from pesakit.models import Pesakit
        from exam.models import Daftar, Pemeriksaan, Exam, Modaliti, PacsExam
        from datetime import datetime
        import re
        
        study_uid = request.data.get('studyInstanceUid')
        create_patient = request.data.get('createPatient', True)
        
        if not study_uid:
            return Response({'error': 'studyInstanceUid is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if study already exists in RIS
        existing_daftar = Daftar.objects.filter(study_instance_uid=study_uid).first()
        if existing_daftar:
            return Response({
                'error': f'Study already imported as registration ID {existing_daftar.id}',
                'registrationId': existing_daftar.id,
                'success': False
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get Orthanc configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Fetch study metadata from Orthanc
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={
                'Level': 'Study',
                'Query': {'StudyInstanceUID': study_uid},
                'Expand': True,
            },
            timeout=30
        )
        
        if not find_response.ok:
            return Response({
                'error': f'Failed to find study in PACS: {find_response.status_code}'
            }, status=status.HTTP_404_NOT_FOUND)
        
        find_result = find_response.json()
        if not find_result:
            return Response({'error': f'Study not found in PACS: {study_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        study_data = find_result[0]
        main_tags = study_data.get('MainDicomTags', {})
        patient_tags = study_data.get('PatientMainDicomTags', {})
        
        # Get detailed series information for proper examination mapping
        series_details = []
        for series_id in study_data.get('Series', []):
            try:
                series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=30)
                if series_response.ok:
                    series_data = series_response.json()
                    series_tags = series_data.get('MainDicomTags', {})
                    
                    # Get first instance for additional metadata
                    instances = series_data.get('Instances', [])
                    instance_tags = {}
                    if instances:
                        instance_response = requests.get(f"{orthanc_url}/instances/{instances[0]}", timeout=30)
                        if instance_response.ok:
                            instance_data = instance_response.json()
                            instance_tags = instance_data.get('MainDicomTags', {})
                    
                    series_details.append({
                        'series_id': series_id,
                        'series_tags': series_tags,
                        'instance_tags': instance_tags,
                        'instance_count': len(instances)
                    })
            except Exception as e:
                print(f"Error fetching series {series_id}: {e}")
                continue
        
        # Extract patient information
        patient_name = patient_tags.get('PatientName', 'Unknown').replace('^', ' ')
        patient_id = patient_tags.get('PatientID', '')
        patient_birth_date = patient_tags.get('PatientBirthDate', '')
        patient_sex = patient_tags.get('PatientSex', '')
        
        # Extract study information
        study_date = main_tags.get('StudyDate', '')
        study_time = main_tags.get('StudyTime', '')
        study_description = main_tags.get('StudyDescription', 'Imported Legacy Study')
        accession_number = main_tags.get('AccessionNumber', '')
        modality = main_tags.get('ModalitiesInStudy', 'XR').split(',')[0]
        institution_name = main_tags.get('InstitutionName', '')
        referring_physician = main_tags.get('ReferringPhysicianName', '')
        operators_name = main_tags.get('OperatorsName', '')
        
        # Parse dates
        study_datetime = None
        if study_date:
            try:
                if study_time:
                    # Clean up time format
                    time_str = study_time.split('.')[0]  # Remove fractional seconds
                    if len(time_str) == 6:  # HHMMSS
                        datetime_str = f"{study_date}{time_str}"
                        study_datetime = datetime.strptime(datetime_str, '%Y%m%d%H%M%S')
                    elif len(time_str) == 4:  # HHMM
                        datetime_str = f"{study_date}{time_str}00"
                        study_datetime = datetime.strptime(datetime_str, '%Y%m%d%H%M%S')
                else:
                    study_datetime = datetime.strptime(study_date, '%Y%m%d')
            except ValueError:
                study_datetime = datetime.now()
        else:
            study_datetime = datetime.now()
        
        # Parse patient birth date
        patient_birth = None
        if patient_birth_date:
            try:
                patient_birth = datetime.strptime(patient_birth_date, '%Y%m%d').date()
            except ValueError:
                pass
        
        # Helper function to parse examination details from DICOM tags
        def parse_examination_details(series_detail):
            series_tags = series_detail['series_tags']
            instance_tags = series_detail['instance_tags']
            
            # Extract DICOM fields
            operators_name = instance_tags.get('OperatorsName', '') or series_tags.get('OperatorsName', '')
            modality = series_tags.get('Modality', 'CR')
            body_part = instance_tags.get('BodyPartExamined', '') or series_tags.get('BodyPartExamined', '')
            
            # Parse AcquisitionDeviceProcessingDescription for exam type and position
            acquisition_desc = instance_tags.get('AcquisitionDeviceProcessingDescription', '') or series_tags.get('AcquisitionDeviceProcessingDescription', '')
            series_description = series_tags.get('SeriesDescription', '')
            
            # Try to extract exam type and position from acquisition description
            exam_type = ''
            position = ''
            
            if acquisition_desc:
                # Split by comma and parse (e.g., "SKULL,LAT" -> exam_type="SKULL", position="LAT")
                parts = [part.strip() for part in acquisition_desc.split(',')]
                if len(parts) >= 1:
                    exam_type = parts[0]
                if len(parts) >= 2:
                    position = parts[1]
            elif series_description:
                # Fallback to series description
                exam_type = series_description
            
            # If no exam type found, use body part
            if not exam_type and body_part:
                exam_type = body_part
            
            # Fallback exam type
            if not exam_type:
                exam_type = 'General Radiography'
            
            # Parse radiographer name (format: "LAST^FIRST^MIDDLE")
            radiographer_name = ''
            if operators_name:
                name_parts = operators_name.split('^')
                if len(name_parts) >= 2:
                    radiographer_name = f"{name_parts[1]} {name_parts[0]}".strip()
                elif len(name_parts) == 1:
                    radiographer_name = name_parts[0].strip()
            
            return {
                'exam_type': exam_type,
                'position': position,
                'modality': modality,
                'body_part': body_part,
                'radiographer_name': radiographer_name,
                'instance_count': series_detail['instance_count']
            }

        with transaction.atomic():
            # Prepare DICOM metadata for shared functions
            file_metadata = {
                'patient_name': patient_name,
                'patient_id': patient_id,
                'patient_sex': patient_sex,
                'patient_birth_date': patient_birth_date,
                'study_instance_uid': study_uid,
                'study_date': study_date,
                'study_description': study_description,
                'referring_physician': referring_physician,
                'accession_number': accession_number,
                'requesting_service': '',  # Not available in PACS import
                'modality': modality
            }
            
            # Find or create patient using shared function
            if create_patient:
                patient = find_or_create_patient(file_metadata)
            else:
                return Response({
                    'error': 'Patient creation disabled'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create registration (Daftar) using shared function
            daftar = create_daftar_for_study(
                patient, 
                file_metadata, 
                registration_data={'referring_physician': referring_physician or 'PACS Import'},
                user=request.user
            )
            
            # Create examinations for each series
            created_examinations = []
            
            for series_detail in series_details:
                exam_details = parse_examination_details(series_detail)
                
                # Prepare series-specific metadata for shared functions
                series_metadata = {
                    **file_metadata,  # Copy base metadata
                    'modality': exam_details['modality'],
                    'body_part_examined': exam_details['body_part'],
                    'acquisition_device_processing_description': f"{exam_details['exam_type']},{exam_details['position']}" if exam_details['position'] else exam_details['exam_type'],
                    'operators_name': exam_details['radiographer_name'],
                    'patient_position': exam_details['position'],
                    'laterality': '',  # Not available in PACS import
                    'series_description': exam_details['exam_type']
                }
                
                # Create examination using shared function
                pemeriksaan = create_pemeriksaan_from_dicom(
                    daftar, 
                    series_metadata, 
                    user=request.user
                )
                
                # Update examination with series-specific info
                pemeriksaan.catatan = f"Series: {series_detail['series_id']}, Images: {exam_details['instance_count']}"
                pemeriksaan.save()
                
                created_examinations.append(pemeriksaan)
            
            # Link to PACS study for the first examination (main reference)
            if created_examinations:
                try:
                    from exam.models import PacsExam
                    PacsExam.objects.create(
                        exam=created_examinations[0],  # OneToOneField to first Pemeriksaan
                        orthanc_id=study_data.get('ID', ''),  # Orthanc internal ID
                        study_id=study_uid,  # Study Instance UID
                        study_instance=study_uid  # Also store in study_instance field
                    )
                except ImportError:
                    # PacsExam model doesn't exist, skip this step
                    pass
        
        # Prepare examination details for response
        examination_details = []
        for pemeriksaan in created_examinations:
            examination_details.append({
                'id': pemeriksaan.id,
                'exam_type': pemeriksaan.exam.exam,
                'modality': pemeriksaan.exam.modaliti.nama,
                'body_part': pemeriksaan.exam.part.part if pemeriksaan.exam.part else None,
                'position': pemeriksaan.patient_position,
                'accession_number': pemeriksaan.accession_number,
                'radiographer': f"{pemeriksaan.jxr.first_name} {pemeriksaan.jxr.last_name}".strip() if pemeriksaan.jxr else None
            })
        
        return Response({
            'message': 'Legacy study imported successfully',
            'studyInstanceUid': study_uid,
            'registrationId': daftar.id,
            'examinationCount': len(created_examinations),
            'examinations': examination_details,
            'patientName': patient_name,
            'accessionNumber': accession_number,
            'success': True
        }, status=status.HTTP_201_CREATED)
        
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        import traceback
        return Response({
            'error': f'Server error: {str(e)}',
            'traceback': traceback.format_exc()
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DicomImageProxyView(APIView):
    """
    Proxy for DICOM images from Orthanc to avoid CORS issues
    Serves DICOM images through Django backend
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, study_uid, series_uid, instance_uid):
        """
        Proxy DICOM image requests to Orthanc
        
        URL format: /api/pacs/dicom-web/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}
        """
        try:
            # Get Orthanc URL from configuration
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            orthanc_url = pacs_config.orthancurl
            
            # Build the Orthanc DICOM-web URL
            orthanc_dicom_url = f"{orthanc_url}/dicom-web/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}"
            
            # Forward the request to Orthanc
            orthanc_response = requests.get(orthanc_dicom_url, stream=True, timeout=30)
            
            if not orthanc_response.ok:
                return Response({
                    'error': f'Failed to fetch DICOM image: {orthanc_response.status_code}'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Create streaming response with the same content type
            response = StreamingHttpResponse(
                orthanc_response.iter_content(chunk_size=8192),
                content_type=orthanc_response.headers.get('Content-Type', 'application/dicom')
            )
            
            # Copy relevant headers
            for header in ['Content-Length', 'Content-Disposition']:
                if header in orthanc_response.headers:
                    response[header] = orthanc_response.headers[header]
            
            # Add CORS headers to allow frontend access
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
            
            return response
            
        except requests.exceptions.RequestException as e:
            return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dicom_instance_proxy(request, orthanc_id):
    """
    Proxy for individual DICOM instances by Orthanc ID with improved reliability
    
    URL format: /api/pacs/instances/{orthanc_id}/file
    """
    import time
    
    max_retries = 3
    retry_delay = 1.0  # seconds
    
    for attempt in range(max_retries):
        try:
            # Get Orthanc URL from configuration
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            orthanc_url = pacs_config.orthancurl
            
            # Build the Orthanc instance file URL
            orthanc_instance_url = f"{orthanc_url}/instances/{orthanc_id}/file"
            
            # Debug logging
            print(f"DEBUG: Attempting to fetch DICOM instance")
            print(f"  - Orthanc URL: {orthanc_url}")
            print(f"  - Instance ID: {orthanc_id}")
            print(f"  - Full URL: {orthanc_instance_url}")
            print(f"  - Attempt: {attempt + 1}/{max_retries}")
            
            # Configure session with improved settings for remote servers
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'RIS-DICOM-Proxy/1.0',
                'Accept': 'application/dicom, */*',
                'Connection': 'keep-alive'
            })
            
            # First, verify the instance exists and get content length
            head_response = session.head(orthanc_instance_url, timeout=15)
            print(f"DEBUG: HEAD response status: {head_response.status_code}")
            if not head_response.ok:
                # If 404, let's check if the instance exists at all
                if head_response.status_code == 404:
                    try:
                        # Check if instance exists without /file suffix
                        instance_info_url = f"{orthanc_url}/instances/{orthanc_id}"
                        info_response = session.get(instance_info_url, timeout=10)
                        print(f"DEBUG: Instance info check status: {info_response.status_code}")
                        
                        if info_response.status_code == 404:
                            print(f"DEBUG: Instance {orthanc_id} does not exist on Orthanc server")
                            # Let's also check if Orthanc server is reachable
                            system_response = session.get(f"{orthanc_url}/system", timeout=5)
                            print(f"DEBUG: Orthanc system check status: {system_response.status_code}")
                            if system_response.ok:
                                print("DEBUG: Orthanc server is reachable but instance not found")
                            else:
                                print("DEBUG: Orthanc server is not reachable")
                        else:
                            print(f"DEBUG: Instance exists but /file endpoint failed")
                            if info_response.ok:
                                instance_data = info_response.json()
                                print(f"DEBUG: Instance info: {instance_data.get('MainDicomTags', {})}")
                                
                    except Exception as check_error:
                        print(f"DEBUG: Error checking instance existence: {check_error}")
                
                if attempt < max_retries - 1:
                    print(f"HEAD request failed (attempt {attempt + 1}/{max_retries}): {head_response.status_code}")
                    time.sleep(retry_delay)
                    continue
                return Response({
                    'error': f'DICOM instance not found: {head_response.status_code}'
                }, status=status.HTTP_404_NOT_FOUND)
            
            expected_length = head_response.headers.get('Content-Length')
            if expected_length:
                expected_length = int(expected_length)
                # Basic sanity check - DICOM files should be at least 1KB
                if expected_length < 1024:
                    return Response({
                        'error': f'Invalid DICOM file size: {expected_length} bytes'
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Now fetch the actual content with streaming
            orthanc_response = session.get(
                orthanc_instance_url, 
                stream=True, 
                timeout=(15, 60)  # (connect timeout, read timeout)
            )
            
            if not orthanc_response.ok:
                if attempt < max_retries - 1:
                    print(f"GET request failed (attempt {attempt + 1}/{max_retries}): {orthanc_response.status_code}")
                    time.sleep(retry_delay)
                    continue
                return Response({
                    'error': f'Failed to fetch DICOM instance: {orthanc_response.status_code}'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Validate content type
            content_type = orthanc_response.headers.get('Content-Type', '')
            if content_type and 'dicom' not in content_type.lower() and 'octet-stream' not in content_type.lower():
                print(f"Warning: Unexpected content type: {content_type}")
            
            # Create a generator that validates data integrity
            def validated_content_generator():
                bytes_received = 0
                try:
                    for chunk in orthanc_response.iter_content(chunk_size=16384):  # Larger chunks for remote servers
                        if chunk:  # Filter out keep-alive chunks
                            bytes_received += len(chunk)
                            yield chunk
                    
                    # Validate total size if we know the expected length
                    if expected_length and bytes_received != expected_length:
                        print(f"Warning: Size mismatch - expected {expected_length}, got {bytes_received}")
                        
                except Exception as e:
                    print(f"Error during streaming: {e}")
                    raise
            
            # Create streaming response
            response = StreamingHttpResponse(
                validated_content_generator(),
                content_type='application/dicom'
            )
            
            # Copy relevant headers
            for header in ['Content-Length', 'Content-Disposition', 'Last-Modified', 'ETag']:
                if header in orthanc_response.headers:
                    response[header] = orthanc_response.headers[header]
            
            # Add CORS headers
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
            
            # Add cache control for better performance
            response['Cache-Control'] = 'public, max-age=3600'  # Cache for 1 hour
            
            return response
            
        except requests.exceptions.Timeout as e:
            if attempt < max_retries - 1:
                print(f"Timeout error (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                continue
            return Response({'error': f'Request timeout: {str(e)}'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
            
        except requests.exceptions.ConnectionError as e:
            if attempt < max_retries - 1:
                print(f"Connection error (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay * (attempt + 1))
                continue
            return Response({'error': f'Connection error: {str(e)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                print(f"Request error (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay)
                continue
            return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        except Exception as e:
            print(f"Unexpected error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # If we get here, all retries failed
    return Response({'error': 'Failed to fetch DICOM data after multiple retries'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dicom_instance_dicomweb_proxy(request, orthanc_id):
    """
    Alternative proxy for DICOM instances when /file endpoint is broken
    Uses multiple fallback strategies to access DICOM data
    
    URL format: /api/pacs/instances/{orthanc_id}/dicomweb
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        print(f"DEBUG: Using alternative proxy for instance {orthanc_id}")
        
        # Strategy 1: Try DICOMweb endpoint like OHIF (works with PostgreSQL storage)
        try:
            print(f"DEBUG: Getting instance metadata for DICOMweb URL construction")
            instance_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}", timeout=10)
            if instance_response.ok:
                instance_data = instance_response.json()
                parent_series = instance_data.get('ParentSeries')
                
                if parent_series:
                    # Get series metadata
                    series_response = requests.get(f"{orthanc_url}/series/{parent_series}", timeout=10)
                    if series_response.ok:
                        series_data = series_response.json()
                        parent_study = series_data.get('ParentStudy')
                        
                        if parent_study:
                            # Get study metadata
                            study_response = requests.get(f"{orthanc_url}/studies/{parent_study}", timeout=10)
                            if study_response.ok:
                                study_data = study_response.json()
                                
                                # Extract UIDs for DICOMweb URL
                                study_uid = study_data.get('MainDicomTags', {}).get('StudyInstanceUID')
                                series_uid = series_data.get('MainDicomTags', {}).get('SeriesInstanceUID')
                                sop_uid = instance_data.get('MainDicomTags', {}).get('SOPInstanceUID')
                                
                                if all([study_uid, series_uid, sop_uid]):
                                    # Use ONLY the DICOMweb endpoint that OHIF uses (no fallbacks that corrupt data)
                                    dicomweb_endpoints = [
                                        f"{orthanc_url}/dicom-web/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}",  # Standard DICOMweb like OHIF
                                    ]
                                    
                                    for dicomweb_url in dicomweb_endpoints:
                                        try:
                                            print(f"DEBUG: Trying DICOMweb endpoint: {dicomweb_url}")
                                            
                                            dicomweb_response = requests.get(dicomweb_url, stream=True, timeout=30)
                                            if dicomweb_response.ok:
                                                print(f"DEBUG: DICOMweb endpoint success: {dicomweb_url}")
                                                
                                                # Read more content to validate DICOM structure
                                                content_peek = b''
                                                for chunk in dicomweb_response.iter_content(chunk_size=1024):
                                                    content_peek += chunk
                                                    break
                                                
                                                # Check for DICM header at position 128
                                                has_dicm_header = len(content_peek) > 132 and content_peek[128:132] == b'DICM'
                                                content_length = len(content_peek)
                                                
                                                print(f"DEBUG: P10 format check - has DICM header: {has_dicm_header}, content length: {content_length}")
                                                
                                                if has_dicm_header and content_length > 256:
                                                    print(f"DEBUG: Valid P10 format with sufficient content, using this endpoint")
                                                    
                                                    # Get fresh response with proper headers for DICOM streaming
                                                    session = requests.Session()
                                                    session.headers.update({
                                                        'Accept': 'application/dicom',
                                                        'Accept-Encoding': 'identity',  # Disable compression
                                                        'User-Agent': 'RIS-DICOM-Viewer/1.0'
                                                    })
                                                    
                                                    fresh_response = session.get(dicomweb_url, stream=True, timeout=60)
                                                    
                                                    if fresh_response.ok:
                                                        response = StreamingHttpResponse(
                                                            fresh_response.iter_content(chunk_size=32768),  # Larger chunks
                                                            content_type='application/dicom'
                                                        )
                                                        
                                                        # Set proper DICOM headers
                                                        response['Content-Type'] = 'application/dicom'
                                                        response['Accept-Ranges'] = 'bytes'
                                                        
                                                        # Copy content length if available
                                                        if 'Content-Length' in fresh_response.headers:
                                                            response['Content-Length'] = fresh_response.headers['Content-Length']
                                                        
                                                        # Add CORS headers
                                                        response['Access-Control-Allow-Origin'] = '*'
                                                        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                                                        response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, Range'
                                                        response['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges'
                                                        
                                                        return response
                                                    else:
                                                        print(f"DEBUG: Fresh request failed: {fresh_response.status_code}")
                                                else:
                                                    print(f"DEBUG: Raw DICOM data without P10 header, trying next endpoint")
                                            else:
                                                print(f"DEBUG: DICOMweb endpoint failed: {dicomweb_url} - {dicomweb_response.status_code}")
                                        except Exception as endpoint_error:
                                            print(f"DEBUG: DICOMweb endpoint error: {dicomweb_url} - {endpoint_error}")
                                            continue
        except Exception as e:
            print(f"DEBUG: DICOMweb strategy failed: {e}")
            
        # Strategy 2: Try direct /file endpoint (in case it sometimes works)
        file_url = f"{orthanc_url}/instances/{orthanc_id}/file"
        try:
            file_response = requests.get(file_url, stream=True, timeout=10)
            if file_response.ok:
                print(f"DEBUG: /file endpoint worked unexpectedly")
                response = StreamingHttpResponse(
                    file_response.iter_content(chunk_size=16384),
                    content_type='application/dicom'
                )
                
                # Copy headers
                for header in ['Content-Length', 'Content-Type']:
                    if header in file_response.headers:
                        response[header] = file_response.headers[header]
                
                # Add CORS headers
                response['Access-Control-Allow-Origin'] = '*'
                response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
                
                return response
        except Exception as e:
            print(f"DEBUG: /file endpoint failed as expected: {e}")
        
        # Strategy 3: Try direct attachment access (might have P10 format)
        try:
            print(f"DEBUG: Trying direct attachment for P10 format")
            attachment_url = f"{orthanc_url}/instances/{orthanc_id}/attachments/1/data"
            attachment_response = requests.get(attachment_url, stream=True, timeout=30)
            if attachment_response.ok:
                print(f"DEBUG: Attachment endpoint success")
                
                # Check for P10 format with more validation
                content_peek = b''
                for chunk in attachment_response.iter_content(chunk_size=1024):
                    content_peek += chunk
                    break
                
                has_dicm_header = len(content_peek) > 132 and content_peek[128:132] == b'DICM'
                content_length = len(content_peek)
                print(f"DEBUG: Attachment P10 check - has DICM header: {has_dicm_header}, content length: {content_length}")
                
                if has_dicm_header and content_length > 256:
                    print(f"DEBUG: Attachment has proper P10 format with sufficient content")
                    
                    # Get fresh response with proper headers
                    session = requests.Session()
                    session.headers.update({
                        'Accept': 'application/dicom',
                        'Accept-Encoding': 'identity',  # Disable compression
                        'User-Agent': 'RIS-DICOM-Viewer/1.0'
                    })
                    
                    fresh_attachment_response = session.get(attachment_url, stream=True, timeout=60)
                    
                    if fresh_attachment_response.ok:
                        response = StreamingHttpResponse(
                            fresh_attachment_response.iter_content(chunk_size=32768),  # Larger chunks
                            content_type='application/dicom'
                        )
                        
                        # Set proper DICOM headers
                        response['Content-Type'] = 'application/dicom'
                        response['Accept-Ranges'] = 'bytes'
                        
                        # Copy content length if available
                        if 'Content-Length' in fresh_attachment_response.headers:
                            response['Content-Length'] = fresh_attachment_response.headers['Content-Length']
                        
                        # Enhanced CORS headers
                        response['Access-Control-Allow-Origin'] = '*'
                        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                        response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, Range'
                        response['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges'
                        
                        return response
                    else:
                        print(f"DEBUG: Fresh attachment request failed: {fresh_attachment_response.status_code}")
        except Exception as e:
            print(f"DEBUG: Attachment strategy failed: {e}")
            
        # Strategy 4: Try other Orthanc endpoints
        # These might work but may not have P10 format
        stone_endpoints = [
            f"{orthanc_url}/instances/{orthanc_id}/content",  # Raw DICOM content
            f"{orthanc_url}/instances/{orthanc_id}/preview",   # PNG preview
            f"{orthanc_url}/web-viewer/instances/{orthanc_id}", # Web viewer endpoint
        ]
        
        for endpoint_url in stone_endpoints:
            try:
                print(f"DEBUG: Trying Stone Web Viewer endpoint: {endpoint_url}")
                stone_response = requests.get(endpoint_url, stream=True, timeout=10)
                if stone_response.ok:
                    print(f"DEBUG: Success with Stone endpoint: {endpoint_url}")
                    
                    # Determine content type
                    content_type = stone_response.headers.get('Content-Type', 'application/dicom')
                    if 'preview' in endpoint_url:
                        content_type = 'image/png'
                    
                    response = StreamingHttpResponse(
                        stone_response.iter_content(chunk_size=16384),
                        content_type=content_type
                    )
                    
                    # Copy headers
                    for header in ['Content-Length', 'Content-Type']:
                        if header in stone_response.headers:
                            response[header] = stone_response.headers[header]
                    
                    # Add CORS headers
                    response['Access-Control-Allow-Origin'] = '*'
                    response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                    response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
                    
                    return response
            except Exception as e:
                print(f"DEBUG: Stone endpoint failed {endpoint_url}: {e}")
                continue
        
        # Strategy 3: Try reconstructed DICOM from tags (last resort)
        try:
            print(f"DEBUG: Attempting to reconstruct DICOM data from metadata")
            
            # Get full instance metadata
            tags_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}/tags", timeout=10)
            if tags_response.ok:
                # For now, return error with detailed info about what endpoints are available
                return Response({
                    'error': 'DICOM file endpoints are not accessible',
                    'debug_info': {
                        'orthanc_instance_id': orthanc_id,
                        'file_endpoint_status': 'not_accessible',
                        'preview_endpoint_status': 'not_accessible',
                        'tags_accessible': True,
                        'recommendation': 'Check Orthanc storage configuration or use Stone Web Viewer directly'
                    }
                }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            print(f"DEBUG: Metadata reconstruction failed: {e}")
        
        # All strategies failed
        return Response({
            'error': f'All DICOM access methods failed for instance {orthanc_id}',
            'debug_info': {
                'orthanc_instance_id': orthanc_id,
                'file_endpoint': 'failed',
                'preview_endpoint': 'failed',
                'metadata_reconstruction': 'failed'
            }
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        print(f"DEBUG: Alternative proxy error: {e}")
        return Response({'error': f'Alternative proxy error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dicom_instance_raw_proxy(request, orthanc_id):
    """
    Alternative proxy for DICOM instances when /file endpoint is broken
    Uses Orthanc's /content endpoint as fallback
    
    URL format: /api/pacs/instances/{orthanc_id}/raw
    """
    import time
    
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        print(f"DEBUG: Using raw proxy for instance {orthanc_id}")
        
        # Try multiple Orthanc endpoints in order of preference
        endpoints_to_try = [
            f"{orthanc_url}/instances/{orthanc_id}/file",  # Standard endpoint
            f"{orthanc_url}/instances/{orthanc_id}/content",  # Alternative endpoint  
            f"{orthanc_url}/instances/{orthanc_id}"  # Raw instance data
        ]
        
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'RIS-DICOM-Proxy/1.0',
            'Accept': 'application/dicom, application/octet-stream, */*',
            'Connection': 'keep-alive'
        })
        
        for i, endpoint_url in enumerate(endpoints_to_try):
            try:
                print(f"DEBUG: Trying endpoint {i+1}: {endpoint_url}")
                
                orthanc_response = session.get(
                    endpoint_url, 
                    stream=True, 
                    timeout=(15, 60)
                )
                
                if orthanc_response.ok:
                    print(f"DEBUG: Success with endpoint {i+1}")
                    
                    # Validate response has data
                    content_length = orthanc_response.headers.get('Content-Length', 0)
                    if content_length and int(content_length) < 1024:
                        print(f"DEBUG: Response too small ({content_length} bytes), trying next endpoint")
                        continue
                    
                    # Create streaming response
                    response = StreamingHttpResponse(
                        orthanc_response.iter_content(chunk_size=16384),
                        content_type='application/dicom'
                    )
                    
                    # Copy relevant headers
                    for header in ['Content-Length', 'Content-Disposition', 'Last-Modified']:
                        if header in orthanc_response.headers:
                            response[header] = orthanc_response.headers[header]
                    
                    # Add CORS headers
                    response['Access-Control-Allow-Origin'] = '*'
                    response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                    response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
                    response['Cache-Control'] = 'public, max-age=3600'
                    
                    return response
                else:
                    print(f"DEBUG: Endpoint {i+1} failed: {orthanc_response.status_code}")
                    
            except Exception as e:
                print(f"DEBUG: Error with endpoint {i+1}: {e}")
                continue
        
        # All endpoints failed
        return Response({
            'error': 'All DICOM endpoints failed - this indicates a storage issue on the Orthanc server'
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        return Response({'error': f'Raw proxy error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_study_image_ids(request, study_uid):
    """
    Get DICOM image IDs for a study using Django proxy URLs
    
    URL format: /api/pacs/studies/{study_uid}/image-ids/
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Step 1: Find the Orthanc internal ID for the study
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={
                'Level': 'Study',
                'Query': {
                    'StudyInstanceUID': study_uid,
                },
                'Expand': True,
            },
            timeout=30
        )
        
        if not find_response.ok:
            return Response({
                'error': f'Failed to find study {study_uid}. Status: {find_response.status_code}'
            }, status=status.HTTP_404_NOT_FOUND)
        
        find_result = find_response.json()
        
        if not find_result or len(find_result) == 0:
            return Response({'error': f'Study not found: {study_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        study_data = find_result[0]
        image_ids = []
        series_info = []
        
        # Step 2: Build image IDs using Django proxy URLs
        for series_id in study_data.get('Series', []):
            series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=30)
            
            if not series_response.ok:
                print(f"DEBUG: Failed to fetch series {series_id}: {series_response.status_code}")
                continue
                
            series_data = series_response.json()
            series_instance_uid = series_data.get('MainDicomTags', {}).get('SeriesInstanceUID')
            series_description = series_data.get('MainDicomTags', {}).get('SeriesDescription', 'Unknown')
            
            if not series_instance_uid:
                print(f"DEBUG: No SeriesInstanceUID for series {series_id}")
                continue
            
            series_instances = series_data.get('Instances', [])
            print(f"DEBUG: Series {series_id} ({series_description}) has {len(series_instances)} instances")
            
            series_image_ids = []
            for instance_id in series_instances:
                instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}", timeout=30)
                
                if not instance_response.ok:
                    print(f"DEBUG: Failed to fetch instance {instance_id}: {instance_response.status_code}")
                    continue
                    
                instance_data = instance_response.json()
                sop_instance_uid = instance_data.get('MainDicomTags', {}).get('SOPInstanceUID')
                
                if series_instance_uid and sop_instance_uid:
                    # Use Django proxy URL for direct instance file access
                    api_url = request.build_absolute_uri('/').rstrip('/')  # Get base URL
                    image_id = f"wadouri:{api_url}/api/pacs/instances/{instance_id}/file"
                    
                    # Skip instance verification since it's broken with PostgreSQL storage
                    # Try both /file and DICOMweb approaches like OHIF
                    print(f"DEBUG: Adding instance {instance_id} with fallback strategy (PostgreSQL storage compatible)")
                    
                    # OHIF-style first: Try DICOMweb endpoint as PRIMARY method  
                    print(f"DEBUG: Using OHIF-style DICOMweb as primary for instance {instance_id}")
                    # WADO-RS format: wadors:frames_url (this is what OHIF actually uses)
                    # The frames endpoint should return the actual DICOM pixel data
                    dicomweb_image_id = f"wadors:{api_url}/api/pacs/instances/{instance_id}/frames/1"
                    image_ids.append(dicomweb_image_id)
                    series_image_ids.append(dicomweb_image_id)
                    print(f"DEBUG: Added primary DICOMweb frames endpoint for instance {instance_id} (OHIF-style)")
                    
                    # Note: We prioritize DICOMweb since OHIF proves it works reliably
                    # Fallback to /file endpoint happens inside the dicomweb proxy if needed
                    
                    # Note: We don't verify if DICOMweb works here because OHIF proves it works
                    # The actual verification happens when the image is loaded in the viewer
                else:
                    print(f"DEBUG: Missing UIDs for instance {instance_id}: series={series_instance_uid}, sop={sop_instance_uid}")
            
            series_info.append({
                'seriesId': series_id,
                'seriesInstanceUID': series_instance_uid,
                'seriesDescription': series_description,
                'instanceCount': len(series_image_ids)
            })
        
        print(f"DEBUG: Total image IDs generated: {len(image_ids)}")
        print(f"DEBUG: Series breakdown: {series_info}")
        
        # If no images found, this might be due to Orthanc database inconsistency
        if len(image_ids) == 0:
            print("DEBUG: No valid images found - checking for Orthanc database issues")
            
            # Test if this is a systemic instance access problem
            test_instance_response = requests.post(
                f"{orthanc_url}/tools/find",
                headers={'Content-Type': 'application/json'},
                json={'Level': 'Instance', 'Query': {}, 'Limit': 1},
                timeout=10
            )
            
            systemic_instance_issue = False
            if test_instance_response.ok:
                test_instances = test_instance_response.json()
                if test_instances:
                    test_instance_id = test_instances[0]
                    # Test if we can access instance metadata at all
                    test_instance_meta = requests.head(f"{orthanc_url}/instances/{test_instance_id}", timeout=5)
                    if not test_instance_meta.ok:
                        systemic_instance_issue = True
                        print("DEBUG: Systemic Orthanc instance access issue detected - database inconsistency")
            
            if systemic_instance_issue:
                return Response({
                    'imageIds': [],
                    'total': 0,
                    'success': True,
                    'warning': 'Orthanc server has database inconsistency issues. Instance records are not accessible despite being listed in studies. However, you can still view this study using Stone Web Viewer directly.',
                    'series_info': series_info,
                    'debug_info': {
                        'study_exists': True,
                        'series_count': len(series_info),
                        'systemic_instance_issue': True,
                        'database_inconsistency': True,
                        'stone_web_viewer_url': f"http://192.168.20.172:8042/stone-webviewer/index.html?study={study_uid}",
                        'recommendation': 'Use Stone Web Viewer for now. Contact system administrator to repair Orthanc database for full RIS integration.'
                    }
                })
            else:
                return Response({
                    'imageIds': [],
                    'total': 0,
                    'success': True,
                    'warning': 'No accessible DICOM instances found. This study may have stale metadata or deleted instances.',
                    'series_info': series_info,
                    'debug_info': {
                        'study_exists': True,
                        'series_count': len(series_info),
                        'instance_verification_failed': True
                    }
                })
        
        if len(image_ids) > 2:
            print(f"DEBUG: Multi-image series detected - {len(image_ids)} total images")
            print(f"DEBUG: First 3 image IDs: {image_ids[:3]}")
            print(f"DEBUG: Last 3 image IDs: {image_ids[-3:]}")
        
        return Response({
            'imageIds': image_ids,
            'total': len(image_ids),
            'success': True
        })
        
    except requests.exceptions.RequestException as e:
        error_msg = f'Network error: {str(e)}'
        print(f"DEBUG: {error_msg}")
        return Response({'error': error_msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        error_msg = f'Server error: {str(e)}'
        print(f"DEBUG: {error_msg}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return Response({'error': error_msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_enhanced_study_metadata(request, study_uid):
    """
    Get enhanced DICOM metadata with detailed series and instance information
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Find the study
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={
                'Level': 'Study',
                'Query': {'StudyInstanceUID': study_uid},
                'Expand': True,
            },
            timeout=30
        )
        
        if not find_response.ok or not find_response.json():
            return Response({'error': f'Study not found: {study_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        study_data = find_response.json()[0]
        
        # Get detailed series information
        series_details = []
        for series_id in study_data.get('Series', []):
            try:
                series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=30)
                if series_response.ok:
                    series_data = series_response.json()
                    series_tags = series_data.get('MainDicomTags', {})
                    
                    # Get first instance for additional metadata
                    instances = series_data.get('Instances', [])
                    instance_tags = {}
                    if instances:
                        instance_response = requests.get(f"{orthanc_url}/instances/{instances[0]}", timeout=30)
                        if instance_response.ok:
                            instance_data = instance_response.json()
                            instance_tags = instance_data.get('MainDicomTags', {})
                    
                    # Parse examination details
                    operators_name = instance_tags.get('OperatorsName', '') or series_tags.get('OperatorsName', '')
                    modality = series_tags.get('Modality', 'CR')
                    body_part = instance_tags.get('BodyPartExamined', '') or series_tags.get('BodyPartExamined', '')
                    
                    # Parse AcquisitionDeviceProcessingDescription
                    acquisition_desc = instance_tags.get('AcquisitionDeviceProcessingDescription', '') or series_tags.get('AcquisitionDeviceProcessingDescription', '')
                    series_description = series_tags.get('SeriesDescription', '')
                    
                    # Extract exam type and position
                    exam_type = ''
                    position = ''
                    
                    if acquisition_desc:
                        parts = [part.strip() for part in acquisition_desc.split(',')]
                        if len(parts) >= 1:
                            exam_type = parts[0]
                        if len(parts) >= 2:
                            position = parts[1]
                    elif series_description:
                        exam_type = series_description
                    
                    if not exam_type and body_part:
                        exam_type = body_part
                    
                    if not exam_type:
                        exam_type = 'General Radiography'
                    
                    # Parse radiographer name
                    radiographer_name = ''
                    if operators_name:
                        name_parts = operators_name.split('^')
                        if len(name_parts) >= 2:
                            radiographer_name = f"{name_parts[1]} {name_parts[0]}".strip()
                        elif len(name_parts) == 1:
                            radiographer_name = name_parts[0].strip()
                    
                    series_details.append({
                        'series_id': series_id,
                        'exam_type': exam_type,
                        'position': position,
                        'modality': modality,
                        'body_part': body_part,
                        'radiographer_name': radiographer_name,
                        'instance_count': len(instances),
                        'series_description': series_description,
                        'acquisition_description': acquisition_desc
                    })
            except Exception as e:
                print(f"Error processing series {series_id}: {e}")
                continue
        
        return Response({
            'study_uid': study_uid,
            'series': series_details,
            'total_series': len(series_details),
            'success': True
        })
        
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_study_series_metadata(request, study_uid):
    """
    Get DICOM series metadata for CT scan bulk retrieval
    
    URL format: /api/pacs/studies/{study_uid}/series/
    Returns series information with first frame URLs for thumbnails
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Find the study
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={
                'Level': 'Study',
                'Query': {'StudyInstanceUID': study_uid},
                'Expand': True,
            },
            timeout=30
        )
        
        if not find_response.ok or not find_response.json():
            return Response({'error': f'Study not found: {study_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        study_data = find_response.json()[0]
        
        # Process each series
        series_metadata = []
        
        for series_id in study_data.get('Series', []):
            try:
                # Get series details
                series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=30)
                if not series_response.ok:
                    continue
                    
                series_data = series_response.json()
                series_tags = series_data.get('MainDicomTags', {})
                instances = series_data.get('Instances', [])
                
                if not instances:
                    continue
                
                # Get first instance for thumbnail
                first_instance_id = instances[0]
                
                # Build API URL for first frame
                api_url = request.build_absolute_uri('/').rstrip('/')
                first_frame_url = f"{api_url}/api/pacs/instances/{first_instance_id}/frames/1"
                
                # Extract series metadata
                series_info = {
                    'seriesId': series_id,
                    'seriesUid': series_tags.get('SeriesInstanceUID', ''),
                    'seriesNumber': int(series_tags.get('SeriesNumber', 0)) if series_tags.get('SeriesNumber') else 0,
                    'seriesDescription': series_tags.get('SeriesDescription', f'Series {series_tags.get("SeriesNumber", "Unknown")}'),
                    'modality': series_tags.get('Modality', 'OT'),
                    'imageCount': len(instances),
                    'firstImageUrl': first_frame_url,
                    'instances': [
                        {
                            'instanceId': instance_id,
                            'frameUrl': f"{api_url}/api/pacs/instances/{instance_id}/frames/1"
                        } for instance_id in instances
                    ]
                }
                
                series_metadata.append(series_info)
                
            except Exception as e:
                print(f"Error processing series {series_id}: {e}")
                continue
        
        # Sort series by series number
        series_metadata.sort(key=lambda x: x['seriesNumber'])
        
        return Response({
            'studyUid': study_uid,
            'series': series_metadata,
            'totalSeries': len(series_metadata),
            'success': True
        })
        
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_series_bulk_images(request, study_uid, series_uid):
    """
    Get bulk image URLs for a series with pagination
    
    URL format: /api/pacs/studies/{study_uid}/series/{series_uid}/images/bulk?start=0&count=50
    """
    try:
        # Get pagination parameters
        start = int(request.GET.get('start', 0))
        count = int(request.GET.get('count', 50))
        
        # Get Orthanc URL from configuration (with caching)
        from django.core.cache import cache
        
        orthanc_url = cache.get('orthanc_url')
        if not orthanc_url:
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            orthanc_url = pacs_config.orthancurl
            cache.set('orthanc_url', orthanc_url, 300)  # Cache for 5 minutes
        
        # Find the series
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={
                'Level': 'Series',
                'Query': {'SeriesInstanceUID': series_uid},
                'Expand': True,
            },
            timeout=30
        )
        
        if not find_response.ok or not find_response.json():
            return Response({'error': f'Series not found: {series_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        series_data = find_response.json()[0]
        instances = series_data.get('Instances', [])
        
        if not instances:
            return Response({'error': f'No instances found in series: {series_uid}'}, status=status.HTTP_404_NOT_FOUND)
        
        # Efficiently get instance details using bulk operations
        instance_details = []
        
        # Use concurrent requests to get instance metadata
        import concurrent.futures
        import threading
        
        def fetch_instance_metadata(instance_id):
            try:
                instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}", timeout=5)
                if instance_response.ok:
                    instance_data = instance_response.json()
                    instance_tags = instance_data.get('MainDicomTags', {})
                    instance_number = int(instance_tags.get('InstanceNumber', 0)) if instance_tags.get('InstanceNumber') else 0
                    
                    return {
                        'instanceId': instance_id,
                        'instanceNumber': instance_number,
                        'sopInstanceUid': instance_tags.get('SOPInstanceUID', '')
                    }
            except:
                pass
            
            # Return basic info if fetch fails
            return {
                'instanceId': instance_id,
                'instanceNumber': 0,
                'sopInstanceUid': ''
            }
        
        # Fetch metadata concurrently with max 10 workers to avoid overwhelming Orthanc
        max_workers = min(10, len(instances))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            instance_details = list(executor.map(fetch_instance_metadata, instances))
        
        # Sort by instance number
        instance_details.sort(key=lambda x: x['instanceNumber'])
        
        # Apply pagination
        total_images = len(instance_details)
        end = min(start + count, total_images)
        paginated_instances = instance_details[start:end]
        
        # Build image URLs
        api_url = request.build_absolute_uri('/').rstrip('/')
        images = []
        
        for i, instance in enumerate(paginated_instances):
            images.append({
                'imageNumber': start + i + 1,
                'imageUrl': f"{api_url}/api/pacs/instances/{instance['instanceId']}/frames/1",
                'instanceUid': instance['sopInstanceUid'],
                'frameNumber': 1,
                'orthancId': instance['instanceId']
            })
        
        return Response({
            'images': images,
            'totalImages': total_images,
            'hasMore': end < total_images,
            'start': start,
            'count': len(images),
            'success': True
        })
        
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Network error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pacs_health_check(request):
    """
    Check PACS server connectivity and basic functionality
    
    URL format: /api/pacs/health/
    """
    import time
    
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({"error": "PACS configuration not found"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Test basic connectivity
        start_time = time.time()
        system_response = requests.get(f"{orthanc_url}/system", timeout=10)
        response_time = time.time() - start_time
        
        if not system_response.ok:
            return Response({
                "success": False,
                "error": f"Orthanc server not reachable: {system_response.status_code}",
                "orthanc_url": orthanc_url,
                "response_time_ms": round(response_time * 1000, 2)
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        system_info = system_response.json()
        
        # Test database connectivity by getting statistics
        stats_response = requests.get(f"{orthanc_url}/statistics", timeout=10)
        stats_info = stats_response.json() if stats_response.ok else None
        
        # Test a simple find operation
        find_test_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={"Content-Type": "application/json"},
            json={
                "Level": "Study",
                "Query": {},
                "Limit": 1
            },
            timeout=10
        )
        
        find_success = find_test_response.ok
        
        return Response({
            "success": True,
            "orthanc_url": orthanc_url,
            "response_time_ms": round(response_time * 1000, 2),
            "system_info": {
                "version": system_info.get("Version"),
                "name": system_info.get("Name"),
                "api_version": system_info.get("ApiVersion"),
                "database_version": system_info.get("DatabaseVersion")
            },
            "statistics": stats_info,
            "find_operation_works": find_success,
            "timestamp": time.time()
        })
        
    except requests.exceptions.Timeout:
        return Response({
            "success": False,
            "error": "Connection timeout to PACS server",
            "orthanc_url": orthanc_url if "orthanc_url" in locals() else "Unknown"
        }, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except requests.exceptions.ConnectionError:
        return Response({
            "success": False,
            "error": "Cannot connect to PACS server",
            "orthanc_url": orthanc_url if "orthanc_url" in locals() else "Unknown"
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        return Response({
            "success": False,
            "error": f"Health check failed: {str(e)}"
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

