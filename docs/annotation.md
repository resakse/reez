# Persistent DICOM Annotation Implementation Plan

## Overview

This document provides a comprehensive, phase-by-phase implementation plan for persistent DICOM annotations and measurements in the RIS frontend. The system will support auto-save functionality, user-specific ownership, and a tabbed interface for annotation management.

## Requirements Summary

1. **User Ownership**: Users can only delete their own annotations/measurements
2. **Right Panel Interface**: Display annotation list with user full names and delete buttons (X) - only visible for user's own annotations
3. **Auto-save**: Annotations automatically save when created/modified
4. **Tabbed Interface**: Right panel should have tabs for:
   - Patient/Studies Information
   - Report
   - Annotation

## Technical Architecture

### Database Schema (Django Backend)

```python
# annotations/models.py
from django.db import models
from django.conf import settings
from exam.models import PacsExam
from audit.models import AuditLog

class DicomAnnotation(models.Model):
    ANNOTATION_TYPES = [
        ('measurement', 'Measurement'),
        ('annotation', 'Annotation'),
        ('arrow', 'Arrow'),
        ('rectangle', 'Rectangle'),
        ('ellipse', 'Ellipse'),
        ('freehand', 'Freehand'),
    ]
    
    # Core fields
    id = models.BigAutoField(primary_key=True)
    pacs_exam = models.ForeignKey(PacsExam, on_delete=models.CASCADE, related_name='annotations')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    
    # DICOM/Image identification
    study_instance_uid = models.CharField(max_length=255)
    series_instance_uid = models.CharField(max_length=255)
    sop_instance_uid = models.CharField(max_length=255)
    image_id = models.TextField()  # Cornerstone image ID
    frame_number = models.IntegerField(default=1)
    
    # Annotation data
    annotation_type = models.CharField(max_length=20, choices=ANNOTATION_TYPES)
    annotation_data = models.JSONField()  # Cornerstone annotation data
    
    # Metadata
    label = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    
    # Measurement specific fields
    measurement_value = models.FloatField(null=True, blank=True)
    measurement_unit = models.CharField(max_length=20, blank=True)
    
    class Meta:
        db_table = 'dicom_annotations'
        indexes = [
            models.Index(fields=['study_instance_uid']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['pacs_exam']),
        ]
        ordering = ['-created_at']

    def can_delete(self, user):
        """Check if user can delete this annotation"""
        return self.user == user

    def save(self, *args, **kwargs):
        """Override save to log audit trail"""
        is_create = self.pk is None
        old_data = None
        
        if not is_create:
            # Get old data for audit
            old_instance = DicomAnnotation.objects.get(pk=self.pk)
            old_data = {
                'annotation_type': old_instance.annotation_type,
                'label': old_instance.label,
                'description': old_instance.description,
                'measurement_value': old_instance.measurement_value
            }
        
        super().save(*args, **kwargs)
        
        # Log audit trail using existing system
        action = 'CREATE' if is_create else 'UPDATE'
        new_data = {
            'annotation_type': self.annotation_type,
            'label': self.label,
            'description': self.description,
            'measurement_value': self.measurement_value
        }
        
        AuditLog.log_action(
            user=self.user,
            action=action,
            resource_type='DicomAnnotation',
            resource_id=str(self.pk),
            resource_name=f"{self.annotation_type} - {self.label or 'Unlabeled'}",
            old_data=old_data,
            new_data=new_data,
            success=True
        )

    def delete(self, *args, **kwargs):
        """Override delete to log audit trail"""
        # Log deletion before actually deleting
        AuditLog.log_action(
            user=self.user,
            action='DELETE',
            resource_type='DicomAnnotation',
            resource_id=str(self.pk),
            resource_name=f"{self.annotation_type} - {self.label or 'Unlabeled'}",
            old_data={
                'annotation_type': self.annotation_type,
                'label': self.label,
                'description': self.description,
                'measurement_value': self.measurement_value
            },
            success=True
        )
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.annotation_type} by {self.user.get_full_name()} - {self.created_at}"
```

### API Layer (Django REST Framework)

```python
# annotations/serializers.py
from rest_framework import serializers
from .models import DicomAnnotation

class DicomAnnotationSerializer(serializers.ModelSerializer):
    user_full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    can_delete = serializers.SerializerMethodField()
    
    class Meta:
        model = DicomAnnotation
        fields = [
            'id', 'study_instance_uid', 'series_instance_uid', 
            'sop_instance_uid', 'image_id', 'frame_number',
            'annotation_type', 'annotation_data', 'label', 'description',
            'measurement_value', 'measurement_unit', 'created_at', 'modified_at',
            'user_full_name', 'can_delete'
        ]
        read_only_fields = ['created_at', 'modified_at', 'user_full_name', 'can_delete']
    
    def get_can_delete(self, obj):
        request = self.context.get('request')
        return obj.can_delete(request.user) if request and request.user else False

# annotations/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Q
from .models import DicomAnnotation
from .serializers import DicomAnnotationSerializer

class DicomAnnotationViewSet(viewsets.ModelViewSet):
    serializer_class = DicomAnnotationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter annotations by study or image"""
        queryset = DicomAnnotation.objects.select_related('user')
        
        # Filter by study
        study_uid = self.request.query_params.get('study_uid')
        if study_uid:
            queryset = queryset.filter(study_instance_uid=study_uid)
        
        # Filter by image
        image_id = self.request.query_params.get('image_id')
        if image_id:
            queryset = queryset.filter(image_id=image_id)
            
        return queryset
    
    def perform_create(self, serializer):
        """Auto-assign current user to annotation"""
        serializer.save(user=self.request.user)
    
    def destroy(self, request, *args, **kwargs):
        """Only allow users to delete their own annotations"""
        annotation = self.get_object()
        if not annotation.can_delete(request.user):
            return Response(
                {'error': 'You can only delete your own annotations'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def by_study(self, request):
        """Get all annotations for a study"""
        study_uid = request.query_params.get('study_uid')
        if not study_uid:
            return Response({'error': 'study_uid parameter required'}, status=400)
        
        annotations = self.get_queryset().filter(study_instance_uid=study_uid)
        serializer = self.get_serializer(annotations, many=True)
        return Response(serializer.data)
```

### Frontend Components (React/TypeScript)

```typescript
// types/annotations.ts
export interface DicomAnnotation {
  id: number;
  study_instance_uid: string;
  series_instance_uid: string;
  sop_instance_uid: string;
  image_id: string;
  frame_number: number;
  annotation_type: 'measurement' | 'annotation' | 'arrow' | 'rectangle' | 'ellipse' | 'freehand';
  annotation_data: any; // Cornerstone annotation data
  label: string;
  description: string;
  measurement_value?: number;
  measurement_unit?: string;
  created_at: string;
  modified_at: string;
  user_full_name: string;
  can_delete: boolean;
}

// hooks/useAnnotations.ts
import { useState, useEffect, useCallback } from 'react';
import { DicomAnnotation } from '@/types/annotations';
import AuthService from '@/lib/auth';

export const useAnnotations = (studyUid: string) => {
  const [annotations, setAnnotations] = useState<DicomAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnnotations = useCallback(async () => {
    if (!studyUid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await AuthService.authenticatedFetch(
        `/api/annotations/by_study/?study_uid=${studyUid}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch annotations');
      }
      
      const data = await response.json();
      setAnnotations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [studyUid]);

  const saveAnnotation = useCallback(async (annotationData: Partial<DicomAnnotation>) => {
    try {
      const response = await AuthService.authenticatedFetch('/api/annotations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotationData)
      });

      if (!response.ok) {
        throw new Error('Failed to save annotation');
      }

      const savedAnnotation = await response.json();
      setAnnotations(prev => [savedAnnotation, ...prev]);
      return savedAnnotation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save annotation');
      throw err;
    }
  }, []);

  const deleteAnnotation = useCallback(async (annotationId: number) => {
    try {
      const response = await AuthService.authenticatedFetch(`/api/annotations/${annotationId}/`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete annotation');
      }

      setAnnotations(prev => prev.filter(a => a.id !== annotationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete annotation');
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  return {
    annotations,
    loading,
    error,
    refetch: fetchAnnotations,
    saveAnnotation,
    deleteAnnotation
  };
};

// components/AnnotationPanel.tsx
import React from 'react';
import { Trash2, User, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DicomAnnotation } from '@/types/annotations';
import { useAnnotations } from '@/hooks/useAnnotations';

interface AnnotationPanelProps {
  studyUid: string;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({ studyUid }) => {
  const { annotations, loading, error, deleteAnnotation } = useAnnotations(studyUid);

  const handleDelete = async (annotationId: number) => {
    if (confirm('Are you sure you want to delete this annotation?')) {
      try {
        await deleteAnnotation(annotationId);
      } catch (err) {
        console.error('Failed to delete annotation:', err);
      }
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Loading annotations...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-600">Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Annotations ({annotations.length})</h3>
      </div>
      
      {annotations.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No annotations found for this study
        </div>
      ) : (
        <div className="space-y-3">
          {annotations.map((annotation) => (
            <Card key={annotation.id} className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{annotation.user_full_name}</span>
                      <Calendar className="w-4 h-4 ml-2" />
                      <span>{new Date(annotation.created_at).toLocaleString()}</span>
                    </div>
                    
                    <div>
                      <div className="font-medium capitalize">
                        {annotation.annotation_type}
                        {annotation.label && ` - ${annotation.label}`}
                      </div>
                      
                      {annotation.measurement_value && (
                        <div className="text-sm text-muted-foreground">
                          {annotation.measurement_value} {annotation.measurement_unit}
                        </div>
                      )}
                      
                      {annotation.description && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {annotation.description}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {annotation.can_delete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(annotation.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// components/RightPanelTabs.tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnnotationPanel } from './AnnotationPanel';
import { PatientInfoPanel } from './PatientInfoPanel';
import { ReportPanel } from './ReportPanel';

interface RightPanelTabsProps {
  studyUid: string;
  patientData: any;
  studyData: any;
}

export const RightPanelTabs: React.FC<RightPanelTabsProps> = ({
  studyUid,
  patientData,
  studyData
}) => {
  return (
    <Tabs defaultValue="patient" className="h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="patient">Patient/Studies</TabsTrigger>
        <TabsTrigger value="report">Report</TabsTrigger>
        <TabsTrigger value="annotations">Annotations</TabsTrigger>
      </TabsList>
      
      <TabsContent value="patient" className="flex-1 overflow-auto">
        <PatientInfoPanel patientData={patientData} studyData={studyData} />
      </TabsContent>
      
      <TabsContent value="report" className="flex-1 overflow-auto">
        <ReportPanel studyUid={studyUid} />
      </TabsContent>
      
      <TabsContent value="annotations" className="flex-1 overflow-auto">
        <AnnotationPanel studyUid={studyUid} />
      </TabsContent>
    </Tabs>
  );
};
```

### Auto-save Integration

```typescript
// hooks/useAnnotationAutoSave.ts
import { useCallback, useRef } from 'react';
import { useAnnotations } from './useAnnotations';
import { toast } from '@/lib/toast';

export const useAnnotationAutoSave = (studyUid: string) => {
  const { saveAnnotation } = useAnnotations(studyUid);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const debouncedSave = useCallback(async (annotationData: any) => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveAnnotation(annotationData);
        toast.success('Annotation saved automatically');
      } catch (error) {
        toast.error('Failed to auto-save annotation');
        console.error('Auto-save error:', error);
      }
    }, 1000); // 1 second delay
  }, [saveAnnotation]);

  return { debouncedSave };
};

// Integration in ProjectionDicomViewer.tsx
const { debouncedSave } = useAnnotationAutoSave(studyUid);

// Cornerstone event handler
const handleAnnotationModified = useCallback((evt: any) => {
  const { annotation, changeType } = evt.detail;
  
  if (changeType === 'completed' || changeType === 'modified') {
    const annotationData = {
      study_instance_uid: studyUid,
      series_instance_uid: annotation.metadata.seriesInstanceUID,
      sop_instance_uid: annotation.metadata.sopInstanceUID,
      image_id: annotation.imageId,
      annotation_type: annotation.metadata.toolName,
      annotation_data: annotation.data,
      label: annotation.data.text?.textBox?.text || '',
      measurement_value: annotation.data.cachedStats?.length || annotation.data.cachedStats?.area,
      measurement_unit: annotation.data.cachedStats?.lengthUnits || annotation.data.cachedStats?.areaUnits
    };
    
    debouncedSave(annotationData);
  }
}, [debouncedSave, studyUid]);
```

## Implementation Phases

### Phase 1: Backend Foundation (Week 1)
**Estimated Time: 3-4 days**

1. **Create Django App**
   ```bash
   python manage.py startapp annotations
   ```

2. **Database Setup**
   - Create `DicomAnnotation` model in `annotations/models.py` with integrated audit logging
   - Add to `INSTALLED_APPS` in settings.py
   - Create and run migrations
   - Add URL routing to main `urls.py`

3. **API Endpoints**
   - Implement `DicomAnnotationViewSet` with full CRUD operations
   - Add permissions and user ownership validation
   - Create serializers with proper field exposure
   - **Integrate with existing audit system** - automatic logging of all annotation operations
   - Test endpoints with Django REST Framework browsable API

4. **Backend Testing**
   - Unit tests for model methods including audit logging
   - API endpoint tests
   - Permission tests for user ownership
   - **Audit logging verification** - ensure all CRUD operations are logged to existing `AuditLog`

### Phase 2: Frontend Data Layer (Week 1-2)
**Estimated Time: 2-3 days**

1. **TypeScript Interfaces**
   - Define `DicomAnnotation` interface
   - Create API response types
   - Add error handling types

2. **Custom Hooks**
   - Implement `useAnnotations` hook with CRUD operations
   - Add `useAnnotationAutoSave` hook with debouncing
   - Error handling and loading states

3. **API Integration**
   - Update `AuthService` to handle annotation endpoints
   - Add proper error handling for 403/404 responses
   - Test authentication flow

### Phase 3: UI Components (Week 2)
**Estimated Time: 4-5 days**

1. **Annotation Panel Component**
   - List view with user names and timestamps
   - Delete buttons with proper permissions
   - Empty state handling
   - Loading and error states

2. **Tabbed Interface**
   - Implement three-tab layout (Patient/Studies, Report, Annotations)
   - Proper tab switching and state management
   - Responsive design considerations

3. **UI Polish**
   - Consistent styling with existing design system
   - Proper spacing and typography
   - Dark/light theme compatibility

### Phase 4: Auto-save Integration (Week 2-3)
**Estimated Time: 3-4 days**

1. **Cornerstone3D Event Handling**
   - Hook into annotation creation/modification events
   - Extract annotation data in correct format
   - Handle different annotation types (measurements, shapes, etc.)

2. **Debounced Save Implementation**
   - Implement 1-second debounce for auto-save
   - Handle network errors gracefully
   - Show appropriate user feedback (toast notifications)

3. **Data Mapping**
   - Map Cornerstone3D annotation data to backend schema
   - Handle measurement values and units extraction
   - Ensure data consistency between frontend and backend

### Phase 5: Integration & Testing (Week 3)
**Estimated Time: 2-3 days**

1. **Component Integration**
   - Integrate annotation panel into existing right sidebar
   - Update `page.tsx` to use new tabbed interface
   - Ensure proper data flow between components

2. **End-to-End Testing**
   - Test complete annotation workflow
   - Verify user ownership and permissions
   - Test auto-save functionality under various conditions

3. **Performance Optimization**
   - Optimize annotation loading for large datasets
   - Implement proper caching strategies
   - Memory leak prevention in Cornerstone3D integration

### Phase 6: Polish & Deployment (Week 3-4)
**Estimated Time: 2 days**

1. **Bug Fixes & Edge Cases**
   - Handle network disconnection scenarios
   - Improve error messages and user feedback
   - Fix any remaining UI/UX issues

2. **Documentation**
   - Update API documentation
   - Add inline code comments
   - User guide for annotation features

3. **Production Readiness**
   - Database migration for production
   - Environment variable configuration
   - Performance monitoring setup

## Security Considerations

### Data Protection
- All annotations are tied to authenticated users
- **HIPAA compliance through existing audit system** - leverages the simple but effective `AuditLog` model
- Automatic audit logging for all CREATE/UPDATE/DELETE operations on annotations
- Integration with existing `audit.models.AuditLog` for comprehensive tracking

### Access Control
- Users can only delete their own annotations (enforced at model level)
- Role-based permissions for viewing annotations
- API rate limiting to prevent abuse
- Integration with existing authentication middleware

### Data Integrity
- Database constraints to ensure data consistency
- **Comprehensive audit trail** for all annotation operations through `AuditLog.log_action()`
- Automatic logging of old/new data states for change tracking
- Proper validation of annotation data at serializer level

## Performance Considerations

### Database Optimization
- Proper indexing on frequently queried fields (study_uid, user, created_at)
- Query optimization using select_related for user data
- Pagination for large annotation datasets

### Frontend Performance
- Lazy loading of annotation data
- Debounced auto-save to reduce API calls
- Memory management for Cornerstone3D integration
- Virtual scrolling for large annotation lists

### Caching Strategy
- API response caching for static annotation data
- Browser-side caching of user preferences
- Redis caching for frequently accessed data

## Monitoring & Maintenance

### Logging
- Comprehensive audit logging for all annotation operations
- Error tracking for auto-save failures
- Performance monitoring for slow queries

### Metrics
- Track annotation creation/deletion rates
- Monitor auto-save success rates
- User engagement with annotation features

### Maintenance Tasks
- Regular cleanup of orphaned annotations
- Database performance optimization
- Security updates for dependencies

## Migration Strategy

### Data Migration
- No existing annotation data to migrate
- Fresh implementation with clean database schema
- Future migration path for DICOM SR/GSPS import

### Deployment Strategy
- Feature flag for gradual rollout
- Database migrations in maintenance window
- Rollback plan in case of issues

## Future Enhancements

### Advanced Features
- DICOM Structured Report (SR) export
- Annotation templates and presets
- Collaborative annotation workflows
- AI-powered annotation suggestions

### Integration Opportunities
- Integration with reporting systems
- Export to third-party PACS systems
- Mobile annotation support
- Voice-to-text annotation entry

## Risk Assessment

### Technical Risks
- **High**: Cornerstone3D integration complexity
- **Medium**: Auto-save performance impact
- **Low**: Database schema changes

### Mitigation Strategies
- Thorough testing of Cornerstone3D event handling
- Performance monitoring and optimization
- Database migration testing in development environment

### Contingency Plans
- Manual save option as fallback for auto-save
- Basic annotation list without advanced features
- Graceful degradation for older browsers

## Success Metrics

### Functional Requirements
- ✅ Users can create and auto-save annotations
- ✅ Users can only delete their own annotations
- ✅ Right panel shows annotations with user names
- ✅ Tabbed interface with Patient/Studies, Report, and Annotation tabs

### Performance Requirements
- Auto-save response time < 2 seconds
- Annotation list loading time < 1 second
- No memory leaks in long-running sessions
- Support for 100+ annotations per study

### User Experience Requirements
- Intuitive annotation management interface
- Clear visual feedback for all operations
- Responsive design across devices
- Consistent with existing application design

This comprehensive implementation plan provides a structured approach to delivering persistent DICOM annotation functionality that meets all specified requirements while maintaining high code quality and performance standards.