from django.db import models
from django.utils.translation import gettext as _
from django.urls import reverse


# Create your models here.

class Disiplin(models.Model):
    disiplin = models.CharField(_("Disiplin"), max_length=50, unique=True)

    class Meta:
        verbose_name = _("Disiplin")
        verbose_name_plural = _("Disiplin")

    def __str__(self):
        return self.disiplin

    def get_absolute_url(self):
        return reverse("Disiplin_detail", kwargs={"pk": self.pk})


class Ward(models.Model):
    wad = models.CharField(_("Wad"), max_length=50, blank=False, unique=True)
    disiplin = models.ForeignKey("Disiplin", verbose_name=_("Disiplin"), on_delete=models.SET_NULL, blank=True,
                                 null=True)

    class Meta:
        verbose_name = _("Ward")
        verbose_name_plural = _("Wards")

    def __str__(self):
        return self.wad

    # def save(self, *args, **kwargs):
    #     self.wad = self.wad.upper()
    #     super(Ward, self).save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("Ward_detail", kwargs={"pk": self.pk})
