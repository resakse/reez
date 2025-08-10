from django.db import models
from django.conf import settings
from audit.models import AuditLog


class DicomAnnotation(models.Model):
    """
    Model for storing DICOM annotations with Cornerstone3D integration.
    Supports auto-save, user ownership, and comprehensive audit logging.
    """
    
    ANNOTATION_TYPES = [
        ('measurement', 'Measurement'),
        ('annotation', 'Annotation'),
        ('arrow', 'Arrow'),
        ('rectangle', 'Rectangle'),
        ('ellipse', 'Ellipse'),
        ('freehand', 'Freehand'),
        ('angle', 'Angle'),
        ('bidirectional', 'Bidirectional'),
        ('length', 'Length'),
        ('probe', 'Probe'),
        ('circle', 'Circle'),
        ('polyline', 'Polyline'),
        ('spline', 'Spline'),
    ]
    
    # Core fields
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE,
        help_text="User who created this annotation"
    )
    
    # DICOM/Image identification
    study_instance_uid = models.CharField(
        max_length=255,
        db_index=True,
        help_text="DICOM Study Instance UID"
    )
    series_instance_uid = models.CharField(
        max_length=255,
        help_text="DICOM Series Instance UID"
    )
    sop_instance_uid = models.CharField(
        max_length=255,
        help_text="DICOM SOP Instance UID"
    )
    image_id = models.TextField(
        help_text="Cornerstone3D image ID"
    )
    frame_number = models.IntegerField(
        default=1,
        help_text="Frame number for multi-frame images"
    )
    
    # Annotation data
    annotation_type = models.CharField(
        max_length=20, 
        choices=ANNOTATION_TYPES,
        help_text="Type of annotation (measurement, shape, etc.)"
    )
    annotation_data = models.JSONField(
        help_text="Cornerstone3D annotation data in JSON format"
    )
    
    # Metadata
    label = models.CharField(
        max_length=200, 
        blank=True,
        help_text="User-defined label for the annotation"
    )
    description = models.TextField(
        blank=True,
        help_text="Detailed description of the annotation"
    )
    
    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the annotation was created"
    )
    modified_at = models.DateTimeField(
        auto_now=True,
        help_text="When the annotation was last modified"
    )
    
    # Measurement specific fields
    measurement_value = models.FloatField(
        null=True, 
        blank=True,
        help_text="Calculated measurement value (length, area, etc.)"
    )
    measurement_unit = models.CharField(
        max_length=20, 
        blank=True,
        help_text="Unit of measurement (mm, cm, px, etc.)"
    )
    
    class Meta:
        db_table = 'dicom_annotations'
        indexes = [
            models.Index(fields=['study_instance_uid']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['annotation_type']),
            models.Index(fields=['study_instance_uid', 'image_id']),
        ]
        constraints = []
        ordering = ['-created_at']
        verbose_name = "DICOM Annotation"
        verbose_name_plural = "DICOM Annotations"

    def can_delete(self, user):
        """Check if user can delete this annotation"""
        return self.user == user

    def can_edit(self, user):
        """Check if user can edit this annotation"""
        return self.user == user

    def save(self, *args, **kwargs):
        """Override save to log comprehensive audit trail"""
        is_create = self.pk is None
        old_data = None
        
        if not is_create:
            # Get old data for audit
            try:
                old_instance = DicomAnnotation.objects.get(pk=self.pk)
                old_data = {
                    'annotation_type': old_instance.annotation_type,
                    'label': old_instance.label,
                    'description': old_instance.description,
                    'measurement_value': old_instance.measurement_value,
                    'measurement_unit': old_instance.measurement_unit,
                    'annotation_data_keys': list(old_instance.annotation_data.keys()) if old_instance.annotation_data else None,
                }
            except DicomAnnotation.DoesNotExist:
                # Handle edge case where object was deleted
                old_data = None
        
        super().save(*args, **kwargs)
        
        # Log audit trail using existing system
        action = 'CREATE' if is_create else 'UPDATE'
        new_data = {
            'annotation_type': self.annotation_type,
            'label': self.label,
            'description': self.description,
            'measurement_value': self.measurement_value,
            'measurement_unit': self.measurement_unit,
            'annotation_data_keys': list(self.annotation_data.keys()) if self.annotation_data else None,
            'study_instance_uid': self.study_instance_uid,
            'image_id': self.image_id[:50] + '...' if len(self.image_id) > 50 else self.image_id,  # Truncate long image IDs
        }
        
        resource_name = f"{self.annotation_type}"
        if self.label:
            resource_name += f" - {self.label}"
        else:
            resource_name += f" - {self.id if not is_create else 'New'}"
        
        AuditLog.log_action(
            user=self.user,
            action=action,
            resource_type='DicomAnnotation',
            resource_id=str(self.pk),
            resource_name=resource_name,
            old_data=old_data,
            new_data=new_data,
            success=True
        )

    def delete(self, *args, **kwargs):
        """Override delete to log audit trail"""
        # Capture data before deletion
        resource_name = f"{self.annotation_type}"
        if self.label:
            resource_name += f" - {self.label}"
        else:
            resource_name += f" - {self.id}"
        
        old_data = {
            'annotation_type': self.annotation_type,
            'label': self.label,
            'description': self.description,
            'measurement_value': self.measurement_value,
            'measurement_unit': self.measurement_unit,
            'study_instance_uid': self.study_instance_uid,
            'image_id': self.image_id[:50] + '...' if len(self.image_id) > 50 else self.image_id,
            'created_at': self.created_at.isoformat(),
        }
        
        # Log deletion before actually deleting
        AuditLog.log_action(
            user=self.user,
            action='DELETE',
            resource_type='DicomAnnotation',
            resource_id=str(self.pk),
            resource_name=resource_name,
            old_data=old_data,
            success=True
        )
        
        super().delete(*args, **kwargs)

    def __str__(self):
        user_name = self.user.get_full_name() if hasattr(self.user, 'get_full_name') else str(self.user)
        label_part = f" - {self.label}" if self.label else ""
        return f"{self.annotation_type}{label_part} by {user_name}"
        
    def get_display_name(self):
        """Get user-friendly display name for the annotation"""
        base_name = self.get_annotation_type_display()
        if self.label:
            return f"{base_name} - {self.label}"
        elif self.measurement_value:
            unit = self.measurement_unit or 'units'
            return f"{base_name} - {self.measurement_value:.2f} {unit}"
        else:
            return base_name
            
    def get_measurement_display(self):
        """Get formatted measurement string"""
        if self.measurement_value is not None:
            unit = self.measurement_unit or ''
            return f"{self.measurement_value:.2f} {unit}".strip()
        return None