from django.urls import path
from .api_views import StaffListCreateAPIView, StaffRetrieveUpdateDestroyAPIView

urlpatterns = [
    path("staff/", StaffListCreateAPIView.as_view(), name="staff-api-list"),
    path("staff/<int:pk>/", StaffRetrieveUpdateDestroyAPIView.as_view(), name="staff-api-detail"),
]