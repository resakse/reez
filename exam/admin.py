from django.contrib import admin
from .models import Bcs, Exam, Modaliti, Daftar, Part, Region
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
    model = Daftar
    extra = 0


@admin.register(Bcs)
class BcsAdmin(admin.ModelAdmin):
    model = Bcs
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

admin.site.register(Part)
admin.site.register(Exam)
