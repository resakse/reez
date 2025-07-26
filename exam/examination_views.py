from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters import rest_framework as filters
from django.db.models import Q
from .models import Pemeriksaan, Exam, Daftar
from .serializers import PemeriksaanSerializer
from wad.models import Ward

class PemeriksaanFilter(filters.FilterSet):
    """
    Custom filter for Pemeriksaan (Examination) with advanced filtering options
    """
    date_from = filters.DateTimeFilter(field_name='daftar__tarikh', lookup_expr='gte')
    date_to = filters.DateTimeFilter(field_name='daftar__tarikh', lookup_expr='lte')
    exam_type = filters.ModelChoiceFilter(field_name='exam', queryset=Exam.objects.all())
    pemohon = filters.CharFilter(field_name='daftar__pemohon', lookup_expr='icontains')
    ward = filters.ModelChoiceFilter(field_name='daftar__rujukan', queryset=Ward.objects.all())
    klinik = filters.CharFilter(method='filter_klinik')
    patient_name = filters.CharFilter(field_name='daftar__pesakit__nama', lookup_expr='icontains')
    no_xray = filters.CharFilter(field_name='no_xray', lookup_expr='icontains')
    
    class Meta:
        model = Pemeriksaan
        fields = ['date_from', 'date_to', 'exam_type', 'pemohon', 'ward', 'klinik', 'patient_name', 'no_xray']
    
    def filter_klinik(self, queryset, name, value):
        """
        Filter by klinik from the jxr (Juru X-Ray) staff member
        """
        return queryset.filter(daftar__jxr__klinik__icontains=value)

class IsActiveUserPermission(permissions.BasePermission):
    """
    Custom permission to only allow active users to access examinations.
    """
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_active
        )

class ExaminationListAPIView(generics.ListAPIView):
    """
    List all examinations with advanced filtering and search capabilities.
    Accessible to all is_active users.
    """
    serializer_class = PemeriksaanSerializer
    permission_classes = [IsActiveUserPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = PemeriksaanFilter
    search_fields = ['no_xray', 'daftar__pesakit__nama', 'daftar__pemohon', 'exam__exam']
    ordering_fields = ['no_xray', 'created', 'daftar__tarikh']
    ordering = ['-no_xray']  # Default ordering by X-ray number descending
    
    def get_queryset(self):
        """
        Return examinations with optimized queries using auto_prefetch
        """
        return Pemeriksaan.objects.select_related(
            'exam', 'exam__modaliti', 'exam__part',
            'daftar', 'daftar__pesakit', 'daftar__rujukan', 'daftar__jxr'
        ).all()

class ExaminationDetailAPIView(generics.RetrieveAPIView):
    """
    Retrieve a single examination with full details.
    """
    queryset = Pemeriksaan.objects.select_related(
        'exam', 'exam__modaliti', 'exam__part',
        'daftar', 'daftar__pesakit', 'daftar__rujukan', 'daftar__jxr'
    ).all()
    serializer_class = PemeriksaanSerializer
    permission_classes = [IsActiveUserPermission]