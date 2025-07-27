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
    try:
        study_uid = request.data.get('studyInstanceUid')
        create_patient = request.data.get('createPatient', True)
        
        if not study_uid:
            return Response({'error': 'studyInstanceUid is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # TODO: Implement actual import logic
        # This would involve:
        # 1. Fetching study metadata from Orthanc
        # 2. Creating or finding patient record in RIS
        # 3. Creating study record in RIS database
        # 4. Linking to PACS study
        
        return Response({
            'message': 'Import functionality coming soon',
            'studyInstanceUid': study_uid,
            'success': False
        }, status=status.HTTP_501_NOT_IMPLEMENTED)
        
    except Exception as e:
        return Response({'error': f'Server error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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