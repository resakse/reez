from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet

# Create DRF router for audit API endpoints
router = DefaultRouter()
router.register(r'logs', AuditLogViewSet, basename='auditlog')

app_name = 'audit'

urlpatterns = [
    # API endpoints - now at /api/audit/ instead of /audit/api/
    path('audit/', include(router.urls)),
]

# Available endpoints:
# GET  /api/audit/logs/                     - List audit logs (paginated)
# GET  /api/audit/logs/{id}/                - Get specific audit log
# GET  /api/audit/logs/statistics/          - Get dashboard statistics  
# GET  /api/audit/logs/export_csv/          - Export logs to CSV
# POST /api/audit/logs/export_csv/          - Export logs to CSV with filters
# GET  /api/audit/logs/filter_options/      - Get available filter options