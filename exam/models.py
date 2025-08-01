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

User = settings.AUTH_USER_MODEL


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
