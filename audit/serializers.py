from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """
    Simple serializer for audit logs with privacy-safe fields
    Optimized for small-scale institutions
    """
    username = serializers.CharField(read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    formatted_timestamp = serializers.CharField(source='get_formatted_timestamp', read_only=True)
    action_color = serializers.CharField(source='get_action_display_color', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id',
            'username', 
            'action',
            'action_display',
            'action_color',
            'resource_type', 
            'resource_id',
            'resource_name',  # Already masked in model
            'timestamp',
            'formatted_timestamp',
            'success',
            'ip_address'
        ]
        read_only_fields = fields  # All fields are read-only for security


class AuditLogDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for individual audit log inspection
    Includes formatted JSON data for better readability
    """
    username = serializers.CharField(read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    formatted_timestamp = serializers.CharField(source='get_formatted_timestamp', read_only=True)
    action_color = serializers.CharField(source='get_action_display_color', read_only=True)
    pretty_old_data = serializers.SerializerMethodField()
    pretty_new_data = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = [
            'id',
            'username',
            'action',
            'action_display', 
            'action_color',
            'resource_type',
            'resource_id',
            'resource_name',  # Already masked
            'old_data',  # Already masked
            'new_data',  # Already masked
            'pretty_old_data',
            'pretty_new_data',
            'timestamp',
            'formatted_timestamp',
            'success',
            'ip_address'
        ]
        read_only_fields = fields
    
    def get_pretty_old_data(self, obj):
        """Return formatted old_data for display"""
        return obj.get_pretty_data('old_data')
    
    def get_pretty_new_data(self, obj):
        """Return formatted new_data for display"""
        return obj.get_pretty_data('new_data')


class AuditStatsSerializer(serializers.Serializer):
    """
    Serializer for dashboard statistics
    Simple metrics for small institutions
    """
    total_events = serializers.IntegerField()
    unique_users = serializers.IntegerField()
    failed_logins = serializers.IntegerField()
    patient_accesses = serializers.IntegerField()
    examination_activities = serializers.IntegerField()
    api_activities = serializers.IntegerField()
    
    # Top activities and users
    top_actions = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of {action: str, count: int} for top actions"
    )
    top_users = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of {username: str, count: int} for most active users"
    )
    
    # Daily activity for last 7 days
    daily_activity = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of {date: str, count: int} for daily activity"
    )
    
    # Date range info
    date_range_start = serializers.DateTimeField()
    date_range_end = serializers.DateTimeField()
    days_included = serializers.IntegerField()


class AuditExportSerializer(serializers.Serializer):
    """
    Serializer for CSV export parameters
    """
    ACTION_CHOICES = [choice[0] for choice in AuditLog.ACTION_CHOICES]
    RESOURCE_TYPE_CHOICES = [
        'Patient', 'Examination', 'Registration', 'Staff', 
        'API', 'AuditDashboard', 'Media', 'Study'
    ]
    
    start_date = serializers.DateField(
        required=False,
        help_text="Start date for export (YYYY-MM-DD)"
    )
    end_date = serializers.DateField(
        required=False,
        help_text="End date for export (YYYY-MM-DD)"
    )
    user_id = serializers.IntegerField(
        required=False,
        help_text="Filter by specific user ID"
    )
    action = serializers.ChoiceField(
        choices=ACTION_CHOICES,
        required=False,
        help_text="Filter by specific action type"
    )
    resource_type = serializers.ChoiceField(
        choices=RESOURCE_TYPE_CHOICES,
        required=False,
        help_text="Filter by resource type"
    )
    success = serializers.BooleanField(
        required=False,
        help_text="Filter by success status"
    )
    limit = serializers.IntegerField(
        default=1000,
        min_value=1,
        max_value=10000,
        help_text="Maximum number of records to export (1-10000)"
    )
    
    def validate(self, data):
        """Validate date range"""
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                "Start date must be before or equal to end date"
            )
        
        return data