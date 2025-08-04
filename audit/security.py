"""
Security monitoring and data protection for small-scale audit trails system.
Provides basic threat detection and enhanced data protection.
"""

import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from django.conf import settings
from django.utils import timezone
from django.core.cache import cache
from django.db.models import Count, Q
from cryptography.fernet import Fernet
import base64
import json

logger = logging.getLogger(__name__)

class ThreatDetector:
    """
    Basic threat detection for small institutions.
    Monitors for suspicious patterns without complex ML.
    """
    
    # Thresholds for small institutions (20-30 users)
    MAX_FAILED_LOGINS_PER_HOUR = 5
    MAX_FAILED_LOGINS_PER_DAY = 15
    MAX_API_CALLS_PER_MINUTE = 100
    SUSPICIOUS_ACTIVITY_THRESHOLD = 10
    
    def __init__(self):
        self.cache_timeout = 3600  # 1 hour
    
    def check_failed_login_patterns(self, username=None, ip_address=None):
        """
        Check for suspicious failed login patterns.
        Returns threat level and recommendations.
        """
        try:
            from .models import AuditLog
            
            # Check last hour and last day
            one_hour_ago = timezone.now() - timedelta(hours=1)
            one_day_ago = timezone.now() - timedelta(days=1)
            
            # Build query for failed logins
            failed_login_query = Q(action='LOGIN_FAILED', success=False)
            
            if username:
                failed_login_query &= Q(username=username)
            if ip_address:
                failed_login_query &= Q(ip_address=ip_address)
            
            # Count failed logins in different time windows
            failed_last_hour = AuditLog.objects.filter(
                failed_login_query,
                timestamp__gte=one_hour_ago
            ).count()
            
            failed_last_day = AuditLog.objects.filter(
                failed_login_query,
                timestamp__gte=one_day_ago
            ).count()
            
            # Determine threat level
            threat_level = 'LOW'
            recommendations = []
            
            if failed_last_hour >= self.MAX_FAILED_LOGINS_PER_HOUR:
                threat_level = 'HIGH'
                recommendations.append(f"Block IP {ip_address} temporarily")
                recommendations.append("Review user account security")
                
            elif failed_last_day >= self.MAX_FAILED_LOGINS_PER_DAY:
                threat_level = 'MEDIUM'
                recommendations.append("Monitor user closely")
                recommendations.append("Consider password reset")
            
            # Log threat detection
            if threat_level in ['MEDIUM', 'HIGH']:
                logger.warning(f"Threat detected: {threat_level} - Failed logins: {failed_last_hour}/hour, {failed_last_day}/day for {username or ip_address}")
            
            return {
                'threat_level': threat_level,
                'failed_last_hour': failed_last_hour,
                'failed_last_day': failed_last_day,
                'recommendations': recommendations,
                'timestamp': timezone.now()
            }
            
        except Exception as e:
            logger.error(f"Error in threat detection: {e}")
            return {'threat_level': 'UNKNOWN', 'error': str(e)}
    
    def check_unusual_activity_patterns(self, user_id):
        """
        Check for unusual activity patterns for a specific user.
        Suitable for small institution monitoring.
        """
        try:
            from .models import AuditLog
            
            # Check last 24 hours
            one_day_ago = timezone.now() - timedelta(days=1)
            
            user_activities = AuditLog.objects.filter(
                user_id=user_id,
                timestamp__gte=one_day_ago
            )
            
            # Count different types of activities
            activity_counts = user_activities.values('action').annotate(
                count=Count('action')
            ).order_by('-count')
            
            # Check for suspicious patterns
            total_activities = user_activities.count()
            patient_accesses = user_activities.filter(resource_type='Patient').count()
            
            # Simple anomaly detection
            threat_level = 'LOW'
            alerts = []
            
            # High volume of patient accesses
            if patient_accesses > 50:  # Adjusted for small institutions
                threat_level = 'MEDIUM'
                alerts.append(f"High patient access volume: {patient_accesses} in 24h")
            
            # Unusual off-hours activity (before 6 AM or after 10 PM)
            off_hours_activities = user_activities.extra(
                where=["EXTRACT(hour FROM timestamp) < 6 OR EXTRACT(hour FROM timestamp) > 22"]
            ).count()
            
            if off_hours_activities > 10:
                threat_level = 'MEDIUM'
                alerts.append(f"Off-hours activity: {off_hours_activities} actions")
            
            # Multiple failed actions
            failed_activities = user_activities.filter(success=False).count()
            if failed_activities > 5:
                alerts.append(f"Multiple failed actions: {failed_activities}")
            
            return {
                'threat_level': threat_level,
                'total_activities': total_activities,
                'patient_accesses': patient_accesses,
                'off_hours_activities': off_hours_activities,
                'failed_activities': failed_activities,
                'alerts': alerts,
                'activity_breakdown': list(activity_counts)
            }
            
        except Exception as e:
            logger.error(f"Error checking unusual activity: {e}")
            return {'threat_level': 'UNKNOWN', 'error': str(e)}
    
    def get_security_summary(self):
        """
        Get overall security summary for the last 24 hours.
        Suitable for daily security review in small institutions.
        """
        try:
            from .models import AuditLog
            
            one_day_ago = timezone.now() - timedelta(days=1)
            
            # Get security-related statistics
            recent_logs = AuditLog.objects.filter(timestamp__gte=one_day_ago)
            
            summary = {
                'total_events': recent_logs.count(),
                'failed_logins': recent_logs.filter(action='LOGIN_FAILED').count(),
                'successful_logins': recent_logs.filter(action='LOGIN').count(),
                'patient_accesses': recent_logs.filter(resource_type='Patient').count(),
                'audit_accesses': recent_logs.filter(resource_type='AuditDashboard').count(),
                'unique_users': recent_logs.values('user_id').distinct().count(),
                'unique_ips': recent_logs.values('ip_address').distinct().count(),
                'failed_actions': recent_logs.filter(success=False).count(),
            }
            
            # Determine overall security status
            if summary['failed_logins'] > 10 or summary['failed_actions'] > 20:
                summary['security_status'] = 'ATTENTION_REQUIRED'
            elif summary['failed_logins'] > 5 or summary['failed_actions'] > 10:
                summary['security_status'] = 'MONITOR'
            else:
                summary['security_status'] = 'NORMAL'
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating security summary: {e}")
            return {'error': str(e)}


class DataProtector:
    """
    Enhanced data protection for small-scale audit systems.
    Provides encryption and advanced masking capabilities.
    """
    
    def __init__(self):
        # Use Django secret key for basic encryption
        self.key = self._derive_key_from_secret()
        self.cipher_suite = Fernet(self.key)
    
    def _derive_key_from_secret(self):
        """Derive Fernet key from Django secret key"""
        # Create a consistent key from Django's SECRET_KEY
        secret_bytes = settings.SECRET_KEY.encode('utf-8')
        key_material = hashlib.sha256(secret_bytes).digest()
        return base64.urlsafe_b64encode(key_material)
    
    def encrypt_sensitive_data(self, data):
        """
        Encrypt sensitive data for storage.
        Returns encrypted string that can be stored in database.
        """
        try:
            if not data:
                return data
            
            # Convert to JSON if not string
            if not isinstance(data, str):
                data = json.dumps(data)
            
            # Encrypt the data
            encrypted_data = self.cipher_suite.encrypt(data.encode('utf-8'))
            return base64.urlsafe_b64encode(encrypted_data).decode('utf-8')
            
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            return data  # Return original data if encryption fails
    
    def decrypt_sensitive_data(self, encrypted_data):
        """
        Decrypt sensitive data for use.
        Returns original data.
        """
        try:
            if not encrypted_data:
                return encrypted_data
            
            # Decode and decrypt
            encrypted_bytes = base64.urlsafe_b64decode(encrypted_data.encode('utf-8'))
            decrypted_data = self.cipher_suite.decrypt(encrypted_bytes)
            return decrypted_data.decode('utf-8')
            
        except Exception as e:
            logger.error(f"Decryption error: {e}")
            return encrypted_data  # Return encrypted data if decryption fails
    
    def mask_patient_data(self, data, mask_level='standard'):
        """
        Enhanced patient data masking with different levels.
        
        mask_level options:
        - 'minimal': Basic masking for internal use
        - 'standard': Standard masking for audit logs
        - 'high': High-level masking for exports
        """
        if not isinstance(data, dict):
            return data
        
        masked_data = data.copy()
        
        # Define masking strategies
        masking_strategies = {
            'minimal': {
                'nama': lambda x: self._mask_name(x, preserve=3),
                'ic': lambda x: self._mask_ic(x, preserve=4),
                'phone': lambda x: self._mask_phone(x, preserve=4),
            },
            'standard': {
                'nama': lambda x: self._mask_name(x, preserve=2),
                'ic': lambda x: self._mask_ic(x, preserve=3),
                'phone': lambda x: self._mask_phone(x, preserve=3),
                'email': lambda x: self._mask_email(x),
                'address': lambda x: '***MASKED***',
            },
            'high': {
                'nama': lambda x: self._mask_name(x, preserve=1),
                'ic': lambda x: self._mask_ic(x, preserve=2),
                'phone': lambda x: '***-***-***',
                'email': lambda x: '***@***.***',
                'address': lambda x: '***MASKED***',
                'mrn': lambda x: f"MRN***{x[-2:] if len(x) > 2 else '**'}",
            }
        }
        
        # Apply masking based on level
        strategies = masking_strategies.get(mask_level, masking_strategies['standard'])
        
        for field, mask_func in strategies.items():
            if field in masked_data and masked_data[field]:
                try:
                    masked_data[field] = mask_func(str(masked_data[field]))
                except Exception as e:
                    logger.error(f"Error masking field {field}: {e}")
                    masked_data[field] = '***ERROR***'
        
        return masked_data
    
    def _mask_name(self, name, preserve=2):
        """Mask name preserving specified number of characters"""
        if not name or len(name) <= preserve:
            return '*' * len(name) if name else name
        
        words = name.split()
        masked_words = []
        
        for word in words:
            if len(word) <= preserve:
                masked_words.append('*' * len(word))
            else:
                masked_words.append(word[:preserve] + '*' * (len(word) - preserve))
        
        return ' '.join(masked_words)
    
    def _mask_ic(self, ic, preserve=3):
        """Mask IC number preserving specified number of characters"""
        if not ic or len(ic) <= preserve:
            return '*' * len(ic) if ic else ic
        
        return ic[:preserve] + '*' * (len(ic) - preserve)
    
    def _mask_phone(self, phone, preserve=3):
        """Mask phone number preserving specified number of characters"""
        if not phone or len(phone) <= preserve:
            return '*' * len(phone) if phone else phone
        
        return phone[:preserve] + '*' * (len(phone) - preserve)
    
    def _mask_email(self, email):
        """Mask email address"""
        if not email or '@' not in email:
            return '***@***.***'
        
        local, domain = email.split('@', 1)
        masked_local = local[0] + '*' * (len(local) - 1) if len(local) > 1 else '*'
        
        if '.' in domain:
            domain_parts = domain.split('.')
            masked_domain = domain_parts[0][0] + '*' * (len(domain_parts[0]) - 1)
            masked_domain += '.' + domain_parts[-1]
        else:
            masked_domain = domain[0] + '*' * (len(domain) - 1)
        
        return f"{masked_local}@{masked_domain}"
    
    def create_data_hash(self, data, salt=None):
        """
        Create secure hash of data for integrity verification.
        Used for audit log integrity checking.
        """
        try:
            if not salt:
                salt = settings.SECRET_KEY
            
            # Convert data to consistent string format
            if isinstance(data, dict):
                data_str = json.dumps(data, sort_keys=True)
            else:
                data_str = str(data)
            
            # Create HMAC hash
            hash_obj = hmac.new(
                salt.encode('utf-8'),
                data_str.encode('utf-8'),
                hashlib.sha256
            )
            
            return hash_obj.hexdigest()
            
        except Exception as e:
            logger.error(f"Error creating data hash: {e}")
            return None


class SecurityMonitor:
    """
    Security monitoring coordinator for small institutions.
    Combines threat detection and data protection.
    """
    
    def __init__(self):
        self.threat_detector = ThreatDetector()
        self.data_protector = DataProtector()
    
    def daily_security_check(self):
        """
        Perform daily security check suitable for small institutions.
        Returns summary of security status and recommendations.
        """
        try:
            # Get overall security summary
            summary = self.threat_detector.get_security_summary()
            
            # Add specific threat checks
            failed_login_threats = self.threat_detector.check_failed_login_patterns()
            
            # Combine results
            security_report = {
                'timestamp': timezone.now(),
                'overall_status': summary.get('security_status', 'UNKNOWN'),
                'daily_summary': summary,
                'threat_analysis': {
                    'failed_logins': failed_login_threats
                },
                'recommendations': self._generate_recommendations(summary, failed_login_threats)
            }
            
            # Log security check
            logger.info(f"Daily security check completed: Status {security_report['overall_status']}")
            
            return security_report
            
        except Exception as e:
            logger.error(f"Error in daily security check: {e}")
            return {
                'timestamp': timezone.now(),
                'overall_status': 'ERROR',
                'error': str(e)
            }
    
    def _generate_recommendations(self, summary, threat_analysis):
        """Generate security recommendations based on analysis"""
        recommendations = []
        
        # Check failed logins
        if summary.get('failed_logins', 0) > 10:
            recommendations.append("HIGH PRIORITY: Investigate multiple failed login attempts")
            recommendations.append("Consider implementing temporary IP blocking")
        
        # Check patient access patterns
        if summary.get('patient_accesses', 0) > 200:  # Adjusted for small institutions
            recommendations.append("Review high patient access volume")
            recommendations.append("Verify all patient accesses are legitimate")
        
        # Check audit access
        if summary.get('audit_accesses', 0) > 20:
            recommendations.append("Multiple audit dashboard accesses detected")
            recommendations.append("Verify all audit accesses are authorized")
        
        # General recommendations for small institutions
        if not recommendations:
            recommendations.append("Security status normal - continue monitoring")
            recommendations.append("Review audit logs weekly for patterns")
        
        return recommendations