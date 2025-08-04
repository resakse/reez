from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import json


class AuditLog(models.Model):
    """Simple audit log model for small institutions"""
    
    ACTION_CHOICES = [
        ('LOGIN', 'Login'),
        ('LOGOUT', 'Logout'), 
        ('LOGIN_FAILED', 'Login Failed'),
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
        ('DELETE', 'Delete'),
        ('VIEW', 'View'),
        ('EXPORT', 'Export'),
        ('API_GET', 'API View'),
        ('API_POST', 'API Create'),
        ('API_PUT', 'API Update'),
        ('API_PATCH', 'API Update'),
        ('API_DELETE', 'API Delete'),
    ]
    
    user = models.ForeignKey(
        'staff.Staff', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        help_text="User who performed the action"
    )
    username = models.CharField(
        max_length=150,
        help_text="Username (preserved even if user is deleted)"
    )
    action = models.CharField(
        max_length=50, 
        choices=ACTION_CHOICES, 
        db_index=True,
        help_text="Type of action performed"
    )
    resource_type = models.CharField(
        max_length=50, 
        blank=True, 
        db_index=True,
        help_text="Type of resource accessed (Patient, Examination, etc.)"
    )
    resource_id = models.CharField(
        max_length=50, 
        blank=True,
        help_text="ID of the resource accessed"
    )
    resource_name = models.CharField(
        max_length=200, 
        blank=True,
        help_text="Masked name/description of the resource"
    )
    old_data = models.JSONField(
        null=True, 
        blank=True,
        help_text="Previous state of the resource (masked)"
    )
    new_data = models.JSONField(
        null=True, 
        blank=True,
        help_text="New state of the resource (masked)"
    )
    ip_address = models.GenericIPAddressField(
        null=True, 
        blank=True,
        help_text="IP address of the user"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True, 
        db_index=True,
        help_text="When the action occurred"
    )
    success = models.BooleanField(
        default=True,
        help_text="Whether the action was successful"
    )
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['timestamp', 'success']),
        ]
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
    
    def __str__(self):
        return f"{self.username} - {self.action} - {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"
    
    @classmethod
    def log_action(cls, user, action, resource_type=None, resource_id=None, 
                   resource_name=None, old_data=None, new_data=None, 
                   ip_address=None, success=True):
        """
        Simple logging method for audit trail
        
        Args:
            user: User instance or None for anonymous actions
            action: Action type (from ACTION_CHOICES)
            resource_type: Type of resource (Patient, Examination, etc.)
            resource_id: ID of the resource
            resource_name: Name/description of resource (will be masked if sensitive)
            old_data: Previous state of resource (will be masked)
            new_data: New state of resource (will be masked)
            ip_address: IP address of the user
            success: Whether the action was successful
        
        Returns:
            AuditLog instance
        """
        # Mask sensitive data based on resource type
        if resource_name and resource_type == 'Patient':
            resource_name = cls.mask_patient_name(resource_name)
        
        if old_data:
            old_data = cls.mask_sensitive_data(old_data)
        if new_data:
            new_data = cls.mask_sensitive_data(new_data)
        
        # Ensure we have a username even if user is None
        username = user.username if user else 'Anonymous'
        
        return cls.objects.create(
            user=user,
            username=username,
            action=action,
            resource_type=resource_type or '',
            resource_id=str(resource_id) if resource_id else '',
            resource_name=resource_name or '',
            old_data=old_data,
            new_data=new_data,
            ip_address=ip_address,
            success=success
        )
    
    @staticmethod
    def mask_patient_name(name):
        """
        Simple name masking for patient privacy
        
        Examples:
            "John Doe" -> "J*** D***"
            "Ahmad bin Abdullah" -> "A**** b** A*******"
        """
        if not name or len(name.strip()) == 0:
            return name
        
        parts = name.strip().split()
        masked_parts = []
        
        for part in parts:
            if len(part) <= 1:
                masked_parts.append(part)
            elif len(part) <= 3:
                masked_parts.append(f"{part[0]}{'*' * (len(part) - 1)}")
            else:
                masked_parts.append(f"{part[0]}{'*' * (len(part) - 1)}")
        
        return ' '.join(masked_parts)
    
    @staticmethod
    def mask_sensitive_data(data):
        """
        Simple data masking for JSON fields containing sensitive information
        
        Masks: ic, nric, phone, email, address, telefon, alamat
        """
        if not isinstance(data, dict):
            return data
        
        sensitive_fields = [
            'ic', 'nric', 'phone', 'email', 'address', 
            'telefon', 'alamat', 'no_telefon', 'emel'
        ]
        masked_data = data.copy()
        
        for field in sensitive_fields:
            if field in masked_data and masked_data[field]:
                value = str(masked_data[field])
                if len(value) > 4:
                    # Show first 2 and last 2 characters, mask the middle
                    masked_data[field] = f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"
                elif len(value) > 2:
                    # Show first character, mask the rest
                    masked_data[field] = f"{value[0]}{'*' * (len(value) - 1)}"
                else:
                    # Very short values get fully masked
                    masked_data[field] = '*' * len(value)
        
        return masked_data
    
    @staticmethod
    def mask_ic_number(ic):
        """
        Specific masking for Malaysian IC numbers
        
        Examples:
            "123456-78-9012" -> "12****-**-***2"
            "123456789012" -> "12********02"
        """
        if not ic or len(ic) < 8:
            return ic
        
        ic_str = str(ic)
        if len(ic_str) <= 4:
            return '*' * len(ic_str)
        
        return f"{ic_str[:2]}{'*' * (len(ic_str) - 4)}{ic_str[-2:]}"
    
    @staticmethod
    def mask_phone_number(phone):
        """
        Specific masking for phone numbers
        
        Examples:
            "0123456789" -> "012***6789"
            "+60123456789" -> "+60***6789"
        """
        if not phone or len(phone) < 6:
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
    
    def get_action_display_color(self):
        """Return CSS color class for different action types"""
        color_map = {
            'LOGIN': 'text-blue-600',
            'LOGOUT': 'text-gray-600',
            'LOGIN_FAILED': 'text-red-600',
            'CREATE': 'text-green-600',
            'UPDATE': 'text-yellow-600',
            'DELETE': 'text-red-600',
            'VIEW': 'text-gray-600',
            'EXPORT': 'text-purple-600',
        }
        return color_map.get(self.action, 'text-gray-600')
    
    def get_formatted_timestamp(self):
        """Return formatted timestamp for display"""
        return self.timestamp.strftime('%Y-%m-%d %H:%M:%S')
    
    def get_pretty_data(self, field_name):
        """Return formatted JSON data for display"""
        data = getattr(self, field_name)
        if not data:
            return None
        
        try:
            return json.dumps(data, indent=2, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(data)