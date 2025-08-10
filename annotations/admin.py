from django.contrib import admin
from .models import DicomAnnotation


@admin.register(DicomAnnotation)
class DicomAnnotationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'user', 'annotation_type', 'label', 
        'study_instance_uid', 'created_at', 'modified_at'
    ]
    list_filter = [
        'annotation_type', 'created_at', 'modified_at', 'user__username'
    ]
    search_fields = [
        'study_instance_uid', 'series_instance_uid', 'label', 
        'description', 'user__username'
    ]
    readonly_fields = ['created_at', 'modified_at']
    ordering = ['-created_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('user', 'annotation_type', 'label', 'description')
        }),
        ('DICOM Identifiers', {
            'fields': (
                'study_instance_uid', 'series_instance_uid', 
                'sop_instance_uid', 'image_id', 'frame_number'
            )
        }),
        ('Annotation Data', {
            'fields': ('annotation_data',)
        }),
        ('Measurement Data', {
            'fields': ('measurement_value', 'measurement_unit'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'modified_at'),
            'classes': ('collapse',)
        })
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')