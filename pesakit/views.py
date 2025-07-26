from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from .models import Pesakit
from .serializers import PesakitSerializer

class PesakitViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows patients to be viewed or edited.
    """
    queryset = Pesakit.objects.all().order_by('-created')
    serializer_class = PesakitSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        search_term = self.request.query_params.get('search', None)
        
        if search_term:
            queryset = queryset.filter(
                Q(nama__icontains=search_term) |
                Q(nric__icontains=search_term) |
                Q(mrn__icontains=search_term)
            )
        
        return queryset
