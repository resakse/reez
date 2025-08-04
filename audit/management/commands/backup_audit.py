"""
Simple backup management command for small-scale audit trails.
Provides automated backup and recovery procedures for audit logs.
"""

import os
import json
import gzip
import shutil
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand, CommandError
from django.core import serializers
from django.conf import settings
from django.utils import timezone
from audit.models import AuditLog
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Simple audit logs backup for small institutions'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--backup-dir',
            type=str,
            default='/var/backups/audit',
            help='Directory to store backups (default: /var/backups/audit)'
        )
        
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of days of audit logs to backup (default: 30)'
        )
        
        parser.add_argument(
            '--compress',
            action='store_true',
            help='Compress backup files with gzip'
        )
        
        parser.add_argument(
            '--format',
            choices=['json', 'csv'],
            default='json',
            help='Backup format (default: json)'
        )
        
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Clean up old backup files (older than 90 days)'
        )
        
        parser.add_argument(
            '--restore',
            type=str,
            help='Restore from backup file (provide file path)'
        )
        
        parser.add_argument(
            '--verify',
            action='store_true',
            help='Verify backup file integrity'
        )
        
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually doing it'
        )
    
    def handle(self, *args, **options):
        self.verbosity = options['verbosity']
        self.dry_run = options['dry_run']
        
        try:
            # Handle restore operation
            if options['restore']:
                return self.restore_backup(options['restore'])
            
            # Handle verify operation
            if options['verify']:
                return self.verify_backup(options.get('restore', ''))
            
            # Handle cleanup operation
            if options['cleanup']:
                self.cleanup_old_backups(options['backup_dir'])
            
            # Perform backup
            self.create_backup(
                backup_dir=options['backup_dir'],
                days=options['days'],
                compress=options['compress'],
                format=options['format']
            )
            
        except Exception as e:
            logger.error(f"Backup operation failed: {e}")
            raise CommandError(f"Backup failed: {e}")
    
    def create_backup(self, backup_dir, days, compress, format):
        """Create backup of audit logs"""
        
        # Ensure backup directory exists
        if not self.dry_run:
            os.makedirs(backup_dir, exist_ok=True)
        
        # Calculate date range
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        # Get audit logs to backup
        audit_logs = AuditLog.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        ).order_by('timestamp')
        
        log_count = audit_logs.count()
        
        if self.verbosity >= 1:
            self.stdout.write(f"Found {log_count} audit logs to backup")
            self.stdout.write(f"Date range: {start_date.date()} to {end_date.date()}")
        
        if log_count == 0:
            self.stdout.write(self.style.WARNING("No audit logs found in specified date range"))
            return
        
        # Generate backup filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"audit_backup_{timestamp}.{format}"
        
        if compress:
            filename += '.gz'
        
        backup_path = os.path.join(backup_dir, filename)
        
        if self.verbosity >= 1:
            self.stdout.write(f"Creating backup: {backup_path}")
        
        if self.dry_run:
            self.stdout.write(self.style.SUCCESS(f"DRY RUN: Would create backup with {log_count} logs"))
            return
        
        try:
            # Create backup based on format
            if format == 'json':
                self.create_json_backup(audit_logs, backup_path, compress)
            elif format == 'csv':
                self.create_csv_backup(audit_logs, backup_path, compress)
            
            # Verify backup was created
            if os.path.exists(backup_path):
                file_size = os.path.getsize(backup_path)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Backup created successfully: {backup_path} ({file_size:,} bytes)"
                    )
                )
                
                # Log backup creation
                logger.info(f"Audit backup created: {backup_path} with {log_count} logs")
                
            else:
                raise CommandError("Backup file was not created")
                
        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            raise CommandError(f"Failed to create backup: {e}")
    
    def create_json_backup(self, audit_logs, backup_path, compress):
        """Create JSON format backup"""
        
        # Serialize audit logs to JSON
        backup_data = {
            'metadata': {
                'created_at': timezone.now().isoformat(),
                'format': 'json',
                'count': audit_logs.count(),
                'django_version': '4.2.6',  # Your Django version
                'backup_tool': 'audit.management.commands.backup_audit'
            },
            'audit_logs': []
        }
        
        # Convert logs to dictionary format
        for log in audit_logs:
            log_data = {
                'id': log.id,
                'user_id': log.user_id,
                'username': log.username,
                'action': log.action,
                'resource_type': log.resource_type,
                'resource_id': log.resource_id,
                'resource_name': log.resource_name,
                'old_data': log.old_data,
                'new_data': log.new_data,
                'ip_address': str(log.ip_address) if log.ip_address else None,
                'timestamp': log.timestamp.isoformat(),
                'success': log.success
            }
            backup_data['audit_logs'].append(log_data)
        
        # Write to file
        if compress:
            with gzip.open(backup_path, 'wt', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
        else:
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
    
    def create_csv_backup(self, audit_logs, backup_path, compress):
        """Create CSV format backup"""
        import csv
        
        # Define CSV headers
        headers = [
            'id', 'user_id', 'username', 'action', 'resource_type',
            'resource_id', 'resource_name', 'ip_address', 'timestamp',
            'success', 'old_data', 'new_data'
        ]
        
        # Open file for writing
        if compress:
            file_obj = gzip.open(backup_path, 'wt', encoding='utf-8', newline='')
        else:
            file_obj = open(backup_path, 'w', encoding='utf-8', newline='')
        
        try:
            writer = csv.writer(file_obj)
            writer.writerow(headers)
            
            for log in audit_logs:
                row = [
                    log.id,
                    log.user_id,
                    log.username,
                    log.action,
                    log.resource_type,
                    log.resource_id,
                    log.resource_name,
                    str(log.ip_address) if log.ip_address else '',
                    log.timestamp.isoformat(),
                    log.success,
                    json.dumps(log.old_data) if log.old_data else '',
                    json.dumps(log.new_data) if log.new_data else ''
                ]
                writer.writerow(row)
        
        finally:
            file_obj.close()
    
    def restore_backup(self, backup_file):
        """Restore audit logs from backup"""
        
        if not os.path.exists(backup_file):
            raise CommandError(f"Backup file not found: {backup_file}")
        
        if self.verbosity >= 1:
            self.stdout.write(f"Restoring from backup: {backup_file}")
        
        if self.dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN: Would restore from backup"))
            return
        
        try:
            # Determine if file is compressed
            is_compressed = backup_file.endswith('.gz')
            
            # Read backup data
            if is_compressed:
                with gzip.open(backup_file, 'rt', encoding='utf-8') as f:
                    backup_data = json.load(f)
            else:
                with open(backup_file, 'r', encoding='utf-8') as f:
                    backup_data = json.load(f)
            
            # Validate backup data
            if 'audit_logs' not in backup_data:
                raise CommandError("Invalid backup format: missing audit_logs")
            
            logs_to_restore = backup_data['audit_logs']
            
            if self.verbosity >= 1:
                self.stdout.write(f"Found {len(logs_to_restore)} logs in backup")
            
            # Restore logs (be careful not to create duplicates)
            restored_count = 0
            skipped_count = 0
            
            for log_data in logs_to_restore:
                # Check if log already exists
                if AuditLog.objects.filter(
                    id=log_data['id'],
                    timestamp=log_data['timestamp']
                ).exists():
                    skipped_count += 1
                    continue
                
                # Create new audit log
                AuditLog.objects.create(
                    id=log_data['id'],
                    user_id=log_data.get('user_id'),
                    username=log_data['username'],
                    action=log_data['action'],
                    resource_type=log_data.get('resource_type', ''),
                    resource_id=log_data.get('resource_id', ''),
                    resource_name=log_data.get('resource_name', ''),
                    old_data=log_data.get('old_data'),
                    new_data=log_data.get('new_data'),
                    ip_address=log_data.get('ip_address'),
                    timestamp=log_data['timestamp'],
                    success=log_data.get('success', True)
                )
                restored_count += 1
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"Restore completed: {restored_count} logs restored, {skipped_count} skipped"
                )
            )
            
            logger.info(f"Audit logs restored from {backup_file}: {restored_count} logs")
            
        except Exception as e:
            logger.error(f"Error restoring backup: {e}")
            raise CommandError(f"Failed to restore backup: {e}")
    
    def verify_backup(self, backup_file):
        """Verify backup file integrity"""
        
        if not backup_file:
            raise CommandError("Please provide backup file path with --restore option")
        
        if not os.path.exists(backup_file):
            raise CommandError(f"Backup file not found: {backup_file}")
        
        try:
            # Determine if file is compressed
            is_compressed = backup_file.endswith('.gz')
            
            if self.verbosity >= 1:
                self.stdout.write(f"Verifying backup: {backup_file}")
            
            # Try to read and parse backup
            if is_compressed:
                with gzip.open(backup_file, 'rt', encoding='utf-8') as f:
                    backup_data = json.load(f)
            else:
                with open(backup_file, 'r', encoding='utf-8') as f:
                    backup_data = json.load(f)
            
            # Validate structure
            required_fields = ['metadata', 'audit_logs']
            for field in required_fields:
                if field not in backup_data:
                    raise CommandError(f"Invalid backup: missing {field}")
            
            # Check metadata
            metadata = backup_data['metadata']
            log_count = len(backup_data['audit_logs'])
            
            self.stdout.write(self.style.SUCCESS("Backup verification passed"))
            
            if self.verbosity >= 1:
                self.stdout.write(f"Backup created: {metadata.get('created_at', 'Unknown')}")
                self.stdout.write(f"Format: {metadata.get('format', 'Unknown')}")
                self.stdout.write(f"Log count: {log_count}")
                self.stdout.write(f"File size: {os.path.getsize(backup_file):,} bytes")
            
        except Exception as e:
            logger.error(f"Backup verification failed: {e}")
            raise CommandError(f"Backup verification failed: {e}")
    
    def cleanup_old_backups(self, backup_dir):
        """Clean up old backup files (older than 90 days)"""
        
        if not os.path.exists(backup_dir):
            if self.verbosity >= 1:
                self.stdout.write(f"Backup directory does not exist: {backup_dir}")
            return
        
        # Calculate cutoff date (90 days ago)
        cutoff_date = datetime.now() - timedelta(days=90)
        
        cleaned_count = 0
        total_size = 0
        
        try:
            for filename in os.listdir(backup_dir):
                if not filename.startswith('audit_backup_'):
                    continue
                
                file_path = os.path.join(backup_dir, filename)
                file_stat = os.stat(file_path)
                file_modified = datetime.fromtimestamp(file_stat.st_mtime)
                
                if file_modified < cutoff_date:
                    file_size = file_stat.st_size
                    
                    if self.verbosity >= 2:
                        self.stdout.write(f"Removing old backup: {filename}")
                    
                    if not self.dry_run:
                        os.remove(file_path)
                    
                    cleaned_count += 1
                    total_size += file_size
            
            if cleaned_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Cleaned up {cleaned_count} old backup files ({total_size:,} bytes freed)"
                    )
                )
            else:
                if self.verbosity >= 1:
                    self.stdout.write("No old backup files to clean up")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            raise CommandError(f"Cleanup failed: {e}")