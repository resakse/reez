"""
DRF ViewSet audit integration mixins

This module provides simple audit mixins for Django REST Framework ViewSets
to automatically track CRUD operations on sensitive resources.

Part of Phase 2 of the small-scale audit trails system.
"""

import logging
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import status
from rest_framework.response import Response

from .models import AuditLog
from .utils import get_current_ip, extract_model_data

logger = logging.getLogger(__name__)


class SimpleAuditMixin:
    """
    Simple audit mixin for DRF ViewSets
    
    This mixin automatically logs CRUD operations for ViewSets with minimal
    configuration. It integrates with the thread-local user context system
    and provides consistent audit logging across the application.
    
    Usage:
        class MyModelViewSet(SimpleAuditMixin, viewsets.ModelViewSet):
            # Your ViewSet implementation
            pass
    """
    
    def get_audit_resource_type(self):
        """
        Get the resource type for audit logging
        
        Override this method to customize resource type names
        """
        if hasattr(self, 'queryset') and self.queryset is not None:
            return self.queryset.model.__name__
        return 'Unknown'
    
    def get_audit_resource_name(self, instance):
        """
        Get a human-readable name for the resource instance
        
        Override this method to customize resource naming
        """
        if hasattr(instance, 'nama'):
            return str(instance.nama)
        elif hasattr(instance, 'name'):
            return str(instance.name)
        elif hasattr(instance, 'username'):
            return str(instance.username)
        elif hasattr(instance, 'title'):
            return str(instance.title)
        else:
            return str(instance)
    
    def get_audit_fields(self, instance):
        """
        Get the fields to include in audit data
        
        Override this method to customize which fields are logged
        """
        return extract_model_data(instance)
    
    def log_audit_action(self, action, instance=None, old_data=None, new_data=None, success=True, exception=None):
        """
        Log an audit action
        
        Args:
            action: Action performed (CREATE, UPDATE, DELETE, VIEW)
            instance: Model instance (if available)
            old_data: Previous state data
            new_data: New state data
            success: Whether the action was successful
            exception: Exception if any occurred
        """
        try:
            user = self.request.user if hasattr(self.request, 'user') and self.request.user.is_authenticated else None
            ip_address = get_current_ip() or getattr(self.request, 'audit_ip', None)
            
            # Get resource information
            resource_type = self.get_audit_resource_type()
            resource_id = getattr(instance, 'id', None) if instance else None
            resource_name = self.get_audit_resource_name(instance) if instance else None
            
            # Add exception information to audit data
            if exception:
                if new_data is None:
                    new_data = {}
                new_data.update({
                    'exception': str(exception),
                    'exception_type': exception.__class__.__name__
                })
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                old_data=old_data,
                new_data=new_data,
                ip_address=ip_address,
                success=success
            )
            
        except Exception as e:
            logger.error(f"Failed to log audit action {action}: {e}")
    
    def perform_create(self, serializer):
        """Override to log creation"""
        try:
            # Save the instance first
            instance = serializer.save()
            
            # Log the creation
            new_data = self.get_audit_fields(instance)
            self.log_audit_action('CREATE', instance=instance, new_data=new_data, success=True)
            
            logger.info(f"Created {self.get_audit_resource_type()} {instance.id} by {self.request.user.username}")
            
        except Exception as e:
            # Log failed creation
            self.log_audit_action('CREATE', success=False, exception=e)
            logger.error(f"Failed to create {self.get_audit_resource_type()}: {e}")
            raise
    
    def perform_update(self, serializer):
        """Override to log updates"""
        try:
            instance = serializer.instance
            
            # Get old data before update
            old_data = self.get_audit_fields(instance)
            
            # Save the updated instance
            updated_instance = serializer.save()
            
            # Get new data after update
            new_data = self.get_audit_fields(updated_instance)
            
            # Log the update
            self.log_audit_action('UPDATE', instance=updated_instance, old_data=old_data, new_data=new_data, success=True)
            
            logger.info(f"Updated {self.get_audit_resource_type()} {updated_instance.id} by {self.request.user.username}")
            
        except Exception as e:
            # Log failed update
            self.log_audit_action('UPDATE', instance=getattr(serializer, 'instance', None), success=False, exception=e)
            logger.error(f"Failed to update {self.get_audit_resource_type()}: {e}")
            raise
    
    def perform_destroy(self, instance):
        """Override to log deletions"""
        try:
            # Get data before deletion
            old_data = self.get_audit_fields(instance)
            resource_id = instance.id
            resource_name = self.get_audit_resource_name(instance)
            
            # Delete the instance
            super().perform_destroy(instance)
            
            # Log the deletion (instance is now deleted, so pass data separately)
            self.log_audit_action(
                'DELETE', 
                old_data=old_data,
                success=True
            )
            
            # Manual log entry since instance is deleted
            try:
                user = self.request.user if hasattr(self.request, 'user') and self.request.user.is_authenticated else None
                ip_address = get_current_ip() or getattr(self.request, 'audit_ip', None)
                
                AuditLog.log_action(
                    user=user,
                    action='DELETE',
                    resource_type=self.get_audit_resource_type(),
                    resource_id=resource_id,
                    resource_name=resource_name,
                    old_data=old_data,
                    ip_address=ip_address,
                    success=True
                )
            except Exception as log_error:
                logger.error(f"Failed to create audit log for deletion: {log_error}")
            
            logger.info(f"Deleted {self.get_audit_resource_type()} {resource_id} by {self.request.user.username}")
            
        except Exception as e:
            # Log failed deletion
            self.log_audit_action('DELETE', instance=instance, success=False, exception=e)
            logger.error(f"Failed to delete {self.get_audit_resource_type()}: {e}")
            raise
    
    def retrieve(self, request, *args, **kwargs):
        """Override to log view/retrieve operations for sensitive resources"""
        try:
            response = super().retrieve(request, *args, **kwargs)
            
            # Only log retrieval for sensitive resource types
            if self.should_log_retrieval():
                instance = self.get_object()
                self.log_audit_action('VIEW', instance=instance, success=True)
            
            return response
            
        except Exception as e:
            # Log failed retrieval
            self.log_audit_action('VIEW', success=False, exception=e)
            raise
    
    def list(self, request, *args, **kwargs):
        """Override to log list operations for sensitive resources"""
        try:
            response = super().list(request, *args, **kwargs)
            
            # Only log list operations for sensitive resource types
            if self.should_log_list():
                # Log the list operation
                list_data = {
                    'count': len(response.data.get('results', [])) if isinstance(response.data, dict) else len(response.data),
                    'filters': dict(request.query_params)
                }
                self.log_audit_action('VIEW', new_data=list_data, success=True)
            
            return response
            
        except Exception as e:
            # Log failed list operation
            self.log_audit_action('VIEW', success=False, exception=e)
            raise
    
    def should_log_retrieval(self):
        """
        Determine if retrieval operations should be logged
        
        Override this method to customize when retrievals are logged.
        By default, only Patient records are logged to avoid noise.
        """
        resource_type = self.get_audit_resource_type()
        sensitive_resources = ['Pesakit', 'Patient']
        return resource_type in sensitive_resources
    
    def should_log_list(self):
        """
        Determine if list operations should be logged
        
        Override this method to customize when list operations are logged.
        By default, only Patient list operations are logged.
        """
        resource_type = self.get_audit_resource_type()
        sensitive_resources = ['Pesakit', 'Patient']
        return resource_type in sensitive_resources


class PatientAuditMixin(SimpleAuditMixin):
    """
    Specialized audit mixin for Patient resources
    
    This mixin provides enhanced audit logging specifically for patient
    records, which require the highest level of tracking for HIPAA compliance.
    """
    
    def get_audit_resource_type(self):
        return 'Patient'
    
    def should_log_retrieval(self):
        return True  # Always log patient record access
    
    def should_log_list(self):
        return True  # Always log patient list access
    
    def get_audit_fields(self, instance):
        """Override to include patient-specific fields"""
        if hasattr(instance, 'mrn'):
            return {
                'id': instance.id,
                'mrn': instance.mrn,
                'nama': instance.nama,
                'ic': getattr(instance, 'ic', None),
                'nric': getattr(instance, 'nric', None),
                'jantina': getattr(instance, 'jantina', None),
                'created': str(getattr(instance, 'created', None)),
                'modified': str(getattr(instance, 'modified', None))
            }
        return super().get_audit_fields(instance)


class StaffAuditMixin(SimpleAuditMixin):
    """
    Specialized audit mixin for Staff resources
    
    This mixin provides audit logging for staff management operations,
    focusing on account creation, modification, and permission changes.
    """
    
    def get_audit_resource_type(self):
        return 'Staff'
    
    def should_log_retrieval(self):
        return False  # Don't log staff record retrievals to reduce noise
    
    def should_log_list(self):
        return False  # Don't log staff list operations
    
    def get_audit_fields(self, instance):
        """Override to include staff-specific fields"""
        if hasattr(instance, 'username'):
            return {
                'id': instance.id,
                'username': instance.username,
                'first_name': getattr(instance, 'first_name', ''),
                'last_name': getattr(instance, 'last_name', ''),
                'is_active': getattr(instance, 'is_active', True),
                'is_staff': getattr(instance, 'is_staff', False),
                'is_superuser': getattr(instance, 'is_superuser', False),
                'last_login': str(getattr(instance, 'last_login', None)),
                'date_joined': str(getattr(instance, 'date_joined', None))
            }
        return super().get_audit_fields(instance)


class ExaminationAuditMixin(SimpleAuditMixin):
    """
    Specialized audit mixin for Examination resources
    
    This mixin provides audit logging for radiology examination operations.
    """
    
    def get_audit_resource_type(self):
        return 'Examination'
    
    def should_log_retrieval(self):
        return False  # Don't log examination retrievals to reduce noise
    
    def should_log_list(self):
        return False  # Don't log examination list operations
    
    def get_audit_fields(self, instance):
        """Override to include examination-specific fields"""
        if hasattr(instance, 'jxr'):
            return {
                'id': instance.id,
                'jxr': getattr(instance, 'jxr', ''),
                'exam': str(getattr(instance, 'exam', '')),
                'modaliti': str(getattr(instance, 'modaliti', '')),
                'daftar': getattr(instance, 'daftar_id', None),
                'created': str(getattr(instance, 'created', None)),
                'modified': str(getattr(instance, 'modified', None))
            }
        return super().get_audit_fields(instance)


class APIAuditMixin:
    """
    Simple mixin for non-ViewSet API views
    
    This mixin can be used with generic API views to provide basic audit logging.
    """
    
    def get_audit_resource_type(self):
        """Get resource type for audit logging"""
        if hasattr(self, 'model'):
            return self.model.__name__
        elif hasattr(self, 'queryset') and self.queryset is not None:
            return self.queryset.model.__name__
        return 'API'
    
    def log_api_audit(self, action, instance=None, success=True, exception=None):
        """Log API operation"""
        try:
            user = self.request.user if hasattr(self.request, 'user') and self.request.user.is_authenticated else None
            ip_address = get_current_ip() or getattr(self.request, 'audit_ip', None)
            
            audit_data = {
                'method': self.request.method,
                'path': self.request.path,
            }
            
            if exception:
                audit_data.update({
                    'exception': str(exception),
                    'exception_type': exception.__class__.__name__
                })
            
            resource_id = getattr(instance, 'id', None) if instance else None
            resource_name = str(instance) if instance else f"{self.request.method} {self.request.path}"
            
            AuditLog.log_action(
                user=user,
                action=f'API_{action}',
                resource_type=self.get_audit_resource_type(),
                resource_id=resource_id,
                resource_name=resource_name,
                new_data=audit_data,
                ip_address=ip_address,
                success=success
            )
            
        except Exception as e:
            logger.error(f"Failed to log API audit: {e}")
    
    def perform_create(self, serializer):
        """Override to log creation in generic views"""
        try:
            instance = serializer.save()
            self.log_api_audit('CREATE', instance=instance, success=True)
            return instance
        except Exception as e:
            self.log_api_audit('CREATE', success=False, exception=e)
            raise
    
    def perform_update(self, serializer):
        """Override to log updates in generic views"""
        try:
            instance = serializer.save()
            self.log_api_audit('UPDATE', instance=instance, success=True)
            return instance
        except Exception as e:
            self.log_api_audit('UPDATE', success=False, exception=e)
            raise