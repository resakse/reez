"""
Independent Radiology Report Models
Allows radiologists to create reports without AI dependency
"""

from django.db import models
from django.contrib.auth import get_user_model
from django_auto_prefetching import auto_prefetch
from .models import Pemeriksaan

User = get_user_model()


class ManualRadiologyReport(auto_prefetch.Model):
    """
    Independent radiology report model that doesn't require AI reports
    This allows radiologists to create reports even when AI system is unavailable
    """
    # Core relationships
    pemeriksaan = auto_prefetch.ForeignKey(
        Pemeriksaan,
        on_delete=models.CASCADE,
        related_name='manual_reports',
        help_text="Examination this report is for"
    )
    radiologist = auto_prefetch.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='manual_radiology_reports',
        help_text="Radiologist creating this report"
    )
    
    # Report Content Sections
    clinical_history = models.TextField(
        blank=True,
        help_text="Clinical history and indication for examination"
    )
    technique = models.TextField(
        blank=True,
        help_text="Imaging technique and parameters used"
    )
    findings = models.TextField(
        help_text="Detailed imaging findings"
    )
    impression = models.TextField(
        help_text="Clinical impression and diagnosis"
    )
    recommendations = models.TextField(
        blank=True,
        help_text="Clinical recommendations and follow-up"
    )
    
    # Report Status
    REPORT_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('completed', 'Completed'),
        ('amended', 'Amended'),
    ]
    report_status = models.CharField(
        max_length=20,
        choices=REPORT_STATUS_CHOICES,
        default='draft',
        help_text="Current status of the report"
    )
    
    # Complexity Assessment
    COMPLEXITY_CHOICES = [
        ('low', 'Low Complexity'),
        ('medium', 'Medium Complexity'),
        ('high', 'High Complexity'),
        ('critical', 'Critical/Emergency'),
    ]
    complexity_level = models.CharField(
        max_length=20,
        choices=COMPLEXITY_CHOICES,
        default='medium',
        help_text="Complexity level of the case"
    )
    
    # Timing
    report_start_time = models.DateTimeField(
        auto_now_add=True,
        help_text="When report creation started"
    )
    report_completion_time = models.DateTimeField(
        null=True, blank=True,
        help_text="When report was completed"
    )
    
    # Peer Review
    peer_review_required = models.BooleanField(
        default=False,
        help_text="Whether this report requires peer review"
    )
    peer_reviewer = auto_prefetch.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='peer_reviewed_manual_reports',
        help_text="Radiologist performing peer review"
    )
    peer_review_status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending Review'),
            ('approved', 'Approved'),
            ('requires_changes', 'Requires Changes'),
        ],
        default='pending',
        help_text="Status of peer review"
    )
    peer_review_comments = models.TextField(
        blank=True,
        help_text="Peer reviewer comments"
    )
    
    # Metadata
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Manual Radiology Report"
        verbose_name_plural = "Manual Radiology Reports"
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['pemeriksaan'],
                name='unique_manual_report_per_examination'
            )
        ]
    
    def __str__(self):
        patient_name = self.pemeriksaan.daftar.pesakit.nama if self.pemeriksaan.daftar else "Unknown"
        return f"{patient_name} - {self.pemeriksaan.no_xray} ({self.report_status})"
    
    @property
    def total_reporting_time(self):
        """Calculate total time spent on reporting"""
        if self.report_completion_time:
            delta = self.report_completion_time - self.report_start_time
            return delta.total_seconds() / 60  # Return minutes
        return None
    
    @property
    def patient_name(self):
        """Get patient name for display"""
        return self.pemeriksaan.daftar.pesakit.nama if self.pemeriksaan.daftar else "Unknown Patient"
    
    @property
    def examination_number(self):
        """Get examination number"""
        return self.pemeriksaan.no_xray
    
    @property
    def modality(self):
        """Get modality name"""
        return self.pemeriksaan.exam.modaliti.nama if self.pemeriksaan.exam and self.pemeriksaan.exam.modaliti else "Unknown"
    
    def save(self, *args, **kwargs):
        # Set completion time when status changes to completed
        if self.report_status == 'completed' and not self.report_completion_time:
            from django.utils import timezone
            self.report_completion_time = timezone.now()
        
        super().save(*args, **kwargs)