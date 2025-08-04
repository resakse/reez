#!/usr/bin/env python3
"""
Test script for Phase 2 audit trails implementation

This script tests the key features of Phase 2:
1. Signal handlers for model changes
2. Authentication tracking
3. ViewSet integration
4. Thread-local user context

Run this script to verify that the audit system is working correctly.
"""

import os
import sys
import django
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.test.client import Client
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
import json

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from audit.models import AuditLog
from audit.utils import set_current_request, get_current_user
from staff.models import Staff

# Import models if available
try:
    from pesakit.models import Pesakit
    PESAKIT_AVAILABLE = True
except ImportError:
    PESAKIT_AVAILABLE = False
    print("Warning: Pesakit model not available for testing")

try:
    from exam.models import Pemeriksaan, Daftar
    EXAM_AVAILABLE = True
except ImportError:
    EXAM_AVAILABLE = False
    print("Warning: Exam models not available for testing")


class AuditPhase2TestCase(TransactionTestCase):
    """Test case for Phase 2 audit trail functionality"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create test user
        self.test_user = Staff.objects.create_user(
            username='testuser',
            password='testpass123',
            first_name='Test',
            last_name='User',
            is_staff=True
        )
        
        # Create admin user for sensitive operations
        self.admin_user = Staff.objects.create_user(
            username='admin',
            password='adminpass123',
            first_name='Admin',
            last_name='User',
            is_staff=True,
            is_superuser=True
        )
        
        # Clear any existing audit logs
        AuditLog.objects.all().delete()
    
    def get_jwt_token(self, user):
        """Get JWT token for authentication"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_authentication_signals(self):
        """Test that authentication events are logged"""
        print("\n=== Testing Authentication Signals ===")
        
        initial_count = AuditLog.objects.count()
        
        # Test login via Django auth
        client = Client()
        response = client.post('/login/', {
            'username': 'testuser',
            'password': 'testpass123'
        })
        
        # Check if login was logged
        login_logs = AuditLog.objects.filter(action='LOGIN', username='testuser')
        print(f"Login logs found: {login_logs.count()}")
        
        if login_logs.exists():
            login_log = login_logs.first()
            print(f"✓ Login logged: {login_log.username} at {login_log.timestamp}")
            print(f"  IP: {login_log.ip_address}")
            print(f"  Success: {login_log.success}")
        
        # Test failed login
        client.post('/login/', {
            'username': 'testuser',
            'password': 'wrongpassword'
        })
        
        failed_logs = AuditLog.objects.filter(action='LOGIN_FAILED')
        print(f"Failed login logs found: {failed_logs.count()}")
        
        if failed_logs.exists():
            failed_log = failed_logs.first()
            print(f"✓ Failed login logged: {failed_log.resource_name}")
            print(f"  Success: {failed_log.success}")
    
    def test_patient_model_signals(self):
        """Test that patient model changes are logged via signals"""
        if not PESAKIT_AVAILABLE:
            print("\n=== Skipping Patient Model Tests (not available) ===")
            return
        
        print("\n=== Testing Patient Model Signals ===")
        
        # Mock request context for signals
        from django.test import RequestFactory
        from audit.utils import set_current_request
        
        factory = RequestFactory()
        request = factory.get('/')
        request.user = self.test_user
        request.audit_ip = '127.0.0.1'
        set_current_request(request)
        
        initial_count = AuditLog.objects.count()
        
        try:
            # Test patient creation
            patient = Pesakit.objects.create(
                nama='Test Patient',
                mrn='TEST001',
                nric='123456789012',
                jantina='L'
            )
            
            create_logs = AuditLog.objects.filter(
                action='CREATE',
                resource_type='Patient',
                resource_id=str(patient.id)
            )
            
            print(f"Patient creation logs: {create_logs.count()}")
            if create_logs.exists():
                log = create_logs.first()
                print(f"✓ Patient creation logged: {log.resource_name}")
                print(f"  User: {log.username}")
                print(f"  Data: {log.new_data}")
            
            # Test patient update
            patient.nama = 'Updated Patient Name'
            patient.save()
            
            update_logs = AuditLog.objects.filter(
                action='UPDATE',
                resource_type='Patient',
                resource_id=str(patient.id)
            )
            
            print(f"Patient update logs: {update_logs.count()}")
            if update_logs.exists():
                log = update_logs.first()
                print(f"✓ Patient update logged: {log.resource_name}")
                print(f"  Old data: {log.old_data}")
                print(f"  New data: {log.new_data}")
            
            # Test patient deletion
            patient_id = patient.id
            patient.delete()
            
            delete_logs = AuditLog.objects.filter(
                action='DELETE',
                resource_type='Patient',
                resource_id=str(patient_id)
            )
            
            print(f"Patient deletion logs: {delete_logs.count()}")
            if delete_logs.exists():
                log = delete_logs.first()
                print(f"✓ Patient deletion logged: {log.resource_name}")
                print(f"  Old data: {log.old_data}")
        
        except Exception as e:
            print(f"✗ Patient model signal test failed: {e}")
        
        finally:
            from audit.utils import clear_current_request
            clear_current_request()
    
    def test_staff_model_signals(self):
        """Test that staff model changes are logged via signals"""
        print("\n=== Testing Staff Model Signals ===")
        
        # Mock request context
        from django.test import RequestFactory
        from audit.utils import set_current_request
        
        factory = RequestFactory()
        request = factory.get('/')
        request.user = self.admin_user
        request.audit_ip = '127.0.0.1'
        set_current_request(request)
        
        try:
            # Test staff creation
            staff = Staff.objects.create_user(
                username='newstaff',
                password='newpass123',
                first_name='New',
                last_name='Staff'
            )
            
            create_logs = AuditLog.objects.filter(
                action='CREATE',
                resource_type='Staff',
                resource_id=str(staff.id)
            )
            
            print(f"Staff creation logs: {create_logs.count()}")
            if create_logs.exists():
                log = create_logs.first()
                print(f"✓ Staff creation logged: {log.resource_name}")
                print(f"  User: {log.username}")
            
            # Test staff update
            staff.first_name = 'Updated'
            staff.save()
            
            update_logs = AuditLog.objects.filter(
                action='UPDATE',
                resource_type='Staff',
                resource_id=str(staff.id)
            )
            
            print(f"Staff update logs: {update_logs.count()}")
            if update_logs.exists():
                log = update_logs.first()
                print(f"✓ Staff update logged: {log.resource_name}")
        
        except Exception as e:
            print(f"✗ Staff model signal test failed: {e}")
        
        finally:
            from audit.utils import clear_current_request
            clear_current_request()
    
    def test_api_audit_mixins(self):
        """Test that API ViewSets log operations correctly"""
        if not PESAKIT_AVAILABLE:
            print("\n=== Skipping API Mixin Tests (Pesakit not available) ===")
            return
        
        print("\n=== Testing API Audit Mixins ===")
        
        # Authenticate client
        token = self.get_jwt_token(self.test_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        initial_count = AuditLog.objects.count()
        
        try:
            # Test POST (create) via API
            patient_data = {
                'nama': 'API Test Patient',
                'mrn': 'API001',
                'nric': '987654321098',
                'jantina': 'P'
            }
            
            response = self.client.post('/api/pesakit/', patient_data)
            print(f"API POST response status: {response.status_code}")
            
            if response.status_code == 201:
                # Check for audit logs
                api_logs = AuditLog.objects.filter(
                    action__in=['CREATE', 'API_POST'],
                    username='testuser'
                ).order_by('-timestamp')
                
                print(f"API creation logs: {api_logs.count()}")
                for log in api_logs[:2]:  # Show first 2 logs
                    print(f"✓ API action logged: {log.action} - {log.resource_type}")
                    print(f"  Resource: {log.resource_name}")
                    print(f"  User: {log.username}")
            
            # Test GET (list) via API
            response = self.client.get('/api/pesakit/')
            print(f"API GET response status: {response.status_code}")
            
            # Check for view logs
            view_logs = AuditLog.objects.filter(
                action__in=['VIEW', 'API_GET'],
                username='testuser'
            ).order_by('-timestamp')
            
            print(f"API view logs: {view_logs.count()}")
            if view_logs.exists():
                log = view_logs.first()
                print(f"✓ API view logged: {log.action} - {log.resource_type}")
        
        except Exception as e:
            print(f"✗ API audit mixin test failed: {e}")
    
    def test_data_masking(self):
        """Test that sensitive data is properly masked"""
        print("\n=== Testing Data Masking ===")
        
        try:
            # Test patient name masking
            from audit.models import AuditLog
            
            masked_name = AuditLog.mask_patient_name("John Doe Smith")
            print(f"Original: John Doe Smith")
            print(f"Masked: {masked_name}")
            
            # Test sensitive data masking
            sensitive_data = {
                'nama': 'Test Patient',
                'ic': '123456789012',
                'phone': '0123456789',
                'email': 'test@example.com'
            }
            
            masked_data = AuditLog.mask_sensitive_data(sensitive_data)
            print(f"Original data: {sensitive_data}")
            print(f"Masked data: {masked_data}")
            
            # Verify masking worked
            if masked_data['ic'] != sensitive_data['ic']:
                print("✓ IC number masking works")
            if masked_data['phone'] != sensitive_data['phone']:
                print("✓ Phone number masking works")
            if masked_data['email'] != sensitive_data['email']:
                print("✓ Email masking works")
        
        except Exception as e:
            print(f"✗ Data masking test failed: {e}")
    
    def test_thread_local_context(self):
        """Test that thread-local user context works"""
        print("\n=== Testing Thread-Local Context ===")
        
        from audit.utils import set_current_request, get_current_user, get_current_ip
        from django.test import RequestFactory
        
        try:
            factory = RequestFactory()
            request = factory.get('/')
            request.user = self.test_user
            request.audit_ip = '192.168.1.100'
            
            # Set request in thread local
            set_current_request(request)
            
            # Test getting current user
            current_user = get_current_user()
            if current_user == self.test_user:
                print("✓ Thread-local user context works")
            else:
                print("✗ Thread-local user context failed")
            
            # Test getting current IP
            current_ip = get_current_ip()
            if current_ip == '192.168.1.100':
                print("✓ Thread-local IP context works")
            else:
                print("✗ Thread-local IP context failed")
            
        except Exception as e:
            print(f"✗ Thread-local context test failed: {e}")
        
        finally:
            from audit.utils import clear_current_request
            clear_current_request()
    
    def generate_test_report(self):
        """Generate a summary report of all audit logs created during testing"""
        print("\n=== AUDIT TEST REPORT ===")
        
        all_logs = AuditLog.objects.all().order_by('-timestamp')
        print(f"Total audit logs created: {all_logs.count()}")
        
        # Group by action
        actions = all_logs.values_list('action', flat=True).distinct()
        for action in actions:
            count = all_logs.filter(action=action).count()
            print(f"  {action}: {count} logs")
        
        # Group by resource type
        resource_types = all_logs.values_list('resource_type', flat=True).distinct()
        print(f"\nResource types tracked:")
        for resource_type in resource_types:
            if resource_type:  # Skip empty resource types
                count = all_logs.filter(resource_type=resource_type).count()
                print(f"  {resource_type}: {count} logs")
        
        # Show recent logs
        print(f"\nMost recent 5 audit logs:")
        for log in all_logs[:5]:
            print(f"  {log.timestamp.strftime('%H:%M:%S')} - {log.username} - {log.action} - {log.resource_type}")


def run_tests():
    """Run all audit trail tests"""
    print("Starting Phase 2 Audit Trail Tests...")
    print("=" * 50)
    
    test_case = AuditPhase2TestCase()
    test_case.setUp()
    
    try:
        # Run individual tests
        test_case.test_authentication_signals()
        test_case.test_patient_model_signals()
        test_case.test_staff_model_signals()
        test_case.test_api_audit_mixins()
        test_case.test_data_masking()
        test_case.test_thread_local_context()
        
        # Generate final report
        test_case.generate_test_report()
        
        print("\n" + "=" * 50)
        print("✓ Phase 2 Audit Trail Tests Completed!")
        print("Check the audit logs in the database for detailed tracking.")
        
    except Exception as e:
        print(f"\n✗ Test execution failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    run_tests()