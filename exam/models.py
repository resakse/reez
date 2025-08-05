from django.db import models
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from wad.models import Ward
from pesakit.models import Pesakit
from reez import settings
from custom.katanama import titlecase
from ordered_model.models import OrderedModel
import auto_prefetch
import uuid
from decimal import Decimal

User = settings.AUTH_USER_MODEL

# Manual reporting models are defined at the end of this file

# Create your models here.
class DashboardConfig(models.Model):
    """
    Configuration model for dashboard settings including storage monitoring
    """
    # Storage configuration
    storage_root_paths = models.JSONField(
        default=list, 
        help_text="List of storage paths to monitor for capacity and usage analysis"
    )
    
    # Alert thresholds
    storage_warning_threshold = models.PositiveIntegerField(
        default=80, 
        help_text="Storage usage percentage that triggers warning alerts"
    )
    storage_critical_threshold = models.PositiveIntegerField(
        default=90, 
        help_text="Storage usage percentage that triggers critical alerts"
    )
    
    # KPI targets for performance monitoring
    target_turnaround_time = models.PositiveIntegerField(
        default=60, 
        help_text="Target turnaround time in minutes from registration to completion"
    )
    target_daily_throughput = models.PositiveIntegerField(
        default=50, 
        help_text="Target number of examinations per day"
    )
    target_equipment_utilization = models.PositiveIntegerField(
        default=75, 
        help_text="Target equipment utilization percentage"
    )
    
    # Storage size estimates by modality (in GB)
    modality_size_estimates = models.JSONField(
        default=dict,
        help_text="Average storage size per examination by modality type (in GB)"
    )
    
    # Dashboard refresh settings
    auto_refresh_interval = models.PositiveIntegerField(
        default=300,  # 5 minutes
        help_text="Auto-refresh interval for dashboard in seconds"
    )
    
    # Notification settings
    email_notifications = models.BooleanField(
        default=True,
        help_text="Enable email notifications for alerts"
    )
    notification_emails = models.JSONField(
        default=list,
        help_text="List of email addresses to receive notifications"
    )
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Dashboard Configuration"
        verbose_name_plural = "Dashboard Configurations"
    
    def __str__(self):
        return f"Dashboard Config - {self.modified.strftime('%Y-%m-%d %H:%M')}"
    
    def save(self, *args, **kwargs):
        # Ensure default modality size estimates
        if not self.modality_size_estimates:
            self.modality_size_estimates = {
                'X-RAY': 0.03,  # 30MB average
                'CR': 0.03,     # 30MB average  
                'DX': 0.03,     # 30MB average
                'CT': 0.3,      # 300MB average
                'MRI': 0.5,     # 500MB average
                'US': 0.1,      # 100MB average
                'MG': 0.05,     # 50MB average (Mammography)
                'RF': 0.1,      # 100MB average (Fluoroscopy)
            }
        
        # Ensure default storage paths if empty
        if not self.storage_root_paths:
            self.storage_root_paths = [
                '/var/lib/orthanc/db',
                '/data/orthanc',
                '/opt/orthanc/data'
            ]
        
        super().save(*args, **kwargs)


class PacsConfig(models.Model):
    ENDPOINT_STYLE_CHOICES = [
        ('dicomweb', 'DICOMweb (OHIF-style) - Standard WADO-RS'),
        ('file', 'File endpoint - Direct Orthanc /file'),
        ('attachment', 'Attachment - Raw DICOM data'),
        ('auto', 'Auto-detect - Try best working endpoint'),
    ]
    
    orthancurl = models.URLField(verbose_name="Orthanc URL", max_length=200)
    viewrurl = models.URLField(verbose_name="DICOM Viewer URL", max_length=200)
    endpoint_style = models.CharField(
        verbose_name="Endpoint Style",
        max_length=20,
        choices=ENDPOINT_STYLE_CHOICES,
        default='dicomweb',
        help_text="Choose which Orthanc endpoint style to use for DICOM image retrieval"
    )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "PACS Configuration"
        verbose_name_plural = "PACS Configurations"

    def __str__(self):
        return f"PACS Config ({self.get_endpoint_style_display()}) - {self.modified}"


class PacsServer(models.Model):
    ENDPOINT_STYLE_CHOICES = [
        ('dicomweb', 'DICOMweb (OHIF-style) - Standard WADO-RS'),
        ('file', 'File endpoint - Direct Orthanc /file'),
        ('attachment', 'Attachment - Raw DICOM data'),
        ('auto', 'Auto-detect - Try best working endpoint'),
    ]
    
    name = models.CharField(
        max_length=100, 
        unique=True, 
        help_text="Friendly name for the PACS server (e.g., 'Unraid Orthanc', 'Main Hospital PACS')"
    )
    orthancurl = models.URLField(
        verbose_name="Orthanc URL", 
        max_length=200,
        help_text="Orthanc server URL (e.g., http://10.0.1.0:8042)"
    )
    viewrurl = models.URLField(
        verbose_name="DICOM Viewer URL", 
        max_length=200,
        help_text="DICOM viewer URL for this server"
    )
    endpoint_style = models.CharField(
        max_length=20,
        choices=ENDPOINT_STYLE_CHOICES,
        default='dicomweb',
        help_text="DICOM endpoint style for image retrieval"
    )
    comments = models.TextField(
        blank=True, 
        help_text="Purpose and usage notes (e.g., 'This is only for CT Scan images', 'Archive server for studies older than 1 year')"
    )
    is_active = models.BooleanField(default=True, help_text="Enable/disable this PACS server")
    is_primary = models.BooleanField(default=False, help_text="Primary PACS server for new examinations")
    is_deleted = models.BooleanField(default=False, help_text="Soft delete flag for servers with historical data")
    include_in_reject_analysis = models.BooleanField(
        default=True, 
        help_text="Include this PACS server in reject analysis calculations. "
                 "Uncheck for imported data from other facilities or archived data "
                 "that shouldn't count towards institution's statistics."
    )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-is_primary', 'name']
        verbose_name = "PACS Server"
        verbose_name_plural = "PACS Servers"
        constraints = [
            models.UniqueConstraint(
                fields=['is_primary'],
                condition=models.Q(is_primary=True, is_deleted=False),
                name='unique_primary_pacs'
            )
        ]
    
    def save(self, *args, **kwargs):
        # Ensure only one primary PACS exists among non-deleted servers
        if self.is_primary and not self.is_deleted:
            PacsServer.objects.filter(is_primary=True, is_deleted=False).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)
    
    def __str__(self):
        primary_marker = " (Primary)" if self.is_primary else ""
        active_marker = "" if self.is_active else " (Inactive)"
        deleted_marker = " (Deleted)" if self.is_deleted else ""
        return f"{self.name}{primary_marker}{active_marker}{deleted_marker}"


class Modaliti(models.Model):
    nama = models.CharField(_("Modaliti"), max_length=150)
    singkatan = models.CharField(_("Singkatan"), max_length=50, blank=True, null=True)
    detail = models.CharField(_("Keterangan"), max_length=250, blank=True, null=True)

    class Meta:
        verbose_name = _("Modaliti")
        verbose_name_plural = _("Modaliti")
        ordering = ["nama"]

    def __str__(self):
        return self.nama

    def save(self, *args, **kwargs):
        self.nama = self.nama.upper()
        if self.singkatan:
            self.singkatan = self.singkatan.upper()
        else:
            self.singkatan = self.nama.upper()

        super(Modaliti, self).save(*args, **kwargs)


class Part(models.Model):
    part = models.CharField(max_length=100)

    def save(self, *args, **kwargs):
        self.part = self.part.upper()
        super(Part, self).save(*args, **kwargs)

    def __str__(self):
        return self.part


class Region(OrderedModel):
    jenis = models.CharField(
        help_text="Modaliti untuk Statistik",
        max_length=50,
        blank=True,
        null=True,
    )
    bahagian = models.CharField(
        help_text="Bahagian untuk Statistik",
        max_length=50,
        blank=True,
        null=True,
    )

    class Meta:
        verbose_name_plural = "Statistik Region"
        unique_together = ["jenis", "bahagian"]
        ordering = [
            "order",
        ]

    def save(self, *args, **kwargs):
        self.jenis = titlecase(self.jenis)
        self.bahagian = titlecase(self.bahagian)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.jenis} - {self.bahagian}"


class Exam(auto_prefetch.Model):
    status_choices = (
        ("ENABLE", "Enable"),
        ("DISABLE", "Disable"),
    )
    exam = models.CharField(max_length=50)
    part = auto_prefetch.ForeignKey(Part, on_delete=models.SET_NULL, null=True, blank=True)
    modaliti = auto_prefetch.ForeignKey(Modaliti, on_delete=models.CASCADE)
    catatan = models.CharField(max_length=200, blank=True, null=True)
    short_desc = models.CharField(max_length=50, blank=True, null=True)
    contrast = models.BooleanField(default=False)
    statistik = auto_prefetch.ForeignKey(
        Region, on_delete=models.SET_NULL, null=True, blank=True
    )
    status_ca = models.CharField(
        max_length=10, choices=status_choices, default="ENABLE"
    )

    class Meta(auto_prefetch.Model.Meta):
        verbose_name_plural = "Pemeriksaan"
        unique_together = ["exam", "part", "modaliti"]
        ordering = ["modaliti", "part", "exam"]

    def __str__(self):
        # return '{} - {}'.format(self.modaliti,self.exam)
        return self.exam

    def save(self, *args, **kwargs):
        self.exam = titlecase(self.exam)
        if self.short_desc:
            self.short_desc = self.short_desc.upper()
        super(Exam, self).save(*args, **kwargs)


lateral_choices = (
    ("Kiri", "Kiri"),
    ("Kanan", "Kanan"),
)


def generate_study_accession(modality_code="XR"):
    """Generate parent accession number for study (e.g., KKP2025XR0000001)"""
    tahun = timezone.now().year
    prefix = f"{settings.KLINIKSHORT}{tahun}{modality_code}"
    
    # Get all existing accession numbers with same prefix
    existing = Daftar.objects.filter(
        parent_accession_number__startswith=prefix
    ).values_list('parent_accession_number', flat=True)
    
    # Find the highest number used
    max_number = 0
    for acc in existing:
        if acc and len(acc) >= 7:  # Ensure we have a valid accession number
            try:
                number = int(acc[-7:])  # Last 7 digits
                max_number = max(max_number, number)
            except (ValueError, IndexError):
                continue
    
    new_number = max_number + 1
    return f"{prefix}{str(new_number).zfill(7)}"


def generate_exam_accession():
    """Generate child accession number for individual examination (e.g., KKP202500000001)"""
    tahun = timezone.now().year
    prefix = f"{settings.KLINIKSHORT}{tahun}"
    
    # Get all existing accession numbers with same prefix
    existing = Pemeriksaan.objects.filter(
        accession_number__startswith=prefix
    ).values_list('accession_number', flat=True)
    
    # Find the highest number used
    max_number = 0
    for acc in existing:
        if acc and len(acc) >= 10:  # Ensure we have a valid accession number
            try:
                # For exam accessions, we use last 10 digits
                number = int(acc[-10:])
                max_number = max(max_number, number)
            except (ValueError, IndexError):
                continue
    
    new_number = max_number + 1
    return f"{prefix}{str(new_number).zfill(10)}"


ambulatori_choice = [
    ('Berjalan', 'Berjalan'),
    ('Kerusi Roda', 'Kerusi Roda'),
    ('Troli', 'Troli')
]
status_chocies = [
    ('Registered', 'Registered'),
    ('Performed', 'Performed'),
    ('Completed', 'Completed')
]


# MWL Integration choices
priority_choices = [
    ('STAT', 'STAT'),
    ('HIGH', 'High'),
    ('MEDIUM', 'Medium'),
    ('LOW', 'Low'),
]

patient_position_choices = [
    ('HFS', 'Head First-Supine'),
    ('HFP', 'Head First-Prone'),
    ('HFDR', 'Head First-Decubitus Right'),
    ('HFDL', 'Head First-Decubitus Left'),
    ('FFS', 'Feet First-Supine'),
    ('FFP', 'Feet First-Prone'),
    ('FFDR', 'Feet First-Decubitus Right'),
    ('FFDL', 'Feet First-Decubitus Left'),
]


class Daftar(auto_prefetch.Model):
    tarikh = models.DateTimeField(default=timezone.now)

    pesakit = auto_prefetch.ForeignKey(Pesakit, on_delete=models.CASCADE)
    no_resit = models.CharField(max_length=50, blank=True, null=True)
    lmp = models.DateField(verbose_name='LMP', blank=True, null=True)
    rujukan = auto_prefetch.ForeignKey(Ward, on_delete=models.SET_NULL, null=True)
    ambulatori = models.CharField(max_length=15, choices=ambulatori_choice, default='Berjalan Kaki')

    # Parent-Child Study Hierarchy
    parent_accession_number = models.CharField(
        max_length=20, unique=True, blank=True, null=True,
        help_text="Parent accession number for grouped studies (e.g., KKP2025XR0000001)"
    )
    requested_procedure_id = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="DICOM Requested Procedure ID (maps 1-to-1 with parent_accession_number)"
    )
    study_description = models.CharField(
        max_length=200, blank=True, null=True,
        help_text="Description of the study (e.g., 'XR Series')"
    )
    
    # MWL Integration fields for CR machine
    study_instance_uid = models.CharField(
        max_length=64, unique=True, blank=True, null=True,
        help_text="Unique identifier for DICOM study"
    )
    accession_number = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="Legacy accession number field (use parent_accession_number for new studies)"
    )
    
    # Study Status
    study_status = models.CharField(
        max_length=15, choices=[
            ('SCHEDULED', 'Scheduled'),
            ('IN_PROGRESS', 'In Progress'),
            ('COMPLETED', 'Completed'),
            ('CANCELLED', 'Cancelled')
        ], default='SCHEDULED',
        help_text="Overall study status"
    )
    scheduled_datetime = models.DateTimeField(
        blank=True, null=True,
        help_text="Scheduled date and time for the examination"
    )
    study_priority = models.CharField(
        max_length=10, choices=priority_choices, default='MEDIUM',
        help_text="Priority level for the study"
    )
    requested_procedure_description = models.CharField(
        max_length=200, blank=True, null=True,
        help_text="Description of the requested procedure"
    )
    study_comments = models.TextField(
        blank=True, null=True,
        help_text="Additional comments for the study"
    )
    patient_position = models.CharField(
        max_length=4, choices=patient_position_choices, blank=True, null=True,
        help_text="Patient position for the examination"
    )
    modality = models.CharField(
        max_length=10, blank=True, null=True,
        help_text="Modality type (CR, DX, etc.)"
    )

    pemohon = models.CharField(max_length=30, blank=True, null=True)
    status = models.CharField(max_length=15, choices=status_chocies, default='Performed')
    hamil = models.BooleanField(default=False)
    jxr = auto_prefetch.ForeignKey(User, verbose_name='Juru X-Ray', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="bcs_jxr"
                                   )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta(auto_prefetch.Model.Meta):
        verbose_name_plural = "Pendaftaran Radiologi"
        ordering = [
            "tarikh", 'pesakit'
        ]

    def generate_study_instance_uid(self):
        """Generate a DICOM Study Instance UID"""
        try:
            # Try to use pydicom's generate_uid if available
            from pydicom.uid import generate_uid
            return generate_uid()
        except ImportError:
            # Fallback to simple UUID-based generation
            org_root = getattr(settings, 'DICOM_ORG_ROOT', '1.2.826.0.1.3680043.8.498')
            uid_suffix = str(uuid.uuid4().int)[:20]  # Limit for DICOM compliance
            return f"{org_root}.{uid_suffix}"
    
    def __str__(self):
        return "{} - {}".format(self.tarikh, self.pesakit.nama)

    def save(self, *args, **kwargs):
        if self.pemohon:
            self.pemohon = titlecase(self.pemohon)
        
        # Generate parent accession number if not provided
        if not self.parent_accession_number:
            # Determine modality from related examinations or default to XR
            modality_code = self.modality or "XR"
            self.parent_accession_number = generate_study_accession(modality_code)
            self.requested_procedure_id = self.parent_accession_number
        
        # Generate Study Instance UID if not provided (for DICOM integration)
        if not self.study_instance_uid:
            self.study_instance_uid = self.generate_study_instance_uid()
        
        # Use parent_accession_number as legacy accession_number for compatibility
        if not self.accession_number:
            self.accession_number = self.parent_accession_number or self.no_resit
        
        super(Daftar, self).save(*args, **kwargs)



class Pemeriksaan(auto_prefetch.Model):
    daftar = auto_prefetch.ForeignKey(Daftar, on_delete=models.CASCADE, related_name='pemeriksaan')
    
    # Individual examination identifiers
    accession_number = models.CharField(
        verbose_name="Accession Number", blank=True, null=True, max_length=20,
        help_text="Individual accession number for this examination (e.g., KKP202500000001)"
    )
    no_xray = models.CharField(
        verbose_name="No. X-Ray (Legacy)", blank=True, null=True, max_length=20,
        help_text="Legacy X-ray number field (use accession_number for new examinations)"
    )
    scheduled_step_id = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="DICOM Scheduled Procedure Step ID (maps to accession_number)"
    )
    
    # Examination details
    exam = auto_prefetch.ForeignKey(Exam, on_delete=models.CASCADE)
    laterality = models.CharField(
        choices=lateral_choices, blank=True, null=True, max_length=10
    )
    
    # Positioning information
    patient_position = models.CharField(
        max_length=20, choices=[
            ('AP', 'Anterior-Posterior'),
            ('PA', 'Posterior-Anterior'),
            ('LAT', 'Lateral'),
            ('LATERAL_LEFT', 'Left Lateral'),
            ('LATERAL_RIGHT', 'Right Lateral'),
            ('OBLIQUE', 'Oblique'),
        ], blank=True, null=True,
        help_text="Patient position for X-ray (AP/PA/Lateral)"
    )
    
    body_position = models.CharField(
        max_length=20, choices=[
            ('ERECT', 'Erect/Standing'),
            ('SUPINE', 'Supine'),
            ('PRONE', 'Prone'),
            ('DECUBITUS_LEFT', 'Left Decubitus'),
            ('DECUBITUS_RIGHT', 'Right Decubitus'),
        ], blank=True, null=True,
        help_text="Body position during examination"
    )
    
    # Examination status and sequence
    exam_status = models.CharField(
        max_length=15, choices=[
            ('SCHEDULED', 'Scheduled'),
            ('IN_PROGRESS', 'In Progress'),
            ('COMPLETED', 'Completed'),
            ('CANCELLED', 'Cancelled')
        ], default='SCHEDULED',
        help_text="Individual examination status"
    )
    
    sequence_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="Order of this examination within the study"
    )
    kv = models.PositiveSmallIntegerField(verbose_name='kVp', blank=True, null=True)
    mas = models.PositiveSmallIntegerField(verbose_name='mAs', blank=True, null=True)
    mgy = models.PositiveSmallIntegerField(verbose_name='mGy', blank=True, null=True)
    catatan = models.CharField(
        verbose_name="Catatan", max_length=200, blank=True, null=True,
        help_text="Catatan khusus untuk pemeriksaan ini (contoh: pesakit tidak dapat luruskan jari)"
    )
    jxr = auto_prefetch.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="exam_jxr"
    )
    
    # DICOM Content Date/Time (actual examination date/time from DICOM tags)
    content_date = models.DateField(
        blank=True, null=True,
        help_text="DICOM ContentDate (0008,0023) - actual examination date"
    )
    content_time = models.TimeField(
        blank=True, null=True,
        help_text="DICOM ContentTime (0008,0033) - actual examination time"
    )
    content_datetime = models.DateTimeField(
        blank=True, null=True,
        help_text="Combined DICOM ContentDate and ContentTime for sorting and display"
    )
    content_datetime_source = models.CharField(
        max_length=50, blank=True, null=True,
        help_text="Source of the datetime (e.g., 'ContentDate/ContentTime', 'StudyDate/StudyTime')"
    )
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta(auto_prefetch.Model.Meta):
        verbose_name_plural = 'Pemeriksaan'
        ordering = ['daftar', 'no_xray']

    def __str__(self):
        return self.no_xray

    def save(self, *args, **kwargs):
        # Generate accession number if not provided
        if not self.accession_number:
            self.accession_number = generate_exam_accession()
            self.scheduled_step_id = self.accession_number
        
        # Keep legacy no_xray for backward compatibility
        if not self.no_xray:
            self.no_xray = self.accession_number
            
        super(Pemeriksaan, self).save(*args, **kwargs)


class PacsExam(models.Model):
    exam = models.OneToOneField(Pemeriksaan, on_delete=models.CASCADE)
    orthanc_id = models.CharField(max_length=100, blank=True, null=True)
    study_id = models.CharField(max_length=100, blank=True, null=True)
    study_instance = models.CharField(max_length=100, blank=True, null=True)
    pacs_server = models.ForeignKey(
        PacsServer, 
        on_delete=models.PROTECT,  # Prevent deletion of servers with examinations
        help_text="PACS server where this examination's DICOM data is stored",
        related_name='examinations',
        null=True,  # Temporary for migration
        blank=True
    )

    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Pacs Item'

    def __str__(self):
        return self.orthanc_id or f"PacsExam {self.id}"
    
    def get_image_proxy_url(self, orthanc_id: str, endpoint_type: str = 'configurable'):
        """Get the correct proxy URL for this examination's images"""
        if self.pacs_server:
            return f"/api/pacs/instances/{self.pacs_server.id}/{orthanc_id}/{endpoint_type}"
        # Fallback to legacy URL structure
        return f"/api/pacs/instances/{orthanc_id}/{endpoint_type}"


class MediaDistribution(models.Model):
    MEDIA_TYPE_CHOICES = [
        ('CD', 'CD'),
        ('DVD', 'DVD'),
        ('XRAY_FILM', 'X-Ray Film'),
        ('USB', 'USB Drive'),
        ('DIGITAL_COPY', 'Digital Copy'),
    ]
    
    STATUS_CHOICES = [
        ('REQUESTED', 'Requested'),
        ('PREPARING', 'Preparing'),
        ('READY', 'Ready for Collection'),
        ('COLLECTED', 'Collected'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    # Core fields
    request_date = models.DateTimeField(default=timezone.now)
    # Support multiple studies in one distribution
    studies = models.ManyToManyField(Daftar, related_name='media_distributions', help_text="Studies included in this distribution")
    # Keep legacy single daftar field for backward compatibility (will be deprecated)
    daftar = models.ForeignKey(Daftar, on_delete=models.CASCADE, related_name='legacy_media_distributions', 
                              null=True, blank=True, help_text="DEPRECATED: Use studies field instead")
    
    # Primary patient (derived from first study)
    primary_patient = models.ForeignKey('pesakit.Pesakit', on_delete=models.CASCADE, related_name='media_distributions',
                                       null=True, blank=True, help_text="Primary patient for this distribution")
    
    # Media details
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPE_CHOICES)
    quantity = models.PositiveIntegerField(default=1, help_text="Number of CDs/films")
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='REQUESTED')
    
    # Collection details
    collected_by = models.CharField(max_length=100, blank=True, null=True, help_text="Name of person collecting")
    collected_by_ic = models.CharField(max_length=25, blank=True, null=True, help_text="IC of collector")
    relationship_to_patient = models.CharField(max_length=50, blank=True, null=True, help_text="Relationship to patient")
    collection_datetime = models.DateTimeField(blank=True, null=True)
    
    # Staff handling
    prepared_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='prepared_media')
    handed_over_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='handed_media')
    
    # Additional details
    comments = models.TextField(blank=True, null=True, help_text="Special instructions or notes")
    cancellation_reason = models.TextField(blank=True, null=True, help_text="Reason for cancellation")
    urgency = models.CharField(max_length=20, choices=[
        ('NORMAL', 'Normal'),
        ('URGENT', 'Urgent'),
        ('STAT', 'STAT'),
    ], default='NORMAL')
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Media Distribution"
        verbose_name_plural = "Media Distributions"
        ordering = ['-request_date']
    
    def __str__(self):
        if self.primary_patient:
            return f"{self.primary_patient.nama} - {self.media_type} ({self.status})"
        elif self.daftar:  # Backward compatibility
            return f"{self.daftar.pesakit.nama} - {self.media_type} ({self.status})"
        return f"Media Distribution {self.id} - {self.media_type} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Set primary_patient from daftar if not set (backward compatibility)
        if not self.primary_patient and self.daftar:
            self.primary_patient = self.daftar.pesakit
        super().save(*args, **kwargs)
        
        # If using legacy daftar field, automatically add to studies
        if self.daftar and not self.studies.filter(id=self.daftar.id).exists():
            self.studies.add(self.daftar)
    
    @property
    def patient_name(self):
        """Get patient name for display"""
        if self.primary_patient:
            return self.primary_patient.nama
        elif self.daftar:
            return self.daftar.pesakit.nama
        return "Unknown Patient"
    
    @property
    def study_count(self):
        """Get number of studies in this distribution"""
        return self.studies.count() or (1 if self.daftar else 0)


# ========== REJECT ANALYSIS MODELS ==========

class RejectCategory(OrderedModel):
    """Main categories for reject analysis with drag-and-drop ordering"""
    CATEGORY_TYPES = [
        ('HUMAN_FAULTS', 'Human Faults'),
        ('EQUIPMENT', 'Equipment'),
        ('PROCESSING', 'Processing'),
        ('OTHERS', 'Others'),
    ]
    
    name = models.CharField(max_length=100, help_text="Category name (e.g., 'Positioning Errors')")
    category_type = models.CharField(max_length=20, choices=CATEGORY_TYPES, help_text="Main category classification")
    description = models.TextField(blank=True, null=True, help_text="Detailed description of this category")
    is_active = models.BooleanField(default=True, help_text="Enable/disable this category")
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(OrderedModel.Meta):
        verbose_name = "Reject Category"
        verbose_name_plural = "Reject Categories"
        ordering = ['category_type', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['category_type', 'name'],
                name='unique_category_name_per_type'
            )
        ]
    
    def __str__(self):
        return f"{self.get_category_type_display()} - {self.name}"
    
    def save(self, *args, **kwargs):
        self.name = titlecase(self.name)
        super().save(*args, **kwargs)


class RejectReason(OrderedModel):
    """Specific reasons within each category with drag-and-drop ordering"""
    category = auto_prefetch.ForeignKey(RejectCategory, on_delete=models.CASCADE, related_name='reasons')
    reason = models.CharField(max_length=200, help_text="Specific reject reason (e.g., 'Over Exposure / High Index')")
    description = models.TextField(blank=True, null=True, help_text="Detailed description and guidance")
    is_active = models.BooleanField(default=True, help_text="Enable/disable this reason")
    
    # Malaysian QAP compliance fields
    qap_code = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="Malaysian QAP classification code if applicable"
    )
    severity_level = models.CharField(
        max_length=20, 
        choices=[
            ('LOW', 'Low Impact'),
            ('MEDIUM', 'Medium Impact'),
            ('HIGH', 'High Impact'),
            ('CRITICAL', 'Critical - Immediate Action Required')
        ],
        default='MEDIUM',
        help_text="Severity level for prioritizing corrective actions"
    )
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(OrderedModel.Meta):
        verbose_name = "Reject Reason"
        verbose_name_plural = "Reject Reasons"
        ordering = ['category', 'order']
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'reason'],
                name='unique_reason_per_category'
            )
        ]
    
    def __str__(self):
        return f"{self.category.name} - {self.reason}"
    
    def save(self, *args, **kwargs):
        self.reason = titlecase(self.reason)
        super().save(*args, **kwargs)


class RejectAnalysis(auto_prefetch.Model):
    """Monthly reject analysis tracking with Malaysian QAP compliance"""
    analysis_date = models.DateField(help_text="Month and year for this analysis (typically first day of month)")
    modality = auto_prefetch.ForeignKey(Modaliti, on_delete=models.CASCADE, help_text="Modality being analyzed")
    
    # Calculated statistics
    total_examinations = models.PositiveIntegerField(
        help_text="Total examinations performed for the month"
    )
    total_images = models.PositiveIntegerField(
        help_text="Total images produced (including retakes and originals)"
    )
    total_retakes = models.PositiveIntegerField(
        help_text="Total number of retake images"
    )
    
    # Calculated percentages
    reject_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        help_text="Reject rate percentage: (total_retakes/total_images) * 100"
    )
    
    # Malaysian QAP specific fields
    drl_compliance = models.BooleanField(
        default=True,
        help_text="Indicates if reject rate meets Malaysian DRL guidelines"
    )
    qap_target_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=8.00,
        help_text="Target reject rate for this modality (default 8% per international guidelines)"
    )
    
    # Analysis and corrective actions
    comments = models.TextField(
        blank=True, null=True, 
        help_text="Analysis comments and findings for the month"
    )
    corrective_actions = models.TextField(
        blank=True, null=True,
        help_text="Corrective actions taken or planned based on this analysis"
    )
    root_cause_analysis = models.TextField(
        blank=True, null=True,
        help_text="Root cause analysis for high reject rates"
    )
    
    # Staff and approval tracking
    created_by = auto_prefetch.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_reject_analyses',
        help_text="Quality manager who created this analysis"
    )
    approved_by = auto_prefetch.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_reject_analyses',
        help_text="Senior staff who approved this analysis"
    )
    approval_date = models.DateTimeField(
        blank=True, null=True,
        help_text="Date when analysis was approved"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(auto_prefetch.Model.Meta):
        verbose_name = "Reject Analysis"
        verbose_name_plural = "Reject Analyses"
        ordering = ['-analysis_date', 'modality']
        constraints = [
            models.UniqueConstraint(
                fields=['analysis_date', 'modality'],
                name='unique_analysis_per_month_modality'
            )
        ]
    
    def __str__(self):
        return f"{self.modality.nama.title()} - {self.analysis_date.strftime('%B %Y')} ({self.reject_rate:.2f}%)"
    
    def save(self, *args, **kwargs):
        # Auto-calculate reject rate if not provided
        if self.total_images > 0:
            rate_calculation = (self.total_retakes / self.total_images) * 100
            self.reject_rate = Decimal(str(rate_calculation)).quantize(Decimal('0.01'))
        else:
            self.reject_rate = Decimal('0.00')
        
        # Check DRL compliance
        self.drl_compliance = self.reject_rate <= self.qap_target_rate
        
        super().save(*args, **kwargs)
    
    @property
    def status_indicator(self):
        """Get status indicator based on reject rate"""
        if self.reject_rate <= self.qap_target_rate:
            return 'GOOD'
        elif self.reject_rate <= (self.qap_target_rate * Decimal('1.5')):
            return 'WARNING'
        else:
            return 'CRITICAL'
    
    @property
    def month_year_display(self):
        """Display month and year in readable format"""
        return self.analysis_date.strftime('%B %Y')


class RejectIncident(auto_prefetch.Model):
    """Individual reject incidents linked to examinations"""
    examination = auto_prefetch.ForeignKey(
        Pemeriksaan, on_delete=models.CASCADE, 
        related_name='reject_incidents',
        help_text="The examination that had a reject/retake",
        null=True, blank=True
    )
    analysis = auto_prefetch.ForeignKey(
        RejectAnalysis, on_delete=models.CASCADE,
        related_name='incidents',
        help_text="Monthly analysis this incident belongs to",
        null=True, blank=True
    )
    
    # Reject details
    reject_reason = auto_prefetch.ForeignKey(RejectReason, on_delete=models.CASCADE)
    reject_date = models.DateTimeField(
        default=timezone.now,
        help_text="Date and time when reject was identified"
    )
    
    # Technical details
    retake_count = models.PositiveSmallIntegerField(
        default=1,
        help_text="Number of retakes required for this examination"
    )
    original_technique = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="Original technique used (kVp, mAs, etc.)"
    )
    corrected_technique = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="Corrected technique for retake"
    )
    
    # Staff involved
    technologist = auto_prefetch.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reject_incidents_as_tech',
        help_text="Radiographer who performed the examination"
    )
    reported_by = auto_prefetch.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reject_incidents_reported',
        help_text="Staff member who identified and reported the reject"
    )
    
    # Additional context
    patient_factors = models.TextField(
        blank=True, null=True,
        help_text="Patient-related factors that contributed to the reject (motion, cooperation, etc.)"
    )
    equipment_factors = models.TextField(
        blank=True, null=True,
        help_text="Equipment-related factors (calibration, malfunction, etc.)"
    )
    notes = models.TextField(
        blank=True, null=True,
        help_text="Additional notes about the reject incident"
    )
    
    # Malaysian QAP compliance
    immediate_action_taken = models.TextField(
        blank=True, null=True,
        help_text="Immediate corrective action taken"
    )
    follow_up_required = models.BooleanField(
        default=False,
        help_text="Indicates if follow-up action is required"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(auto_prefetch.Model.Meta):
        verbose_name = "Reject Incident"
        verbose_name_plural = "Reject Incidents"
        ordering = ['-reject_date']
        indexes = [
            models.Index(fields=['reject_date']),
            models.Index(fields=['analysis', 'reject_date']),
            models.Index(fields=['examination']),
        ]
    
    def __str__(self):
        return f"{self.examination.no_xray} - {self.reject_reason.reason} ({self.reject_date.strftime('%d/%m/%Y')})"
    
    def save(self, *args, **kwargs):
        # Ensure analysis matches the examination date
        if self.examination and self.analysis_id is None:
            # Try to find or create appropriate analysis
            exam_date = self.examination.created.date()
            analysis_date = exam_date.replace(day=1)  # First day of month
            
            try:
                self.analysis = RejectAnalysis.objects.get(
                    analysis_date=analysis_date,
                    modality=self.examination.exam.modaliti
                )
            except RejectAnalysis.DoesNotExist:
                # Analysis will need to be created separately
                pass
        
        super().save(*args, **kwargs)


class RejectAnalysisTargetSettings(models.Model):
    """
    System-wide target reject rate settings for different modalities.
    This replaces localStorage usage with proper database storage.
    """
    # Target reject rates by modality (as percentages)
    xray_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=8.00,
        verbose_name="X-Ray Target Rate (%)",
        help_text="Target reject rate for X-Ray examinations (default 8%)"
    )
    ct_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=5.00,
        verbose_name="CT Target Rate (%)",
        help_text="Target reject rate for CT examinations (default 5%)"
    )
    mri_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=3.00,
        verbose_name="MRI Target Rate (%)",
        help_text="Target reject rate for MRI examinations (default 3%)"
    )
    ultrasound_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=6.00,
        verbose_name="Ultrasound Target Rate (%)",
        help_text="Target reject rate for Ultrasound examinations (default 6%)"
    )
    mammography_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=4.00,
        verbose_name="Mammography Target Rate (%)",
        help_text="Target reject rate for Mammography examinations (default 4%)"
    )
    overall_target = models.DecimalField(
        max_digits=5, decimal_places=2, default=8.00,
        verbose_name="Overall Target Rate (%)",
        help_text="Overall facility target reject rate (default 8%)"
    )
    
    # Malaysian QAP compliance settings
    drl_compliance_enabled = models.BooleanField(
        default=True,
        verbose_name="DRL Compliance Enabled",
        help_text="Enable Malaysian Diagnostic Reference Level compliance monitoring"
    )
    warning_threshold_multiplier = models.DecimalField(
        max_digits=3, decimal_places=2, default=1.25,
        verbose_name="Warning Threshold Multiplier",
        help_text="Multiplier for warning threshold (e.g., 1.25 = warning at 125% of target)"
    )
    critical_threshold_multiplier = models.DecimalField(
        max_digits=3, decimal_places=2, default=1.50,
        verbose_name="Critical Threshold Multiplier",
        help_text="Multiplier for critical threshold (e.g., 1.50 = critical at 150% of target)"
    )
    
    # Notification settings
    enable_notifications = models.BooleanField(
        default=True,
        verbose_name="Enable Notifications",
        help_text="Enable email notifications when targets are exceeded"
    )
    notification_emails = models.JSONField(
        default=list,
        verbose_name="Notification Email Addresses",
        help_text="List of email addresses to notify when targets are exceeded"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_target_settings',
        help_text="User who created these settings"
    )
    modified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='modified_target_settings',
        help_text="User who last modified these settings"
    )
    
    class Meta:
        verbose_name = "Reject Analysis Target Settings"
        verbose_name_plural = "Reject Analysis Target Settings"
        
    def __str__(self):
        return f"Target Settings - Overall: {self.overall_target}%"
    
    def save(self, *args, **kwargs):
        # Ensure default notification emails if empty
        if not self.notification_emails:
            self.notification_emails = []
        super().save(*args, **kwargs)
    
    def get_target_for_modality(self, modality_name):
        """
        Get target reject rate for a specific modality.
        Returns the overall target if specific modality target not found.
        """
        modality_name = modality_name.upper() if modality_name else ""
        
        # Map modality names to target fields
        modality_mapping = {
            'X-RAY': self.xray_target,
            'XRAY': self.xray_target,
            'XR': self.xray_target,
            'CR': self.xray_target,
            'DX': self.xray_target,
            'CT': self.ct_target,
            'CT SCAN': self.ct_target,
            'MRI': self.mri_target,
            'MR': self.mri_target,
            'US': self.ultrasound_target,
            'ULTRASOUND': self.ultrasound_target,
            'MG': self.mammography_target,
            'MAMMOGRAPHY': self.mammography_target,
            'MAMMO': self.mammography_target,
        }
        
        return modality_mapping.get(modality_name, self.overall_target)
    
    def get_warning_threshold(self, modality_name):
        """Get warning threshold for a specific modality"""
        target = self.get_target_for_modality(modality_name)
        return target * self.warning_threshold_multiplier
    
    def get_critical_threshold(self, modality_name):
        """Get critical threshold for a specific modality"""
        target = self.get_target_for_modality(modality_name)
        return target * self.critical_threshold_multiplier
    
    def assess_reject_rate(self, modality_name, reject_rate):
        """
        Assess reject rate status for a given modality and rate.
        Returns: 'GOOD', 'WARNING', 'CRITICAL'
        """
        target = self.get_target_for_modality(modality_name)
        warning_threshold = self.get_warning_threshold(modality_name)
        critical_threshold = self.get_critical_threshold(modality_name)
        
        if reject_rate <= target:
            return 'GOOD'
        elif reject_rate <= warning_threshold:
            return 'WARNING'
        else:
            return 'CRITICAL'
    
    @classmethod
    def get_current_settings(cls):
        """
        Get the current target settings instance.
        Creates default settings if none exist.
        """
        settings = cls.objects.first()
        if not settings:
            settings = cls.objects.create()
        return settings


# ========== AI REPORTING MODELS ==========

class AIGeneratedReport(auto_prefetch.Model):
    """AI-generated radiology reports with orthanc integration"""
    pemeriksaan = auto_prefetch.ForeignKey(
        Pemeriksaan, 
        on_delete=models.CASCADE,
        related_name='ai_reports',
        help_text="The examination this AI report belongs to"
    )
    
    # AI Model Information
    ai_model_version = models.CharField(
        max_length=50,
        help_text="Version of the AI model used for generation (e.g., 'llava-med-v1.0')"
    )
    ai_model_type = models.CharField(
        max_length=30,
        choices=[
            ('vision_language', 'Vision-Language Model'),
            ('medical_llm', 'Medical LLM'),
            ('ensemble', 'Ensemble Model'),
        ],
        default='vision_language',
        help_text="Type of AI model used"
    )
    
    # Generated Report Content
    generated_report = models.TextField(
        help_text="The complete AI-generated report text"
    )
    report_sections = models.JSONField(
        default=dict,
        help_text="Structured report sections (clinical_history, findings, impression, etc.)"
    )
    
    # AI Confidence and Quality Metrics
    confidence_score = models.FloatField(
        help_text="Overall confidence score from AI model (0.0 to 1.0)"
    )
    section_confidence = models.JSONField(
        default=dict,
        help_text="Confidence scores for each report section"
    )
    quality_metrics = models.JSONField(
        default=dict,
        help_text="Quality assurance metrics from validation models"
    )
    
    # Critical Findings Detection
    critical_findings = models.JSONField(
        default=list,
        help_text="List of critical findings detected by AI"
    )
    critical_findings_confidence = models.FloatField(
        null=True, blank=True,
        help_text="Confidence score for critical findings detection"
    )
    requires_urgent_review = models.BooleanField(
        default=False,
        help_text="Flag indicating if report requires urgent radiologist review"
    )
    
    # Review Status
    review_status = models.CharField(
        max_length=20, 
        choices=[
            ('pending', 'Pending Review'),
            ('in_review', 'Under Review'),
            ('approved', 'Approved'),
            ('modified', 'Modified by Radiologist'),
            ('rejected', 'Rejected')
        ],
        default='pending',
        help_text="Current review status of the AI-generated report"
    )
    
    # Staff Assignments
    reviewed_by = auto_prefetch.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, blank=True,
        related_name='reviewed_ai_reports',
        help_text="Radiologist who reviewed this AI report"
    )
    reviewed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Timestamp when the report was reviewed"
    )
    
    # Final Report Output
    final_report = models.TextField(
        blank=True,
        help_text="Final report text after radiologist review/modification"
    )
    
    # Orthanc PACS Integration
    orthanc_study_id = models.CharField(
        max_length=100, null=True, blank=True,
        help_text="Orthanc study ID for DICOM images used in analysis"
    )
    orthanc_series_ids = models.JSONField(
        default=list,
        help_text="List of Orthanc series IDs analyzed by AI"
    )
    dicom_metadata = models.JSONField(
        default=dict,
        help_text="Relevant DICOM metadata used for analysis"
    )
    
    # Processing Information
    processing_time_seconds = models.FloatField(
        null=True, blank=True,
        help_text="Time taken for AI report generation in seconds"
    )
    processing_errors = models.JSONField(
        default=list,
        help_text="List of errors encountered during processing"
    )
    processing_warnings = models.JSONField(
        default=list,
        help_text="List of warnings from AI processing pipeline"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(auto_prefetch.Model.Meta):
        verbose_name = "AI Generated Report"
        verbose_name_plural = "AI Generated Reports"
        ordering = ['-created']
        indexes = [
            models.Index(fields=['pemeriksaan', 'review_status']),
            models.Index(fields=['ai_model_version', 'confidence_score']),
            models.Index(fields=['orthanc_study_id']),
            models.Index(fields=['requires_urgent_review', 'review_status']),
            models.Index(fields=['created']),
        ]
    
    def __str__(self):
        return f"AI Report - {self.pemeriksaan.no_xray} ({self.review_status})"
    
    def save(self, *args, **kwargs):
        # Auto-set requires_urgent_review based on critical findings
        if self.critical_findings and self.critical_findings_confidence:
            self.requires_urgent_review = (
                len(self.critical_findings) > 0 and 
                self.critical_findings_confidence > 0.8
            )
        super().save(*args, **kwargs)
    
    @property
    def is_completed(self):
        """Check if AI report processing is completed"""
        return self.review_status in ['approved', 'modified']
    
    @property
    def patient_name(self):
        """Get patient name for this report"""
        return self.pemeriksaan.daftar.pesakit.nama
    
    @property
    def examination_type(self):
        """Get examination type"""
        return self.pemeriksaan.exam.exam


class RadiologistReport(auto_prefetch.Model):
    """Collaborative reporting model for radiologist input"""
    ai_report = models.OneToOneField(
        AIGeneratedReport, 
        on_delete=models.CASCADE,
        related_name='radiologist_report',
        help_text="The AI report this radiologist report is based on"
    )
    radiologist = auto_prefetch.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='radiologist_reports',
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
        help_text="Follow-up recommendations and next steps"
    )
    
    # AI Collaboration Metadata
    ai_suggestions_used = models.JSONField(
        default=list,
        help_text="List of AI suggestions that were accepted and used"
    )
    ai_suggestions_modified = models.JSONField(
        default=list,
        help_text="List of AI suggestions that were modified by radiologist"
    )
    ai_suggestions_rejected = models.JSONField(
        default=list,
        help_text="List of AI suggestions that were rejected"
    )
    radiologist_additions = models.TextField(
        blank=True,
        help_text="Additional findings/content added by radiologist"
    )
    
    # Workflow Tracking
    report_start_time = models.DateTimeField(
        auto_now_add=True,
        help_text="When radiologist started working on the report"
    )
    report_completion_time = models.DateTimeField(
        null=True, blank=True,
        help_text="When radiologist completed the report"
    )
    time_saved_estimate = models.IntegerField(
        null=True, blank=True,
        help_text="Estimated time saved using AI assistance (in minutes)"
    )
    
    # Quality and Complexity Metrics
    complexity_level = models.CharField(
        max_length=20, 
        choices=[
            ('routine', 'Routine'),
            ('complex', 'Complex'),
            ('critical', 'Critical')
        ],
        default='routine',
        help_text="Complexity level as assessed by radiologist"
    )
    radiologist_confidence = models.FloatField(
        null=True, blank=True,
        help_text="Radiologist's confidence in final report (0.0 to 1.0)"
    )
    
    # Report Status
    report_status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('in_progress', 'In Progress'),
            ('completed', 'Completed'),
            ('approved', 'Approved'),
            ('archived', 'Archived')
        ],
        default='draft',
        help_text="Current status of the radiologist report"
    )
    
    # Quality Assurance
    peer_review_required = models.BooleanField(
        default=False,
        help_text="Flag indicating if peer review is required"
    )
    peer_reviewer = auto_prefetch.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='peer_reviewed_reports',
        help_text="Peer reviewer for quality assurance"
    )
    peer_review_date = models.DateTimeField(
        null=True, blank=True,
        help_text="Date of peer review completion"
    )
    peer_review_comments = models.TextField(
        blank=True,
        help_text="Comments from peer reviewer"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta(auto_prefetch.Model.Meta):
        verbose_name = "Radiologist Report"
        verbose_name_plural = "Radiologist Reports"
        ordering = ['-created']
        indexes = [
            models.Index(fields=['radiologist', 'report_completion_time']),
            models.Index(fields=['complexity_level', 'radiologist_confidence']),
            models.Index(fields=['report_status']),
            models.Index(fields=['peer_review_required', 'peer_review_date']),
        ]
    
    def __str__(self):
        return f"Report by {self.radiologist.username} - {self.ai_report.pemeriksaan.no_xray}"
    
    def save(self, *args, **kwargs):
        # Auto-set completion time when status changes to completed
        if self.report_status == 'completed' and not self.report_completion_time:
            from django.utils import timezone
            self.report_completion_time = timezone.now()
        
        # Calculate time saved estimate
        if self.report_completion_time and self.time_saved_estimate is None:
            # Simple heuristic: estimate based on AI suggestions used
            ai_suggestions_count = len(self.ai_suggestions_used)
            base_time_saved = min(ai_suggestions_count * 5, 30)  # 5 min per suggestion, max 30 min
            self.time_saved_estimate = base_time_saved
        
        super().save(*args, **kwargs)
    
    @property
    def total_reporting_time(self):
        """Calculate total time spent on reporting"""
        if self.report_completion_time:
            delta = self.report_completion_time - self.report_start_time
            return delta.total_seconds() / 60  # Return in minutes
        return None
    
    @property
    def ai_adoption_rate(self):
        """Calculate percentage of AI suggestions adopted"""
        total_suggestions = (
            len(self.ai_suggestions_used) + 
            len(self.ai_suggestions_modified) + 
            len(self.ai_suggestions_rejected)
        )
        if total_suggestions > 0:
            adopted = len(self.ai_suggestions_used) + len(self.ai_suggestions_modified)
            return (adopted / total_suggestions) * 100
        return 0


class ReportCollaboration(auto_prefetch.Model):
    """Track collaborative interactions between AI and radiologist"""
    radiologist_report = auto_prefetch.ForeignKey(
        RadiologistReport, 
        on_delete=models.CASCADE,
        related_name='collaborations',
        help_text="The radiologist report this collaboration belongs to"
    )
    
    # Interaction Details
    interaction_type = models.CharField(
        max_length=30, 
        choices=[
            ('accept_ai_finding', 'Accepted AI Finding'),
            ('modify_ai_finding', 'Modified AI Finding'),
            ('reject_ai_finding', 'Rejected AI Finding'),
            ('add_new_finding', 'Added New Finding'),
            ('request_ai_second_opinion', 'Requested AI Second Opinion'),
            ('flag_ai_error', 'Flagged AI Error'),
            ('approve_ai_suggestion', 'Approved AI Suggestion'),
        ],
        help_text="Type of collaborative interaction"
    )
    
    # Content of the Interaction
    ai_suggestion = models.TextField(
        help_text="Original AI suggestion or finding"
    )
    radiologist_action = models.TextField(
        help_text="Action taken by radiologist"
    )
    
    # Context Information
    report_section = models.CharField(
        max_length=30,
        choices=[
            ('clinical_history', 'Clinical History'),
            ('technique', 'Technique'),
            ('findings', 'Findings'),
            ('impression', 'Impression'),
            ('recommendations', 'Recommendations'),
        ],
        help_text="Report section where interaction occurred"
    )
    
    # Confidence Tracking
    confidence_before = models.FloatField(
        help_text="AI confidence score before radiologist interaction"
    )
    confidence_after = models.FloatField(
        null=True, blank=True,
        help_text="Updated confidence after radiologist input"
    )
    
    # Learning and Feedback
    feedback_category = models.CharField(
        max_length=20,
        choices=[
            ('correct', 'AI was correct'),
            ('incorrect', 'AI was incorrect'),
            ('incomplete', 'AI was incomplete'),
            ('irrelevant', 'AI was irrelevant'),
            ('helpful', 'AI was helpful'),
        ],
        null=True, blank=True,
        help_text="Radiologist feedback on AI performance"
    )
    
    improvement_suggestion = models.TextField(
        blank=True,
        help_text="Radiologist suggestion for AI improvement"
    )
    
    # Technical Details
    ai_reasoning = models.JSONField(
        default=dict,
        help_text="AI's reasoning for the suggestion (if available)"
    )
    image_regions = models.JSONField(
        default=list,
        help_text="Image regions/coordinates relevant to this interaction"
    )
    
    # Timing
    timestamp = models.DateTimeField(
        auto_now_add=True,
        help_text="When this interaction occurred"
    )
    
    class Meta(auto_prefetch.Model.Meta):
        verbose_name = "Report Collaboration"
        verbose_name_plural = "Report Collaborations"
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['radiologist_report', 'timestamp']),
            models.Index(fields=['interaction_type', 'feedback_category']),
            models.Index(fields=['report_section']),
        ]
    
    def __str__(self):
        return f"{self.interaction_type} - {self.radiologist_report.ai_report.pemeriksaan.no_xray}"


class AIModelPerformance(models.Model):
    """Track AI model performance metrics over time"""
    # Model Information
    model_version = models.CharField(
        max_length=50,
        help_text="AI model version being tracked"
    )
    model_type = models.CharField(
        max_length=30,
        choices=[
            ('vision_language', 'Vision-Language Model'),
            ('medical_llm', 'Medical LLM'),
            ('qa_model', 'Quality Assurance Model'),
            ('ensemble', 'Ensemble Model'),
        ],
        help_text="Type of AI model"
    )
    
    # Time Period
    analysis_date = models.DateField(
        help_text="Date of performance analysis (typically monthly)"
    )
    modality = auto_prefetch.ForeignKey(
        Modaliti,
        on_delete=models.CASCADE,
        null=True, blank=True,
        help_text="Specific modality for this performance analysis"
    )
    
    # Performance Metrics
    total_reports_generated = models.PositiveIntegerField(
        default=0,
        help_text="Total number of reports generated in this period"
    )
    reports_approved_unchanged = models.PositiveIntegerField(
        default=0,
        help_text="Reports approved without any changes"
    )
    reports_modified = models.PositiveIntegerField(
        default=0,
        help_text="Reports modified by radiologists"
    )
    reports_rejected = models.PositiveIntegerField(
        default=0,
        help_text="Reports completely rejected"
    )
    
    # Accuracy Metrics
    accuracy_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="Overall accuracy rate as percentage"
    )
    critical_findings_sensitivity = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="Sensitivity for detecting critical findings"
    )
    false_positive_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="False positive rate as percentage"
    )
    
    # Efficiency Metrics
    average_processing_time = models.FloatField(
        null=True, blank=True,
        help_text="Average processing time in seconds"
    )
    average_time_saved = models.FloatField(
        null=True, blank=True,
        help_text="Average time saved by radiologists in minutes"
    )
    user_satisfaction_score = models.DecimalField(
        max_digits=3, decimal_places=2,
        null=True, blank=True,
        help_text="User satisfaction score (1.0 to 5.0)"
    )
    
    # Technical Metrics
    system_uptime_percentage = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="System uptime percentage for the period"
    )
    error_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="Processing error rate as percentage"
    )
    
    # Comments and Analysis
    performance_notes = models.TextField(
        blank=True,
        help_text="Notes about performance trends and issues"
    )
    improvement_actions = models.TextField(
        blank=True,
        help_text="Actions taken or planned for improvement"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    created_by = auto_prefetch.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        help_text="User who created this performance record"
    )
    
    class Meta:
        verbose_name = "AI Model Performance"
        verbose_name_plural = "AI Model Performance Records"
        ordering = ['-analysis_date', 'model_version']
        constraints = [
            models.UniqueConstraint(
                fields=['model_version', 'analysis_date', 'modality'],
                name='unique_performance_per_model_date_modality'
            )
        ]
        indexes = [
            models.Index(fields=['model_version', 'analysis_date']),
            models.Index(fields=['modality', 'analysis_date']),
        ]
    
    def __str__(self):
        modality_str = f" - {self.modality.nama}" if self.modality else ""
        return f"{self.model_version} - {self.analysis_date.strftime('%B %Y')}{modality_str}"
    
    def save(self, *args, **kwargs):
        # Calculate accuracy rate if not provided
        if not self.accuracy_rate and self.total_reports_generated > 0:
            accurate_reports = self.reports_approved_unchanged + self.reports_modified
            self.accuracy_rate = Decimal(
                (accurate_reports / self.total_reports_generated) * 100
            ).quantize(Decimal('0.01'))
        
        super().save(*args, **kwargs)
    
    @property
    def approval_rate(self):
        """Get the rate of reports approved (with or without modifications)"""
        if self.total_reports_generated > 0:
            approved = self.reports_approved_unchanged + self.reports_modified
            return (approved / self.total_reports_generated) * 100
        return 0
    
    @property
    def modification_rate(self):
        """Get the rate of reports that required modifications"""
        if self.total_reports_generated > 0:
            return (self.reports_modified / self.total_reports_generated) * 100
        return 0


class AIConfiguration(models.Model):
    """Configuration settings for AI reporting system"""
    # Ollama Server Configuration
    ollama_server_url = models.URLField(
        default='http://localhost:11434',
        help_text="URL of the Ollama server"
    )
    
    # Model Configuration
    vision_language_model = models.CharField(
        max_length=100,
        default='llava-med:7b',
        help_text="Vision-language model for image analysis"
    )
    medical_llm_model = models.CharField(
        max_length=100,
        default='meditron:7b',
        help_text="Medical LLM for report generation"
    )
    qa_model = models.CharField(
        max_length=100,
        default='medalpaca:7b',
        help_text="Quality assurance model"
    )
    
    # Processing Configuration
    max_processing_time_seconds = models.PositiveIntegerField(
        default=300,
        help_text="Maximum time allowed for AI processing (seconds)"
    )
    confidence_threshold = models.FloatField(
        default=0.7,
        help_text="Minimum confidence threshold for auto-approval"
    )
    critical_findings_threshold = models.FloatField(
        default=0.8,
        help_text="Confidence threshold for flagging critical findings"
    )
    
    # Quality Assurance Settings
    enable_qa_validation = models.BooleanField(
        default=True,
        help_text="Enable quality assurance validation"
    )
    require_peer_review_critical = models.BooleanField(
        default=True,
        help_text="Require peer review for critical findings"
    )
    auto_approve_routine_reports = models.BooleanField(
        default=False,
        help_text="Auto-approve routine reports above confidence threshold"
    )
    
    # Notification Settings
    notify_on_critical_findings = models.BooleanField(
        default=True,
        help_text="Send notifications for critical findings"
    )
    notification_emails = models.JSONField(
        default=list,
        help_text="Email addresses for notifications"
    )
    
    # System Settings
    enable_ai_reporting = models.BooleanField(
        default=True,
        help_text="Enable AI reporting system"
    )
    maintenance_mode = models.BooleanField(
        default=False,
        help_text="Enable maintenance mode (disable AI processing)"
    )
    
    # Audit fields
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    modified_by = auto_prefetch.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        help_text="User who last modified the configuration"
    )
    
    class Meta:
        verbose_name = "AI Configuration"
        verbose_name_plural = "AI Configurations"
    
    def __str__(self):
        return f"AI Configuration - {self.modified.strftime('%Y-%m-%d %H:%M')}"
    
    def save(self, *args, **kwargs):
        # Ensure only one configuration exists
        if not self.pk:
            AIConfiguration.objects.all().delete()
        super().save(*args, **kwargs)
    
    @classmethod
    def get_current_config(cls):
        """Get the current AI configuration"""
        config = cls.objects.first()
        if not config:
            config = cls.objects.create()
        return config


# ========== MANUAL RADIOLOGY REPORT MODEL ==========

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
    
    class Meta(auto_prefetch.Model.Meta):
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
            self.report_completion_time = timezone.now()
        
        super().save(*args, **kwargs)
