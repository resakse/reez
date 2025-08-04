"""
Audit utilities for thread-local storage and helper functions
"""

import threading
import hashlib
from django.conf import settings


# Thread-local storage for current request context
_thread_locals = threading.local()


def get_current_request():
    """Get the current request from thread-local storage"""
    return getattr(_thread_locals, 'request', None)


def set_current_request(request):
    """Set the current request in thread-local storage"""
    _thread_locals.request = request


def clear_current_request():
    """Clear the current request from thread-local storage"""
    if hasattr(_thread_locals, 'request'):
        delattr(_thread_locals, 'request')


def get_current_user():
    """Get the current user from thread-local storage"""
    request = get_current_request()
    if request and hasattr(request, 'user') and request.user.is_authenticated:
        return request.user
    return None


def get_current_ip():
    """Get the current IP address from thread-local storage"""
    request = get_current_request()
    if request:
        return getattr(request, 'audit_ip', None)
    return None


class SimpleDataProtection:
    """Basic data protection utilities for small institutions"""
    
    @staticmethod
    def hash_sensitive_field(value):
        """
        Create consistent hash for search while protecting data
        
        This allows searching for records without exposing sensitive data
        """
        if not value:
            return None
        
        # Use Django secret key as salt for consistency
        salt = getattr(settings, 'SECRET_KEY', 'default-salt')
        hash_input = f"{salt}{value}".encode('utf-8')
        return hashlib.sha256(hash_input).hexdigest()[:16]
    
    @staticmethod
    def mask_ic_number(ic):
        """
        Mask Malaysian IC number for display
        
        Examples:
            "123456-78-9012" -> "12****-**-***2"
            "123456789012" -> "12********02"
        """
        if not ic or len(str(ic)) < 8:
            return ic
        
        ic_str = str(ic)
        if len(ic_str) <= 4:
            return '*' * len(ic_str)
        
        return f"{ic_str[:2]}{'*' * (len(ic_str) - 4)}{ic_str[-2:]}"
    
    @staticmethod
    def mask_phone_number(phone):
        """
        Mask phone number for display
        
        Examples:
            "0123456789" -> "012***6789"
            "+60123456789" -> "+60***6789"
        """
        if not phone or len(str(phone)) < 6:
            return phone
        
        phone_str = str(phone)
        if phone_str.startswith('+'):
            if len(phone_str) <= 7:
                return f"{phone_str[:4]}{'*' * (len(phone_str) - 4)}"
            return f"{phone_str[:6]}{'*' * (len(phone_str) - 9)}{phone_str[-3:]}"
        else:
            if len(phone_str) <= 6:
                return f"{phone_str[:3]}{'*' * (len(phone_str) - 3)}"
            return f"{phone_str[:3]}{'*' * (len(phone_str) - 6)}{phone_str[-3:]}"
    
    @staticmethod
    def mask_email(email):
        """
        Mask email address for display
        
        Examples:
            "user@example.com" -> "u***@e*****e.com"
        """
        if not email or '@' not in email:
            return email
        
        local, domain = email.split('@', 1)
        
        # Mask local part
        if len(local) <= 1:
            masked_local = local
        elif len(local) <= 3:
            masked_local = f"{local[0]}{'*' * (len(local) - 1)}"
        else:
            masked_local = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
        
        # Mask domain part
        if '.' in domain:
            domain_parts = domain.split('.')
            if len(domain_parts) >= 2:
                domain_name = domain_parts[0]
                domain_ext = '.'.join(domain_parts[1:])
                
                if len(domain_name) <= 1:
                    masked_domain = f"{domain_name}.{domain_ext}"
                elif len(domain_name) <= 3:
                    masked_domain = f"{domain_name[0]}{'*' * (len(domain_name) - 1)}.{domain_ext}"
                else:
                    masked_domain = f"{domain_name[0]}{'*' * (len(domain_name) - 2)}{domain_name[-1]}.{domain_ext}"
            else:
                masked_domain = domain
        else:
            masked_domain = f"{'*' * len(domain)}"
        
        return f"{masked_local}@{masked_domain}"


def log_model_change(instance, action, old_data=None, new_data=None):
    """
    Helper function to log model changes from signals or views
    
    Args:
        instance: Model instance that changed
        action: Action performed (CREATE, UPDATE, DELETE)
        old_data: Previous state of the instance
        new_data: New state of the instance
    """
    from .models import AuditLog
    
    user = get_current_user()
    ip_address = get_current_ip()
    
    # Determine resource type and name
    resource_type = instance.__class__.__name__
    resource_id = getattr(instance, 'id', None)
    
    # Generate resource name based on model type
    resource_name = str(instance)
    if resource_type == 'Pesakit' and hasattr(instance, 'nama'):
        resource_name = instance.nama
    elif resource_type == 'Staff' and hasattr(instance, 'username'):
        resource_name = instance.username
    
    AuditLog.log_action(
        user=user,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        old_data=old_data,
        new_data=new_data,
        ip_address=ip_address
    )


def extract_model_data(instance, fields=None):
    """
    Extract relevant data from a model instance for audit logging
    
    Args:
        instance: Model instance
        fields: List of fields to extract (None for all important fields)
    
    Returns:
        Dictionary of field values
    """
    if not instance:
        return None
    
    # Default important fields based on model type
    model_name = instance.__class__.__name__
    
    if fields is None:
        if model_name == 'Pesakit':
            fields = ['id', 'mrn', 'nama', 'ic', 'jantina']
        elif model_name == 'Staff':
            fields = ['id', 'username', 'first_name', 'last_name', 'is_active']
        elif model_name == 'Pemeriksaan':
            fields = ['id', 'jxr', 'exam', 'modaliti']
        elif model_name == 'Daftar':
            fields = ['id', 'pesakit', 'pemeriksaan', 'tarikh']
        else:
            # Generic fields for unknown models
            fields = ['id', 'name', 'nama', 'title']
    
    data = {}
    for field in fields:
        if hasattr(instance, field):
            value = getattr(instance, field)
            
            # Handle foreign key relationships
            if hasattr(value, 'pk'):
                data[field] = str(value)
            else:
                data[field] = value
    
    return data