from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from .models import Pesakit
from .serializers import PesakitSerializer

class PesakitViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows patients to be viewed or edited.
    """
    queryset = Pesakit.objects.all().order_by('-id')
    serializer_class = PesakitSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['nama', 'nric', 'mrn']
    ordering_fields = ['id', 'mrn', 'nama', 't_lahir', 'jantina', 'created', 'modified']
    ordering = ['-id']  # Default ordering
    
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
