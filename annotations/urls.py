from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DicomAnnotationViewSet

# Create router and register viewsets
router = DefaultRouter()
router.register(r'annotations', DicomAnnotationViewSet, basename='dicom-annotations')

urlpatterns = [
    # API endpoints
    path('', include(router.urls)),
]

# URL patterns will generate the following endpoints:
# GET    /api/annotations/                    - List all annotations (with filtering)
# POST   /api/annotations/                    - Create new annotation
# GET    /api/annotations/{id}/               - Get specific annotation
# PUT    /api/annotations/{id}/               - Update annotation (full)
# PATCH  /api/annotations/{id}/               - Update annotation (partial)
# DELETE /api/annotations/{id}/               - Delete annotation
# GET    /api/annotations/by_study/           - Get annotations by study UID
# GET    /api/annotations/by_image/           - Get annotations by image ID
# GET    /api/annotations/my_annotations/     - Get current user's annotations
# DELETE /api/annotations/bulk_delete/        - Bulk delete annotations