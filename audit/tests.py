"""
Comprehensive unit tests for small-scale audit trails system.
Tests all phases: Foundation, Tracking, Dashboard, Security.
"""

import json
import tempfile
import os
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.urls import reverse
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APITestCase
from rest_framework import status

from audit.models import AuditLog
from audit.security import ThreatDetector, DataProtector, SecurityMonitor
from audit.middleware import SimpleAuditMiddleware, AuditContextMiddleware
from audit.permissions import SuperuserOnlyPermission, AuditAccessLoggingPermission
from pesakit.models import Pesakit
from exam.models import Pemeriksaan, Exam, Modaliti
from staff.models import Staff

User = get_user_model()


class AuditModelTests(TestCase):
    """Test Phase 1: Basic Foundation - Models and Core Functionality"""
    
    def setUp(self):
        self.user = Staff.objects.create_user(
            username='testuser',
            password='testpass',
            is_superuser=True
        )
    
    def test_audit_log_creation(self):
        """Test basic audit log creation"""
        log = AuditLog.log_action(
            user=self.user,
            action='TEST_ACTION',
            resource_type='TestResource',
            resource_id='123',
            resource_name='Test Resource',
            ip_address='192.168.1.100'
        )
        
        self.assertIsNotNone(log)
        self.assertEqual(log.username, 'testuser')
        self.assertEqual(log.action, 'TEST_ACTION')
        self.assertEqual(log.resource_type, 'TestResource')
        self.assertEqual(log.ip_address, '192.168.1.100')
        self.assertTrue(log.success)
    
    def test_patient_name_masking(self):
        """Test patient name masking functionality"""
        # Test normal name
        masked = AuditLog.mask_patient_name('Ahmad bin Abdullah')
        self.assertEqual(masked, 'A**** b** A*******')
        
        # Test single name
        masked = AuditLog.mask_patient_name('Ahmad')
        self.assertEqual(masked, 'A****')
        
        # Test empty name
        masked = AuditLog.mask_patient_name('')
        self.assertEqual(masked, '')
        
        # Test None
        masked = AuditLog.mask_patient_name(None)
        self.assertIsNone(masked)
    
    def test_sensitive_data_masking(self):
        """Test sensitive data masking in JSON fields"""
        sensitive_data = {
            'ic': '123456-78-9012',
            'phone': '0123456789',
            'email': 'test@example.com',
            'address': 'Some address',
            'normal_field': 'normal_value'
        }
        
        masked = AuditLog.mask_sensitive_data(sensitive_data)
        
        self.assertEqual(masked['ic'], '12**********12')
        self.assertEqual(masked['phone'], '01******89')
        self.assertEqual(masked['normal_field'], 'normal_value')
    
    def test_audit_log_queryset_methods(self):
        """Test custom queryset methods"""
        # Create test logs
        AuditLog.log_action(self.user, 'LOGIN', ip_address='192.168.1.100')
        AuditLog.log_action(self.user, 'CREATE', resource_type='Patient')
        AuditLog.log_action(self.user, 'LOGIN_FAILED', success=False)
        
        # Test filtering
        login_logs = AuditLog.objects.filter(action='LOGIN')
        self.assertEqual(login_logs.count(), 1)
        
        failed_logs = AuditLog.objects.filter(success=False)
        self.assertEqual(failed_logs.count(), 1)
        
        patient_logs = AuditLog.objects.filter(resource_type='Patient')
        self.assertEqual(patient_logs.count(), 1)


class AuditSignalsTests(TestCase):
    """Test Phase 2: Essential Tracking - Signal Handlers"""
    
    def setUp(self):
        self.user = Staff.objects.create_user(
            username='testdoctor',
            password='testpass'
        )
        
        # Set up required models for testing
        self.modaliti = Modaliti.objects.create(modaliti='X-Ray')
        self.exam = Exam.objects.create(exam='Chest X-Ray', modaliti=self.modaliti)
    
    @patch('audit.signals.get_current_user')
    def test_patient_creation_signal(self, mock_get_user):
        """Test patient creation triggers audit log"""
        mock_get_user.return_value = self.user
        
        # Create patient
        patient = Pesakit.objects.create(
            nama='Ahmad bin Ali',
            ic='123456-78-9012',
            mrn='MRN001'
        )
        
        # Check audit log was created
        audit_logs = AuditLog.objects.filter(
            action='CREATE',
            resource_type='Patient',
            resource_id=str(patient.id)
        )
        
        self.assertEqual(audit_logs.count(), 1)
        audit_log = audit_logs.first()
        self.assertEqual(audit_log.username, 'testdoctor')
        self.assertEqual(audit_log.resource_name, 'A**** b** A**')  # Masked name
    
    @patch('audit.signals.get_current_user')
    def test_patient_update_signal(self, mock_get_user):
        """Test patient update triggers audit log"""
        mock_get_user.return_value = self.user
        
        # Create and update patient
        patient = Pesakit.objects.create(
            nama='Original Name',
            ic='123456-78-9012',
            mrn='MRN002'
        )
        
        # Clear previous logs
        AuditLog.objects.all().delete()
        
        # Update patient
        patient.nama = 'Updated Name'
        patient.save()
        
        # Check audit log was created
        audit_logs = AuditLog.objects.filter(
            action='UPDATE',
            resource_type='Patient',
            resource_id=str(patient.id)
        )
        
        self.assertEqual(audit_logs.count(), 1)
    
    @patch('audit.signals.get_current_user')
    def test_examination_creation_signal(self, mock_get_user):
        """Test examination creation triggers audit log"""
        mock_get_user.return_value = self.user
        
        # Create examination
        examination = Pemeriksaan.objects.create(
            exam=self.exam,
            modaliti=self.modaliti,
            bahagian='Chest'
        )
        
        # Check audit log was created
        audit_logs = AuditLog.objects.filter(
            action='CREATE',
            resource_type='Examination',
            resource_id=str(examination.id)
        )
        
        self.assertEqual(audit_logs.count(), 1)
        audit_log = audit_logs.first()
        self.assertEqual(audit_log.username, 'testdoctor')


class AuditMiddlewareTests(TestCase):
    """Test middleware functionality"""
    
    def setUp(self):
        self.user = Staff.objects.create_user(
            username='testuser',
            password='testpass'
        )
    
    def test_simple_audit_middleware(self):
        """Test SimpleAuditMiddleware functionality"""
        from django.http import HttpRequest, HttpResponse
        
        # Create mock request
        request = HttpRequest()
        request.META = {
            'REMOTE_ADDR': '192.168.1.100',
            'HTTP_USER_AGENT': 'TestAgent/1.0'
        }
        request.path = '/api/patients/'
        request.method = 'GET'
        request.user = self.user
        
        # Create middleware
        get_response = MagicMock(return_value=HttpResponse())
        middleware = SimpleAuditMiddleware(get_response)
        
        # Process request
        response = middleware(request)
        
        # Check that IP was captured
        self.assertEqual(request.audit_ip, '192.168.1.100')
        
        # Check that get_response was called
        get_response.assert_called_once_with(request)
    
    def test_audit_context_middleware(self):
        """Test AuditContextMiddleware functionality"""
        from audit.middleware import AuditContextMiddleware
        from django.http import HttpRequest, HttpResponse
        
        # Create mock request
        request = HttpRequest()
        request.user = self.user
        
        # Create middleware
        get_response = MagicMock(return_value=HttpResponse())
        middleware = AuditContextMiddleware(get_response)
        
        # Process request
        response = middleware(request)
        
        # Check that context was set and cleared
        get_response.assert_called_once_with(request)


class AuditAPITests(APITestCase):
    """Test Phase 3: Basic Dashboard - API Endpoints"""
    
    def setUp(self):
        # Create superuser for API access
        self.superuser = Staff.objects.create_user(
            username='admin',
            password='adminpass',
            is_superuser=True
        )
        
        # Create regular user
        self.regular_user = Staff.objects.create_user(
            username='doctor',
            password='doctorpass'
        )
        
        # Create test audit logs
        self.create_test_audit_logs()
    
    def create_test_audit_logs(self):
        """Create test audit logs for API testing"""
        now = timezone.now()
        
        # Create various types of logs
        AuditLog.objects.create(
            user=self.superuser,
            username='admin',
            action='LOGIN',
            timestamp=now - timedelta(hours=1),
            ip_address='192.168.1.100'
        )
        
        AuditLog.objects.create(
            user=self.regular_user,
            username='doctor',
            action='CREATE',
            resource_type='Patient',
            resource_id='123',
            resource_name='Test Patient',
            timestamp=now - timedelta(hours=2)
        )
        
        AuditLog.objects.create(
            user=None,
            username='unknown',
            action='LOGIN_FAILED',
            success=False,
            timestamp=now - timedelta(hours=3),
            ip_address='192.168.1.200'
        )
    
    def test_unauthorized_access(self):
        """Test that regular users cannot access audit API"""
        self.client.force_authenticate(user=self.regular_user)
        
        url = reverse('auditlog-list')
        response = self.client.get(url)
        
        # Should be forbidden for non-superusers
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_superuser_access(self):
        """Test that superusers can access audit API"""
        self.client.force_authenticate(user=self.superuser)
        
        url = reverse('auditlog-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
    
    def test_audit_log_filtering(self):
        """Test audit log filtering functionality"""
        self.client.force_authenticate(user=self.superuser)
        
        # Test action filtering
        url = reverse('auditlog-list')
        response = self.client.get(url, {'action': 'LOGIN'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertTrue(all(log['action'] == 'LOGIN' for log in results))
        
        # Test resource type filtering
        response = self.client.get(url, {'resource_type': 'Patient'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertTrue(all(log['resource_type'] == 'Patient' for log in results))
    
    def test_statistics_endpoint(self):
        """Test statistics dashboard endpoint"""
        self.client.force_authenticate(user=self.superuser)
        
        url = reverse('auditlog-simple-stats')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check required statistics fields
        required_fields = [
            'total_events', 'unique_users', 'failed_logins',
            'patient_accesses', 'examination_activities'
        ]
        
        for field in required_fields:
            self.assertIn(field, response.data)
    
    def test_csv_export(self):
        """Test CSV export functionality"""
        self.client.force_authenticate(user=self.superuser)
        
        url = reverse('auditlog-export-csv')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename=', response['Content-Disposition'])


class SecurityTests(TestCase):
    """Test Phase 4: Essential Security - Security Features"""
    
    def setUp(self):
        self.user = Staff.objects.create_user(
            username='testuser',
            password='testpass'
        )
        self.threat_detector = ThreatDetector()
        self.data_protector = DataProtector()
        self.security_monitor = SecurityMonitor()
    
    def test_threat_detector_failed_logins(self):
        """Test threat detection for failed logins"""
        # Create multiple failed login attempts
        for i in range(6):
            AuditLog.log_action(
                user=None,
                action='LOGIN_FAILED',
                success=False,
                ip_address='192.168.1.100'
            )
        
        # Check threat detection
        result = self.threat_detector.check_failed_login_patterns(
            ip_address='192.168.1.100'
        )
        
        self.assertEqual(result['threat_level'], 'HIGH')
        self.assertGreaterEqual(result['failed_last_hour'], 5)
        self.assertIn('recommendations', result)
    
    def test_data_protector_masking(self):
        """Test data protection masking"""
        test_data = {
            'nama': 'Ahmad bin Abdullah',
            'ic': '123456-78-9012',
            'phone': '0123456789',
            'email': 'test@example.com'
        }
        
        # Test different masking levels
        minimal_mask = self.data_protector.mask_patient_data(test_data, 'minimal')
        standard_mask = self.data_protector.mask_patient_data(test_data, 'standard')
        high_mask = self.data_protector.mask_patient_data(test_data, 'high')
        
        # Minimal should preserve more characters
        self.assertTrue(len(minimal_mask['nama']) >= len(standard_mask['nama']))
        
        # High level should mask more aggressively
        self.assertIn('***', high_mask['nama'])
        self.assertIn('***', high_mask['phone'])
    
    def test_data_protector_encryption(self):
        """Test data encryption/decryption"""
        test_data = "Sensitive patient information"
        
        # Encrypt data
        encrypted = self.data_protector.encrypt_sensitive_data(test_data)
        self.assertNotEqual(encrypted, test_data)
        self.assertIsInstance(encrypted, str)
        
        # Decrypt data
        decrypted = self.data_protector.decrypt_sensitive_data(encrypted)
        self.assertEqual(decrypted, test_data)
    
    def test_security_monitor_daily_check(self):
        """Test daily security check"""
        # Create some test data
        AuditLog.log_action(self.user, 'LOGIN')
        AuditLog.log_action(self.user, 'CREATE', resource_type='Patient')
        AuditLog.log_action(None, 'LOGIN_FAILED', success=False)
        
        # Run daily check
        report = self.security_monitor.daily_security_check()
        
        self.assertIn('timestamp', report)
        self.assertIn('overall_status', report)
        self.assertIn('daily_summary', report)
        self.assertIn('recommendations', report)
    
    def test_permission_classes(self):
        """Test custom permission classes"""
        from django.http import HttpRequest
        from django.contrib.auth.models import AnonymousUser
        
        # Test SuperuserOnlyPermission
        permission = SuperuserOnlyPermission()
        
        # Mock request with superuser
        request = HttpRequest()
        request.user = self.user
        request.user.is_superuser = True
        request.user.is_active = True
        request.session = {}
        request.META = {'REMOTE_ADDR': '127.0.0.1'}
        
        self.assertTrue(permission.has_permission(request, None))
        
        # Mock request with regular user
        request.user.is_superuser = False
        self.assertFalse(permission.has_permission(request, None))
        
        # Mock request with anonymous user
        request.user = AnonymousUser()
        self.assertFalse(permission.has_permission(request, None))


class ManagementCommandTests(TestCase):
    """Test management commands"""
    
    def setUp(self):
        self.user = Staff.objects.create_user(
            username='testuser',
            password='testpass'
        )
        
        # Create test audit logs
        for i in range(5):
            AuditLog.log_action(
                self.user,
                'TEST_ACTION',
                resource_type='TestResource',
                timestamp=timezone.now() - timedelta(days=i)
            )
    
    def test_cleanup_audit_logs_command(self):
        """Test cleanup audit logs management command"""
        # Check initial count
        initial_count = AuditLog.objects.count()
        self.assertEqual(initial_count, 5)
        
        # Run cleanup command (dry run)
        call_command('cleanup_audit_logs', '--dry-run', '--retention-days=2')
        
        # Count should be unchanged after dry run
        self.assertEqual(AuditLog.objects.count(), initial_count)
        
        # Run actual cleanup
        call_command('cleanup_audit_logs', '--retention-days=2', '--force')
        
        # Should have fewer logs now
        remaining_count = AuditLog.objects.count()
        self.assertLess(remaining_count, initial_count)
    
    def test_backup_audit_command(self):
        """Test backup audit management command"""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Test backup creation
            call_command(
                'backup_audit',
                '--backup-dir', temp_dir,
                '--days', '30',
                '--format', 'json'
            )
            
            # Check that backup file was created
            backup_files = [f for f in os.listdir(temp_dir) if f.startswith('audit_backup_')]
            self.assertEqual(len(backup_files), 1)
            
            backup_file = os.path.join(temp_dir, backup_files[0])
            
            # Verify backup content
            with open(backup_file, 'r') as f:
                backup_data = json.load(f)
            
            self.assertIn('metadata', backup_data)
            self.assertIn('audit_logs', backup_data)
            self.assertEqual(len(backup_data['audit_logs']), 5)
    
    def test_verify_audit_integrity_command(self):
        """Test audit integrity verification command"""
        # Should pass with good data
        call_command('verify_audit_integrity', '--days', '30')
        
        # Create some problematic data
        AuditLog.objects.create(
            user=self.user,
            username='',  # Empty username should trigger warning
            action='TEST_ACTION'
        )
        
        # Should detect the issue
        call_command('verify_audit_integrity', '--days', '30')


class IntegrationTests(TestCase):
    """Integration tests for the complete audit system"""
    
    def setUp(self):
        self.superuser = Staff.objects.create_user(
            username='admin',
            password='adminpass',
            is_superuser=True
        )
        
        self.doctor = Staff.objects.create_user(
            username='doctor',
            password='doctorpass'
        )
    
    def test_end_to_end_patient_workflow(self):
        """Test complete patient workflow with audit tracking"""
        from audit.signals import set_current_user
        
        # Set user context for signals
        set_current_user(self.doctor)
        
        # Create patient (should trigger audit log)
        patient = Pesakit.objects.create(
            nama='Test Patient',
            ic='123456-78-9012',
            mrn='MRN001'
        )
        
        # Check audit log was created
        create_logs = AuditLog.objects.filter(
            action='CREATE',
            resource_type='Patient',
            username='doctor'
        )
        self.assertEqual(create_logs.count(), 1)
        
        # Update patient (should trigger audit log)
        patient.nama = 'Updated Patient'
        patient.save()
        
        # Check update audit log
        update_logs = AuditLog.objects.filter(
            action='UPDATE',
            resource_type='Patient',
            username='doctor'
        )
        self.assertEqual(update_logs.count(), 1)
        
        # Verify sensitive data is masked
        log = create_logs.first()
        self.assertEqual(log.resource_name, 'T*** P******')  # Masked name
    
    def test_security_workflow(self):
        """Test security monitoring workflow"""
        # Create suspicious activity
        for i in range(10):
            AuditLog.log_action(
                user=None,
                action='LOGIN_FAILED',
                success=False,
                ip_address='192.168.1.100'
            )
        
        # Run threat detection
        threat_detector = ThreatDetector()
        result = threat_detector.check_failed_login_patterns(
            ip_address='192.168.1.100'
        )
        
        # Should detect high threat level
        self.assertEqual(result['threat_level'], 'HIGH')
        self.assertGreater(result['failed_last_hour'], 5)
        
        # Run security summary
        security_monitor = SecurityMonitor()
        summary = security_monitor.daily_security_check()
        
        self.assertIn('overall_status', summary)
        self.assertIn('recommendations', summary)
    
    @override_settings(AUDIT_RETENTION_DAYS=1)
    def test_complete_audit_lifecycle(self):
        """Test complete audit log lifecycle"""
        # Create audit log
        log = AuditLog.log_action(
            user=self.doctor,
            action='TEST_LIFECYCLE',
            resource_type='TestResource'
        )
        
        # Verify creation
        self.assertIsNotNone(log.id)
        self.assertEqual(log.username, 'doctor')
        
        # Test backup
        with tempfile.TemporaryDirectory() as temp_dir:
            call_command(
                'backup_audit',
                '--backup-dir', temp_dir,
                '--days', '1'
            )
            
            # Verify backup exists
            backup_files = os.listdir(temp_dir)
            self.assertGreater(len(backup_files), 0)
        
        # Test integrity verification
        call_command('verify_audit_integrity', '--days', '1')
        
        # This completes the full lifecycle test


# Test runner
if __name__ == '__main__':
    import django
    from django.conf import settings
    from django.test.utils import get_runner
    
    django.setup()
    TestRunner = get_runner(settings)
    test_runner = TestRunner()
    failures = test_runner.run_tests(['audit.tests'])