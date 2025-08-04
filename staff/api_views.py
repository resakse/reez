from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Staff
from .serializers import StaffSerializer, StaffCreateUpdateSerializer
from audit.mixins import APIAuditMixin

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

class StaffListCreateAPIView(APIAuditMixin, generics.ListCreateAPIView):
    queryset = Staff.objects.all()
    permission_classes = [IsStaffPermission]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffCreateUpdateSerializer
        return StaffSerializer
    
    def get_queryset(self):
        queryset = Staff.objects.all()
        jawatan = self.request.query_params.get('jawatan', None)
        if jawatan is not None:
            queryset = queryset.filter(jawatan=jawatan)
        return queryset
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        # Use the audit mixin's perform_create method
        return super().perform_create(serializer)

class StaffRetrieveUpdateDestroyAPIView(APIAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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
        # Use the audit mixin's perform_update method
        return super().perform_update(serializer)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            # Log deactivation instead of deletion
            old_data = {'is_active': instance.is_active, 'username': instance.username}
            new_data = {'is_active': False, 'username': instance.username}
            
            # Instead of deleting, just deactivate the staff
            instance.is_active = False
            instance.save()
            
            # Log the deactivation
            self.log_api_audit('DEACTIVATE', instance=instance, success=True)
            
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            self.log_api_audit('DEACTIVATE', instance=instance, success=False, exception=e)
            raise