from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
import requests
import logging

from .models import PacsServer
from .serializers import PacsServerSerializer, PacsServerListSerializer
from staff.permissions import IsSuperUser

logger = logging.getLogger(__name__)


class PacsServerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing PACS servers
    Only superusers can manage PACS servers
    """
    queryset = PacsServer.objects.filter(is_deleted=False)
    serializer_class = PacsServerSerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    
    def get_queryset(self):
        """Filter out deleted servers by default"""
        return PacsServer.objects.filter(is_deleted=False).order_by('-is_primary', 'name')
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete server if it has examinations, hard delete if empty"""
        pacs_server = self.get_object()
        
        # Check if server has any examinations
        examination_count = pacs_server.examinations.count()
        
        if examination_count > 0:
            # Soft delete - keep server for historical data
            pacs_server.is_deleted = True
            pacs_server.is_active = False
            pacs_server.is_primary = False
            pacs_server.save()
            
            return Response({
                'message': f'Server marked as deleted. {examination_count} historical examinations preserved.',
                'examination_count': examination_count,
                'soft_deleted': True
            })
        else:
            # Hard delete - no examinations depend on this server
            pacs_server.delete()
            return Response({
                'message': 'Server permanently deleted.', 
                'soft_deleted': False
            })

    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        """Set this PACS server as primary"""
        pacs_server = self.get_object()
        
        if pacs_server.is_deleted:
            return Response(
                {'error': 'Cannot set deleted PACS server as primary'}, 
                status=400
            )
        
        if not pacs_server.is_active:
            return Response(
                {'error': 'Cannot set inactive PACS server as primary'}, 
                status=400
            )
        
        # The model's save method will handle ensuring only one primary exists
        pacs_server.is_primary = True
        pacs_server.save()
        
        logger.info(f"PACS server {pacs_server.name} set as primary by {request.user.username}")
        
        return Response({'status': 'Primary PACS server updated'})
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted server"""
        # Allow access to deleted servers for restore
        pacs_server = get_object_or_404(PacsServer, pk=pk)
        
        if not pacs_server.is_deleted:
            return Response({'error': 'Server is not deleted'}, status=400)
        
        pacs_server.is_deleted = False
        pacs_server.is_active = True  # Reactivate on restore
        pacs_server.save()
        
        logger.info(f"PACS server {pacs_server.name} restored by {request.user.username}")
        
        return Response({'message': 'Server restored successfully'})
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active PACS servers"""
        active_servers = PacsServer.objects.filter(is_active=True, is_deleted=False)
        serializer = PacsServerListSerializer(active_servers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def primary(self, request):
        """Get the primary PACS server"""
        try:
            primary_server = PacsServer.objects.get(is_primary=True, is_active=True, is_deleted=False)
            serializer = PacsServerSerializer(primary_server)
            return Response(serializer.data)
        except PacsServer.DoesNotExist:
            return Response({'error': 'No primary PACS server configured'}, status=404)
    
    @action(detail=False, methods=['get'])
    def health_check(self, request):
        """Check health of all PACS servers"""
        servers = PacsServer.objects.filter(is_deleted=False)
        health_status = {}
        
        for server in servers:
            try:
                # Test connection to Orthanc server
                response = requests.get(f"{server.orthancurl.rstrip('/')}/system", timeout=5)
                health_status[server.id] = {
                    'name': server.name,
                    'status': 'healthy' if response.status_code == 200 else 'unhealthy',
                    'response_time_ms': response.elapsed.total_seconds() * 1000,
                    'examination_count': server.examinations.count(),
                    'is_active': server.is_active,
                    'is_primary': server.is_primary
                }
            except Exception as e:
                health_status[server.id] = {
                    'name': server.name,
                    'status': 'unreachable',
                    'error': str(e),
                    'examination_count': server.examinations.count(),
                    'is_active': server.is_active,
                    'is_primary': server.is_primary
                }
        
        return Response(health_status)


class MultiplePacsSearchView(APIView):
    """Search across all active PACS servers"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        search_params = request.data.copy()  # Make a copy so we can modify it
        server_ids = search_params.get('server_ids', [])
        
        # If no specific servers requested, search all active servers
        if not server_ids:
            active_servers = PacsServer.objects.filter(is_active=True, is_deleted=False)
        else:
            active_servers = PacsServer.objects.filter(
                id__in=server_ids, 
                is_active=True, 
                is_deleted=False
            )
        
        # Add server count to search params for per-server limit calculation
        search_params['active_server_count'] = active_servers.count()
        
        all_studies = []
        server_errors = {}
        servers_searched = []
        
        for server in active_servers:
            try:
                # Search this PACS server
                server_studies = self._search_single_pacs(server, search_params)
                
                # Add server info to each study
                for study in server_studies:
                    study['pacs_server_id'] = server.id
                    study['pacs_server_name'] = server.name
                
                all_studies.extend(server_studies)
                servers_searched.append({'id': server.id, 'name': server.name})
                
            except Exception as e:
                server_errors[server.name] = str(e)
                logger.error(f"Error searching PACS server {server.name}: {e}")
        
        # Sort studies by study date (most recent first)
        all_studies.sort(key=lambda x: x.get('studyDate', ''), reverse=True)
        
        # Apply total limit across all servers
        total_limit = search_params.get('limit', 100)
        if len(all_studies) > total_limit:
            all_studies = all_studies[:total_limit]
        
        return Response({
            'success': True,
            'studies': all_studies,
            'total_count': len(all_studies),
            'server_errors': server_errors,
            'servers_searched': servers_searched,
            'pagination_info': {
                'per_server_limit': search_params.get('limit', 100) // max(1, active_servers.count()),
                'total_limit': total_limit,
                'servers_count': active_servers.count()
            }
        })
    
    def _search_single_pacs(self, server: PacsServer, search_params: dict):
        """
        Search a single PACS server with pagination support
        Based on the existing PacsSearchView logic
        """
        try:
            # Build DICOM query from search parameters
            query = {}
            
            if search_params.get('patientName'):
                query['PatientName'] = f"*{search_params['patientName']}*"
            
            if search_params.get('patientId'):
                query['PatientID'] = f"*{search_params['patientId']}*"
            
            if search_params.get('dateFrom') or search_params.get('dateTo'):
                date_range = ""
                if search_params.get('dateFrom'):
                    date_range += search_params['dateFrom'].replace('-', '')
                date_range += "-"
                if search_params.get('dateTo'):
                    date_range += search_params['dateTo'].replace('-', '')
                query['StudyDate'] = date_range
            
            if search_params.get('studyDescription'):
                query['StudyDescription'] = f"*{search_params['studyDescription']}*"
            
            # Calculate per-server limit for multiple PACS
            total_limit = search_params.get('limit', 100)
            active_server_count = search_params.get('active_server_count', 1)
            per_server_limit = min(total_limit, max(20, total_limit // active_server_count))
            
            # Build Orthanc C-FIND request
            orthanc_query = {
                'Level': 'Study',
                'Query': query,
                'Expand': True,
                'Limit': per_server_limit
            }
            
            # Query this Orthanc server
            orthanc_url = server.orthancurl.rstrip('/')
            response = requests.post(
                f"{orthanc_url}/tools/find",
                json=orthanc_query,
                timeout=30
            )
            
            if not response.ok:
                logger.error(f"Orthanc search failed for {server.name}: {response.status_code}")
                return []
            
            studies_data = response.json()
            
            # Format studies for frontend
            formatted_studies = []
            for study in studies_data:
                try:
                    # Skip if study is not a dictionary (sometimes Orthanc returns strings)
                    if not isinstance(study, dict):
                        logger.warning(f"Skipping non-dict study from {server.name}: {type(study)} - {study}")
                        continue
                    
                    # Extract DICOM tags
                    main_dicom_tags = study.get('MainDicomTags', {})
                    patient_main_dicom_tags = study.get('PatientMainDicomTags', {})
                    
                    # Ensure series is a list for counting
                    series_list = study.get('Series', [])
                    if not isinstance(series_list, list):
                        series_list = []
                    
                    # Extract modality from series (DICOM tag 0008,0060 is series-level)
                    modality = 'Unknown'
                    body_part_examined = None
                    protocol_name = None
                    acquisition_device_processing_description = None
                    manufacturer = None
                    
                    # Try study-level ModalitiesInStudy first
                    study_modalities = main_dicom_tags.get('ModalitiesInStudy', '')
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
                            logger.debug(f"Failed to fetch series modality from {server.name}: {e}")
                            pass
                    
                    # Extract additional DICOM fields from series and instance data
                    if series_list:
                        try:
                            first_series_id = series_list[0]
                            series_response = requests.get(
                                f"{orthanc_url}/series/{first_series_id}",
                                timeout=5
                            )
                            if series_response.ok:
                                series_data = series_response.json()
                                series_tags = series_data.get('MainDicomTags', {})
                                
                                # Try to get fields from series level first
                                body_part_examined = series_tags.get('BodyPartExamined')
                                protocol_name = series_tags.get('ProtocolName')
                                acquisition_device_processing_description = series_tags.get('AcquisitionDeviceProcessingDescription')
                                manufacturer = series_tags.get('Manufacturer')
                                
                                # If not found at series level, try instance level
                                instances = series_data.get('Instances', [])
                                if instances and (not body_part_examined or not protocol_name or not acquisition_device_processing_description or not manufacturer):
                                    try:
                                        first_instance_id = instances[0]
                                        instance_response = requests.get(
                                            f"{orthanc_url}/instances/{first_instance_id}",
                                            timeout=5
                                        )
                                        if instance_response.ok:
                                            instance_data = instance_response.json()
                                            instance_tags = instance_data.get('MainDicomTags', {})
                                            
                                            # Use instance-level tags as fallback
                                            if not body_part_examined:
                                                body_part_examined = instance_tags.get('BodyPartExamined')
                                            if not protocol_name:
                                                protocol_name = instance_tags.get('ProtocolName')
                                            if not acquisition_device_processing_description:
                                                acquisition_device_processing_description = instance_tags.get('AcquisitionDeviceProcessingDescription')
                                            if not manufacturer:
                                                manufacturer = instance_tags.get('Manufacturer')
                                    except Exception as e:
                                        logger.debug(f"Failed to fetch instance tags from {server.name}: {e}")
                        except Exception as e:
                            logger.debug(f"Failed to fetch series tags from {server.name}: {e}")
                    
                    formatted_study = {
                        'id': study.get('ID', ''),
                        'studyInstanceUid': main_dicom_tags.get('StudyInstanceUID', ''),
                        'patientName': patient_main_dicom_tags.get('PatientName', ''),
                        'patientId': patient_main_dicom_tags.get('PatientID', ''),
                        'patientBirthDate': patient_main_dicom_tags.get('PatientBirthDate', ''),
                        'patientSex': patient_main_dicom_tags.get('PatientSex', ''),
                        'studyDate': main_dicom_tags.get('StudyDate', ''),
                        'studyTime': main_dicom_tags.get('StudyTime', ''),
                        'studyDescription': main_dicom_tags.get('StudyDescription', ''),
                        'modality': modality,
                        'seriesCount': len(series_list),
                        'imageCount': sum(len(series.get('Instances', [])) if isinstance(series, dict) else 0 for series in series_list),
                        'institutionName': main_dicom_tags.get('InstitutionName', ''),
                        'accessionNumber': main_dicom_tags.get('AccessionNumber', ''),
                        
                        # Additional DICOM fields that frontend expects
                        'bodyPartExamined': body_part_examined,
                        'protocolName': protocol_name,
                        'manufacturer': manufacturer,
                        'acquisitionDeviceProcessingDescription': acquisition_device_processing_description,
                    }
                    
                    formatted_studies.append(formatted_study)
                    
                except Exception as e:
                    logger.warning(f"Error formatting study from {server.name}: {e}")
                    logger.debug(f"Problematic study data: {study}")
                    continue
            
            logger.info(f"Retrieved {len(formatted_studies)} studies from {server.name}")
            return formatted_studies
            
        except requests.RequestException as e:
            logger.error(f"Network error searching {server.name}: {e}")
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error searching {server.name}: {e}")
            raise Exception(f"Search error: {str(e)}")


class PacsUploadDestinationsView(APIView):
    """Return available PACS servers for upload"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        active_servers = PacsServer.objects.filter(is_active=True, is_deleted=False)
        serializer = PacsServerListSerializer(active_servers, many=True)
        
        primary_server = active_servers.filter(is_primary=True).first()
        
        return Response({
            'servers': serializer.data,
            'primary_server_id': primary_server.id if primary_server else None
        })