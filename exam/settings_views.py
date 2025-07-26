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
                viewrurl='http://localhost:3000/viewer'
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
    Get the current PACS configuration (latest one)
    """
    config = PacsConfig.objects.first()
    if not config:
        # Create default configuration if none exists
        config = PacsConfig.objects.create(
            orthancurl='http://localhost:8042',
            viewrurl='http://localhost:3000/viewer'
        )
    
    serializer = PacsConfigSerializer(config)
    return Response(serializer.data)