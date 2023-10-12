from django.db import models
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from wad.models import Ward

from reez import settings
from custom.katanama import titlecase
from ordered_model.models import OrderedModel

User = settings.AUTH_USER_MODEL


# Create your models here.
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


class Exam(models.Model):
    status_choices = (
        ("ENABLE", "Enable"),
        ("DISABLE", "Disable"),
    )
    exam = models.CharField(max_length=50)
    exam_code = models.CharField(max_length=15, blank=True, null=True)
    part = models.ForeignKey(Part, on_delete=models.SET_NULL, null=True, blank=True)
    modaliti = models.ForeignKey(Modaliti, on_delete=models.CASCADE)
    catatan = models.CharField(max_length=200, blank=True, null=True)
    short_desc = models.CharField(max_length=50, blank=True, null=True)
    contrast = models.BooleanField(default=False)
    statistik = models.ForeignKey(
        Region, on_delete=models.SET_NULL, null=True, blank=True
    )
    status_ca = models.CharField(
        max_length=10, choices=status_choices, default="ENABLE"
    )

    class Meta:
        verbose_name_plural = "Pemeriksaan"
        unique_together = ["exam", "part", "modaliti"]
        ordering = ["modaliti", "part", "exam"]

    def __str__(self):
        # return '{} - {}'.format(self.modaliti,self.exam)
        return self.exam


class Bcs(models.Model):
    tarikh = models.DateTimeField(default=timezone.now)
    mrn = models.CharField(verbose_name="MRN", max_length=15, blank=True, null=True)
    nric = models.CharField(
        verbose_name="NRIC",
        help_text="NRIC / Passport Jika Tiada AM",
        max_length=25,
        blank=True,
        null=True,
    )
    nama = models.CharField(max_length=30, null=True, blank=False)
    ward = models.ForeignKey(Ward, on_delete=models.SET_NULL, null=True, blank=True)
    pemohon = models.CharField(max_length=30, null=True, blank=True)

    mo = models.CharField(
        verbose_name="MO",
        max_length=30,
        help_text="MO Radiologi",
        blank=True,
        null=True,
    )
    radiologist = models.CharField(max_length=30, blank=True, null=True)

    catatan = models.TextField(blank=True, null=True)

    jxr = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=False)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "BCS"
        ordering = ["-tarikh"]
        unique_together = ["tarikh", "mrn", "nric"]

    def __str__(self):
        if self.mrn:
            info = self.mrn
        else:
            info = self.nric

        return f"{self.tarikh} - {info}"

    def save(self, *args, **kwargs):
        self.nama = titlecase(self.nama)
        self.mrn = self.mrn.upper()
        if self.mo:
            self.mo = titlecase(self.mo)
        if self.pemohon:
            self.pemohon = titlecase(self.pemohon)
        if self.radiologist:
            self.radiologist = titlecase(self.radiologist)
        super(Bcs, self).save(*args, **kwargs)


lateral_choices = (
    ("Left", "Left"),
    ("Right", "Right"),
)


def noxray(nombor=None):
    tahun = timezone.now().year
    print(nombor)
    if nombor is not None:
        print("dah ada nombor")
        return nombor
    try:
        lnombor = (
            Daftar.objects.filter(bcs__tarikh__year=tahun).order_by("-nobcs").first()
        )
        if lnombor is None:
            print("takde nombor")
            latest = "1"
        else:
            print("ada nombor ({})..tambah nombor baru".format(lnombor.nobcs))
            latest = int(lnombor.nobcs[-4:])  # amik last 6 numbor
            latest = latest + 1
            print("nombor baru : ", latest)
    except Bcs.DoesNotExist:
        print("takde case..set nombor = 1")
        latest = "1"

    print("last check nombor : ", latest)
    latest = str(latest).zfill(4)
    print("tambah 00000 kat nombor : ", latest)
    nombornya = "{}{}{}".format(settings.KLINIKSHORT, tahun, latest)
    print("nombor xray : ", nombornya)
    return nombornya


class Daftar(models.Model):
    nobcs = models.CharField(
        verbose_name="No. X-Ray", blank=True, null=True, max_length=20
    )
    bcs = models.ForeignKey(Bcs, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    laterality = models.CharField(
        choices=lateral_choices, blank=True, null=True, max_length=10
    )
    merged = models.BooleanField(default=False)
    jxr = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="bcs_jxr"
    )
    dcatatan = models.CharField(
        verbose_name="Catatan", blank=True, null=True, max_length=20
    )
    merge_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="bcs_merge"
    )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Pendaftaran BCS"
        ordering = [
            "nobcs",
        ]

    def save(self, *args, **kwargs):
        nombor = noxray(self.nobcs)
        print(nombor)
        self.nobcs = nombor
        super(Daftar, self).save(*args, **kwargs)

    def __str__(self):
        return "{} - {}".format(self.nobcs, self.exam)

    def get_absolute_url(self):
        return reverse("bcs:exam-detail", args=[self.pk])

    def get_komen_url(self):
        return reverse("bcs:exam-komen", args=[self.pk])
