from django.contrib import admin
from .models import Pemeriksaan, Exam, Modaliti, Daftar, Part, Region, PacsConfig, PacsExam
from ordered_model.admin import (
    OrderedModelAdmin,
    OrderedTabularInline,
    OrderedInlineModelAdminMixin,
)
# Register your models here.


class ExamInline(admin.TabularInline):
    model = Exam
    extra = 0


class RegisterInline(admin.TabularInline):
    model = Pemeriksaan
    extra = 0


@admin.register(Daftar)
class BcsAdmin(admin.ModelAdmin):
    model = Daftar
    inlines = [
        RegisterInline,
    ]


@admin.register(Modaliti)
class ModalitiAdmin(admin.ModelAdmin):
    model = Modaliti
    list_display = ["singkatan", "nama", "detail"]


@admin.register(Region)
class RegionAdmin(OrderedModelAdmin):
    list_display = ("jenis", "bahagian", "move_up_down_links")


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    model = Exam
    list_display = ['exam','part','modaliti','statistik']

admin.site.register(Part)
admin.site.register(PacsExam)


@admin.register(PacsConfig)
class PacsConfigAdmin(admin.ModelAdmin):
    list_display = ['orthancurl', 'viewrurl', 'modified']
    readonly_fields = ['created', 'modified']
