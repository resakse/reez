from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    ModalitiViewSet, PartViewSet, ExamViewSet, 
    DaftarViewSet, PemeriksaanViewSet, 
    RegistrationWorkflowView, MWLWorklistView,
    GroupedExaminationView, GroupedMWLView, PositionChoicesView,
    DicomWorklistExportView
)
from .settings_views import PacsConfigListCreateAPIView, PacsConfigDetailAPIView, get_current_pacs_config, get_pacs_orthanc_url
from .examination_views import ExaminationListAPIView, ExaminationDetailAPIView
from .pacs_views import PacsSearchView, pacs_stats, import_legacy_study, DicomImageProxyView, dicom_instance_proxy, get_study_image_ids, get_enhanced_study_metadata

from . import api
# from .export import export_xls
app_name = "bcs"

# REST API router
router = DefaultRouter(trailing_slash=True)
router.register(r'modalities', ModalitiViewSet, basename='modality')
router.register(r'parts', PartViewSet, basename='part')
router.register(r'exams', ExamViewSet, basename='exam')
router.register(r'registrations', DaftarViewSet, basename='registration')
router.register(r'examinations', PemeriksaanViewSet, basename='examination')

urlpatterns = [
    path("", views.orthanc_study, name="orthanc-study"),
    path("exam/", views.senarai_bcs, name="bcs-list"),
    path("exam/tambah", views.tambah_bcs, name="bcs-tambah"),
    path("exam/<int:pk>/kemaskini", views.edit_bcs, name="bcs-edit"),
    path("exam/<int:pk>/exam/senarai", views.list_exam, name="exam-senarai"),
    path("exam/<int:pk>/exam/tambah", views.tambah_exam, name="exam-tambah"),
    path("exam/<int:pk>/exam/edit", views.edit_exam, name="exam-edit"),
    path("exam/<int:pk>/exam/padam", views.del_exam, name="exam-padam"),
    path("exam/<int:pk>/exam/view", views.exam_view, name="exam-view"),
    path("exam/<int:pk>/exam/get", views.get_exam, name="exam-get"),
    path("exam/<int:pk>/exam/detail", views.get_detail, name="exam-detail"),
    path("exam/<int:pk>/exam/komen", views.edit_comment, name="exam-komen"),
    path("exam/<int:pk>/click", views.get_click, name="bcs-click"),
    # path("<int:pk>/merge", views.merged, name="bcs-merge"),

    #exam
    path("config/", views.configList, name="config-list"),
    path("config/stat", views.staticList, name="config-stat-list"),
    path("config/exam", views.examList, name="config-exam-list"),
    path("config/exam/<int:pk>", views.examUpdate, name="config-exam-update"),
    path("config/exam/<int:pk>/padam", views.examDelete, name="config-exam-padam"),
    path("config/pacs/", views.pacs_config, name="pacs-config"),
    path("checkam", views.checkAM, name="checkam"),
    # path("export/", export_xls, name="excel"),

    # api
    path("api/modaliti", api.modalitiApi, name="api-modaliti"),
    path("api/exam", api.examlistApi, name="api-exam"),
    path("api/rujukan", api.rujukanApi, name="api-rujukan"),

    #orthanc
    path("senarai/pesakit/", views.orthanc_list, name="orthanc-list"),
    path("senarai/exam/", views.orthanc_study, name="orthanc-study"),
    
    # New grouped examination endpoints (MUST come before router to avoid conflicts)
    path('examinations/grouped/', GroupedExaminationView.as_view(), name='grouped-examinations'),
    path('mwl/grouped/', GroupedMWLView.as_view(), name='grouped-mwl'),
    path('choices/positions/', PositionChoicesView.as_view(), name='position-choices'),
    path('dicom/worklist/export/', DicomWorklistExportView.as_view(), name='dicom-worklist-export'),
    
    # Additional REST API endpoints for workflow
    path('registration/workflow/', RegistrationWorkflowView.as_view(), name='registration-workflow'),
    path('mwl/worklist/', MWLWorklistView.as_view(), name='mwl-worklist'),
    
    # REST API endpoints
    path('', include(router.urls)),
    
    # PACS Settings API endpoints (supervisor only)
    path('settings/pacs/', PacsConfigListCreateAPIView.as_view(), name='pacs-settings-list'),
    path('settings/pacs/<int:pk>/', PacsConfigDetailAPIView.as_view(), name='pacs-settings-detail'),
    path('settings/pacs/current/', get_current_pacs_config, name='pacs-settings-current'),
    
    # PACS Orthanc URL endpoint (authenticated users)
    path('pacs/orthanc-url/', get_pacs_orthanc_url, name='pacs-orthanc-url'),
    
    # Examination API endpoints (active users only)
    path('examinations/list/', ExaminationListAPIView.as_view(), name='examinations-list'),
    path('examinations/<int:pk>/', ExaminationDetailAPIView.as_view(), name='examinations-detail'),
    
    # PACS Browser API endpoints (authenticated users)
    path('pacs/search/', PacsSearchView.as_view(), name='pacs-search'),
    path('pacs/stats/', pacs_stats, name='pacs-stats'),
    path('pacs/import/', import_legacy_study, name='pacs-import'),
    
    # DICOM Image Proxy endpoints (authenticated users)
    path('pacs/dicom-web/studies/<str:study_uid>/series/<str:series_uid>/instances/<str:instance_uid>', 
         DicomImageProxyView.as_view(), name='dicom-image-proxy'),
    path('pacs/instances/<str:orthanc_id>/file', dicom_instance_proxy, name='dicom-instance-proxy'),
    path('pacs/studies/<str:study_uid>/image-ids/', get_study_image_ids, name='get-study-image-ids'),
    path('pacs/studies/<str:study_uid>/enhanced-metadata/', get_enhanced_study_metadata, name='get-enhanced-study-metadata'),
]
