import csv
from datetime import timedelta
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from .models import AuditLog
from .serializers import (
    AuditLogSerializer, 
    AuditLogDetailSerializer, 
    AuditStatsSerializer,
    AuditExportSerializer
)
from .permissions import AuditAccessLoggingPermission, ReadOnlyAuditPermission
from .security import SecurityMonitor, ThreatDetector


class AuditLogPagination(PageNumberPagination):
    """
    Simple pagination for audit logs
    Optimized for small institutions with limited data
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SuperuserOnlyPermission(permissions.BasePermission):
    """
    Simple superuser-only permission for audit access
    Security requirement: Only superusers can access audit logs
    """
    
    def has_permission(self, request, view):
        return (
            request.user and 
            request.user.is_authenticated and 
            request.user.is_superuser
        )
    
    def has_object_permission(self, request, view, obj):
        return (
            request.user and 
            request.user.is_authenticated and 
            request.user.is_superuser
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Enhanced audit log API for small institutions with security monitoring
    
    Features:
    - Enhanced superuser-only access with logging
    - Basic filtering (user, action, resource_type, date range)
    - Statistics dashboard with threat detection
    - CSV export for compliance
    - Security monitoring and threat detection
    - Optimized for 20-30 users with minimal server resources
    """
    
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [AuditAccessLoggingPermission]  # Enhanced security with logging
    pagination_class = AuditLogPagination
    
    def get_queryset(self):
        """
        Apply filtering and ensure superuser access
        Simple filtering designed for small-scale operations
        """
        # Security check - this should be redundant due to permission class
        if not (self.request.user and self.request.user.is_superuser):
            return AuditLog.objects.none()
        
        queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
        
        # Simple filtering parameters
        user_id = self.request.query_params.get('user_id')
        if user_id:
            try:
                queryset = queryset.filter(user_id=int(user_id))
            except (ValueError, TypeError):
                pass
        
        username = self.request.query_params.get('username')
        if username:
            queryset = queryset.filter(username__icontains=username)
        
        action = self.request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)
        
        resource_type = self.request.query_params.get('resource_type')
        if resource_type:
            queryset = queryset.filter(resource_type=resource_type)
        
        success = self.request.query_params.get('success')
        if success is not None:
            if success.lower() in ['true', '1', 'yes']:
                queryset = queryset.filter(success=True)
            elif success.lower() in ['false', '0', 'no']:
                queryset = queryset.filter(success=False)
        
        # Date range filtering
        days = self.request.query_params.get('days')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if days:
            try:
                days_int = int(days)
                since = timezone.now() - timedelta(days=days_int)
                queryset = queryset.filter(timestamp__gte=since)
            except (ValueError, TypeError):
                # Default to last 30 days if invalid
                since = timezone.now() - timedelta(days=30)
                queryset = queryset.filter(timestamp__gte=since)
        elif start_date or end_date:
            if start_date:
                try:
                    start_dt = timezone.datetime.strptime(start_date, '%Y-%m-%d')
                    start_dt = timezone.make_aware(start_dt)
                    queryset = queryset.filter(timestamp__gte=start_dt)
                except ValueError:
                    pass
            
            if end_date:
                try:
                    end_dt = timezone.datetime.strptime(end_date, '%Y-%m-%d')
                    end_dt = timezone.make_aware(end_dt) + timedelta(days=1)
                    queryset = queryset.filter(timestamp__lt=end_dt)
                except ValueError:
                    pass
        else:
            # Default: last 30 days for performance
            since = timezone.now() - timedelta(days=30)
            queryset = queryset.filter(timestamp__gte=since)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def security_summary(self, request):
        """
        Get security summary with threat detection for small institutions.
        Provides daily security overview with basic threat analysis.
        """
        try:
            # Initialize security monitor
            security_monitor = SecurityMonitor()
            
            # Get daily security check results
            security_report = security_monitor.daily_security_check()
            
            return Response(security_report)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate security summary: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def threat_analysis(self, request):
        """
        Perform basic threat analysis suitable for small institutions.
        Checks for failed login patterns and suspicious activities.
        """
        try:
            threat_detector = ThreatDetector()
            
            # Get parameters
            username = request.query_params.get('username')
            ip_address = request.query_params.get('ip_address')
            user_id = request.query_params.get('user_id')
            
            threat_report = {}
            
            # Check failed login patterns
            if username or ip_address:
                threat_report['failed_login_analysis'] = threat_detector.check_failed_login_patterns(
                    username=username,
                    ip_address=ip_address
                )
            
            # Check unusual activity patterns for specific user
            if user_id:
                threat_report['activity_analysis'] = threat_detector.check_unusual_activity_patterns(
                    user_id=int(user_id)
                )
            
            # If no specific parameters, provide general threat summary
            if not any([username, ip_address, user_id]):
                threat_report['general_analysis'] = threat_detector.get_security_summary()
            
            return Response(threat_report)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to perform threat analysis: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def get_serializer_class(self):
        """Use detailed serializer for individual records"""
        if self.action == 'retrieve':
            return AuditLogDetailSerializer
        return AuditLogSerializer
    
    def list(self, request, *args, **kwargs):
        """Override list to log dashboard access"""
        # Log audit dashboard access
        AuditLog.log_action(
            user=request.user,
            action='VIEW',
            resource_type='AuditDashboard',
            resource_name='Audit Dashboard Access',
            ip_address=self.get_client_ip(request)
        )
        
        return super().list(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Basic dashboard statistics for small institutions
        
        Returns:
        - Total events in date range
        - Unique users count  
        - Failed login attempts
        - Patient access count
        - Examination activities
        - Top actions and users
        - Daily activity for last 7 days
        """
        # Get date range (default: last 30 days)
        days = int(request.query_params.get('days', 30))
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        # Base queryset for statistics
        stats_queryset = AuditLog.objects.filter(
            timestamp__gte=start_date,
            timestamp__lte=end_date
        )
        
        # Basic counts
        total_events = stats_queryset.count()
        unique_users = stats_queryset.values('user').distinct().count()
        failed_logins = stats_queryset.filter(action='LOGIN_FAILED').count()
        patient_accesses = stats_queryset.filter(resource_type='Patient').count()
        examination_activities = stats_queryset.filter(resource_type='Examination').count()
        api_activities = stats_queryset.filter(action__startswith='API_').count()
        
        # Top actions (limit 5 for simplicity)
        top_actions = list(
            stats_queryset.values('action')
            .annotate(count=Count('action'))
            .order_by('-count')[:5]
        )
        
        # Most active users (limit 5)
        top_users = list(
            stats_queryset.values('username')
            .annotate(count=Count('username'))
            .order_by('-count')[:5]
        )
        
        # Daily activity for last 7 days
        daily_activity = []
        for i in range(7):
            date = (end_date - timedelta(days=i)).date()
            count = stats_queryset.filter(timestamp__date=date).count()
            daily_activity.append({
                'date': date.isoformat(),
                'count': count
            })
        daily_activity.reverse()  # Chronological order
        
        stats_data = {
            'total_events': total_events,
            'unique_users': unique_users,
            'failed_logins': failed_logins,
            'patient_accesses': patient_accesses,
            'examination_activities': examination_activities,
            'api_activities': api_activities,
            'top_actions': top_actions,
            'top_users': top_users,
            'daily_activity': daily_activity,
            'date_range_start': start_date,
            'date_range_end': end_date,
            'days_included': days
        }
        
        # Log statistics access
        AuditLog.log_action(
            user=request.user,
            action='VIEW',
            resource_type='AuditStatistics',
            resource_name=f'Statistics for last {days} days',
            ip_address=self.get_client_ip(request)
        )
        
        serializer = AuditStatsSerializer(stats_data)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get', 'post'])
    def export_csv(self, request):
        """
        Export audit logs to CSV for compliance reporting
        
        Supports filtering by:
        - Date range (start_date, end_date)
        - User ID
        - Action type
        - Resource type
        - Success status
        - Limit (max 10,000 records)
        """
        if request.method == 'POST':
            serializer = AuditExportSerializer(data=request.data)
        else:
            serializer = AuditExportSerializer(data=request.query_params)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Build queryset with filters
        queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
        
        # Apply filters from validated data
        validated_data = serializer.validated_data
        
        if validated_data.get('start_date'):
            start_dt = timezone.make_aware(
                timezone.datetime.combine(validated_data['start_date'], timezone.datetime.min.time())
            )
            queryset = queryset.filter(timestamp__gte=start_dt)
        
        if validated_data.get('end_date'):
            end_dt = timezone.make_aware(
                timezone.datetime.combine(validated_data['end_date'], timezone.datetime.max.time())
            )
            queryset = queryset.filter(timestamp__lte=end_dt)
        
        if validated_data.get('user_id'):
            queryset = queryset.filter(user_id=validated_data['user_id'])
        
        if validated_data.get('action'):
            queryset = queryset.filter(action=validated_data['action'])
        
        if validated_data.get('resource_type'):
            queryset = queryset.filter(resource_type=validated_data['resource_type'])
        
        if validated_data.get('success') is not None:
            queryset = queryset.filter(success=validated_data['success'])
        
        # Limit results
        limit = validated_data.get('limit', 1000)
        queryset = queryset[:limit]
        
        # Create CSV response
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_logs_export.csv"'
        
        writer = csv.writer(response)
        
        # CSV headers
        writer.writerow([
            'Timestamp',
            'Username', 
            'Action',
            'Resource Type',
            'Resource ID',
            'Resource Name',
            'Success',
            'IP Address'
        ])
        
        # Write data rows
        for log in queryset:
            writer.writerow([
                log.get_formatted_timestamp(),
                log.username,
                log.get_action_display(),
                log.resource_type,
                log.resource_id,
                log.resource_name,  # Already masked
                'Yes' if log.success else 'No',
                log.ip_address or ''
            ])
        
        # Log export activity
        AuditLog.log_action(
            user=request.user,
            action='EXPORT',
            resource_type='AuditLogs',
            resource_name=f'CSV Export ({queryset.count()} records)',
            ip_address=self.get_client_ip(request)
        )
        
        return response
    
    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        """
        Return available filter options for the dashboard
        Helps populate dropdowns in the frontend
        """
        from staff.models import Staff
        
        # Get unique actions from last 90 days (for relevance)
        recent_logs = AuditLog.objects.filter(
            timestamp__gte=timezone.now() - timedelta(days=90)
        )
        
        actions = list(
            recent_logs.values_list('action', flat=True)
            .distinct()
            .order_by('action')
        )
        
        resource_types = list(
            recent_logs.values_list('resource_type', flat=True)
            .distinct()
            .exclude(resource_type='')
            .order_by('resource_type')
        )
        
        # Active users (who have logged in recently)
        active_users = list(
            Staff.objects.filter(
                auditlog__timestamp__gte=timezone.now() - timedelta(days=30)
            ).distinct().values('id', 'username').order_by('username')
        )
        
        return Response({
            'actions': actions,
            'resource_types': resource_types,
            'active_users': active_users
        })
    
    def get_client_ip(self, request):
        """Get real client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')