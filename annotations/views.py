from rest_framework import viewsets, permissions, status, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.db import IntegrityError
from audit.models import AuditLog
from .models import DicomAnnotation
from .serializers import (
    DicomAnnotationSerializer, 
    DicomAnnotationListSerializer,
    DicomAnnotationCreateSerializer
)


class DicomAnnotationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for DICOM annotations with comprehensive CRUD operations.
    
    Features:
    - User ownership validation
    - Auto-save support
    - Filtering by study and image
    - Comprehensive audit logging
    - Proper permissions
    """
    
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['annotation_type', 'study_instance_uid', 'image_id']
    search_fields = ['label', 'description', 'study_instance_uid']
    ordering_fields = ['created_at', 'modified_at', 'annotation_type']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """
        Filter annotations with optimized queries.
        """
        queryset = DicomAnnotation.objects.select_related('user').all()
        
        # Filter by study
        study_uid = self.request.query_params.get('study_uid')
        if study_uid:
            queryset = queryset.filter(study_instance_uid=study_uid)
        
        # Filter by image
        image_id = self.request.query_params.get('image_id')
        if image_id:
            queryset = queryset.filter(image_id=image_id)
            
        # Filter by frame number
        frame_number = self.request.query_params.get('frame_number')
        if frame_number:
            try:
                frame_num = int(frame_number)
                queryset = queryset.filter(frame_number=frame_num)
            except (ValueError, TypeError):
                pass
            
        return queryset
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return DicomAnnotationListSerializer
        elif self.action == 'create':
            return DicomAnnotationCreateSerializer
        else:
            return DicomAnnotationSerializer
    
    def create(self, request, *args, **kwargs):
        """Create annotation with duplicate UID handling"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            # Try to create the annotation
            annotation = serializer.save(user=request.user)
            
            # Log successful creation (already handled by model save method)
            AuditLog.log_action(
                user=request.user,
                action='API_POST',
                resource_type='DicomAnnotation',
                resource_id=str(annotation.pk),
                resource_name=f"API Create - {annotation.get_display_name()}",
                new_data={'endpoint': '/api/annotations/', 'method': 'POST'},
                ip_address=self.get_client_ip(),
                success=True
            )
            
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
            
        except IntegrityError as e:
            # Handle duplicate Cornerstone UID constraint violation
            if 'unique_cornerstone_annotation_uid' in str(e):
                cornerstone_uid = serializer.validated_data.get('cornerstone_annotation_uid')
                
                if cornerstone_uid:
                    # Try to find the existing annotation with this UID
                    try:
                        existing_annotation = DicomAnnotation.objects.get(
                            cornerstone_annotation_uid=cornerstone_uid
                        )
                        
                        # Log the duplicate attempt
                        AuditLog.log_action(
                            user=request.user,
                            action='API_POST_DUPLICATE',
                            resource_type='DicomAnnotation',
                            resource_id=str(existing_annotation.pk),
                            resource_name=f"Duplicate UID attempt - {existing_annotation.get_display_name()}",
                            new_data={
                                'endpoint': '/api/annotations/', 
                                'method': 'POST',
                                'duplicate_uid': cornerstone_uid,
                                'existing_annotation_id': existing_annotation.id
                            },
                            ip_address=self.get_client_ip(),
                            success=False
                        )
                        
                        # Return the existing annotation data instead of creating a duplicate
                        existing_serializer = self.get_serializer(existing_annotation)
                        return Response(
                            existing_serializer.data, 
                            status=status.HTTP_200_OK,
                            headers={'X-Duplicate-Prevention': 'true'}
                        )
                        
                    except DicomAnnotation.DoesNotExist:
                        # Race condition - the duplicate was deleted between constraint check and this query
                        pass
            
            # Re-raise the IntegrityError if it's not the expected duplicate UID constraint
            raise
    
    def destroy(self, request, *args, **kwargs):
        """Only allow users to delete their own annotations"""
        annotation = self.get_object()
        
        if not annotation.can_delete(request.user):
            # Log failed deletion attempt
            AuditLog.log_action(
                user=request.user,
                action='API_DELETE',
                resource_type='DicomAnnotation',
                resource_id=str(annotation.pk),
                resource_name=f"Unauthorized deletion attempt - {annotation.get_display_name()}",
                ip_address=self.get_client_ip(),
                success=False
            )
            
            return Response(
                {'error': 'You can only delete your own annotations'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Log successful deletion attempt (actual deletion audit is handled by model)
        AuditLog.log_action(
            user=request.user,
            action='API_DELETE',
            resource_type='DicomAnnotation',
            resource_id=str(annotation.pk),
            resource_name=f"API Delete - {annotation.get_display_name()}",
            old_data={'endpoint': '/api/annotations/', 'method': 'DELETE'},
            ip_address=self.get_client_ip(),
            success=True
        )
        
        return super().destroy(request, *args, **kwargs)
    
    def update(self, request, *args, **kwargs):
        """Only allow users to update their own annotations"""
        annotation = self.get_object()
        
        if not annotation.can_edit(request.user):
            # Log failed update attempt
            AuditLog.log_action(
                user=request.user,
                action='API_PUT',
                resource_type='DicomAnnotation',
                resource_id=str(annotation.pk),
                resource_name=f"Unauthorized update attempt - {annotation.get_display_name()}",
                ip_address=self.get_client_ip(),
                success=False
            )
            
            return Response(
                {'error': 'You can only edit your own annotations'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().update(request, *args, **kwargs)
    
    def partial_update(self, request, *args, **kwargs):
        """Only allow users to partially update their own annotations"""
        annotation = self.get_object()
        
        if not annotation.can_edit(request.user):
            # Log failed update attempt
            AuditLog.log_action(
                user=request.user,
                action='API_PATCH',
                resource_type='DicomAnnotation',
                resource_id=str(annotation.pk),
                resource_name=f"Unauthorized update attempt - {annotation.get_display_name()}",
                ip_address=self.get_client_ip(),
                success=False
            )
            
            return Response(
                {'error': 'You can only edit your own annotations'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().partial_update(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def by_study(self, request):
        """Get all annotations for a specific study"""
        study_uid = request.query_params.get('study_uid')
        if not study_uid:
            return Response(
                {'error': 'study_uid parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        annotations = self.get_queryset().filter(study_instance_uid=study_uid)
        serializer = DicomAnnotationListSerializer(
            annotations, many=True, context={'request': request}
        )
        
        # Log study annotation access
        AuditLog.log_action(
            user=request.user,
            action='API_GET',
            resource_type='DicomAnnotation',
            resource_name=f"Study annotations - {study_uid[:20]}...",
            new_data={
                'endpoint': '/api/annotations/by_study/',
                'study_uid': study_uid,
                'count': len(serializer.data)
            },
            ip_address=self.get_client_ip(),
            success=True
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_image(self, request):
        """Get all annotations for a specific image"""
        image_id = request.query_params.get('image_id')
        if not image_id:
            return Response(
                {'error': 'image_id parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        annotations = self.get_queryset().filter(image_id=image_id)
        serializer = DicomAnnotationListSerializer(
            annotations, many=True, context={'request': request}
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_annotations(self, request):
        """Get all annotations created by the current user"""
        annotations = self.get_queryset().filter(user=request.user)
        
        # Apply any additional filtering
        study_uid = request.query_params.get('study_uid')
        if study_uid:
            annotations = annotations.filter(study_instance_uid=study_uid)
        
        serializer = DicomAnnotationListSerializer(
            annotations, many=True, context={'request': request}
        )
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['delete'])
    def bulk_delete(self, request):
        """Delete multiple annotations (only user's own)"""
        annotation_ids = request.data.get('annotation_ids', [])
        if not annotation_ids:
            return Response(
                {'error': 'annotation_ids list is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get annotations that belong to current user
        annotations = DicomAnnotation.objects.filter(
            id__in=annotation_ids, 
            user=request.user
        )
        
        if not annotations.exists():
            return Response(
                {'error': 'No annotations found or you do not own these annotations'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        deleted_count = annotations.count()
        
        # Log bulk deletion
        AuditLog.log_action(
            user=request.user,
            action='API_DELETE',
            resource_type='DicomAnnotation',
            resource_name=f"Bulk delete {deleted_count} annotations",
            old_data={'annotation_ids': annotation_ids, 'deleted_count': deleted_count},
            ip_address=self.get_client_ip(),
            success=True
        )
        
        # Delete annotations (individual deletion audits will be handled by model)
        annotations.delete()
        
        return Response({
            'message': f'Successfully deleted {deleted_count} annotations'
        })
    
    def get_client_ip(self):
        """Get client IP address for audit logging"""
        x_forwarded_for = self.request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0]
        return self.request.META.get('REMOTE_ADDR')