"""
Management command to generate test audit data for development and testing

This command creates sample audit log entries to test the audit system
without requiring actual user activity.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
import random
from audit.models import AuditLog


User = get_user_model()


class Command(BaseCommand):
    help = "Generate test audit data for development and testing"
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=100,
            help='Number of audit log entries to create (default: 100)',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Spread entries over this many days (default: 30)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing audit logs before generating new ones',
        )
    
    def handle(self, *args, **options):
        count = options['count']
        days = options['days']
        clear = options['clear']
        
        if clear:
            deleted_count, _ = AuditLog.objects.all().delete()
            self.stdout.write(f"Cleared {deleted_count} existing audit log entries")
        
        # Get or create test users
        users = self.get_or_create_test_users()
        
        # Generate audit entries
        self.stdout.write(f"Generating {count} audit log entries over {days} days...")
        
        created_count = 0
        for i in range(count):
            self.create_random_audit_entry(users, days)
            created_count += 1
            
            if created_count % 20 == 0:
                self.stdout.write(f"Created {created_count}/{count} entries...")
        
        self.stdout.write(
            self.style.SUCCESS(f"Successfully created {created_count} audit log entries")
        )
    
    def get_or_create_test_users(self):
        """Get or create test users for audit entries"""
        users = []
        
        # Try to get existing users
        existing_users = list(User.objects.filter(is_active=True)[:5])
        if existing_users:
            users.extend(existing_users)
        
        # Create test users if needed
        test_usernames = ['dr_ahmad', 'dr_siti', 'radiographer1', 'admin_user', 'test_user']
        
        for username in test_usernames:
            if len(users) >= 5:
                break
                
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': username.replace('_', ' ').title(),
                    'is_active': True,
                }
            )
            if created:
                self.stdout.write(f"Created test user: {username}")
            users.append(user)
        
        return users
    
    def create_random_audit_entry(self, users, days_range):
        """Create a random audit log entry"""
        # Random timestamp within the specified range
        random_days_ago = random.randint(0, days_range)
        random_hours = random.randint(0, 23)
        random_minutes = random.randint(0, 59)
        
        timestamp = timezone.now() - timedelta(
            days=random_days_ago,
            hours=random_hours,
            minutes=random_minutes
        )
        
        # Random user (or None for anonymous actions)
        user = None
        username = 'Anonymous'
        if random.random() > 0.1:  # 90% chance of having a user
            user = random.choice(users)
            username = user.username
        
        # Random action
        actions = [
            'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 
            'DELETE', 'VIEW', 'EXPORT', 'API_GET', 'API_POST'
        ]
        action = random.choice(actions)
        
        # Random resource type and data
        resource_scenarios = self.get_resource_scenarios()
        scenario = random.choice(resource_scenarios)
        
        # Create the audit log entry
        audit_log = AuditLog.objects.create(
            user=user,
            username=username,
            action=action,
            resource_type=scenario['resource_type'],
            resource_id=scenario['resource_id'],
            resource_name=scenario['resource_name'],
            old_data=scenario.get('old_data'),
            new_data=scenario.get('new_data'),
            ip_address=self.get_random_ip(),
            timestamp=timestamp,
            success=random.random() > 0.05  # 95% success rate
        )
        
        return audit_log
    
    def get_resource_scenarios(self):
        """Get different resource scenarios for realistic test data"""
        return [
            {
                'resource_type': 'Patient',
                'resource_id': f'P{random.randint(1000, 9999)}',
                'resource_name': f'A**** b** A*******',  # Masked patient name
                'new_data': {
                    'mrn': f'MRN{random.randint(100000, 999999)}',
                    'ic': '12****-**-***4',  # Masked IC
                    'jantina': random.choice(['L', 'P'])
                }
            },
            {
                'resource_type': 'Examination',
                'resource_id': f'E{random.randint(1000, 9999)}',
                'resource_name': f'X-Ray Chest {random.randint(1, 100)}',
                'new_data': {
                    'exam_type': random.choice(['X-Ray Chest', 'CT Scan', 'MRI Brain']),
                    'modality': random.choice(['X-Ray', 'CT', 'MRI'])
                }
            },
            {
                'resource_type': 'Registration',
                'resource_id': f'R{random.randint(1000, 9999)}',
                'resource_name': f'Registration for M**** A****',
                'new_data': {
                    'patient_mrn': f'MRN{random.randint(100000, 999999)}',
                    'exam_date': timezone.now().date().isoformat()
                }
            },
            {
                'resource_type': 'Staff',
                'resource_id': f'S{random.randint(1, 100)}',
                'resource_name': random.choice(['dr_ahmad', 'dr_siti', 'radiographer1']),
                'new_data': {
                    'is_active': True,
                    'last_login': timezone.now().isoformat()
                }
            },
            {
                'resource_type': 'API',
                'resource_id': random.choice(['/api/patients/', '/api/examinations/', '/api/staff/']),
                'resource_name': f"GET {random.choice(['/api/patients/', '/api/examinations/'])}",
                'new_data': {
                    'method': 'GET',
                    'status_code': random.choice([200, 201, 404, 500]),
                    'duration_ms': round(random.uniform(50, 2000), 2)
                }
            }
        ]
    
    def get_random_ip(self):
        """Generate a random IP address for testing"""
        ip_patterns = [
            '192.168.1.{}',
            '10.0.0.{}',
            '172.16.0.{}',
            '127.0.0.1',  # localhost
        ]
        
        if random.random() > 0.1:  # 90% internal IPs
            pattern = random.choice(ip_patterns[:-1])
            return pattern.format(random.randint(1, 254))
        else:
            return ip_patterns[-1]  # localhost