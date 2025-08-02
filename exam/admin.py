from django.contrib import admin
from .models import Pemeriksaan, Exam, Modaliti, Daftar, Part, Region, PacsConfig, PacsExam, MediaDistribution
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


@admin.register(MediaDistribution)
class MediaDistributionAdmin(admin.ModelAdmin):
    list_display = [
        'request_date', 'get_patient_name', 'get_patient_mrn', 
        'media_type', 'quantity', 'status', 'urgency', 'collected_by'
    ]
    list_filter = ['status', 'media_type', 'urgency', 'request_date']
    search_fields = [
        'daftar__pesakit__nama', 'daftar__pesakit__mrn', 'collected_by', 
        'collected_by_ic', 'comments'
    ]
    readonly_fields = ['created', 'modified']
    fieldsets = (
        ('Request Information', {
            'fields': ('request_date', 'daftar', 'urgency', 'comments')
        }),
        ('Media Details', {
            'fields': ('media_type', 'quantity', 'status')
        }),
        ('Collection Details', {
            'fields': (
                'collected_by', 'collected_by_ic', 'relationship_to_patient', 
                'collection_datetime'
            )
        }),
        ('Staff Handling', {
            'fields': ('prepared_by', 'handed_over_by')
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        })
    )
    
    def get_patient_name(self, obj):
        return obj.daftar.pesakit.nama
    get_patient_name.short_description = 'Patient Name'
    get_patient_name.admin_order_field = 'daftar__pesakit__nama'
    
    def get_patient_mrn(self, obj):
        return obj.daftar.pesakit.mrn
    get_patient_mrn.short_description = 'MRN'
    get_patient_mrn.admin_order_field = 'daftar__pesakit__mrn'
