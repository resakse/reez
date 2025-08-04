"""
AI Reporting API Views

REST API endpoints for AI-powered radiology reporting system including:
- AI report generation and management
- Collaborative radiologist reporting
- Performance tracking and analytics
- System configuration management
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Count, Avg, Sum
from django.core.cache import cache
from django.http import JsonResponse

from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import (
    AIGeneratedReport, RadiologistReport, ReportCollaboration, 
    AIModelPerformance, AIConfiguration, Pemeriksaan, Modaliti
)
from .serializers import (
    AIGeneratedReportSerializer, AIGeneratedReportListSerializer,
    RadiologistReportSerializer, RadiologistReportListSerializer,
    ReportCollaborationSerializer, AIModelPerformanceSerializer,
    AIConfigurationSerializer, PemeriksaanSerializer
)
from .ai_services import AIReportingService
from staff.permissions import IsRadiologist, IsTechnologist

logger = logging.getLogger(__name__)


class StandardResultsSetPagination(PageNumberPagination):
    """Standard pagination for AI reporting endpoints"""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class AIGeneratedReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AI-generated reports
    Provides CRUD operations and AI report generation functionality
    """
    serializer_class = AIGeneratedReportSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Get filtered queryset based on user permissions and query parameters"""
        queryset = AIGeneratedReport.objects.select_related(
            'pemeriksaan__exam__modaliti',
            'pemeriksaan__daftar__pesakit',
            'reviewed_by'
        ).prefetch_related(
            'pemeriksaan__daftar__rujukan'
        )
        
        # Filter by review status
        review_status = self.request.query_params.get('review_status')
        if review_status:
            queryset = queryset.filter(review_status=review_status)
        
        # Filter by modality
        modality = self.request.query_params.get('modality')
        if modality:
            queryset = queryset.filter(pemeriksaan__exam__modaliti_id=modality)
        
        # Filter by urgent review requirement
        urgent_only = self.request.query_params.get('urgent_only')
        if urgent_only and urgent_only.lower() == 'true':
            queryset = queryset.filter(requires_urgent_review=True)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(created__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created__date__lte=date_to)
        
        # Filter by confidence threshold
        min_confidence = self.request.query_params.get('min_confidence')
        if min_confidence:
            try:
                threshold = float(min_confidence)
                queryset = queryset.filter(confidence_score__gte=threshold)
            except ValueError:
                pass
        
        # Search by patient name or examination number
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(pemeriksaan__no_xray__icontains=search) |
                Q(pemeriksaan__daftar__pesakit__nama__icontains=search) |
                Q(pemeriksaan__daftar__pesakit__mrn__icontains=search)
            )
        
        return queryset.order_by('-created')
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return AIGeneratedReportListSerializer
        return AIGeneratedReportSerializer
    
    @action(detail=False, methods=['post'], permission_classes=[IsRadiologist])
    def generate_report(self, request):
        """
        Generate AI report for a specific examination
        
        Expected payload:
        {
            "pemeriksaan_id": 123
        }
        """
        try:
            pemeriksaan_id = request.data.get('pemeriksaan_id')
            if not pemeriksaan_id:
                return Response(
                    {'error': 'pemeriksaan_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            pemeriksaan = get_object_or_404(Pemeriksaan, id=pemeriksaan_id)
            
            # Check if AI report already exists
            existing_report = AIGeneratedReport.objects.filter(pemeriksaan=pemeriksaan).first()
            if existing_report:
                return Response(
                    {
                        'message': 'AI report already exists for this examination',
                        'report_id': existing_report.id,
                        'review_status': existing_report.review_status
                    },
                    status=status.HTTP_409_CONFLICT
                )
            
            # Generate AI report asynchronously (in production, use Celery)
            ai_service = AIReportingService()
            ai_report = ai_service.generate_ai_report(pemeriksaan)
            
            serializer = AIGeneratedReportSerializer(ai_report)
            
            return Response({
                'message': 'AI report generated successfully',
                'report': serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error generating AI report: {e}")
            return Response(
                {'error': 'Failed to generate AI report', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], permission_classes=[IsRadiologist])
    def update_review_status(self, request, pk=None):
        """
        Update review status of AI report
        
        Expected payload:
        {
            "review_status": "approved",
            "review_comments": "Optional comments"
        }
        """
        ai_report = self.get_object()
        new_status = request.data.get('review_status')
        review_comments = request.data.get('review_comments', '')
        
        if new_status not in ['pending', 'in_review', 'approved', 'modified', 'rejected']:
            return Response(
                {'error': 'Invalid review status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update review status
        ai_report.review_status = new_status
        ai_report.reviewed_by = request.user
        ai_report.reviewed_at = timezone.now()
        
        # Add review comments to processing notes if provided
        if review_comments:
            if not ai_report.processing_warnings:
                ai_report.processing_warnings = []
            ai_report.processing_warnings.append(f"Review: {review_comments}")
        
        ai_report.save()
        
        serializer = AIGeneratedReportSerializer(ai_report)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def dicom_images(self, request, pk=None):
        """Get DICOM images associated with AI report"""
        ai_report = self.get_object()
        
        if not ai_report.orthanc_study_id:
            return Response(
                {'error': 'No DICOM study associated with this report'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            from .ai_services import OrthancPACSClient
            orthanc_client = OrthancPACSClient()
            
            # Get study information
            study_info = orthanc_client.get_study_info(ai_report.orthanc_study_id)
            if not study_info:
                return Response(
                    {'error': 'Study not found in PACS'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get series information
            series_list = orthanc_client.get_study_series(ai_report.orthanc_study_id)
            
            return Response({
                'study_id': ai_report.orthanc_study_id,
                'study_info': study_info,
                'series': series_list,
                'viewer_url': f"{orthanc_client.pacs_server.viewrurl}/app/explorer.html#study?uuid={ai_report.orthanc_study_id}"
            })
            
        except Exception as e:
            logger.error(f"Error retrieving DICOM images: {e}")
            return Response(
                {'error': 'Failed to retrieve DICOM images'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RadiologistReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for radiologist reports
    Provides collaborative reporting functionality
    """
    serializer_class = RadiologistReportSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated, IsRadiologist]
    
    def get_queryset(self):
        """Get filtered queryset based on user and query parameters"""
        queryset = RadiologistReport.objects.select_related(
            'ai_report__pemeriksaan__exam__modaliti',
            'ai_report__pemeriksaan__daftar__pesakit',
            'radiologist',
            'peer_reviewer'
        ).prefetch_related(
            'collaborations'
        )
        
        # Filter by current user if requested
        my_reports_only = self.request.query_params.get('my_reports_only')
        if my_reports_only and my_reports_only.lower() == 'true':
            queryset = queryset.filter(radiologist=self.request.user)
        
        # Filter by report status
        report_status = self.request.query_params.get('report_status')
        if report_status:
            queryset = queryset.filter(report_status=report_status)
        
        # Filter by complexity level
        complexity_level = self.request.query_params.get('complexity_level')
        if complexity_level:
            queryset = queryset.filter(complexity_level=complexity_level)
        
        # Filter by completion date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(report_completion_time__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(report_completion_time__date__lte=date_to)
        
        return queryset.order_by('-created')
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return RadiologistReportListSerializer
        return RadiologistReportSerializer
    
    def perform_create(self, serializer):
        """Set radiologist to current user when creating report"""
        serializer.save(radiologist=self.request.user)
    
    @action(detail=True, methods=['post'])
    def add_collaboration(self, request, pk=None):
        """
        Add collaboration interaction to report
        
        Expected payload:
        {
            "interaction_type": "accept_ai_finding",
            "ai_suggestion": "AI suggested pneumonia",
            "radiologist_action": "Confirmed pneumonia diagnosis",
            "report_section": "findings",
            "confidence_before": 0.85,
            "confidence_after": 0.95,
            "feedback_category": "correct"
        }
        """
        radiologist_report = self.get_object()
        
        # Create collaboration record
        collaboration_data = request.data.copy()
        collaboration_data['radiologist_report'] = radiologist_report.id
        
        serializer = ReportCollaborationSerializer(data=collaboration_data)
        if serializer.is_valid():
            collaboration = serializer.save()
            
            # Update report's AI collaboration metadata
            interaction_type = collaboration.interaction_type
            if interaction_type == 'accept_ai_finding':
                radiologist_report.ai_suggestions_used.append(collaboration.ai_suggestion)
            elif interaction_type == 'modify_ai_finding':
                radiologist_report.ai_suggestions_modified.append(collaboration.ai_suggestion)
            elif interaction_type == 'reject_ai_finding':
                radiologist_report.ai_suggestions_rejected.append(collaboration.ai_suggestion)
            
            radiologist_report.save()
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def complete_report(self, request, pk=None):
        """Mark report as completed and calculate metrics"""
        radiologist_report = self.get_object()
        
        if radiologist_report.report_status == 'completed':
            return Response(
                {'error': 'Report is already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate required fields
        if not radiologist_report.findings or not radiologist_report.impression:
            return Response(
                {'error': 'Findings and impression are required to complete report'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update status and completion time
        radiologist_report.report_status = 'completed'
        radiologist_report.report_completion_time = timezone.now()
        
        # Set radiologist confidence if provided
        confidence = request.data.get('radiologist_confidence')
        if confidence is not None:
            try:
                radiologist_report.radiologist_confidence = float(confidence)
            except ValueError:
                pass
        
        radiologist_report.save()
        
        # Update AI report status
        ai_report = radiologist_report.ai_report
        ai_report.review_status = 'modified' if radiologist_report.ai_suggestions_modified else 'approved'
        ai_report.reviewed_by = request.user
        ai_report.reviewed_at = timezone.now()
        ai_report.final_report = self._generate_final_report(radiologist_report)
        ai_report.save()
        
        serializer = RadiologistReportSerializer(radiologist_report)
        return Response(serializer.data)
    
    def _generate_final_report(self, radiologist_report):
        """Generate final report text from radiologist report sections"""
        sections = []
        
        if radiologist_report.clinical_history:
            sections.append(f"CLINICAL HISTORY:\n{radiologist_report.clinical_history}")
        
        if radiologist_report.technique:
            sections.append(f"TECHNIQUE:\n{radiologist_report.technique}")
        
        if radiologist_report.findings:
            sections.append(f"FINDINGS:\n{radiologist_report.findings}")
        
        if radiologist_report.impression:
            sections.append(f"IMPRESSION:\n{radiologist_report.impression}")
        
        if radiologist_report.recommendations:
            sections.append(f"RECOMMENDATIONS:\n{radiologist_report.recommendations}")
        
        return "\n\n".join(sections)


class ReportCollaborationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for report collaboration tracking
    Read-only access to collaboration data for analytics
    """
    serializer_class = ReportCollaborationSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated, IsRadiologist]
    
    def get_queryset(self):
        """Get filtered collaboration records"""
        queryset = ReportCollaboration.objects.select_related(
            'radiologist_report__radiologist',
            'radiologist_report__ai_report__pemeriksaan'
        )
        
        # Filter by radiologist
        radiologist_id = self.request.query_params.get('radiologist_id')
        if radiologist_id:
            queryset = queryset.filter(radiologist_report__radiologist_id=radiologist_id)
        
        # Filter by interaction type
        interaction_type = self.request.query_params.get('interaction_type')
        if interaction_type:
            queryset = queryset.filter(interaction_type=interaction_type)
        
        # Filter by feedback category
        feedback_category = self.request.query_params.get('feedback_category')
        if feedback_category:
            queryset = queryset.filter(feedback_category=feedback_category)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(timestamp__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__date__lte=date_to)
        
        return queryset.order_by('-timestamp')


class AIModelPerformanceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AI model performance tracking
    Provides performance analytics and metrics
    """
    serializer_class = AIModelPerformanceSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated, IsRadiologist]
    
    def get_queryset(self):
        """Get filtered performance records"""
        queryset = AIModelPerformance.objects.select_related(
            'modality',
            'created_by'
        )
        
        # Filter by model version
        model_version = self.request.query_params.get('model_version')
        if model_version:
            queryset = queryset.filter(model_version=model_version)
        
        # Filter by modality
        modality = self.request.query_params.get('modality')
        if modality:
            queryset = queryset.filter(modality_id=modality)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(analysis_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(analysis_date__lte=date_to)
        
        return queryset.order_by('-analysis_date', 'model_version')
    
    @action(detail=False, methods=['get'])
    def summary_stats(self, request):
        """Get summary performance statistics"""
        # Get date range for analysis
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Get recent performance data
        recent_performance = AIModelPerformance.objects.filter(
            analysis_date__gte=start_date,
            analysis_date__lte=end_date
        ).aggregate(
            avg_accuracy=Avg('accuracy_rate'),
            avg_processing_time=Avg('average_processing_time'),
            avg_time_saved=Avg('average_time_saved'),
            total_reports=Sum('total_reports_generated')
        )
        
        # Get performance by modality
        modality_performance = AIModelPerformance.objects.filter(
            analysis_date__gte=start_date,
            analysis_date__lte=end_date
        ).values(
            'modality__nama'
        ).annotate(
            avg_accuracy=Avg('accuracy_rate'),
            total_reports=Sum('total_reports_generated')
        ).order_by('-total_reports')
        
        # Get AI report statistics
        ai_reports_stats = AIGeneratedReport.objects.filter(
            created__date__gte=start_date,
            created__date__lte=end_date
        ).aggregate(
            total_generated=Count('id'),
            pending_review=Count('id', filter=Q(review_status='pending')),
            approved=Count('id', filter=Q(review_status='approved')),
            critical_findings=Count('id', filter=Q(requires_urgent_review=True)),
            avg_confidence=Avg('confidence_score')
        )
        
        return Response({
            'date_range': {
                'start_date': start_date,
                'end_date': end_date,
                'days': days
            },
            'overall_performance': recent_performance,
            'modality_performance': list(modality_performance),
            'ai_reports_stats': ai_reports_stats
        })


class AIConfigurationView(APIView):
    """
    API view for AI system configuration management
    Singleton configuration with proper permissions
    """
    permission_classes = [permissions.IsAuthenticated, IsRadiologist]
    
    def get(self, request):
        """Get current AI configuration"""
        config = AIConfiguration.get_current_config()
        serializer = AIConfigurationSerializer(config)
        return Response(serializer.data)
    
    def put(self, request):
        """Update AI configuration"""
        config = AIConfiguration.get_current_config()
        serializer = AIConfigurationSerializer(
            config, 
            data=request.data, 
            context={'request': request}
        )
        
        if serializer.is_valid():
            serializer.save()
            
            # Clear any cached configuration
            cache.delete('ai_config')
            
            return Response(serializer.data)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AIConnectionTestView(APIView):
    """Test AI service connection"""
    permission_classes = [permissions.IsAuthenticated, IsRadiologist]
    
    def post(self, request):
        """Test connection to AI services"""
        try:
            from .ai_services import OllamaAIService
            
            config = AIConfiguration.get_current_config()
            ai_service = OllamaAIService(config)
            
            # Test simple generation
            test_result = ai_service._generate_with_ollama(
                model=config.medical_llm_model,
                prompt="Test connection. Respond with 'Connection successful.'"
            )
            
            if test_result['success']:
                return Response({
                    'status': 'success',
                    'message': 'AI service connection successful',
                    'response_time': test_result['processing_time'],
                    'model': test_result['model']
                })
            else:
                return Response({
                    'status': 'error',
                    'message': 'AI service connection failed',
                    'error': test_result.get('error', 'Unknown error')
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                
        except Exception as e:
            logger.error(f"AI service connection test failed: {e}")
            return Response({
                'status': 'error',
                'message': 'AI service connection test failed',
                'error': str(e)
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AIReportingDashboardView(APIView):
    """
    Dashboard view providing comprehensive AI reporting analytics
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get dashboard data for AI reporting system"""
        # Get date range parameters
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Basic AI report statistics
        ai_reports = AIGeneratedReport.objects.filter(
            created__date__gte=start_date,
            created__date__lte=end_date
        )
        
        basic_stats = {
            'total_ai_reports': ai_reports.count(),
            'pending_review': ai_reports.filter(review_status='pending').count(),
            'approved_reports': ai_reports.filter(review_status='approved').count(),
            'critical_findings': ai_reports.filter(requires_urgent_review=True).count(),
            'average_confidence': ai_reports.aggregate(Avg('confidence_score'))['confidence_score__avg'] or 0,
            'average_processing_time': ai_reports.exclude(
                processing_time_seconds__isnull=True
            ).aggregate(Avg('processing_time_seconds'))['processing_time_seconds__avg'] or 0
        }
        
        # Performance by modality
        modality_stats = ai_reports.values(
            'pemeriksaan__exam__modaliti__nama'
        ).annotate(
            count=Count('id'),
            avg_confidence=Avg('confidence_score'),
            critical_count=Count('id', filter=Q(requires_urgent_review=True))
        ).order_by('-count')
        
        # Daily report generation trend
        daily_trend = []
        for i in range(days):
            date = start_date + timedelta(days=i)
            count = ai_reports.filter(created__date=date).count()
            daily_trend.append({
                'date': date.isoformat(),
                'count': count
            })
        
        # Radiologist productivity
        radiologist_reports_queryset = RadiologistReport.objects.filter(
            created__date__gte=start_date,
            created__date__lte=end_date
        ).select_related('radiologist')
        
        # Calculate radiologist stats with proper ai_adoption_rate calculation
        radiologist_stats = []
        radiologist_groups = {}
        
        for report in radiologist_reports_queryset:
            key = (report.radiologist.first_name, report.radiologist.last_name)
            if key not in radiologist_groups:
                radiologist_groups[key] = {
                    'radiologist__first_name': report.radiologist.first_name,
                    'radiologist__last_name': report.radiologist.last_name,
                    'reports': [],
                    'reports_completed': 0
                }
            
            radiologist_groups[key]['reports'].append(report)
            if report.report_status == 'completed':
                radiologist_groups[key]['reports_completed'] += 1
        
        for key, data in radiologist_groups.items():
            reports = data['reports']
            
            # Calculate averages manually since ai_adoption_rate is a property
            time_saved_values = [r.time_saved_estimate for r in reports if r.time_saved_estimate is not None]
            avg_time_saved = sum(time_saved_values) / len(time_saved_values) if time_saved_values else None
            
            # Calculate average AI adoption rate from the property
            adoption_rates = [r.ai_adoption_rate for r in reports]
            avg_ai_adoption = sum(adoption_rates) / len(adoption_rates) if adoption_rates else 0
            
            radiologist_stats.append({
                'radiologist__first_name': data['radiologist__first_name'],
                'radiologist__last_name': data['radiologist__last_name'],
                'reports_completed': data['reports_completed'],
                'avg_time_saved': avg_time_saved,
                'avg_ai_adoption': avg_ai_adoption
            })
        
        # Sort by reports completed
        radiologist_stats.sort(key=lambda x: x['reports_completed'], reverse=True)
        
        # AI model performance trends
        model_performance = AIModelPerformance.objects.filter(
            analysis_date__gte=start_date,
            analysis_date__lte=end_date
        ).values(
            'model_version'
        ).annotate(
            avg_accuracy=Avg('accuracy_rate'),
            total_reports=Sum('total_reports_generated'),
            avg_time_saved=Avg('average_time_saved')
        ).order_by('-total_reports')
        
        # System health indicators
        config = AIConfiguration.get_current_config()
        system_health = {
            'ai_reporting_enabled': config.enable_ai_reporting,
            'maintenance_mode': config.maintenance_mode,
            'qa_validation_enabled': config.enable_qa_validation,
            'critical_notifications_enabled': config.notify_on_critical_findings,
            'last_config_update': config.modified.isoformat() if config.modified else None
        }
        
        return Response({
            'date_range': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'days': days
            },
            'basic_stats': basic_stats,
            'modality_stats': list(modality_stats),
            'daily_trend': daily_trend,
            'radiologist_stats': radiologist_stats,
            'model_performance': list(model_performance),
            'system_health': system_health
        })


class AIReportGenerationAPIView(APIView):
    """
    Simplified API for generating AI reports
    Used by frontend and external integrations
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """
        Generate AI report for examination
        
        Expected payload:
        {
            "examination_number": "KKP20250001",
            "force_regenerate": false
        }
        """
        try:
            examination_number = request.data.get('examination_number')
            force_regenerate = request.data.get('force_regenerate', False)
            
            if not examination_number:
                return Response(
                    {'error': 'examination_number is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Find examination
            try:
                pemeriksaan = Pemeriksaan.objects.get(no_xray=examination_number)
            except Pemeriksaan.DoesNotExist:
                return Response(
                    {'error': f'Examination {examination_number} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Check for existing report
            existing_report = AIGeneratedReport.objects.filter(pemeriksaan=pemeriksaan).first()
            if existing_report and not force_regenerate:
                serializer = AIGeneratedReportSerializer(existing_report)
                return Response({
                    'message': 'AI report already exists',
                    'report': serializer.data,
                    'existed': True
                })
            
            # Generate or regenerate report
            with transaction.atomic():
                if existing_report and force_regenerate:
                    existing_report.delete()
                
                ai_service = AIReportingService()
                ai_report = ai_service.generate_ai_report(pemeriksaan)
                
                serializer = AIGeneratedReportSerializer(ai_report)
                
                return Response({
                    'message': 'AI report generated successfully',
                    'report': serializer.data,
                    'existed': False
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            logger.error(f"Error in AI report generation API: {e}")
            return Response(
                {'error': 'Failed to generate AI report', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )