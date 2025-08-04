"""
Django management command to test Phase 2 audit trails implementation

Usage: python manage.py test_audit_phase2
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.db import transaction
from audit.models import AuditLog
from audit.utils import set_current_request, get_current_user, clear_current_request
from staff.models import Staff

# Import models if available
try:
    from pesakit.models import Pesakit
    PESAKIT_AVAILABLE = True
except ImportError:
    PESAKIT_AVAILABLE = False

try:
    from exam.models import Pemeriksaan, Daftar
    EXAM_AVAILABLE = True
except ImportError:
    EXAM_AVAILABLE = False


class Command(BaseCommand):
    help = 'Test Phase 2 audit trails implementation'

    def add_arguments(self, parser):
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Clean up test data after running tests',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Phase 2 Audit Trail Tests...'))
        self.stdout.write('=' * 60)
        
        # Set up test environment
        self.setup_test_data()
        
        try:
            # Run tests
            self.test_signal_handlers()
            self.test_data_masking()
            self.test_thread_local_context()
            self.generate_report()
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Test failed: {e}'))
            import traceback
            traceback.print_exc()
        
        finally:
            if options['cleanup']:
                self.cleanup_test_data()
            
            self.stdout.write('=' * 60)
            self.stdout.write(self.style.SUCCESS('Phase 2 Audit Trail Tests Completed!'))

    def setup_test_data(self):
        """Set up test users and clean audit logs"""
        self.stdout.write('\nSetting up test data...')
        
        # Create or get test users
        self.test_user, created = Staff.objects.get_or_create(
            username='audit_test_user',
            defaults={
                'first_name': 'Audit',
                'last_name': 'Test',
                'is_staff': True
            }
        )
        if created:
            self.test_user.set_password('testpass123')
            self.test_user.save()
        
        self.admin_user, created = Staff.objects.get_or_create(
            username='audit_admin_user',
            defaults={
                'first_name': 'Audit',
                'last_name': 'Admin',
                'is_staff': True,
                'is_superuser': True
            }
        )
        if created:
            self.admin_user.set_password('adminpass123')
            self.admin_user.save()
        
        # Store initial audit log count
        self.initial_log_count = AuditLog.objects.count()
        self.stdout.write(f'Initial audit log count: {self.initial_log_count}')

    def test_signal_handlers(self):
        """Test that model change signals work correctly"""
        self.stdout.write('\n=== Testing Signal Handlers ===')
        
        # Set up request context for signals
        factory = RequestFactory()
        request = factory.get('/test/')
        request.user = self.test_user
        request.audit_ip = '127.0.0.1'
        
        set_current_request(request)
        
        try:
            # Test Staff model signals
            with transaction.atomic():
                test_staff = Staff.objects.create_user(
                    username='signal_test_staff',
                    password='testpass123',
                    first_name='Signal',
                    last_name='Test'
                )
                
                staff_create_logs = AuditLog.objects.filter(
                    action='CREATE',
                    resource_type='Staff',
                    resource_id=str(test_staff.id)
                )
                
                self.stdout.write(f'Staff creation logs: {staff_create_logs.count()}')
                if staff_create_logs.exists():
                    log = staff_create_logs.first()
                    self.stdout.write(self.style.SUCCESS(
                        f'✓ Staff creation logged: {log.resource_name} by {log.username}'
                    ))
                
                # Test update
                test_staff.first_name = 'Updated'
                test_staff.save()
                
                staff_update_logs = AuditLog.objects.filter(
                    action='UPDATE',
                    resource_type='Staff',
                    resource_id=str(test_staff.id)
                )
                
                self.stdout.write(f'Staff update logs: {staff_update_logs.count()}')
                if staff_update_logs.exists():
                    log = staff_update_logs.first()
                    self.stdout.write(self.style.SUCCESS(
                        f'✓ Staff update logged: {log.resource_name} by {log.username}'
                    ))
                    if log.old_data and log.new_data:
                        self.stdout.write(f'  Old data: {log.old_data}')
                        self.stdout.write(f'  New data: {log.new_data}')
            
            # Test Patient model signals if available
            if PESAKIT_AVAILABLE:
                with transaction.atomic():
                    test_patient = Pesakit.objects.create(
                        nama='Signal Test Patient',
                        mrn='SIG001',
                        nric='123456789012',
                        jantina='L'
                    )
                    
                    patient_create_logs = AuditLog.objects.filter(
                        action='CREATE',
                        resource_type='Patient',
                        resource_id=str(test_patient.id)
                    )
                    
                    self.stdout.write(f'Patient creation logs: {patient_create_logs.count()}')
                    if patient_create_logs.exists():
                        log = patient_create_logs.first()
                        self.stdout.write(self.style.SUCCESS(
                            f'✓ Patient creation logged: {log.resource_name} by {log.username}'
                        ))
                        # Check that patient name is masked
                        if '*' in log.resource_name:
                            self.stdout.write(self.style.SUCCESS('✓ Patient name properly masked'))
            else:
                self.stdout.write(self.style.WARNING('⚠ Skipping Patient tests - model not available'))
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Signal handler test failed: {e}'))
        
        finally:
            clear_current_request()

    def test_data_masking(self):
        """Test data masking functionality"""
        self.stdout.write('\n=== Testing Data Masking ===')
        
        try:
            # Test patient name masking
            test_names = [
                'John Doe',
                'Ahmad bin Abdullah',
                'Siti Nur Aishah binti Muhammad',
                'A',
                ''
            ]
            
            for name in test_names:
                if name:  # Skip empty names
                    masked = AuditLog.mask_patient_name(name)
                    self.stdout.write(f'Original: "{name}" → Masked: "{masked}"')
            
            # Test sensitive data masking
            sensitive_data = {
                'nama': 'Test Patient',
                'ic': '123456-78-9012',
                'nric': '123456789012',
                'phone': '0123456789',
                'telefon': '+60123456789',
                'email': 'test@example.com',
                'alamat': '123 Test Street, Kuala Lumpur'
            }
            
            masked_data = AuditLog.mask_sensitive_data(sensitive_data)
            
            self.stdout.write('\nSensitive data masking:')
            for field, original in sensitive_data.items():
                masked = masked_data.get(field, original)
                if original != masked:
                    self.stdout.write(self.style.SUCCESS(
                        f'✓ {field}: "{original}" → "{masked}"'
                    ))
                else:
                    self.stdout.write(f'  {field}: "{original}" (unchanged)')
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Data masking test failed: {e}'))

    def test_thread_local_context(self):
        """Test thread-local context functionality"""
        self.stdout.write('\n=== Testing Thread-Local Context ===')
        
        try:
            factory = RequestFactory()
            request = factory.get('/test/')
            request.user = self.test_user
            request.audit_ip = '192.168.1.100'
            
            # Test setting and getting context
            set_current_request(request)
            
            current_user = get_current_user()
            if current_user == self.test_user:
                self.stdout.write(self.style.SUCCESS('✓ Thread-local user context works'))
            else:
                self.stdout.write(self.style.ERROR('✗ Thread-local user context failed'))
            
            from audit.utils import get_current_ip
            current_ip = get_current_ip()
            if current_ip == '192.168.1.100':
                self.stdout.write(self.style.SUCCESS('✓ Thread-local IP context works'))
            else:
                self.stdout.write(self.style.ERROR(f'✗ Thread-local IP context failed: got {current_ip}'))
            
            # Test clearing context
            clear_current_request()
            current_user = get_current_user()
            if current_user is None:
                self.stdout.write(self.style.SUCCESS('✓ Thread-local context clearing works'))
            else:
                self.stdout.write(self.style.ERROR('✗ Thread-local context clearing failed'))
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Thread-local context test failed: {e}'))

    def generate_report(self):
        """Generate a summary report of audit logs"""
        self.stdout.write('\n=== AUDIT TEST REPORT ===')
        
        all_logs = AuditLog.objects.all().order_by('-timestamp')
        new_logs = AuditLog.objects.filter(id__gt=self.initial_log_count).order_by('-timestamp')
        
        self.stdout.write(f'Total audit logs: {all_logs.count()}')
        self.stdout.write(f'New logs created during test: {new_logs.count()}')
        
        if new_logs.exists():
            # Group by action
            actions = new_logs.values_list('action', flat=True).distinct()
            self.stdout.write('\nActions logged:')
            for action in actions:
                count = new_logs.filter(action=action).count()
                self.stdout.write(f'  {action}: {count} logs')
            
            # Group by resource type
            resource_types = new_logs.values_list('resource_type', flat=True).distinct()
            self.stdout.write('\nResource types tracked:')
            for resource_type in resource_types:
                if resource_type:  # Skip empty resource types
                    count = new_logs.filter(resource_type=resource_type).count()
                    self.stdout.write(f'  {resource_type}: {count} logs')
            
            # Show recent logs
            self.stdout.write('\nMost recent 5 audit logs:')
            for log in new_logs[:5]:
                timestamp = log.timestamp.strftime('%Y-%m-%d %H:%M:%S')
                self.stdout.write(
                    f'  {timestamp} - {log.username} - {log.action} - {log.resource_type} - {log.resource_name}'
                )

    def cleanup_test_data(self):
        """Clean up test data created during testing"""
        self.stdout.write('\nCleaning up test data...')
        
        try:
            # Delete test staff
            Staff.objects.filter(username__in=[
                'signal_test_staff',
                'audit_test_user',
                'audit_admin_user'
            ]).delete()
            
            # Delete test patients if available
            if PESAKIT_AVAILABLE:
                Pesakit.objects.filter(mrn__startswith='SIG').delete()
            
            # Optionally clean up audit logs created during test
            test_logs = AuditLog.objects.filter(
                username__in=['audit_test_user', 'audit_admin_user']
            )
            deleted_count = test_logs.count()
            test_logs.delete()
            
            self.stdout.write(f'Deleted {deleted_count} test audit logs')
            self.stdout.write(self.style.SUCCESS('Test data cleanup completed'))
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Cleanup failed: {e}'))