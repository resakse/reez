"""
Django signals for automatic audit trail tracking

This module implements Phase 2 of the small-scale audit trails system:
- Model change tracking for Patient, Examination, and Registration models
- Authentication event tracking (login, logout, failures)
- Thread-local user context management for signals
"""

from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.core.signals import request_started, request_finished
import logging

# Import models that need tracking
try:
    from pesakit.models import Pesakit
except ImportError:
    Pesakit = None

try:
    from exam.models import Pemeriksaan, Daftar
except ImportError:
    Pemeriksaan = None
    Daftar = None

try:
    from staff.models import Staff
except ImportError:
    Staff = None

from .models import AuditLog
from .utils import get_current_user, get_current_ip, extract_model_data

logger = logging.getLogger(__name__)


# Authentication tracking
@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    """Log successful user login"""
    try:
        ip_address = getattr(request, 'audit_ip', None)
        if not ip_address:
            # Fallback IP extraction if middleware didn't set it
            ip_address = request.META.get('REMOTE_ADDR', 'unknown')
        
        AuditLog.log_action(
            user=user,
            action='LOGIN',
            resource_type='Authentication',
            resource_name=f"Login: {user.username}",
            ip_address=ip_address,
            success=True
        )
        logger.info(f"User {user.username} logged in from {ip_address}")
        
    except Exception as e:
        logger.error(f"Failed to log user login: {e}")


@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    """Log user logout"""
    try:
        if user:  # User might be None if session expired
            ip_address = getattr(request, 'audit_ip', None)
            if not ip_address:
                ip_address = request.META.get('REMOTE_ADDR', 'unknown')
            
            AuditLog.log_action(
                user=user,
                action='LOGOUT',
                resource_type='Authentication',
                resource_name=f"Logout: {user.username}",
                ip_address=ip_address,
                success=True
            )
            logger.info(f"User {user.username} logged out from {ip_address}")
            
    except Exception as e:
        logger.error(f"Failed to log user logout: {e}")


@receiver(user_login_failed)
def log_failed_login(sender, credentials, request, **kwargs):
    """Log failed login attempts"""
    try:
        username = credentials.get('username', 'Unknown')
        ip_address = getattr(request, 'audit_ip', None)
        if not ip_address:
            ip_address = request.META.get('REMOTE_ADDR', 'unknown')
        
        AuditLog.log_action(
            user=None,
            action='LOGIN_FAILED',
            resource_type='Authentication',
            resource_name=f"Failed login attempt: {username}",
            new_data={'attempted_username': username},
            ip_address=ip_address,
            success=False
        )
        logger.warning(f"Failed login attempt for {username} from {ip_address}")
        
    except Exception as e:
        logger.error(f"Failed to log failed login: {e}")


# Patient (Pesakit) tracking - most important for HIPAA compliance
if Pesakit:
    # Store original data before save for comparison
    @receiver(pre_save, sender=Pesakit)
    def store_original_patient_data(sender, instance, **kwargs):
        """Store original patient data before modification"""
        try:
            if instance.pk:  # Only for updates, not creates
                original = Pesakit.objects.get(pk=instance.pk)
                # Store in instance for access in post_save
                instance._original_data = extract_model_data(original)
            else:
                instance._original_data = None
        except Pesakit.DoesNotExist:
            instance._original_data = None
        except Exception as e:
            logger.error(f"Failed to store original patient data: {e}")
            instance._original_data = None

    @receiver(post_save, sender=Pesakit)
    def log_patient_change(sender, instance, created, **kwargs):
        """Log patient creation and updates"""
        try:
            user = get_current_user()
            if not user:
                # Skip logging if no user context (e.g., system operations)
                return
            
            ip_address = get_current_ip()
            action = 'CREATE' if created else 'UPDATE'
            
            # Get old and new data
            old_data = getattr(instance, '_original_data', None)
            new_data = extract_model_data(instance)
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type='Patient',
                resource_id=instance.id,
                resource_name=instance.nama,  # Will be masked automatically
                old_data=old_data,
                new_data=new_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Patient {instance.mrn} {action.lower()}d by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log patient change: {e}")

    @receiver(post_delete, sender=Pesakit)
    def log_patient_deletion(sender, instance, **kwargs):
        """Log patient deletion"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            old_data = extract_model_data(instance)
            
            AuditLog.log_action(
                user=user,
                action='DELETE',
                resource_type='Patient',
                resource_id=instance.id,
                resource_name=instance.nama,  # Will be masked automatically
                old_data=old_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Patient {instance.mrn} deleted by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log patient deletion: {e}")


# Examination (Pemeriksaan) tracking
if Pemeriksaan:
    @receiver(pre_save, sender=Pemeriksaan)
    def store_original_examination_data(sender, instance, **kwargs):
        """Store original examination data before modification"""
        try:
            if instance.pk:
                original = Pemeriksaan.objects.get(pk=instance.pk)
                instance._original_data = extract_model_data(original)
            else:
                instance._original_data = None
        except Pemeriksaan.DoesNotExist:
            instance._original_data = None
        except Exception as e:
            logger.error(f"Failed to store original examination data: {e}")
            instance._original_data = None

    @receiver(post_save, sender=Pemeriksaan)
    def log_examination_change(sender, instance, created, **kwargs):
        """Log examination creation and updates"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            action = 'CREATE' if created else 'UPDATE'
            
            # Get old and new data
            old_data = getattr(instance, '_original_data', None)
            new_data = extract_model_data(instance)
            
            # Create descriptive resource name
            exam_name = str(instance.exam) if instance.exam else 'Unknown Exam'
            modality_name = str(instance.modaliti) if instance.modaliti else 'Unknown Modality'
            resource_name = f"{exam_name} ({modality_name})"
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type='Examination',
                resource_id=instance.id,
                resource_name=resource_name,
                old_data=old_data,
                new_data=new_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Examination {instance.jxr} {action.lower()}d by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log examination change: {e}")

    @receiver(post_delete, sender=Pemeriksaan)
    def log_examination_deletion(sender, instance, **kwargs):
        """Log examination deletion"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            old_data = extract_model_data(instance)
            
            exam_name = str(instance.exam) if instance.exam else 'Unknown Exam'
            modality_name = str(instance.modaliti) if instance.modaliti else 'Unknown Modality'
            resource_name = f"{exam_name} ({modality_name})"
            
            AuditLog.log_action(
                user=user,
                action='DELETE',
                resource_type='Examination',
                resource_id=instance.id,
                resource_name=resource_name,
                old_data=old_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Examination {instance.jxr} deleted by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log examination deletion: {e}")


# Registration (Daftar) tracking
if Daftar:
    @receiver(pre_save, sender=Daftar)
    def store_original_registration_data(sender, instance, **kwargs):
        """Store original registration data before modification"""
        try:
            if instance.pk:
                original = Daftar.objects.get(pk=instance.pk)
                instance._original_data = extract_model_data(original)
            else:
                instance._original_data = None
        except Daftar.DoesNotExist:
            instance._original_data = None
        except Exception as e:
            logger.error(f"Failed to store original registration data: {e}")
            instance._original_data = None

    @receiver(post_save, sender=Daftar)
    def log_registration_change(sender, instance, created, **kwargs):
        """Log registration creation and updates"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            action = 'CREATE' if created else 'UPDATE'
            
            # Get old and new data
            old_data = getattr(instance, '_original_data', None)
            new_data = extract_model_data(instance)
            
            # Create descriptive resource name
            patient_name = instance.pesakit.nama if instance.pesakit else 'Unknown Patient'
            resource_name = f"Registration for {patient_name}"
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type='Registration',
                resource_id=instance.id,
                resource_name=resource_name,  # Patient name will be masked
                old_data=old_data,
                new_data=new_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Registration {instance.id} {action.lower()}d by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log registration change: {e}")

    @receiver(post_delete, sender=Daftar)
    def log_registration_deletion(sender, instance, **kwargs):
        """Log registration deletion"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            old_data = extract_model_data(instance)
            
            patient_name = instance.pesakit.nama if instance.pesakit else 'Unknown Patient'
            resource_name = f"Registration for {patient_name}"
            
            AuditLog.log_action(
                user=user,
                action='DELETE',
                resource_type='Registration',
                resource_id=instance.id,
                resource_name=resource_name,  # Patient name will be masked
                old_data=old_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Registration {instance.id} deleted by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log registration deletion: {e}")


# Staff tracking for administrative purposes
if Staff:
    @receiver(pre_save, sender=Staff)
    def store_original_staff_data(sender, instance, **kwargs):
        """Store original staff data before modification"""
        try:
            if instance.pk:
                original = Staff.objects.get(pk=instance.pk)
                instance._original_data = extract_model_data(original)
            else:
                instance._original_data = None
        except Staff.DoesNotExist:
            instance._original_data = None
        except Exception as e:
            logger.error(f"Failed to store original staff data: {e}")
            instance._original_data = None

    @receiver(post_save, sender=Staff)
    def log_staff_change(sender, instance, created, **kwargs):
        """Log staff creation and updates"""
        try:
            user = get_current_user()
            if not user:
                return
            
            # Skip logging automatic last_login updates to avoid duplicate login logs
            old_data = getattr(instance, '_original_data', None)
            new_data = extract_model_data(instance)
            
            # Check if only last_login field changed (automatic Django update)
            if not created and old_data and new_data:
                # Compare data without last_login field
                old_without_login = {k: v for k, v in old_data.items() if k != 'last_login'}
                new_without_login = {k: v for k, v in new_data.items() if k != 'last_login'}
                
                # If only last_login changed, skip logging (login signal handles this)
                if old_without_login == new_without_login:
                    return
            
            ip_address = get_current_ip()
            action = 'CREATE' if created else 'UPDATE'
            
            AuditLog.log_action(
                user=user,
                action=action,
                resource_type='Staff',
                resource_id=instance.id,
                resource_name=instance.username,
                old_data=old_data,
                new_data=new_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Staff {instance.username} {action.lower()}d by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log staff change: {e}")

    @receiver(post_delete, sender=Staff)
    def log_staff_deletion(sender, instance, **kwargs):
        """Log staff deletion"""
        try:
            user = get_current_user()
            if not user:
                return
            
            ip_address = get_current_ip()
            old_data = extract_model_data(instance)
            
            AuditLog.log_action(
                user=user,
                action='DELETE',
                resource_type='Staff',
                resource_id=instance.id,
                resource_name=instance.username,
                old_data=old_data,
                ip_address=ip_address,
                success=True
            )
            
            logger.info(f"Staff {instance.username} deleted by {user.username}")
            
        except Exception as e:
            logger.error(f"Failed to log staff deletion: {e}")


# Helper function to log API access from signals
def log_api_access(user, action, path, success=True, exception=None):
    """
    Helper function to log API access from views or middleware
    
    Args:
        user: User making the request
        action: API action (API_GET, API_POST, etc.)
        path: Request path
        success: Whether the operation was successful
        exception: Exception if any occurred
    """
    try:
        ip_address = get_current_ip()
        
        audit_data = {
            'path': path,
            'action': action
        }
        
        if exception:
            audit_data['exception'] = str(exception)
            audit_data['exception_type'] = exception.__class__.__name__
        
        AuditLog.log_action(
            user=user,
            action=action,
            resource_type='API',
            resource_id=path,
            resource_name=f"{action} {path}",
            new_data=audit_data,
            ip_address=ip_address,
            success=success
        )
        
    except Exception as e:
        logger.error(f"Failed to log API access: {e}")