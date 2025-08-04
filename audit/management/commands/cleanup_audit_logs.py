"""
Management command to clean up old audit logs

This command implements the 2-year retention policy for audit logs
as specified in the small-scale audit trails implementation plan.
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta
from audit.models import AuditLog
import logging


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = """
    Clean up audit logs older than specified retention period.
    
    Default retention period is 2 years as per compliance requirements.
    Use --dry-run to see what would be deleted without actually deleting.
    Use --retention-days to specify custom retention period.
    """
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )
        parser.add_argument(
            '--retention-days',
            type=int,
            default=730,  # 2 years
            help='Number of days to retain audit logs (default: 730 days / 2 years)',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Number of records to delete in each batch (default: 1000)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force deletion without confirmation prompt',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed progress information',
        )
    
    def handle(self, *args, **options):
        """Main command handler"""
        
        retention_days = options['retention_days']
        dry_run = options['dry_run']
        batch_size = options['batch_size']
        force = options['force']
        verbose = options['verbose']
        
        # Calculate cutoff date
        cutoff_date = timezone.now() - timedelta(days=retention_days)
        
        self.stdout.write(
            self.style.SUCCESS(
                f"Audit log cleanup started - Retention: {retention_days} days"
            )
        )
        self.stdout.write(f"Cutoff date: {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Count logs to be deleted
        logs_to_delete = AuditLog.objects.filter(timestamp__lt=cutoff_date)
        total_count = logs_to_delete.count()
        
        if total_count == 0:
            self.stdout.write(
                self.style.SUCCESS("No audit logs found that exceed retention period.")
            )
            return
        
        # Show summary
        self.stdout.write(f"\nLogs to be deleted: {total_count:,}")
        
        if verbose:
            self.show_deletion_summary(logs_to_delete)
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING("\n[DRY RUN MODE] - No data will be deleted")
            )
            self.show_sample_records(logs_to_delete.order_by('timestamp')[:10])
            return
        
        # Confirm deletion unless forced
        if not force:
            confirm = input(f"\nAre you sure you want to delete {total_count:,} audit log records? [y/N]: ")
            if confirm.lower() != 'y':
                self.stdout.write("Operation cancelled.")
                return
        
        # Perform deletion in batches
        deleted_count = self.delete_in_batches(logs_to_delete, batch_size, verbose)
        
        # Final summary
        self.stdout.write(
            self.style.SUCCESS(
                f"\nCleanup completed successfully! Deleted {deleted_count:,} audit log records."
            )
        )
        
        # Log the cleanup operation itself
        try:
            AuditLog.log_action(
                user=None,
                action='DELETE',
                resource_type='AuditLog',
                resource_name=f'Cleanup: {deleted_count:,} records deleted',
                new_data={
                    'deleted_count': deleted_count,
                    'retention_days': retention_days,
                    'cutoff_date': cutoff_date.isoformat(),
                },
                success=True
            )
        except Exception as e:
            logger.warning(f"Failed to log cleanup operation: {e}")
    
    def show_deletion_summary(self, queryset):
        """Show summary of logs to be deleted by action type"""
        from django.db.models import Count
        
        summary = queryset.values('action').annotate(count=Count('action')).order_by('-count')
        
        self.stdout.write("\nBreakdown by action type:")
        for item in summary:
            self.stdout.write(f"  {item['action']}: {item['count']:,}")
        
        # Show date range
        oldest = queryset.order_by('timestamp').first()
        newest = queryset.order_by('-timestamp').first()
        
        if oldest and newest:
            self.stdout.write(f"\nDate range: {oldest.timestamp.strftime('%Y-%m-%d')} to {newest.timestamp.strftime('%Y-%m-%d')}")
    
    def show_sample_records(self, sample_logs):
        """Show sample records that would be deleted"""
        self.stdout.write("\nSample records that would be deleted:")
        self.stdout.write("-" * 80)
        
        for log in sample_logs:
            self.stdout.write(
                f"{log.timestamp.strftime('%Y-%m-%d %H:%M:%S')} | "
                f"{log.username:15} | {log.action:10} | {log.resource_type or 'N/A'}"
            )
    
    def delete_in_batches(self, queryset, batch_size, verbose):
        """Delete records in batches to avoid memory issues"""
        total_deleted = 0
        
        while True:
            # Get batch of IDs to delete (more memory efficient)
            batch_ids = list(
                queryset.values_list('id', flat=True)[:batch_size]
            )
            
            if not batch_ids:
                break
            
            # Delete batch
            deleted_count, _ = AuditLog.objects.filter(id__in=batch_ids).delete()
            total_deleted += deleted_count
            
            if verbose:
                self.stdout.write(f"Deleted batch: {deleted_count:,} records (Total: {total_deleted:,})")
        
        return total_deleted
    
    def validate_retention_days(self, retention_days):
        """Validate retention period"""
        if retention_days < 1:
            raise CommandError("Retention days must be at least 1")
        
        if retention_days < 365:
            self.stdout.write(
                self.style.WARNING(
                    f"Warning: Retention period of {retention_days} days is less than 1 year. "
                    "This may not meet compliance requirements."
                )
            )
        
        if retention_days > 3650:  # 10 years
            self.stdout.write(
                self.style.WARNING(
                    f"Warning: Retention period of {retention_days} days is more than 10 years. "
                    "This will consume significant storage space."
                )
            )