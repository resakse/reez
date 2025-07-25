from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PesakitViewSet

router = DefaultRouter(trailing_slash=True)
router.register(r'patients', PesakitViewSet, basename='patient')

urlpatterns = [
    path('', include(router.urls)),
] 