from django.urls import path
from . import views
app_name = "staff"


urlpatterns = [
    path("login/", views.login_user, name="staff-login"),
    path("logout/", views.logout_view, name="staff-logout"),
    path("tukar/", views.tukar_laluan, name="staff-tukar"),
    path("tambah", views.staff_tambah, name="staff-tambah"),
    path("<int:pk>/aktif", views.useractive, name="staff-aktif"),
    path("<int:pk>/kemaskini", views.staff_edit, name="staff-edit"),
    path("<int:pk>/passwd", views.staff_passwd, name="staff-pass"),
    path("", views.stafflist, name="staff-list"),

]