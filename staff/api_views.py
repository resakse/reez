from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Staff
from .serializers import StaffSerializer, StaffCreateUpdateSerializer

User = get_user_model()

class IsStaffPermission(permissions.BasePermission):
    """
    Custom permission to only allow staff members to access staff management.
    """
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_staff
        )

class StaffListCreateAPIView(generics.ListCreateAPIView):
    queryset = Staff.objects.all()
    permission_classes = [IsStaffPermission]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffCreateUpdateSerializer
        return StaffSerializer
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        serializer.save()

class StaffRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Staff.objects.all()
    permission_classes = [IsStaffPermission]
    
    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return StaffCreateUpdateSerializer
        return StaffSerializer
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_update(self, serializer):
        serializer.save()
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Instead of deleting, just deactivate the staff
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)