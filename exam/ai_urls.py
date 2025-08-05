"""
URL patterns for AI Reporting System

Defines all API endpoints for AI-powered radiology reporting including:
- AI report generation and management
- Collaborative radiologist reporting
- Performance tracking and analytics
- System configuration management
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .ai_views import (
    AIGeneratedReportViewSet,
    RadiologistReportViewSet,
    ReportCollaborationViewSet,
    AIModelPerformanceViewSet,
    AIConfigurationView,
    AIConnectionTestView,
    AIReportingDashboardView,
    AIReportGenerationAPIView
)

from .manual_report_views import (
    ManualRadiologyReportViewSet,
    ManualReportCompleteView
)

# Create router for ViewSets
router = DefaultRouter()
router.register(r'ai-reports', AIGeneratedReportViewSet, basename='ai-reports')
router.register(r'radiologist-reports', RadiologistReportViewSet, basename='radiologist-reports')
router.register(r'collaborations', ReportCollaborationViewSet, basename='collaborations')
router.register(r'performance', AIModelPerformanceViewSet, basename='performance')

# Manual reporting (AI-independent)
router.register(r'manual-reports', ManualRadiologyReportViewSet, basename='manual-reports')

app_name = 'ai_reporting'

urlpatterns = [
    # ViewSet URLs
    path('api/ai-reporting/', include(router.urls)),
    
    # Configuration endpoints
    path('api/ai-reporting/config/', AIConfigurationView.as_view(), name='ai-config'),
    path('api/ai-reporting/config/test/', AIConnectionTestView.as_view(), name='ai-config-test'),
    
    # Dashboard and analytics
    path('api/ai-reporting/dashboard/', AIReportingDashboardView.as_view(), name='ai-dashboard'),
    
    # Simplified generation endpoint
    path('api/ai-reporting/generate/', AIReportGenerationAPIView.as_view(), name='ai-generate'),
    
    # Additional AI report endpoints
    path('api/ai-reporting/ai-reports/<int:pk>/update-status/', 
         AIGeneratedReportViewSet.as_view({'post': 'update_review_status'}), 
         name='ai-report-update-status'),
    path('api/ai-reporting/ai-reports/<int:pk>/dicom-images/', 
         AIGeneratedReportViewSet.as_view({'get': 'dicom_images'}), 
         name='ai-report-dicom-images'),
    path('api/ai-reporting/ai-reports/generate/', 
         AIGeneratedReportViewSet.as_view({'post': 'generate_report'}), 
         name='ai-report-generate'),
    
    # Radiologist report endpoints  
    path('api/ai-reporting/radiologist-reports/<int:pk>/add-collaboration/', 
         RadiologistReportViewSet.as_view({'post': 'add_collaboration'}), 
         name='radiologist-report-add-collaboration'),
    path('api/ai-reporting/radiologist-reports/<int:pk>/complete/', 
         RadiologistReportViewSet.as_view({'post': 'complete_report'}), 
         name='radiologist-report-complete'),
    
    # Performance analytics endpoints
    path('api/ai-reporting/performance/summary/', 
         AIModelPerformanceViewSet.as_view({'get': 'summary_stats'}), 
         name='performance-summary'),
    
    # Manual reporting endpoints (AI-independent) - direct access
    path('api/manual-reports/', ManualRadiologyReportViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='manual-reports-list'),
    path('api/manual-reports/<int:pk>/', ManualRadiologyReportViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='manual-reports-detail'),
    path('api/manual-reports/<int:report_id>/complete/', 
         ManualReportCompleteView.as_view(), 
         name='manual-report-complete'),
]