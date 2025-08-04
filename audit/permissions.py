"""
Enhanced access control for small-scale audit trails system.
Provides superuser-only permissions with session verification.
"""

from rest_framework.permissions import BasePermission
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class SuperuserOnlyPermission(BasePermission):
    """
    Enhanced superuser-only permission with session verification.
    Suitable for small institutions with 20-30 users.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission to access audit system"""
        
        # Anonymous users have no access
        if isinstance(request.user, AnonymousUser) or not request.user:
            logger.warning(f"Anonymous user attempted audit access from {self.get_client_ip(request)}")
            return False
        
        # Only superusers can access audit system
        if not request.user.is_superuser:
            logger.warning(f"Non-superuser {request.user.username} attempted audit access from {self.get_client_ip(request)}")
            return False
        
        # Verify user account is active
        if not request.user.is_active:
            logger.warning(f"Inactive superuser {request.user.username} attempted audit access")
            return False
        
        # Basic session verification
        if not self.verify_session_security(request):
            logger.warning(f"Superuser {request.user.username} failed session security check")
            return False
        
        # Log successful audit access
        logger.info(f"Superuser {request.user.username} granted audit access from {self.get_client_ip(request)}")
        return True
    
    def has_object_permission(self, request, view, obj):
        """Check object-level permissions"""
        return self.has_permission(request, view)
    
    def verify_session_security(self, request):
        """
        Basic security verification for both session and JWT authentication.
        Handles JWT tokens from frontend and sessions from Django admin.
        """
        try:
            # For JWT authentication (from frontend), check if Authorization header exists
            auth_header = request.META.get('HTTP_AUTHORIZATION')
            if auth_header and auth_header.startswith('Bearer '):
                # JWT authentication - check token validity (already verified by DRF)
                # Additional checks can be added here if needed
                return True
            
            # For session authentication (from Django admin), check session
            if hasattr(request, 'session') and request.session.session_key:
                # Check session age (max 8 hours for audit access)
                if hasattr(request.session, 'get_session_cookie_age'):
                    session_age = request.session.get_session_cookie_age()
                    if session_age and session_age > 28800:  # 8 hours
                        return False
                
                # Store audit access timestamp in session
                request.session['last_audit_access'] = timezone.now().isoformat()
                request.session.save()
                
                return True
            
            # If neither JWT nor valid session, reject
            return False
            
        except Exception as e:
            logger.error(f"Session verification error: {e}")
            return False
    
    def get_client_ip(self, request):
        """Get real client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', 'Unknown')


class AuditAccessLoggingPermission(SuperuserOnlyPermission):
    """
    Extension of SuperuserOnlyPermission that logs all access attempts.
    Useful for security monitoring in small institutions.
    """
    
    def has_permission(self, request, view):
        """Enhanced permission checking with access logging"""
        
        # Get basic info for logging
        ip_address = self.get_client_ip(request)
        user_info = f"{request.user.username}" if request.user and not isinstance(request.user, AnonymousUser) else "Anonymous"
        
        # Check basic permission
        has_access = super().has_permission(request, view)
        
        # Log access attempt to audit system
        self.log_audit_access_attempt(request, has_access, ip_address, user_info)
        
        return has_access
    
    def log_audit_access_attempt(self, request, success, ip_address, user_info):
        """Log audit dashboard access attempts"""
        try:
            # Import here to avoid circular imports
            from .models import AuditLog
            
            AuditLog.log_action(
                user=request.user if success and request.user and not isinstance(request.user, AnonymousUser) else None,
                action='AUDIT_ACCESS',
                resource_type='AuditDashboard',
                resource_name='Dashboard Access',
                ip_address=ip_address,
                success=success,
                old_data={
                    'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                    'path': request.path,
                    'method': request.method
                }
            )
            
        except Exception as e:
            logger.error(f"Failed to log audit access attempt: {e}")


class ReadOnlyAuditPermission(SuperuserOnlyPermission):
    """
    Read-only permission for audit logs.
    Prevents modification of audit data.
    """
    
    def has_permission(self, request, view):
        """Only allow read operations on audit data"""
        
        # Check basic superuser permission first
        if not super().has_permission(request, view):
            return False
        
        # Only allow safe methods (GET, HEAD, OPTIONS)
        if request.method not in ['GET', 'HEAD', 'OPTIONS']:
            logger.warning(f"Superuser {request.user.username} attempted unsafe method {request.method} on audit data")
            return False
        
        return True