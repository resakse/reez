"""
Manual Radiology Report API Views
Independent reporting system that doesn't require AI reports
"""

import logging
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import Pemeriksaan
from .manual_report_models import ManualRadiologyReport
from staff.permissions import CanReport, CanViewReport

logger = logging.getLogger(__name__)


class ManualReportPagination(PageNumberPagination):
    """Pagination for manual reports"""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class ManualRadiologyReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for manual radiology reports
    Allows radiologists to create reports without AI dependency
    """
    pagination_class = ManualReportPagination
    permission_classes = [permissions.IsAuthenticated, CanReport]
    
    def get_queryset(self):
        """Get filtered queryset based on user permissions and query parameters"""
        queryset = ManualRadiologyReport.objects.select_related(
            'pemeriksaan__exam__modaliti',
            'pemeriksaan__daftar__pesakit',
            'radiologist',
            'peer_reviewer'
        )
        
        # Filter by examination number if provided
        examination_number = self.request.query_params.get('examination_number')
        if examination_number:
            queryset = queryset.filter(pemeriksaan__no_xray=examination_number)
        
        # Filter by report status
        report_status = self.request.query_params.get('report_status')
        if report_status:
            queryset = queryset.filter(report_status=report_status)
        
        # Filter by current user if requested
        my_reports_only = self.request.query_params.get('my_reports_only')
        if my_reports_only and my_reports_only.lower() == 'true':
            queryset = queryset.filter(radiologist=self.request.user)
        
        return queryset.order_by('-created')
    
    def get_serializer_class(self):
        """Return appropriate serializer"""
        # For now, use a simple inline serializer
        from rest_framework import serializers
        
        class ManualReportSerializer(serializers.ModelSerializer):
            radiologist_name = serializers.SerializerMethodField()
            patient_name = serializers.ReadOnlyField()
            examination_number = serializers.ReadOnlyField()
            modality = serializers.ReadOnlyField()
            total_reporting_time = serializers.ReadOnlyField()
            
            class Meta:
                model = ManualRadiologyReport
                fields = [
                    'id', 'pemeriksaan', 'radiologist', 'radiologist_name',
                    'clinical_history', 'technique', 'findings', 'impression', 'recommendations',
                    'report_status', 'complexity_level', 'report_start_time', 'report_completion_time',
                    'peer_review_required', 'peer_reviewer', 'peer_review_status', 'peer_review_comments',
                    'patient_name', 'examination_number', 'modality', 'total_reporting_time',
                    'created', 'modified'
                ]
                read_only_fields = ['radiologist', 'report_start_time', 'total_reporting_time']
            
            def get_radiologist_name(self, obj):
                return f"{obj.radiologist.first_name} {obj.radiologist.last_name}".strip()
        
        return ManualReportSerializer
    
    def perform_create(self, serializer):
        """Set radiologist to current user when creating report"""
        serializer.save(radiologist=self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Create a new manual report"""
        try:
            # Get examination
            pemeriksaan_id = request.data.get('pemeriksaan_id')
            examination_number = request.data.get('examination_number')
            
            if pemeriksaan_id:
                pemeriksaan = get_object_or_404(Pemeriksaan, id=pemeriksaan_id)
            elif examination_number:
                pemeriksaan = get_object_or_404(Pemeriksaan, no_xray=examination_number)
            else:
                return Response(
                    {'error': 'Either pemeriksaan_id or examination_number is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if report already exists
            existing_report = ManualRadiologyReport.objects.filter(pemeriksaan=pemeriksaan).first()
            if existing_report:
                return Response(
                    {
                        'error': 'Report already exists for this examination',
                        'report_id': existing_report.id
                    },
                    status=status.HTTP_409_CONFLICT
                )
            
            # Create the report
            report_data = request.data.copy()
            report_data['pemeriksaan'] = pemeriksaan.id
            
            serializer = self.get_serializer(data=report_data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error creating manual report: {e}")
            return Response(
                {'error': 'Failed to create report', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def update(self, request, *args, **kwargs):
        """Update an existing manual report"""
        instance = self.get_object()
        
        # Only allow radiologist who created the report or superuser to edit
        if instance.radiologist != request.user and not request.user.is_superuser:
            return Response(
                {'error': 'You can only edit your own reports'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """Delete a manual report"""
        instance = self.get_object()
        
        # Only allow radiologist who created the report or superuser to delete
        if instance.radiologist != request.user and not request.user.is_superuser:
            return Response(
                {'error': 'You can only delete your own reports'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().destroy(request, *args, **kwargs)


class ManualReportCompleteView(APIView):
    """Complete a manual radiology report"""
    permission_classes = [permissions.IsAuthenticated, CanReport]
    
    def post(self, request, report_id):
        """Mark report as completed"""
        try:
            report = get_object_or_404(ManualRadiologyReport, id=report_id)
            
            # Only allow radiologist who created the report or superuser to complete
            if report.radiologist != request.user and not request.user.is_superuser:
                return Response(
                    {'error': 'You can only complete your own reports'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if report.report_status == 'completed':
                return Response(
                    {'error': 'Report is already completed'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate required fields
            if not report.findings or not report.impression:
                return Response(
                    {'error': 'Findings and impression are required to complete report'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Mark as completed
            report.report_status = 'completed'
            report.report_completion_time = timezone.now()
            report.save()
            
            # Return updated report
            serializer_class = ManualRadiologyReportViewSet().get_serializer_class()
            serializer = serializer_class(report)
            
            return Response({
                'message': 'Report completed successfully',
                'report': serializer.data
            })
            
        except Exception as e:
            logger.error(f"Error completing manual report: {e}")
            return Response(
                {'error': 'Failed to complete report', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )