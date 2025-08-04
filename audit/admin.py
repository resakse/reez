from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only admin interface for audit logs"""
    
    list_display = [
        'timestamp', 'username', 'action', 'resource_type', 
        'resource_name', 'ip_address', 'success'
    ]
    list_filter = [
        'action', 'resource_type', 'success', 'timestamp'
    ]
    search_fields = [
        'username', 'resource_name', 'ip_address'
    ]
    readonly_fields = [
        'user', 'username', 'action', 'resource_type', 
        'resource_id', 'resource_name', 'old_data', 
        'new_data', 'ip_address', 'timestamp', 'success'
    ]
    
    def has_add_permission(self, request):
        """Prevent manual creation of audit logs"""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Allow viewing but not editing"""
        return request.user.is_superuser
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of audit logs"""
        return False
    
    def has_view_permission(self, request, obj=None):
        """Only superusers can view audit logs"""
        return request.user.is_superuser