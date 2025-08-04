# Generated audit trails migration for Phase 1 implementation

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('staff', '0004_remove_staff_is_supervisor'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(help_text='Username (preserved even if user is deleted)', max_length=150)),
                ('action', models.CharField(choices=[('LOGIN', 'Login'), ('LOGOUT', 'Logout'), ('LOGIN_FAILED', 'Login Failed'), ('CREATE', 'Create'), ('UPDATE', 'Update'), ('DELETE', 'Delete'), ('VIEW', 'View'), ('EXPORT', 'Export'), ('API_GET', 'API View'), ('API_POST', 'API Create'), ('API_PUT', 'API Update'), ('API_PATCH', 'API Update'), ('API_DELETE', 'API Delete')], db_index=True, help_text='Type of action performed', max_length=50)),
                ('resource_type', models.CharField(blank=True, db_index=True, help_text='Type of resource accessed (Patient, Examination, etc.)', max_length=50)),
                ('resource_id', models.CharField(blank=True, help_text='ID of the resource accessed', max_length=50)),
                ('resource_name', models.CharField(blank=True, help_text='Masked name/description of the resource', max_length=200)),
                ('old_data', models.JSONField(blank=True, help_text='Previous state of the resource (masked)', null=True)),
                ('new_data', models.JSONField(blank=True, help_text='New state of the resource (masked)', null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, help_text='IP address of the user', null=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True, help_text='When the action occurred')),
                ('success', models.BooleanField(default=True, help_text='Whether the action was successful')),
                ('user', models.ForeignKey(blank=True, help_text='User who performed the action', null=True, on_delete=django.db.models.deletion.SET_NULL, to='staff.staff')),
            ],
            options={
                'verbose_name': 'Audit Log',
                'verbose_name_plural': 'Audit Logs',
                'ordering': ['-timestamp'],
            },
        ),
        
        # Create indexes for optimal performance with small-scale usage
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['user', 'timestamp'], name='audit_user_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['resource_type', 'resource_id'], name='audit_resource_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['action', 'timestamp'], name='audit_action_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['timestamp', 'success'], name='audit_timestamp_success_idx'),
        ),
        
        # Database-level comment (PostgreSQL only - skipped for SQLite compatibility)
        # migrations.RunSQL(
        #     "COMMENT ON TABLE audit_auditlog IS 'Small-scale audit trail system for RIS - Phase 1 implementation';",
        #     reverse_sql="",
        #     state_operations=[],
        # ),
    ]