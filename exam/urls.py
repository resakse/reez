from django.urls import path
from . import views
from . import api
# from .export import export_xls
app_name = "bcs"


urlpatterns = [
    path("", views.senarai_bcs, name="bcs-list"),
    path("tambah", views.tambah_bcs, name="bcs-tambah"),
    path("<int:pk>/kemaskini", views.edit_bcs, name="bcs-edit"),
    path("<int:pk>/exam/senarai", views.list_exam, name="exam-senarai"),
    path("<int:pk>/exam/tambah", views.tambah_exam, name="exam-tambah"),
    path("<int:pk>/exam/edit", views.edit_exam, name="exam-edit"),
    path("<int:pk>/exam/padam", views.del_exam, name="exam-padam"),
    path("<int:pk>/exam/get", views.get_exam, name="exam-get"),
    path("<int:pk>/exam/detail", views.get_detail, name="exam-detail"),
    path("<int:pk>/exam/komen", views.edit_comment, name="exam-komen"),
    path("<int:pk>/click", views.get_click, name="bcs-click"),
    # path("<int:pk>/merge", views.merged, name="bcs-merge"),

    #exam
    path("config/", views.configList, name="config-list"),
    path("config/stat", views.staticList, name="config-stat-list"),
    path("config/exam", views.examList, name="config-exam-list"),
    path("config/exam/<int:pk>", views.examUpdate, name="config-exam-update"),
    path("config/exam/<int:pk>/padam", views.examDelete, name="config-exam-padam"),

    #ceking
    path("checkam", views.checkAM, name="checkam"),
    # path("export/", export_xls, name="excel"),

    # api
    path("api/modaliti", api.modalitiApi, name="api-modaliti"),
    path("api/exam", api.examlistApi, name="api-exam"),
    path("api/rujukan", api.rujukanApi, name="api-rujukan"),
]
