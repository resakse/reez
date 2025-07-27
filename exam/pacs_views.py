"""
PACS Browser API Views
Provides REST API endpoints for browsing legacy DICOM studies in Orthanc PACS
"""

import requests
import json
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import PacsConfig


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
            
            # Modality search
            modality = search_params.get('modality')
            if modality and modality != 'ALL':
                query['ModalitiesInStudy'] = modality
            
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
            
            # Format results for frontend
            formatted_studies = []
            for study in orthanc_results:
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
                    'modality': study.get('MainDicomTags', {}).get('ModalitiesInStudy', '').split(',')[0] if study.get('MainDicomTags', {}).get('ModalitiesInStudy') else 'Unknown',
                    'seriesCount': len(study.get('Series', [])),
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
            # Find or create patient
            patient = None
            if create_patient and patient_id:
                # Try to find existing patient by ID or name
                from django.db import models as django_models
                patient = Pesakit.objects.filter(
                    django_models.Q(mrn=patient_id) | django_models.Q(nric=patient_id)
                ).first()
                
                if not patient:
                    # Create new patient
                    patient = Pesakit.objects.create(
                        nama=patient_name,
                        mrn=patient_id,
                        nric=patient_id if len(patient_id) == 12 else '',  # Assume NRIC if 12 digits
                        jantina='L' if patient_sex == 'M' else 'P' if patient_sex == 'F' else 'L',
                        jxr=request.user  # Required field for the user who created the record
                    )
            
            if not patient:
                return Response({
                    'error': 'Patient creation disabled or patient information insufficient'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Find or create modality
            modaliti, _ = Modaliti.objects.get_or_create(
                nama=modality,
                defaults={'singkatan': modality}
            )
            
            # Create registration (Daftar)
            daftar = Daftar.objects.create(
                tarikh=study_datetime,
                pesakit=patient,
                study_instance_uid=study_uid,
                parent_accession_number=accession_number or None,
                accession_number=accession_number or None,
                study_description=study_description,
                modality=modality,
                study_status='COMPLETED',  # Legacy studies are completed
                pemohon=referring_physician or 'Legacy Import',
                status='Completed',
                jxr=request.user
            )
            
            # Create examinations for each series
            created_examinations = []
            
            for series_detail in series_details:
                exam_details = parse_examination_details(series_detail)
                
                # Find or create modality for this series
                series_modaliti, _ = Modaliti.objects.get_or_create(
                    nama=exam_details['modality'],
                    defaults={'singkatan': exam_details['modality']}
                )
                
                # Find or create body part if specified
                part = None
                if exam_details['body_part']:
                    from exam.models import Part
                    part, _ = Part.objects.get_or_create(
                        part=exam_details['body_part'].upper()
                    )
                
                # Find or create examination type
                exam, _ = Exam.objects.get_or_create(
                    exam=exam_details['exam_type'],
                    modaliti=series_modaliti,
                    part=part,
                    defaults={'catatan': 'Imported from legacy PACS'}
                )
                
                # Map position to patient_position
                patient_position = None
                if exam_details['position']:
                    position_map = {
                        'AP': 'AP',
                        'PA': 'PA', 
                        'LAT': 'LAT',
                        'LATERAL': 'LAT',
                        'LEFT': 'LATERAL_LEFT',
                        'RIGHT': 'LATERAL_RIGHT',
                        'OBL': 'OBLIQUE',
                        'OBLIQUE': 'OBLIQUE'
                    }
                    patient_position = position_map.get(exam_details['position'].upper(), exam_details['position'])
                
                # Find or create radiographer user
                radiographer = request.user  # Default to importing user
                if exam_details['radiographer_name']:
                    try:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        # Try to find user by name parts
                        name_parts = exam_details['radiographer_name'].split()
                        if len(name_parts) >= 2:
                            radiographer = User.objects.filter(
                                first_name__icontains=name_parts[0],
                                last_name__icontains=name_parts[1]
                            ).first() or request.user
                    except:
                        pass
                
                # Create examination record (Pemeriksaan)
                pemeriksaan = Pemeriksaan.objects.create(
                    daftar=daftar,
                    exam=exam,
                    accession_number=f"{accession_number}_{len(created_examinations)+1}" if accession_number else None,
                    no_xray=f"{accession_number}_{len(created_examinations)+1}" if accession_number else None,
                    patient_position=patient_position,
                    catatan=f"Series: {series_detail['series_id']}, Images: {exam_details['instance_count']}",
                    jxr=radiographer,
                    exam_status='COMPLETED'
                )
                
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
    Proxy for individual DICOM instances by Orthanc ID
    
    URL format: /api/pacs/instances/{orthanc_id}/file
    """
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        
        # Build the Orthanc instance file URL
        orthanc_instance_url = f"{orthanc_url}/instances/{orthanc_id}/file"
        
        # Forward the request to Orthanc
        orthanc_response = requests.get(orthanc_instance_url, stream=True, timeout=30)
        
        if not orthanc_response.ok:
            return Response({
                'error': f'Failed to fetch DICOM instance: {orthanc_response.status_code}'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create streaming response
        response = StreamingHttpResponse(
            orthanc_response.iter_content(chunk_size=8192),
            content_type='application/dicom'
        )
        
        # Copy relevant headers
        for header in ['Content-Length', 'Content-Disposition']:
            if header in orthanc_response.headers:
                response[header] = orthanc_response.headers[header]
        
        # Add CORS headers
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
                    image_ids.append(image_id)
                    series_image_ids.append(image_id)
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