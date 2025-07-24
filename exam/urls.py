from django.urls import path
from . import views

app_name = 'exam'
from . import api
# from .export import export_xls
app_name = "bcs"


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

]
