from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from .models import PacsConfig
from .serializers import PacsConfigSerializer

class IsSupervisorPermission(permissions.BasePermission):
    """
    Custom permission to only allow superusers to access PACS settings.
    """
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_superuser
        )

class PacsConfigListCreateAPIView(generics.ListCreateAPIView):
    queryset = PacsConfig.objects.all()
    serializer_class = PacsConfigSerializer
    permission_classes = [IsSupervisorPermission]

    def get_queryset(self):
        # Return the latest configuration or create a default one
        config = PacsConfig.objects.first()
        if not config:
            config = PacsConfig.objects.create(
                orthancurl='http://localhost:8042',
                viewrurl='http://localhost:3000/viewer',
                endpoint_style='dicomweb'
            )
        return PacsConfig.objects.all()

class PacsConfigDetailAPIView(generics.RetrieveUpdateAPIView):
    queryset = PacsConfig.objects.all()
    serializer_class = PacsConfigSerializer
    permission_classes = [IsSupervisorPermission]

@api_view(['GET'])
@permission_classes([IsSupervisorPermission])
def get_current_pacs_config(request):
    """
    Get the current PACS configuration (latest one) - Admin only
    """
    config = PacsConfig.objects.first()
    if not config:
        # Create default configuration if none exists
        config = PacsConfig.objects.create(
            orthancurl='http://localhost:8043',
            viewrurl='http://localhost:3000/viewer',
            endpoint_style='dicomweb'
        )
    
    serializer = PacsConfigSerializer(config)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_pacs_orthanc_url(request):
    """
    Get only the Orthanc URL from PACS configuration for authenticated users
    This is needed for the DICOM viewer to connect to the PACS server
    """
    config = PacsConfig.objects.first()
    if not config:
        # Return default URL if no configuration exists
        return Response({
            'orthancurl': 'http://localhost:8043'
        })
    
    return Response({
        'orthancurl': config.orthancurl
    })