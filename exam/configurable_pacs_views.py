"""
Configurable PACS endpoint views based on PacsConfig.endpoint_style
"""
import requests
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse, HttpResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
import json
from .models import PacsConfig

"""
Fixed WADO-RS metadata endpoint with proper DICOM tag handling
"""
from django.http import JsonResponse, HttpResponse
import json

@csrf_exempt
def configurable_dicom_metadata(request, orthanc_id):
    """
    Get DICOM metadata in JSON format for WADO-RS
    
    URL format: /api/pacs/instances/{orthanc_id}/metadata
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response
    
    # Check authentication manually (for JWT tokens from frontend)
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return JsonResponse({'error': 'Authentication required'}, status=401)
        
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return JsonResponse({'error': 'PACS configuration not found'}, status=500)
        
        orthanc_url = pacs_config.orthancurl
        
        
        # Get metadata from Orthanc in standard DICOM tag format
        metadata_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}/tags", timeout=30)
        
        if not metadata_response.ok:
            return JsonResponse({'error': f'Failed to get metadata: {metadata_response.status_code}'}, status=500)
        
        metadata = metadata_response.json()
        
        # CRITICAL: Convert Orthanc format to proper WADO-RS format
        formatted_metadata = {}
        
        for tag, value in metadata.items():
            # Skip group length tags
            if tag.endswith(',0000'):
                continue
            
            # Properly format each tag
            formatted_tag = tag.lower().replace(',', '')
            
            if isinstance(value, dict) and 'Value' in value and 'vr' in value:
                # Already in correct WADO-RS format
                formatted_metadata[formatted_tag] = value
            elif isinstance(value, dict) and 'Type' in value and 'Value' in value:
                # Convert Orthanc format to WADO-RS
                vr = _orthanc_type_to_vr(value['Type'])
                tag_value = value['Value']
                
                # Handle special cases for numeric values
                if formatted_tag in ['00280010', '00280011', '00280100', '00280101', '00280102', '00280103', '00280002']:
                    # These should be integers
                    if isinstance(tag_value, str):
                        try:
                            tag_value = int(tag_value)
                        except:
                            pass
                # Ensure Value is always an array
                if not isinstance(tag_value, list):
                    tag_value = [tag_value]
                
                formatted_metadata[formatted_tag] = {
                    'Value': tag_value,
                    'vr': vr
                }
            elif isinstance(value, dict):
                # Handle other dict formats
                formatted_metadata[formatted_tag] = value
        
        # Get instance statistics for accurate dimensions
        stats_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}/statistics", timeout=10)
        if stats_response.ok:
            stats = stats_response.json()
            
            # Try to calculate expected dimensions from uncompressed size
            if 'UncompressedSize' in stats:
                uncompressed_size = int(stats['UncompressedSize'])
                
                # For 16-bit images (2 bytes per pixel), calculate possible dimensions
                if uncompressed_size > 0:
                    pixels = uncompressed_size // 2  # Assuming 16-bit
                    
                    # Calculate all possible dimension combinations for this pixel count
                    possible_dimensions = []
                    for width in range(100, 4000):
                        if pixels % width == 0:
                            height = pixels // width
                            if 100 <= height <= 4000:  # Reasonable range for medical images
                                possible_dimensions.append((height, width))  # (rows, cols)
                    
                    # Try common medical image dimensions first
                    common_dims = [
                        (512, 512), (256, 256), (1024, 1024), 
                        (480, 640), (640, 480), (384, 384),
                        (400, 400), (320, 320), (600, 600), (800, 600), (1024, 768)
                    ]
                    
                    for rows, cols in common_dims:
                        if rows * cols == pixels:
                            actual_rows = rows
                            actual_cols = cols
                            break
                    
                    # Store the file-size calculated dimensions for later use
                    file_size_dimensions = possible_dimensions
                    exact_file_match = None
                    for rows, cols in common_dims:
                        if rows * cols == pixels:
                            exact_file_match = (rows, cols)
                            break
                else:
                    file_size_dimensions = []
                    exact_file_match = None
        else:
            file_size_dimensions = []
            exact_file_match = None
        
        # CRITICAL: Extract actual dimensions from the metadata
        actual_rows = None
        actual_cols = None
        
        # Get instance metadata first to get reliable dimensions
        instance_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}", timeout=10)
        instance_data = {}
        if instance_response.ok:
            instance_data = instance_response.json()
            main_tags = instance_data.get('MainDicomTags', {})
            
            # First try MainDicomTags (most reliable)
            if 'Rows' in main_tags:
                try:
                    actual_rows = int(main_tags['Rows'])
                except Exception:
                    pass
            
            if 'Columns' in main_tags:
                try:
                    actual_cols = int(main_tags['Columns'])
                except Exception:
                    pass
        
        # Fallback: Try to get rows/columns from raw metadata if MainDicomTags failed
        if actual_rows is None and '0028,0010' in metadata:  # Rows
            rows_value = metadata['0028,0010'].get('Value')
            if rows_value:
                try:
                    # Handle both string and list formats
                    if isinstance(rows_value, list):
                        actual_rows = int(rows_value[0])
                    else:
                        actual_rows = int(rows_value)
                except Exception:
                    pass
        
        if actual_cols is None and '0028,0011' in metadata:  # Columns
            cols_value = metadata['0028,0011'].get('Value')
            if cols_value:
                try:
                    # Handle both string and list formats
                    if isinstance(cols_value, list):
                        actual_cols = int(cols_value[0])
                    else:
                        actual_cols = int(cols_value)
                except Exception:
                    pass
        
        
        # Store original metadata dimensions as backup
        original_rows = actual_rows
        original_cols = actual_cols
        
        # Let's also check if we can get dimensions from the DICOM file itself
        try:
            # Try to get image metadata directly from Orthanc's simplified tags
            simplified_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}/simplified-tags", timeout=10)
            if simplified_response.ok:
                simplified_tags = simplified_response.json()
                
                # Use simplified tags if our previous detection failed
                if actual_rows is None and 'Rows' in simplified_tags:
                    try:
                        actual_rows = int(simplified_tags['Rows'])
                    except:
                        pass
                        
                if actual_cols is None and 'Columns' in simplified_tags:
                    try:
                        actual_cols = int(simplified_tags['Columns'])
                    except:
                        pass
        except Exception:
            pass
        
        # CRITICAL: Use file size calculation if it provides better accuracy
        # Check if metadata dimensions don't match the actual pixel count
        USE_FILE_SIZE_CORRECTION = False  # Set to False to disable file-size correction
        
        if USE_FILE_SIZE_CORRECTION and 'file_size_dimensions' in locals() and file_size_dimensions:
            metadata_pixel_count = actual_rows * actual_cols if (actual_rows and actual_cols) else 0
            file_pixel_count = int(stats.get('UncompressedSize', 0)) // 2 if 'stats' in locals() else 0
            
            # If file size gives us exact dimensions, prefer those over metadata
            if file_pixel_count > 0 and abs(metadata_pixel_count - file_pixel_count) > 100:
                # Choose the orientation that makes most sense based on original metadata
                # Medical images are often taller than wide, so prefer the orientation that matches
                original_ratio = actual_rows / actual_cols if (actual_rows and actual_cols and actual_cols != 0) else 1
                
                best_match = None
                best_ratio_diff = float('inf')
                
                for rows, cols in file_size_dimensions:
                    new_ratio = rows / cols
                    ratio_diff = abs(original_ratio - new_ratio)
                    
                    if ratio_diff < best_ratio_diff:
                        best_ratio_diff = ratio_diff
                        best_match = (rows, cols)
                
                if best_match:
                    actual_rows, actual_cols = best_match
                else:
                    # Fallback to first option
                    actual_rows, actual_cols = file_size_dimensions[0]
        
        # Use file size calculation if metadata extraction failed completely
        elif (actual_rows is None or actual_cols is None) and 'exact_file_match' in locals() and exact_file_match:
            actual_rows, actual_cols = exact_file_match
        elif (actual_rows is None or actual_cols is None) and 'file_size_dimensions' in locals() and file_size_dimensions:
            # Use the first reasonable dimension from file size
            actual_rows, actual_cols = file_size_dimensions[0]
        
        # Use reasonable defaults if dimensions still not found
        if actual_rows is None:
            actual_rows = 512
        if actual_cols is None:
            actual_cols = 512
            
        # DISABLED PADDING ANALYSIS: Let Cornerstone handle the padding
        
        # Essential tags with proper values
        essential_tags = {
            '00080005': {'Value': ['ISO_IR 100'], 'vr': 'CS'},  # SpecificCharacterSet
            '00080016': {'Value': ['1.2.840.10008.5.1.4.1.1.2'], 'vr': 'UI'},  # SOPClassUID
            '00080018': {'Value': [instance_data.get('MainDicomTags', {}).get('SOPInstanceUID', f'1.2.3.{orthanc_id}')], 'vr': 'UI'},
            '00080020': {'Value': ['20240101'], 'vr': 'DA'},  # StudyDate
            '00080030': {'Value': ['120000'], 'vr': 'TM'},  # StudyTime
            '00080060': {'Value': ['CT'], 'vr': 'CS'},  # Modality
            '00100010': {'Value': [instance_data.get('MainDicomTags', {}).get('PatientName', 'PATIENT^NAME')], 'vr': 'PN'},
            '00100020': {'Value': [instance_data.get('MainDicomTags', {}).get('PatientID', '12345')], 'vr': 'LO'},
            '00200013': {'Value': [1], 'vr': 'IS'},  # InstanceNumber
            '00280002': {'Value': [1], 'vr': 'US'},  # SamplesPerPixel
            '00280004': {'Value': ['MONOCHROME2'], 'vr': 'CS'},  # PhotometricInterpretation
            '00280008': {'Value': [1], 'vr': 'IS'},  # NumberOfFrames
            '00280010': {'Value': [actual_rows], 'vr': 'US'},  # Rows - CRITICAL!
            '00280011': {'Value': [actual_cols], 'vr': 'US'},  # Columns - CRITICAL!
            '00280030': {'Value': [1.0, 1.0], 'vr': 'DS'},  # PixelSpacing
            '00280100': {'Value': [16], 'vr': 'US'},  # BitsAllocated
            '00280101': {'Value': [12], 'vr': 'US'},  # BitsStored
            '00280102': {'Value': [11], 'vr': 'US'},  # HighBit
            '00280103': {'Value': [0], 'vr': 'US'},  # PixelRepresentation
            '00281050': {'Value': [40], 'vr': 'DS'},  # WindowCenter
            '00281051': {'Value': [400], 'vr': 'DS'},  # WindowWidth
            '00281052': {'Value': [0], 'vr': 'DS'},  # RescaleIntercept
            '00281053': {'Value': [1], 'vr': 'DS'},  # RescaleSlope
        }
        
        # Override with actual values from metadata where available
        if '00280004' in metadata:  # PhotometricInterpretation
            photo_value = metadata['00280004'].get('Value')
            if photo_value:
                # Extract the actual value if it's in a list
                actual_photo = photo_value if isinstance(photo_value, str) else photo_value[0] if isinstance(photo_value, list) else photo_value
                essential_tags['00280004']['Value'] = [actual_photo]
        
        if '00280002' in metadata:  # SamplesPerPixel - CRITICAL for avoiding the error
            samples_value = metadata['00280002'].get('Value')
            if samples_value:
                try:
                    essential_tags['00280002']['Value'] = [int(samples_value)] if isinstance(samples_value, (str, int)) else samples_value
                    essential_tags['00280002']['vr'] = 'US'  # Correct VR
                except:
                    pass
        
        if '00280100' in metadata:  # BitsAllocated
            bits_value = metadata['00280100'].get('Value')
            if bits_value:
                try:
                    essential_tags['00280100']['Value'] = [int(bits_value)] if isinstance(bits_value, (str, int)) else bits_value
                except:
                    pass
        
        if '00280101' in metadata:  # BitsStored
            bits_value = metadata['00280101'].get('Value')
            if bits_value:
                try:
                    essential_tags['00280101']['Value'] = [int(bits_value)] if isinstance(bits_value, (str, int)) else bits_value
                except:
                    pass
        
        if '00280102' in metadata:  # HighBit
            bits_value = metadata['00280102'].get('Value')
            if bits_value:
                try:
                    essential_tags['00280102']['Value'] = [int(bits_value)] if isinstance(bits_value, (str, int)) else bits_value
                except:
                    pass
        
        # Add missing essential tags
        for tag, default_value in essential_tags.items():
            if tag not in formatted_metadata:
                formatted_metadata[tag] = default_value
            elif not formatted_metadata[tag].get('Value'):
                formatted_metadata[tag]['Value'] = default_value['Value']
        
        # CRITICAL: Ensure rows and columns are correct (updated after padding analysis)
        formatted_metadata['00280010'] = {'Value': [actual_rows], 'vr': 'US'}
        formatted_metadata['00280011'] = {'Value': [actual_cols], 'vr': 'US'}
        
        
        # CRITICAL: Add BulkDataURI for pixel data - this is the key to WADO-RS working!
        api_url = request.build_absolute_uri('/').rstrip('/')
        bulk_data_uri = f"{api_url}/api/pacs/instances/{orthanc_id}/frames/1"
        
        # The tag 7FE00010 is the pixel data tag - this MUST have BulkDataURI for WADO-RS
        formatted_metadata["7fe00010"] = {
            "vr": "OW",
            "BulkDataURI": bulk_data_uri
        }
        
        
        
        
        # Note: Some padding in pixel data is normal and Cornerstone should handle it
        
        # Return metadata as JSON array (WADO-RS format)
        response_data = json.dumps([formatted_metadata])
        response = HttpResponse(response_data, content_type='application/dicom+json')
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        
        return response
        
    except Exception as e:
        return JsonResponse({'error': f'DICOM metadata failed: {str(e)}'}, status=500)


def _orthanc_type_to_vr(orthanc_type):
    """Convert Orthanc type to DICOM VR"""
    type_map = {
        'String': 'LO',
        'Sequence': 'SQ',
        'Integer': 'IS',
        'Float': 'DS',
        'Date': 'DA',
        'Time': 'TM',
        'DateTime': 'DT',
        'PersonName': 'PN',
        'Binary': 'OB',
    }
    return type_map.get(orthanc_type, 'LO')

@csrf_exempt
def configurable_dicom_frames(request, orthanc_id, frame_number):
    """
    Get DICOM frame data for WADO-RS
    
    URL format: /api/pacs/instances/{orthanc_id}/frames/{frame_number}
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response
    
    # Check authentication manually (for JWT tokens from frontend)
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return JsonResponse({'error': 'Authentication required'}, status=401)
        
    try:
        # Get Orthanc URL from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return JsonResponse({'error': 'PACS configuration not found'}, status=500)
        
        orthanc_url = pacs_config.orthancurl
        
        
        # First check if this is a multi-frame image and get image dimensions
        instance_info = requests.get(f"{orthanc_url}/instances/{orthanc_id}", timeout=10)
        if instance_info.ok:
            instance_data = instance_info.json()
            main_tags = instance_data.get('MainDicomTags', {})
            number_of_frames = int(main_tags.get('NumberOfFrames', '1'))
            
        else:
            number_of_frames = 1
        
        # For multi-frame images, try the frames endpoint
        if number_of_frames > 1:
            try:
                # Orthanc uses 0-based indexing for frames
                orthanc_frame_index = frame_number - 1
                frames_response = requests.get(
                    f"{orthanc_url}/instances/{orthanc_id}/frames/{orthanc_frame_index}/raw",
                    stream=True,
                    timeout=30
                )
                
                if frames_response.ok:
                    response = StreamingHttpResponse(
                        frames_response.iter_content(chunk_size=32768),
                        content_type='application/octet-stream'
                    )
                    response['Access-Control-Allow-Origin'] = '*'
                    response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                    response['Access-Control-Allow-Headers'] = '*'
                    return response
            except Exception:
                pass
        
        # For single-frame images, try to get raw pixel data first
        
        try:
            # Try Orthanc's raw pixel data endpoint (this gives us JUST the pixel data)
            # Note: For single-frame images, frame 1 in URL corresponds to frame 0 in Orthanc
            orthanc_frame_index = frame_number - 1  # Convert 1-based to 0-based
            raw_response = requests.get(
                f"{orthanc_url}/instances/{orthanc_id}/frames/{orthanc_frame_index}/raw",
                stream=True,
                timeout=30
            )
            
            if raw_response.ok:
                response = StreamingHttpResponse(
                    raw_response.iter_content(chunk_size=32768),
                    content_type='application/octet-stream'
                )
                response['Access-Control-Allow-Origin'] = '*'
                response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                response['Access-Control-Allow-Headers'] = '*'
                return response
            else:
                pass
        except Exception:
            pass
        
        # If raw pixel data fails, fall back to full DICOM file
        
        dicom_response = requests.get(
            f"{orthanc_url}/instances/{orthanc_id}/file",
            stream=True,
            timeout=60
        )
        
        if not dicom_response.ok:
            # Try the DICOMweb endpoint as fallback
            try:
                # Get instance metadata to construct DICOMweb URL
                instance_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}", timeout=10)
                if instance_response.ok:
                    instance_data = instance_response.json()
                    parent_series = instance_data.get('ParentSeries')
                    
                    if parent_series:
                        series_response = requests.get(f"{orthanc_url}/series/{parent_series}", timeout=10)
                        if series_response.ok:
                            series_data = series_response.json()
                            parent_study = series_data.get('ParentStudy')
                            
                            if parent_study:
                                study_response = requests.get(f"{orthanc_url}/studies/{parent_study}", timeout=10)
                                if study_response.ok:
                                    study_data = study_response.json()
                                    
                                    study_uid = study_data.get('MainDicomTags', {}).get('StudyInstanceUID')
                                    series_uid = series_data.get('MainDicomTags', {}).get('SeriesInstanceUID')
                                    sop_uid = instance_data.get('MainDicomTags', {}).get('SOPInstanceUID')
                                    
                                    if all([study_uid, series_uid, sop_uid]):
                                        dicomweb_url = f"{orthanc_url}/dicom-web/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}"
                                        dicom_response = requests.get(dicomweb_url, stream=True, timeout=60)
                                        
                                        if dicom_response.ok:
                                            pass
            except Exception:
                pass
            
            if not dicom_response.ok:
                return HttpResponse(f'Failed to get DICOM file: {dicom_response.status_code}', status=404)
        
        # Stream the DICOM file
        response = StreamingHttpResponse(
            dicom_response.iter_content(chunk_size=32768),
            content_type='application/dicom'
        )
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        
        return response
        
    except Exception as e:
        return HttpResponse(f'DICOM frame failed: {str(e)}', status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def configurable_dicom_instance_proxy(request, orthanc_id):
    """
    Configurable proxy for DICOM instances based on PacsConfig endpoint_style
    
    URL format: /api/pacs/instances/{orthanc_id}/configurable
    """
    try:
        # Get Orthanc URL and endpoint style from configuration
        pacs_config = PacsConfig.objects.first()
        if not pacs_config:
            return Response({'error': 'PACS configuration not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        orthanc_url = pacs_config.orthancurl
        endpoint_style = pacs_config.endpoint_style
        
        
        # Strategy selection based on configuration
        if endpoint_style == 'file':
            return _try_file_endpoint(orthanc_url, orthanc_id)
        elif endpoint_style == 'attachment':
            return _try_attachment_endpoint(orthanc_url, orthanc_id)
        elif endpoint_style == 'dicomweb':
            return _try_dicomweb_endpoint(orthanc_url, orthanc_id)
        elif endpoint_style == 'auto':
            return _try_auto_detect_endpoint(orthanc_url, orthanc_id)
        else:
            # Default to dicomweb
            return _try_dicomweb_endpoint(orthanc_url, orthanc_id)
            
    except Exception as e:
        return Response({'error': f'DICOM proxy failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _try_file_endpoint(orthanc_url, orthanc_id):
    """Direct /file endpoint (may not work with PostgreSQL storage)"""
    try:
        file_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}/file", stream=True, timeout=30)
        if file_response.ok:
            response = StreamingHttpResponse(
                file_response.iter_content(chunk_size=32768),
                content_type='application/dicom'
            )
            response['Content-Disposition'] = f'attachment; filename="{orthanc_id}.dcm"'
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            response['Access-Control-Allow-Headers'] = '*'
            
            return response
        else:
            return Response({'error': f'/file endpoint failed: {file_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': f'/file endpoint error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _try_attachment_endpoint(orthanc_url, orthanc_id):
    """Raw attachment data endpoint"""
    try:
        attachment_url = f"{orthanc_url}/instances/{orthanc_id}/attachments/1/data"
        attachment_response = requests.get(attachment_url, stream=True, timeout=30)
        if attachment_response.ok:
            response = StreamingHttpResponse(
                attachment_response.iter_content(chunk_size=32768),
                content_type='application/dicom'
            )
            response['Content-Disposition'] = f'attachment; filename="{orthanc_id}.dcm"'
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            response['Access-Control-Allow-Headers'] = '*'
            
            return response
        else:
            return Response({'error': f'Attachment endpoint failed: {attachment_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': f'Attachment endpoint error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _try_dicomweb_endpoint(orthanc_url, orthanc_id):
    """OHIF-style DICOMweb endpoint (cleanest, most reliable)"""
    try:
        instance_response = requests.get(f"{orthanc_url}/instances/{orthanc_id}", timeout=10)
        if not instance_response.ok:
            return Response({'error': f'Instance metadata not found: {instance_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
            
        instance_data = instance_response.json()
        parent_series = instance_data.get('ParentSeries')
        
        if not parent_series:
            return Response({'error': 'Parent series not found'}, status=status.HTTP_404_NOT_FOUND)
            
        # Get series metadata
        series_response = requests.get(f"{orthanc_url}/series/{parent_series}", timeout=10)
        if not series_response.ok:
            return Response({'error': f'Series metadata not found: {series_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
            
        series_data = series_response.json()
        parent_study = series_data.get('ParentStudy')
        
        if not parent_study:
            return Response({'error': 'Parent study not found'}, status=status.HTTP_404_NOT_FOUND)
            
        # Get study metadata
        study_response = requests.get(f"{orthanc_url}/studies/{parent_study}", timeout=10)
        if not study_response.ok:
            return Response({'error': f'Study metadata not found: {study_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
            
        study_data = study_response.json()
        
        # Extract required UIDs for DICOMweb
        study_uid = study_data.get('MainDicomTags', {}).get('StudyInstanceUID')
        series_uid = series_data.get('MainDicomTags', {}).get('SeriesInstanceUID')
        sop_uid = instance_data.get('MainDicomTags', {}).get('SOPInstanceUID')
        if not all([study_uid, series_uid, sop_uid]):
            return Response({'error': 'Missing required DICOM UIDs'}, status=status.HTTP_404_NOT_FOUND)
            
        # Try BOTH URL formats: internal IP and external domain path
        # Your OHIF uses: https://dicom.resakse.com/orthanc/dicom-web/...
        # We're trying: http://192.168.20.172:8042/dicom-web/...
        
        # Get the full DICOM file from DICOMweb instance endpoint (not frames)
        instance_url = f"{orthanc_url}/dicom-web/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}"
        
        # Use headers that request DICOM file format
        headers = {
            'Accept': 'application/dicom, */*',
            'Accept-Encoding': 'identity',  # No compression to avoid parsing issues
        }
        
        dicom_response = requests.get(instance_url, headers=headers, stream=True, timeout=60)
        
        if not dicom_response.ok:
            return Response({'error': f'DICOMweb instance endpoint failed: {dicom_response.status_code}'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get response info
        content_type = dicom_response.headers.get('Content-Type', 'application/dicom')
        content_length = dicom_response.headers.get('Content-Length')
        
        # Return the full DICOM file that Cornerstone can parse
        response = StreamingHttpResponse(
            dicom_response.iter_content(chunk_size=32768),
            content_type='application/dicom'  # Force DICOM content type
        )
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        response['Cache-Control'] = 'no-cache'
        
        return response
            
    except Exception as e:
        return Response({'error': f'DICOMweb endpoint error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _try_auto_detect_endpoint(orthanc_url, orthanc_id):
    """Try endpoints in order of reliability: dicomweb -> attachment -> file"""
    # Try DICOMweb first (most reliable)
    try:
        response = _try_dicomweb_endpoint(orthanc_url, orthanc_id)
        if response.status_code == 200:
            return response
    except:
        pass
        
    # Try attachment second
    try:
        response = _try_attachment_endpoint(orthanc_url, orthanc_id)
        if response.status_code == 200:
            return response
    except:
        pass
        
    # Try file last
    try:
        response = _try_file_endpoint(orthanc_url, orthanc_id)
        if response.status_code == 200:
            return response
    except:
        pass
        
    return Response({'error': 'All auto-detect endpoints failed'}, status=status.HTTP_404_NOT_FOUND)