"""
Simple audit middleware for small-scale RIS institutions

This middleware provides lightweight request tracking and audit logging
for essential API endpoints without significant performance overhead.
"""

import logging
from django.utils.deprecation import MiddlewareMixin
from django.urls import resolve
from django.http import JsonResponse


logger = logging.getLogger(__name__)


class SimpleAuditMiddleware(MiddlewareMixin):
    """
    Lightweight audit middleware for small institutions
    
    Features:
    - Tracks IP addresses for all requests
    - Logs API access for sensitive endpoints
    - Minimal performance overhead
    - Designed for 20-30 concurrent users
    """
    
    def __init__(self, get_response=None):
        self.get_response = get_response
        
        # Define which endpoints should be audited
        self.audit_paths = [
            '/api/patients/',
            '/api/examinations/', 
            '/api/staff/',
            '/api/daftar/',
            '/api/pemeriksaan/',
            '/api/pesakit/',
        ]
        
        # Define which endpoints should be audited for all methods
        self.sensitive_paths = [
            '/api/patients/',
            '/api/pesakit/',
        ]
        
        super().__init__(get_response)
    
    def process_request(self, request):
        """
        Process incoming request before view is called
        
        Stores audit information in request object for later use
        """
        # Get real client IP address
        request.audit_ip = self.get_client_ip(request)
        
        # Store request start time for performance tracking
        import time
        request.audit_start_time = time.time()
        
        return None
    
    def process_response(self, request, response):
        """
        Process response after view has been called
        
        Logs API access for audited endpoints
        """
        # Only log if we should audit this request
        if self.should_log_request(request):
            self.log_api_access(request, response)
        
        return response
    
    def process_exception(self, request, exception):
        """
        Process exceptions that occur during request handling
        
        Logs failed requests for audit purposes
        """
        if self.should_log_request(request):
            self.log_api_access(request, None, exception=exception)
        
        return None
    
    def get_client_ip(self, request):
        """
        Get the real client IP address from request
        
        Handles common proxy headers used in small institution setups
        """
        # Check for IP in common proxy headers
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Take the first IP in the chain
            ip = x_forwarded_for.split(',')[0].strip()
            if ip:
                return ip
        
        # Check other common headers
        x_real_ip = request.META.get('HTTP_X_REAL_IP')
        if x_real_ip:
            return x_real_ip.strip()
        
        # Fall back to remote address
        return request.META.get('REMOTE_ADDR', 'unknown')
    
    def should_log_request(self, request):
        """
        Determine if a request should be logged
        
        Only logs requests to important API endpoints to minimize overhead
        """
        # Skip non-API requests
        if not request.path.startswith('/api/'):
            return False
        
        # Check if path matches any audit patterns
        for audit_path in self.audit_paths:
            if request.path.startswith(audit_path):
                return True
        
        return False
    
    def is_sensitive_endpoint(self, request):
        """
        Check if this is a sensitive endpoint that should always be logged
        """
        for sensitive_path in self.sensitive_paths:
            if request.path.startswith(sensitive_path):
                return True
        return False
    
    def log_api_access(self, request, response, exception=None):
        """
        Log API access to audit trail
        
        Creates audit log entries for tracked API endpoints
        """
        try:
            # Import here to avoid circular imports
            from .models import AuditLog
            
            # Determine action based on HTTP method
            action_map = {
                'GET': 'API_GET',
                'POST': 'API_POST', 
                'PUT': 'API_PUT',
                'PATCH': 'API_PATCH',
                'DELETE': 'API_DELETE',
            }
            action = action_map.get(request.method, 'API_UNKNOWN')
            
            # Determine success status
            if exception:
                success = False
                status_code = 500
            elif response:
                success = 200 <= response.status_code < 400
                status_code = response.status_code
            else:
                success = False
                status_code = 0
            
            # Get user information
            user = None
            username = 'Anonymous'
            if hasattr(request, 'user') and request.user.is_authenticated:
                user = request.user
                username = request.user.username
            
            # Determine resource type from URL
            resource_type = self.extract_resource_type(request.path)
            
            # Create audit log entry
            audit_data = {
                'path': request.path,
                'method': request.method,
                'status_code': status_code,
            }
            
            # Add exception info if present
            if exception:
                audit_data['exception'] = str(exception)
                audit_data['exception_type'] = exception.__class__.__name__
            
            # Add timing information if available
            if hasattr(request, 'audit_start_time'):
                import time
                duration = time.time() - request.audit_start_time
                audit_data['duration_ms'] = round(duration * 1000, 2)
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type=resource_type,
                resource_id=request.path,
                resource_name=f"{request.method} {request.path}",
                new_data=audit_data,
                ip_address=request.audit_ip,
                success=success
            )
            
        except Exception as e:
            # Log error but don't break the request
            logger.error(f"Failed to create audit log: {e}")
    
    def extract_resource_type(self, path):
        """
        Extract resource type from API path
        
        Maps API paths to resource types for better organization
        """
        resource_map = {
            '/api/patients/': 'Patient',
            '/api/pesakit/': 'Patient', 
            '/api/examinations/': 'Examination',
            '/api/pemeriksaan/': 'Examination',
            '/api/daftar/': 'Registration',
            '/api/staff/': 'Staff',
            '/api/modaliti/': 'Modality',
            '/api/exam/': 'ExamType',
        }
        
        for api_path, resource_type in resource_map.items():
            if path.startswith(api_path):
                return resource_type
        
        return 'API'
    
    def get_request_summary(self, request):
        """
        Get a summary of the request for logging purposes
        
        Returns basic request information without sensitive data
        """
        return {
            'method': request.method,
            'path': request.path,
            'user_agent': request.META.get('HTTP_USER_AGENT', '')[:200],
            'content_type': request.META.get('CONTENT_TYPE', ''),
            'content_length': request.META.get('CONTENT_LENGTH', 0),
        }


class AuditContextMiddleware(MiddlewareMixin):
    """
    Middleware to provide audit context for thread-local storage
    
    This allows models and views to access current user and request
    information for audit logging purposes.
    """
    
    def __init__(self, get_response=None):
        self.get_response = get_response
        super().__init__(get_response)
    
    def process_request(self, request):
        """Store current request in thread-local storage"""
        from .utils import set_current_request
        set_current_request(request)
        return None
    
    def process_response(self, request, response):
        """Clear thread-local storage"""
        from .utils import clear_current_request
        clear_current_request()
        return response
    
    def process_exception(self, request, exception):
        """Clear thread-local storage on exception"""
        from .utils import clear_current_request
        clear_current_request()
        return None