from django.db import models
from django.contrib.auth.models import AbstractUser
from reez.settings import KLINIK
from custom.katanama import titlecase
# Create your models here.

jawatan_choices = [
    ('Juru X-Ray', 'Juru X-Ray'),
    ('Pegawai Perubatan', 'Pegawai Perubatan'),
    ('Penolong Pegawai Perubatan', 'Penolong Pegawai Perubatan'),
    ('Jururawat', 'Jururawat'),
]


class Staff(AbstractUser):
    jawatan = models.CharField(max_length=40, choices=jawatan_choices, default='Juru X-Ray')
    klinik = models.CharField(max_length=50, default=KLINIK)

    komen = models.CharField(max_length=200, blank=True, null=True)
    jxr = models.CharField(max_length=150, blank=True, null=True)
    kemaskini = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.username

    def nama(self):
        return f'{self.first_name} {self.last_name}'

    def save(self, *args, **kwargs):
        if self.first_name:
            self.first_name = titlecase(self.first_name)
        if self.last_name:
            self.last_name = titlecase(self.last_name)

        super(Staff, self).save(*args, **kwargs)
