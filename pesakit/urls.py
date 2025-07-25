from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PesakitViewSet

router = DefaultRouter()
router.register(r'patients', PesakitViewSet)

urlpatterns = [
    path('', include(router.urls)),
] 