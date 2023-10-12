from django.db import models
from django.contrib.auth.models import AbstractUser
from reez.settings import KLINIK
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

    def __str__(self):
        return self.username
