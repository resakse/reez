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

User = settings.AUTH_USER_MODEL


# Create your models here.
class PacsConfig(models.Model):
    orthancurl = models.URLField(verbose_name="Orthanc URL", max_length=200)
    viewrurl = models.URLField(verbose_name="DICOM Viewer URL", max_length=200)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "PACS Configuration"
        verbose_name_plural = "PACS Configurations"

    def __str__(self):
        return f"PACS Config (Last modified: {self.modified})"


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
        if not self.singkatan:
            self.singkatan = self.nama
            self.singkatan = self.singkatan.upper()

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
    exam_code = models.CharField(max_length=15, blank=True, null=True)
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
        self.short_desc = self.short_desc.upper()
        super(Exam, self).save(*args, **kwargs)


lateral_choices = (
    ("Kiri", "Kiri"),
    ("Kanan", "Kanan"),
)


def kiraxray(nombor=None):
    tahun = timezone.now().year
    print(nombor)
    if nombor is not None:
        print("dah ada nombor")
        return nombor
    try:
        lnombor = (
            Pemeriksaan.objects.filter(daftar__tarikh__year=tahun).order_by("-no_xray").first()
        )
        if lnombor is None:
            print("takde nombor")
            latest = "1"
        else:
            print("ada nombor ({})..tambah nombor baru".format(lnombor.no_xray))
            latest = int(lnombor.no_xray[-4:])  # amik last 6 numbor
            latest = latest + 1
            print("nombor baru : ", latest)
    except Pemeriksaan.DoesNotExist:
        print("takde case..set nombor = 1")
        latest = "1"

    print("last check nombor : ", latest)
    latest = str(latest).zfill(4)
    print("tambah 00000 kat nombor : ", latest)
    nombornya = "{}{}{}".format(settings.KLINIKSHORT, tahun, latest)
    print("nombor xray : ", nombornya)
    return nombornya


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

    # MWL Integration fields for CR machine
    study_instance_uid = models.CharField(
        max_length=64, unique=True, blank=True, null=True,
        help_text="Unique identifier for DICOM study"
    )
    accession_number = models.CharField(
        max_length=16, blank=True, null=True,
        help_text="Hospital's unique identifier for the study"
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
    dcatatan = models.CharField(
        verbose_name="Catatan", blank=True, null=True, max_length=20
    )
    jxr = auto_prefetch.ForeignKey(User, verbose_name='Juru X-Ray', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="bcs_jxr"
                                   )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    performed = models.DateTimeField(default=timezone.now, blank=True, null=True)

    class Meta(auto_prefetch.Model.Meta):
        verbose_name_plural = "Pendaftaran Radiologi"
        ordering = [
            "tarikh", 'pesakit'
        ]

    def __str__(self):
        return "{} - {}".format(self.tarikh, self.pesakit.nama)

    def save(self, *args, **kwargs):
        if self.pemohon:
            self.pemohon = titlecase(self.pemohon)
        
        # Generate study_instance_uid if not provided
        if not self.study_instance_uid:
            import uuid
            self.study_instance_uid = str(uuid.uuid4())
        
        # Use no_resit as accession_number if not provided
        if not self.accession_number and self.no_resit:
            self.accession_number = self.no_resit
        
        super(Daftar, self).save(*args, **kwargs)

    def get_absolute_url(self):
        return ''
        return reverse("bcs:exam-detail", args=[self.pk])

    def get_komen_url(self):
        return ''
        return reverse("bcs:exam-komen", args=[self.pk])


class Pemeriksaan(auto_prefetch.Model):
    daftar = auto_prefetch.ForeignKey(Daftar, on_delete=models.CASCADE, related_name='pemeriksaan')
    no_xray = models.CharField(
        verbose_name="No. X-Ray", blank=True, null=True, max_length=20
    )
    exam = auto_prefetch.ForeignKey(Exam, on_delete=models.CASCADE)
    laterality = models.CharField(
        choices=lateral_choices, blank=True, null=True, max_length=10
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
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta(auto_prefetch.Model.Meta):
        verbose_name_plural = 'Pemeriksaan'
        ordering = ['daftar', 'no_xray']

    def __str__(self):
        return self.no_xray

    def save(self, *args, **kwargs):
        nombor = kiraxray(self.no_xray)
        print(nombor)
        self.no_xray = nombor
        super(Pemeriksaan, self).save(*args, **kwargs)


class PacsExam(models.Model):
    exam = models.OneToOneField(Pemeriksaan, on_delete=models.CASCADE)
    orthanc_id = models.CharField(max_length=100, blank=True, null=True)
    study_id = models.CharField(max_length=100, blank=True, null=True)
    study_instance = models.CharField(max_length=100, blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Pacs Item'

    def __str__(self):
        return self.orthanc_id
