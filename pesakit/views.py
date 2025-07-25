from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Pesakit
from .serializers import PesakitSerializer

class PesakitViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows patients to be viewed or edited.
    """
    queryset = Pesakit.objects.all().order_by('-created')
    serializer_class = PesakitSerializer
    permission_classes = [IsAuthenticated]
