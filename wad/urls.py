from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import WardViewSet, DisiplinViewSet

app_name='wad'

# REST API router
router = DefaultRouter(trailing_slash=True)
router.register(r'wards', WardViewSet, basename='ward')
router.register(r'disciplines', DisiplinViewSet, basename='discipline')

urlpatterns = [
    path('', views.ward_list,  name='wad-list'),
    path('disiplin/', views.disiplin_list,  name='disiplin-list'),
    path('disiplin/tambah', views.disiplin_tambah,  name='disiplin-tambah'),
    path('disiplin/<int:id>/kemaskini', views.disiplin_update, name='disiplin-kemaskini'),
    path('disiplin/<int:id>/padam', views.disiplin_delete, name='disiplin-padam'),

    path('tambah/', views.wad_tambah, name='wad-tambah'),
    path('<int:id>/kemaskini/', views.wad_kemaskini, name='wad-kemaskini'),
    path('<int:id>/padam/', views.wad_delete, name='wad-padam'),
    
    # REST API endpoints
    path('api/', include(router.urls)),
]
