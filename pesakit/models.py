from datetime import datetime, date
from django.db import models
from django.urls import reverse
from reez import settings
from custom.katanama import titlecase
User = settings.AUTH_USER_MODEL
harini = datetime.now()


bangsa_list = [
    ('Melayu', 'Melayu'),
    ('Cina', 'Cina'),
    ('India', 'India'),
    ('Lain-Lain', 'Lain-Lain'),
    ('Warga Asing', 'Warga Asing')
]
jantina_list = [
    ('L','Lelaki'),
    ('P','Perempuan')
]

# Create your models here.
class Pesakit(models.Model):
    mrn = models.CharField(verbose_name="MRN", max_length=15, blank=True, null=True)
    nric = models.CharField(
        verbose_name="NRIC",
        help_text="NRIC / Passport",
        max_length=25,
        blank=True,
        null=True,
    )
    nama = models.CharField(max_length=50, null=True, blank=False)
    bangsa = models.CharField(max_length=15, choices=bangsa_list, default='Melayu')
    jantina = models.CharField(max_length=2, choices=jantina_list, default='L')
    umur = models.CharField(max_length=10, blank=True, null=True)
    catatan = models.TextField(blank=True, null=True)

    jxr = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=False)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Pesakit"
        ordering = ["mrn","nric"]
        unique_together = ["mrn", "nric"]

    def __str__(self):
        if self.mrn:
            info = self.mrn
        else:
            info = self.nric

        return f"{info} - {self.nama}"

    def save(self, *args, **kwargs):
        self.nama = titlecase(self.nama)
        if self.mrn:
            self.mrn = self.mrn.upper()
        if self.nric:
            self.nric = self.nric.upper()

        super(Pesakit, self).save(*args, **kwargs)

    @property
    def ic(self):
        ic = self.nric
        return ic.replace("-", "")

    @property
    def t_lahir(self):
        tlahir = self.nric[:6]
        lahir = datetime.strptime(tlahir, "%y%m%d").date()
        return lahir

    @property
    def kira_umur(self):
        lahir = self.t_lahir
        today = date.today()
        return today.year - lahir.year - ((today.month,
                                           today.day) < (lahir.month,
                                                         lahir.day))

    @property
    def cek_jantina(self):
        lastic = self.nric[-1]
        if (int(lastic) % 2) == 0:
            return 'Perempuan'
        return 'Lelaki'