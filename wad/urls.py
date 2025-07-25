from django.urls import path
from . import views
app_name='wad'


urlpatterns = [
    path('', views.ward_list,  name='wad-list'),
    path('disiplin/', views.disiplin_list,  name='disiplin-list'),
    path('disiplin/tambah', views.disiplin_tambah,  name='disiplin-tambah'),
    path('disiplin/<int:id>/tambah', views.disiplin_update, name='disiplin-kemaskini'),
    path('disiplin/<int:id>/padam', views.disiplin_delete, name='disiplin-padam'),

    path('tambah/', views.wad_tambah, name='wad-tambah'),
    path('<int:id>/kemaskini/', views.wad_kemaskini, name='wad-kemaskini'),
    path('<int:id>/padam/', views.wad_delete, name='wad-padam'),

]
