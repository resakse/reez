# Small-Scale Audit Trails Implementation Plan

## Overview
This document outlines a **simplified, cost-effective audit trail system** for small radiology institutions with 20-30 doctors and 1-2 radiographer workstations. The focus is on essential compliance, minimal resource usage, and easy maintenance.

## Project Scope
- **Users**: 20-30 doctors + 1-2 radiographers
- **Equipment**: Single modality (X-Ray, CT, or MRI)
- **Infrastructure**: Basic on-premise setup with minimal IT support
- **Budget**: Cost-conscious implementation with open-source technologies

## Requirements
1. **Basic Dashboard**: Simple statistics and searchable audit logs
2. **Lightweight**: Minimal server resources and maintenance
3. **Essential Security**: Superuser-only access with basic protection
4. **Simple Compliance**: Basic HIPAA compliance for small practices

## Technology Stack Decisions

### 🎯 **Simplified Architecture: Database-Only Approach**
**Selected**: Single PostgreSQL database with basic logging
- **Pros**: Simple, reliable, familiar to most developers
- **Cons**: Limited scalability (sufficient for small scale)
- **Why Chosen**: Perfect for 20-30 users, minimal maintenance

### 💾 **Database: PostgreSQL Only**
**Selected**: Single PostgreSQL instance
- **Pros**: ACID compliance, reliable, well-documented
- **Cons**: Single point of failure (acceptable for small scale)
- **Why Chosen**: Proven reliability, existing infrastructure

### 🔄 **Processing: Synchronous Only**
**Selected**: Direct database writes during requests
- **Pros**: Simple implementation, immediate consistency
- **Cons**: Slight performance overhead (negligible for small scale)
- **Why Chosen**: Simplicity over complexity for small teams

### ☁️ **Deployment: Single Server**
**Selected**: All-in-one server deployment
- **Pros**: Simple setup, low cost, easy backup
- **Cons**: No redundancy (acceptable risk for small practices)
- **Why Chosen**: Cost-effective and appropriate for scale

## Implementation Phases

### Phase 1: Basic Foundation (Week 1)
**Goal**: Set up simple audit logging with minimal features

#### 1.1 Simple Database Schema
```sql
-- Single audit table (no complex relationships)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES staff_staff(id) ON DELETE SET NULL,
    username VARCHAR(150) NOT NULL,
    action VARCHAR(50) NOT NULL,  -- LOGIN, LOGOUT, CREATE, UPDATE, DELETE, VIEW
    resource_type VARCHAR(50),    -- Patient, Examination, User
    resource_id VARCHAR(50),
    resource_name VARCHAR(200),   -- Masked patient name
    old_data JSONB,              -- Simple before state
    new_data JSONB,              -- Simple after state
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    
    -- Basic indexes for small-scale performance
    INDEX (user_id, timestamp),
    INDEX (timestamp),
    INDEX (action),
    INDEX (resource_type)
);

-- Automatic cleanup (keep 2 years for compliance)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs 
    WHERE timestamp < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Monthly cleanup job
SELECT cron.schedule('cleanup-audit-logs', '0 2 1 * *', 'SELECT cleanup_old_audit_logs();');
```

#### 1.2 Simple Django Models
```python
# audit/models.py
class AuditLog(models.Model):
    """Simple audit log model for small institutions"""
    
    ACTION_CHOICES = [
        ('LOGIN', 'Login'),
        ('LOGOUT', 'Logout'), 
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
        ('DELETE', 'Delete'),
        ('VIEW', 'View'),
        ('EXPORT', 'Export'),
    ]
    
    user = models.ForeignKey('staff.Staff', on_delete=models.SET_NULL, null=True)
    username = models.CharField(max_length=150)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES, db_index=True)
    resource_type = models.CharField(max_length=50, blank=True, db_index=True)
    resource_id = models.CharField(max_length=50, blank=True)
    resource_name = models.CharField(max_length=200, blank=True)  # Masked
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    success = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
        ]
    
    @classmethod
    def log_action(cls, user, action, resource_type=None, resource_id=None, 
                   resource_name=None, old_data=None, new_data=None, 
                   ip_address=None, success=True):
        """Simple logging method"""
        # Mask sensitive data
        if resource_name and resource_type == 'Patient':
            resource_name = cls.mask_patient_name(resource_name)
        
        if old_data:
            old_data = cls.mask_sensitive_data(old_data)
        if new_data:
            new_data = cls.mask_sensitive_data(new_data)
        
        return cls.objects.create(
            user=user,
            username=user.username if user else 'Anonymous',
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            resource_name=resource_name,
            old_data=old_data,
            new_data=new_data,
            ip_address=ip_address,
            success=success
        )
    
    @staticmethod
    def mask_patient_name(name):
        """Simple name masking: John Doe -> J*** D***"""
        if not name:
            return name
        parts = name.split()
        return ' '.join([f"{part[0]}{'*' * (len(part)-1)}" if len(part) > 1 else part for part in parts])
    
    @staticmethod
    def mask_sensitive_data(data):
        """Simple data masking for JSON fields"""
        if not isinstance(data, dict):
            return data
        
        sensitive_fields = ['ic', 'nric', 'phone', 'email', 'address']
        masked_data = data.copy()
        
        for field in sensitive_fields:
            if field in masked_data:
                value = str(masked_data[field])
                if len(value) > 4:
                    masked_data[field] = f"{value[:2]}{'*' * (len(value)-4)}{value[-2:]}"
        
        return masked_data
```

#### 1.3 Simple Middleware
```python
# audit/middleware.py
class SimpleAuditMiddleware:
    """Lightweight audit middleware for small institutions"""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Store request info for later use
        request.audit_ip = self.get_client_ip(request)
        
        response = self.get_response(request)
        
        # Log API access for sensitive endpoints
        if self.should_log_request(request):
            self.log_api_access(request, response)
        
        return response
    
    def get_client_ip(self, request):
        """Get real client IP"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0]
        return request.META.get('REMOTE_ADDR')
    
    def should_log_request(self, request):
        """Only log important API endpoints"""
        logged_paths = ['/api/patients/', '/api/examinations/', '/api/staff/']
        return any(request.path.startswith(path) for path in logged_paths)
    
    def log_api_access(self, request, response):
        """Log API access"""
        if hasattr(request, 'user') and request.user.is_authenticated:
            from .models import AuditLog
            
            action = 'VIEW' if request.method == 'GET' else request.method
            success = 200 <= response.status_code < 400
            
            AuditLog.log_action(
                user=request.user,
                action=f'API_{action}',
                resource_type='API',
                resource_id=request.path,
                ip_address=request.audit_ip,
                success=success
            )
```

**Phase 1 Deliverables:**
- [ ] Simple audit model with basic masking
- [ ] Lightweight middleware for API tracking
- [ ] Database migration scripts
- [ ] Basic unit tests

### Phase 2: Essential Tracking (Week 2)
**Goal**: Track the most important user activities

#### 2.1 Model Signal Handlers
```python
# audit/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed

from pesakit.models import Pesakit
from exam.models import Pemeriksaan, Daftar
from .models import AuditLog

# Get current user from thread local storage
import threading
_thread_locals = threading.local()

def get_current_user():
    return getattr(_thread_locals, 'user', None)

def set_current_user(user):
    _thread_locals.user = user

# Authentication tracking
@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    AuditLog.log_action(
        user=user,
        action='LOGIN',
        ip_address=getattr(request, 'audit_ip', None)
    )

@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    if user:
        AuditLog.log_action(
            user=user,
            action='LOGOUT',
            ip_address=getattr(request, 'audit_ip', None)
        )

@receiver(user_login_failed)
def log_failed_login(sender, credentials, request, **kwargs):
    AuditLog.log_action(
        user=None,
        action='LOGIN_FAILED',
        resource_name=credentials.get('username', 'Unknown'),
        ip_address=getattr(request, 'audit_ip', None),
        success=False
    )

# Patient tracking (most important for HIPAA)
@receiver(post_save, sender=Pesakit)
def log_patient_change(sender, instance, created, **kwargs):
    user = get_current_user()
    if not user:
        return
    
    action = 'CREATE' if created else 'UPDATE'
    AuditLog.log_action(
        user=user,
        action=action,
        resource_type='Patient',
        resource_id=instance.id,
        resource_name=instance.nama,
        new_data={'mrn': instance.mrn, 'ic': instance.ic}
    )

# Examination tracking
@receiver(post_save, sender=Pemeriksaan)
def log_examination_change(sender, instance, created, **kwargs):
    user = get_current_user()
    if not user:
        return
    
    action = 'CREATE' if created else 'UPDATE'
    AuditLog.log_action(
        user=user,
        action=action,
        resource_type='Examination',
        resource_id=instance.id,
        resource_name=f"Exam {instance.id}",
        new_data={'exam_type': str(instance.exam), 'modality': str(instance.modaliti)}
    )

# Registration tracking
@receiver(post_save, sender=Daftar)
def log_registration_change(sender, instance, created, **kwargs):
    user = get_current_user()
    if not user:
        return
    
    if created:
        AuditLog.log_action(
            user=user,
            action='CREATE',
            resource_type='Registration',
            resource_id=instance.id,
            resource_name=f"Registration for {instance.pesakit.nama if instance.pesakit else 'Unknown'}",
            new_data={'patient_mrn': instance.pesakit.mrn if instance.pesakit else None}
        )
```

#### 2.2 ViewSet Integration
```python
# audit/mixins.py
class SimpleAuditMixin:
    """Simple audit mixin for ViewSets"""
    
    def perform_create(self, serializer):
        from .signals import set_current_user
        set_current_user(self.request.user)
        super().perform_create(serializer)
    
    def perform_update(self, serializer):
        from .signals import set_current_user
        set_current_user(self.request.user)
        super().perform_update(serializer)
    
    def perform_destroy(self, instance):
        from .models import AuditLog
        
        # Log deletion before it happens
        AuditLog.log_action(
            user=self.request.user,
            action='DELETE',
            resource_type=instance.__class__.__name__,
            resource_id=instance.id,
            resource_name=str(instance),
            old_data=self.get_object_data(instance)
        )
        
        super().perform_destroy(instance)
    
    def get_object_data(self, instance):
        """Extract important fields from model instance"""
        important_fields = ['id', 'name', 'nama', 'mrn', 'ic']
        data = {}
        
        for field in important_fields:
            if hasattr(instance, field):
                data[field] = str(getattr(instance, field))
        
        return data
```

**Phase 2 Deliverables:**
- [ ] Signal handlers for critical model changes
- [ ] Authentication event tracking
- [ ] Simple ViewSet audit integration
- [ ] Thread-local user context management

### Phase 3: Basic Dashboard (Week 3)
**Goal**: Create a simple, functional audit dashboard

#### 3.1 Simple API Endpoints
```python
# audit/views.py
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from django.utils import timezone
from datetime import timedelta
from .models import AuditLog
from .serializers import AuditLogSerializer

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Simple audit log API for small institutions"""
    
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Only superusers can access audit logs
        if not self.request.user.is_superuser:
            return AuditLog.objects.none()
        
        queryset = AuditLog.objects.select_related('user')
        
        # Simple filtering
        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        action = self.request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)
        
        resource_type = self.request.query_params.get('resource_type')
        if resource_type:
            queryset = queryset.filter(resource_type=resource_type)
        
        # Date range filtering
        days = self.request.query_params.get('days', '30')
        try:
            days = int(days)
            since = timezone.now() - timedelta(days=days)
            queryset = queryset.filter(timestamp__gte=since)
        except ValueError:
            pass
        
        return queryset.order_by('-timestamp')
    
    @action(detail=False, methods=['get'])
    def simple_stats(self, request):
        """Basic dashboard statistics"""
        if not request.user.is_superuser:
            return Response({'error': 'Unauthorized'}, status=403)
        
        # Last 30 days stats
        since = timezone.now() - timedelta(days=30)
        recent_logs = AuditLog.objects.filter(timestamp__gte=since)
        
        stats = {
            'total_events': recent_logs.count(),
            'unique_users': recent_logs.values('user').distinct().count(),
            'failed_logins': recent_logs.filter(action='LOGIN_FAILED').count(),
            'patient_accesses': recent_logs.filter(resource_type='Patient').count(),
            'examination_activities': recent_logs.filter(resource_type='Examination').count(),
            
            # Top activities
            'top_actions': list(
                recent_logs.values('action')
                .annotate(count=Count('action'))
                .order_by('-count')[:5]
            ),
            
            # Most active users
            'top_users': list(
                recent_logs.values('username')
                .annotate(count=Count('username'))
                .order_by('-count')[:5]
            ),
            
            # Daily activity (last 7 days)
            'daily_activity': self.get_daily_activity(recent_logs)
        }
        
        return Response(stats)
    
    def get_daily_activity(self, queryset):
        """Get daily activity counts for last 7 days"""
        daily_stats = []
        for i in range(7):
            date = timezone.now().date() - timedelta(days=i)
            count = queryset.filter(timestamp__date=date).count()
            daily_stats.append({
                'date': date.isoformat(),
                'count': count
            })
        return list(reversed(daily_stats))

# audit/serializers.py
from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'username', 'action', 'resource_type', 
            'resource_id', 'resource_name', 'timestamp', 
            'success', 'ip_address'
        ]
        # Don't expose sensitive data fields
```

#### 3.2 Simple Frontend Dashboard
```typescript
// Frontend: Simple audit dashboard components
// ris-frontend/src/app/audit-dashboard/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AuditStats {
  total_events: number;
  unique_users: number;
  failed_logins: number;
  patient_accesses: number;
  examination_activities: number;
  top_actions: Array<{action: string, count: number}>;
  top_users: Array<{username: string, count: number}>;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_name: string;
  timestamp: string;
  success: boolean;
  ip_address: string;
}

export default function SimpleAuditDashboard() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    resource_type: '',
    days: '30'
  });

  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load statistics
      const statsResponse = await fetch('/api/audit/logs/simple_stats/');
      const statsData = await statsResponse.json();
      setStats(statsData);
      
      // Load recent logs with filters
      const params = new URLSearchParams();
      if (filters.action) params.append('action', filters.action);
      if (filters.resource_type) params.append('resource_type', filters.resource_type);
      params.append('days', filters.days);
      
      const logsResponse = await fetch(`/api/audit/logs/?${params}`);
      const logsData = await logsResponse.json();
      setLogs(logsData.results || []);
      
    } catch (error) {
      console.error('Failed to load audit data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading audit dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold">Audit Dashboard</h1>
      
      {/* Simple Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_events || 0}</div>
            <p className="text-xs text-muted-foreground">Last {filters.days} days</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.unique_users || 0}</div>
            <p className="text-xs text-muted-foreground">Unique users</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Patient Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.patient_accesses || 0}</div>
            <p className="text-xs text-muted-foreground">Patient records accessed</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failed_logins || 0}</div>
            <p className="text-xs text-muted-foreground">Security alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Simple Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Select value={filters.action} onValueChange={(value) => setFilters({...filters, action: value})}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="VIEW">View</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filters.resource_type} onValueChange={(value) => setFilters({...filters, resource_type: value})}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Resources</SelectItem>
                <SelectItem value="Patient">Patients</SelectItem>
                <SelectItem value="Examination">Examinations</SelectItem>
                <SelectItem value="Registration">Registrations</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filters.days} onValueChange={(value) => setFilters({...filters, days: value})}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={loadDashboardData} variant="outline">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Simple Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.username}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs ${
                      log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                      log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                      log.action === 'LOGIN' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell>
                    {log.resource_type && (
                      <div>
                        <div className="font-medium">{log.resource_type}</div>
                        {log.resource_name && (
                          <div className="text-sm text-muted-foreground">
                            {log.resource_name}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{log.ip_address}</TableCell>
                  <TableCell>
                    <span className={`w-2 h-2 rounded-full inline-block ${
                      log.success ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Phase 3 Deliverables:**
- [ ] Simple REST API with basic filtering
- [ ] Clean dashboard with essential statistics
- [ ] Audit log table with search and filters
- [ ] Export functionality (CSV download)

### Phase 4: Essential Security (Week 4)
**Goal**: Implement basic security measures for small institutions

#### 4.1 Simple Access Control
```python
# audit/permissions.py
from rest_framework.permissions import BasePermission

class SuperuserOnlyPermission(BasePermission):
    """Simple superuser-only permission"""
    
    def has_permission(self, request, view):
        return request.user and request.user.is_superuser
    
    def has_object_permission(self, request, view, obj):
        return request.user and request.user.is_superuser

# audit/views.py - Add to existing ViewSet
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [SuperuserOnlyPermission]
    
    def list(self, request, *args, **kwargs):
        # Log who accessed audit dashboard
        AuditLog.log_action(
            user=request.user,
            action='VIEW',
            resource_type='AuditDashboard',
            ip_address=getattr(request, 'audit_ip', None)
        )
        return super().list(request, *args, **kwargs)
```

#### 4.2 Basic Data Protection
```python
# audit/utils.py
import hashlib
from django.conf import settings

class SimpleDataProtection:
    """Basic data protection for small institutions"""
    
    @staticmethod
    def hash_sensitive_field(value):
        """Create consistent hash for search while protecting data"""
        if not value:
            return None
        return hashlib.sha256(f"{settings.SECRET_KEY}{value}".encode()).hexdigest()[:16]
    
    @staticmethod
    def mask_ic_number(ic):
        """Mask IC: 123456-78-9012 -> 12****-**-***2"""
        if not ic or len(ic) < 8:
            return ic
        return f"{ic[:2]}{'*' * (len(ic)-4)}{ic[-2:]}"
    
    @staticmethod
    def mask_phone_number(phone):
        """Mask phone: 0123456789 -> 012***6789"""
        if not phone or len(phone) < 6:
            return phone
        return f"{phone[:3]}{'*' * (len(phone)-6)}{phone[-3:]}"

# Enhanced model with protection
class AuditLog(models.Model):
    # ... existing fields ...
    
    @classmethod
    def log_action(cls, user, action, **kwargs):
        # Apply basic data protection
        if 'new_data' in kwargs and kwargs['new_data']:
            kwargs['new_data'] = cls.protect_sensitive_data(kwargs['new_data'])
        if 'old_data' in kwargs and kwargs['old_data']:
            kwargs['old_data'] = cls.protect_sensitive_data(kwargs['old_data'])
        
        return super().log_action(user, action, **kwargs)
    
    @staticmethod
    def protect_sensitive_data(data):
        """Apply basic protection to sensitive fields"""
        if not isinstance(data, dict):
            return data
        
        protected = data.copy()
        protection = SimpleDataProtection()
        
        # Apply masking
        if 'ic' in protected:
            protected['ic'] = protection.mask_ic_number(protected['ic'])
        if 'phone' in protected:
            protected['phone'] = protection.mask_phone_number(protected['phone'])
        
        return protected
```

#### 4.3 Simple Backup Strategy
```bash
#!/bin/bash
# scripts/backup_audit_logs.sh
# Simple backup script for small institutions

DB_NAME="ris_database"
BACKUP_DIR="/var/backups/audit"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup audit logs table only
pg_dump -t audit_auditlog $DB_NAME > $BACKUP_DIR/audit_logs_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/audit_logs_$DATE.sql

# Keep only last 30 days of backups
find $BACKUP_DIR -name "audit_logs_*.sql.gz" -mtime +30 -delete

echo "Audit logs backup completed: audit_logs_$DATE.sql.gz"
```

```python
# audit/management/commands/backup_audit.py
from django.core.management.base import BaseCommand
from django.core.management import call_command
import os
from datetime import datetime

class Command(BaseCommand):
    help = 'Simple audit logs backup for small institutions'
    
    def handle(self, *args, **options):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = '/var/backups/audit'
        
        # Ensure backup directory exists
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create backup file path
        backup_file = os.path.join(backup_dir, f'audit_logs_{timestamp}.json')
        
        # Export audit logs to JSON
        with open(backup_file, 'w') as f:
            call_command('dumpdata', 'audit.auditlog', stdout=f)
        
        self.stdout.write(
            self.style.SUCCESS(f'Audit logs backed up to {backup_file}')
        )
```

**Phase 4 Deliverables:**
- [ ] Superuser-only access control
- [ ] Basic data masking for sensitive fields
- [ ] Simple backup scripts and management commands
- [ ] Basic security audit logging

## Resource Requirements

### **Minimal Server Specifications**
- **CPU**: 2 cores (sufficient for 30 users)
- **RAM**: 4GB (2GB for OS, 2GB for application + database)
- **Storage**: 100GB SSD (with room for 2 years of audit logs)
- **Network**: Standard broadband connection

### **Software Requirements**
- **OS**: Ubuntu 20.04 LTS or CentOS 8
- **Database**: PostgreSQL 12+
- **Web Server**: Nginx
- **Python**: 3.8+
- **Node.js**: 16+ (for frontend build)

### **Estimated Costs**
- **Server Hardware**: $1,000 - $2,000 (one-time)
- **Development Time**: 4 weeks @ $50/hour = $8,000
- **Annual Maintenance**: $2,000 (basic support)
- **Total First Year**: ~$12,000

## Maintenance & Operations

### **Daily Tasks (Automated)**
- Audit log rotation and cleanup
- Basic system health checks
- Backup verification

### **Weekly Tasks (5 minutes)**
- Review failed login attempts
- Check audit log growth
- Verify backup integrity

### **Monthly Tasks (30 minutes)**
- Generate basic compliance report
- Review user activity patterns
- Update system if needed

### **Annual Tasks (2 hours)**
- Full system audit and review
- Update retention policies
- Security assessment

## Compliance Features

### **Basic HIPAA Compliance**
- ✅ User authentication and access logging
- ✅ Patient data access tracking
- ✅ Data modification audit trail
- ✅ Basic data masking for sensitive information
- ✅ 2-year audit log retention
- ✅ Simple export for compliance reporting

### **Missing Advanced Features** (acceptable for small scale)
- ❌ Real-time threat detection
- ❌ Machine learning analytics
- ❌ Advanced behavioral analysis
- ❌ Automated compliance validation
- ❌ Multi-factor authentication integration

## Success Metrics

### **Functional Goals**
- [ ] Track 100% of patient data access
- [ ] < 2 second dashboard load time
- [ ] Zero audit data loss
- [ ] < 1% system overhead

### **Compliance Goals**
- [ ] Pass basic HIPAA audit requirements
- [ ] Generate monthly compliance reports
- [ ] 2-year audit trail retention
- [ ] Secure superuser-only access

### **Operational Goals**
- [ ] < 30 minutes weekly maintenance
- [ ] Automated daily backups
- [ ] Simple troubleshooting procedures
- [ ] Clear documentation for small IT teams

## Conclusion

This **simplified audit trail system** is specifically designed for small radiology institutions with limited IT resources and budget constraints. By focusing on **essential features** rather than enterprise complexity, it provides:

### **Key Benefits**
- ✅ **Cost-Effective**: ~$12K first year vs $50K+ for enterprise solutions
- ✅ **Simple Maintenance**: < 30 minutes weekly vs hours of complex management
- ✅ **Essential Compliance**: Meets basic HIPAA requirements for small practices
- ✅ **Easy Implementation**: 4 weeks vs 6+ months for complex systems
- ✅ **Minimal Resources**: Runs on basic server hardware
- ✅ **Clear Documentation**: Written for small IT teams or external consultants

### **Perfect For**
- Small radiology clinics (20-30 users)
- Single modality operations
- Limited IT staff or budget
- Basic compliance requirements
- Simple, reliable operation

### **Growth Path**
When the institution grows, this system can be enhanced with:
- Additional security features
- Advanced analytics
- Multiple server deployment
- Integration with larger PACS systems

**Total Investment**: 4 weeks development + minimal ongoing maintenance
**Expected Savings**: 80% vs enterprise audit solutions
**Risk**: Low - proven technologies with simple architecture