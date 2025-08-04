"""
Audit log integrity verification command for small-scale audit trails.
Provides basic tamper detection and log integrity verification.
"""

import hashlib
import json
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.db.models import Count, Q
from audit.models import AuditLog
from audit.security import DataProtector
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Verify audit log integrity for small institutions'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of days to verify (default: 30)'
        )
        
        parser.add_argument(
            '--full-check',
            action='store_true',
            help='Perform full integrity check including data validation'
        )
        
        parser.add_argument(
            '--suspicious-patterns',
            action='store_true',
            help='Check for suspicious patterns in audit logs'
        )
        
        parser.add_argument(
            '--generate-report',
            action='store_true',
            help='Generate detailed integrity report'
        )
        
        parser.add_argument(
            '--output-file',
            type=str,
            help='Output report to file'
        )
        
        parser.add_argument(
            '--fix-issues',
            action='store_true',
            help='Attempt to fix minor integrity issues (use with caution)'
        )
    
    def handle(self, *args, **options):
        self.verbosity = options['verbosity']
        self.data_protector = DataProtector()
        
        try:
            # Calculate date range
            end_date = timezone.now()
            start_date = end_date - timedelta(days=options['days'])
            
            if self.verbosity >= 1:
                self.stdout.write(f"Verifying audit logs from {start_date.date()} to {end_date.date()}")
            
            # Get audit logs to verify
            audit_logs = AuditLog.objects.filter(
                timestamp__gte=start_date,
                timestamp__lte=end_date
            ).order_by('timestamp')
            
            log_count = audit_logs.count()
            
            if log_count == 0:
                self.stdout.write(self.style.WARNING("No audit logs found in specified date range"))
                return
            
            # Perform integrity checks
            integrity_results = {
                'total_logs': log_count,
                'start_date': start_date,
                'end_date': end_date,
                'checks_performed': [],
                'issues_found': [],
                'warnings': [],
                'recommendations': []
            }
            
            # Basic consistency checks
            self.check_basic_consistency(audit_logs, integrity_results)
            
            # Check for data gaps
            self.check_temporal_consistency(audit_logs, integrity_results)
            
            # Check for suspicious patterns if requested
            if options['suspicious_patterns']:
                self.check_suspicious_patterns(audit_logs, integrity_results)
            
            # Full data validation if requested
            if options['full_check']:
                self.perform_full_data_validation(audit_logs, integrity_results)
            
            # Generate report
            if options['generate_report']:
                self.generate_integrity_report(integrity_results, options.get('output_file'))
            
            # Display summary
            self.display_summary(integrity_results)
            
            # Fix issues if requested
            if options['fix_issues'] and integrity_results['issues_found']:
                self.fix_integrity_issues(integrity_results)
            
        except Exception as e:
            logger.error(f"Integrity verification failed: {e}")
            raise CommandError(f"Verification failed: {e}")
    
    def check_basic_consistency(self, audit_logs, results):
        """Check basic data consistency"""
        
        if self.verbosity >= 2:
            self.stdout.write("Checking basic data consistency...")
        
        issues = []
        warnings = []
        
        # Check for null or empty critical fields
        null_username_count = audit_logs.filter(username__isnull=True).count()
        empty_username_count = audit_logs.filter(username='').count()
        null_action_count = audit_logs.filter(action__isnull=True).count()
        
        if null_username_count > 0:
            issues.append(f"Found {null_username_count} logs with null username")
        
        if empty_username_count > 0:
            issues.append(f"Found {empty_username_count} logs with empty username")
        
        if null_action_count > 0:
            issues.append(f"Found {null_action_count} logs with null action")
        
        # Check for invalid timestamps
        future_logs = audit_logs.filter(timestamp__gt=timezone.now()).count()
        if future_logs > 0:
            issues.append(f"Found {future_logs} logs with future timestamps")
        
        # Check for logs without IP addresses (may be normal for some actions)
        no_ip_logs = audit_logs.filter(ip_address__isnull=True).count()
        if no_ip_logs > 0:
            warnings.append(f"Found {no_ip_logs} logs without IP addresses")
        
        # Check for extremely long usernames (possible injection attempts)
        long_username_logs = audit_logs.extra(where=["LENGTH(username) > 150"]).count()
        if long_username_logs > 0:
            warnings.append(f"Found {long_username_logs} logs with unusually long usernames")
        
        results['checks_performed'].append('basic_consistency')
        results['issues_found'].extend(issues)
        results['warnings'].extend(warnings)
        
        if self.verbosity >= 2:
            if issues:
                self.stdout.write(self.style.ERROR(f"Basic consistency issues: {len(issues)}"))
            else:
                self.stdout.write(self.style.SUCCESS("Basic consistency check passed"))
    
    def check_temporal_consistency(self, audit_logs, results):
        """Check for temporal consistency and gaps"""
        
        if self.verbosity >= 2:
            self.stdout.write("Checking temporal consistency...")
        
        issues = []
        warnings = []
        
        # Check for duplicate timestamps (unlikely but possible)
        duplicate_timestamps = audit_logs.values('timestamp').annotate(
            count=Count('timestamp')
        ).filter(count__gt=10)  # More than 10 events at exact same time is suspicious
        
        if duplicate_timestamps.exists():
            for dup in duplicate_timestamps:
                warnings.append(f"Found {dup['count']} logs with identical timestamp: {dup['timestamp']}")
        
        # Check for large gaps in logging (more than 24 hours with no activity)
        log_dates = audit_logs.values_list('timestamp__date', flat=True).distinct().order_by('timestamp__date')
        
        if len(log_dates) > 1:
            for i in range(1, len(log_dates)):
                gap = (log_dates[i] - log_dates[i-1]).days
                if gap > 1:
                    warnings.append(f"Gap in audit logging: {gap} days between {log_dates[i-1]} and {log_dates[i]}")
        
        # Check for logs out of sequence (timestamps going backwards)
        out_of_sequence = 0
        previous_timestamp = None
        
        for log in audit_logs.iterator():
            if previous_timestamp and log.timestamp < previous_timestamp:
                out_of_sequence += 1
            previous_timestamp = log.timestamp
        
        if out_of_sequence > 0:
            issues.append(f"Found {out_of_sequence} logs with out-of-sequence timestamps")
        
        results['checks_performed'].append('temporal_consistency')
        results['issues_found'].extend(issues)
        results['warnings'].extend(warnings)
        
        if self.verbosity >= 2:
            if issues:
                self.stdout.write(self.style.ERROR(f"Temporal consistency issues: {len(issues)}"))
            else:
                self.stdout.write(self.style.SUCCESS("Temporal consistency check passed"))
    
    def check_suspicious_patterns(self, audit_logs, results):
        """Check for suspicious patterns in audit logs"""
        
        if self.verbosity >= 2:
            self.stdout.write("Checking for suspicious patterns...")
        
        warnings = []
        issues = []
        
        # Check for excessive failed logins from single IP
        failed_logins = audit_logs.filter(action='LOGIN_FAILED', success=False)
        
        if failed_logins.exists():
            # Group by IP address
            failed_by_ip = failed_logins.values('ip_address').annotate(
                count=Count('ip_address')
            ).filter(count__gte=10).order_by('-count')
            
            for item in failed_by_ip:
                warnings.append(f"Excessive failed logins from IP {item['ip_address']}: {item['count']} attempts")
        
        # Check for unusual off-hours activity
        off_hours_logs = audit_logs.extra(
            where=["EXTRACT(hour FROM timestamp) < 6 OR EXTRACT(hour FROM timestamp) > 22"]
        )
        
        if off_hours_logs.exists():
            off_hours_count = off_hours_logs.count()
            total_count = audit_logs.count()
            percentage = (off_hours_count / total_count) * 100
            
            if percentage > 20:  # More than 20% off-hours activity
                warnings.append(f"High off-hours activity: {off_hours_count} logs ({percentage:.1f}%) outside business hours")
        
        # Check for users with excessive patient access
        patient_access_logs = audit_logs.filter(resource_type='Patient')
        
        if patient_access_logs.exists():
            # Group by user
            access_by_user = patient_access_logs.values('username').annotate(
                count=Count('username')
            ).filter(count__gte=100).order_by('-count')  # Adjusted for small institutions
            
            for item in access_by_user:
                warnings.append(f"High patient access volume by user {item['username']}: {item['count']} accesses")
        
        # Check for rapid succession of identical actions
        rapid_actions = audit_logs.values('username', 'action', 'resource_type').annotate(
            count=Count('id')
        ).filter(count__gte=50).order_by('-count')  # 50+ identical actions
        
        for item in rapid_actions:
            warnings.append(f"Rapid identical actions: User {item['username']} performed {item['action']} on {item['resource_type']} {item['count']} times")
        
        # Check for users accessing audit dashboard frequently
        audit_access_logs = audit_logs.filter(resource_type='AuditDashboard')
        
        if audit_access_logs.exists():
            frequent_audit_users = audit_access_logs.values('username').annotate(
                count=Count('username')
            ).filter(count__gte=20).order_by('-count')  # 20+ audit accesses
            
            for item in frequent_audit_users:
                warnings.append(f"Frequent audit dashboard access by user {item['username']}: {item['count']} times")
        
        results['checks_performed'].append('suspicious_patterns')
        results['issues_found'].extend(issues)
        results['warnings'].extend(warnings)
        
        if self.verbosity >= 2:
            if warnings:
                self.stdout.write(self.style.WARNING(f"Suspicious patterns found: {len(warnings)}"))
            else:
                self.stdout.write(self.style.SUCCESS("No suspicious patterns detected"))
    
    def perform_full_data_validation(self, audit_logs, results):
        """Perform full data validation including JSON field integrity"""
        
        if self.verbosity >= 2:
            self.stdout.write("Performing full data validation...")
        
        issues = []
        warnings = []
        validated_count = 0
        
        # Check JSON field integrity
        for log in audit_logs.iterator():
            try:
                # Validate old_data JSON
                if log.old_data:
                    if not isinstance(log.old_data, dict):
                        issues.append(f"Log {log.id}: Invalid old_data format")
                
                # Validate new_data JSON
                if log.new_data:
                    if not isinstance(log.new_data, dict):
                        issues.append(f"Log {log.id}: Invalid new_data format")
                
                # Check for extremely large JSON data (potential DoS)
                if log.old_data and len(str(log.old_data)) > 10000:
                    warnings.append(f"Log {log.id}: Unusually large old_data field")
                
                if log.new_data and len(str(log.new_data)) > 10000:
                    warnings.append(f"Log {log.id}: Unusually large new_data field")
                
                validated_count += 1
                
                # Progress indicator for large datasets
                if validated_count % 1000 == 0 and self.verbosity >= 2:
                    self.stdout.write(f"Validated {validated_count} logs...")
                
            except Exception as e:
                issues.append(f"Log {log.id}: Data validation error - {str(e)}")
        
        results['checks_performed'].append('full_data_validation')
        results['issues_found'].extend(issues)
        results['warnings'].extend(warnings)
        results['validated_count'] = validated_count
        
        if self.verbosity >= 2:
            self.stdout.write(f"Validated {validated_count} logs")
            if issues:
                self.stdout.write(self.style.ERROR(f"Data validation issues: {len(issues)}"))
            else:
                self.stdout.write(self.style.SUCCESS("Full data validation passed"))
    
    def generate_integrity_report(self, results, output_file=None):
        """Generate detailed integrity report"""
        
        report = {
            'generated_at': timezone.now().isoformat(),
            'verification_period': {
                'start_date': results['start_date'].isoformat(),
                'end_date': results['end_date'].isoformat(),
                'total_logs': results['total_logs']
            },
            'checks_performed': results['checks_performed'],
            'summary': {
                'issues_found': len(results['issues_found']),
                'warnings_issued': len(results['warnings']),
                'overall_status': 'PASS' if not results['issues_found'] else 'ISSUES_FOUND'
            },
            'details': {
                'issues': results['issues_found'],
                'warnings': results['warnings'],
                'recommendations': results['recommendations']
            }
        }
        
        # Add additional statistics if available
        if 'validated_count' in results:
            report['verification_period']['validated_count'] = results['validated_count']
        
        # Generate recommendations based on findings
        if results['issues_found']:
            report['details']['recommendations'].append("Address all identified issues immediately")
            report['details']['recommendations'].append("Review audit log collection procedures")
        
        if results['warnings']:
            report['details']['recommendations'].append("Investigate warnings for potential security concerns")
            report['details']['recommendations'].append("Consider implementing additional monitoring")
        
        if not results['issues_found'] and not results['warnings']:
            report['details']['recommendations'].append("Audit log integrity is good - continue regular monitoring")
        
        # Save to file if requested
        if output_file:
            try:
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(report, f, indent=2, ensure_ascii=False)
                
                self.stdout.write(
                    self.style.SUCCESS(f"Integrity report saved to: {output_file}")
                )
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Failed to save report: {e}")
                )
        
        return report
    
    def display_summary(self, results):
        """Display integrity verification summary"""
        
        self.stdout.write("\n" + "="*60)
        self.stdout.write("AUDIT LOG INTEGRITY VERIFICATION SUMMARY")
        self.stdout.write("="*60)
        
        self.stdout.write(f"Period: {results['start_date'].date()} to {results['end_date'].date()}")
        self.stdout.write(f"Total logs verified: {results['total_logs']:,}")
        self.stdout.write(f"Checks performed: {', '.join(results['checks_performed'])}")
        
        # Issues summary
        if results['issues_found']:
            self.stdout.write(f"\n{self.style.ERROR('ISSUES FOUND:')} {len(results['issues_found'])}")
            for issue in results['issues_found']:
                self.stdout.write(f"  • {issue}")
        else:
            self.stdout.write(f"\n{self.style.SUCCESS('✓ No critical issues found')}")
        
        # Warnings summary
        if results['warnings']:
            self.stdout.write(f"\n{self.style.WARNING('WARNINGS:')} {len(results['warnings'])}")
            for warning in results['warnings'][:5]:  # Show first 5 warnings
                self.stdout.write(f"  • {warning}")
            
            if len(results['warnings']) > 5:
                self.stdout.write(f"  ... and {len(results['warnings']) - 5} more warnings")
        else:
            self.stdout.write(f"{self.style.SUCCESS('✓ No warnings issued')}")
        
        # Overall status
        if results['issues_found']:
            overall_status = self.style.ERROR("ISSUES REQUIRE ATTENTION")
        elif results['warnings']:
            overall_status = self.style.WARNING("WARNINGS SHOULD BE REVIEWED")
        else:
            overall_status = self.style.SUCCESS("INTEGRITY VERIFIED")
        
        self.stdout.write(f"\nOverall Status: {overall_status}")
        self.stdout.write("="*60 + "\n")
    
    def fix_integrity_issues(self, results):
        """Attempt to fix minor integrity issues"""
        
        self.stdout.write(self.style.WARNING("Attempting to fix integrity issues..."))
        self.stdout.write(self.style.WARNING("This feature is basic and should be used with caution"))
        
        # This is a placeholder for potential fixes
        # In a small institution setup, manual review is usually preferred
        
        fixed_count = 0
        
        # Example: Fix empty usernames by setting to 'UNKNOWN'
        empty_username_logs = AuditLog.objects.filter(username='')
        if empty_username_logs.exists():
            count = empty_username_logs.update(username='UNKNOWN')
            fixed_count += count
            self.stdout.write(f"Fixed {count} logs with empty usernames")
        
        if fixed_count > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Fixed {fixed_count} minor issues")
            )
            logger.info(f"Audit integrity fixes applied: {fixed_count} issues resolved")
        else:
            self.stdout.write("No automatic fixes available for current issues")
            self.stdout.write("Manual review and correction recommended")