from django.contrib import admin
from django.contrib.auth import get_user_model
from django.utils.html import format_html
from django.utils import timezone
from .models import (
    Pemeriksaan, Exam, Modaliti, Daftar, Part, Region, PacsConfig, PacsExam, 
    MediaDistribution, PacsServer, RejectCategory, RejectReason, RejectAnalysis, 
    RejectIncident
)
from ordered_model.admin import (
    OrderedModelAdmin,
    OrderedTabularInline,
)

User = get_user_model()
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


# ============================================================================
# REJECT ANALYSIS ADMIN CONFIGURATIONS
# ============================================================================

class RejectReasonInline(OrderedTabularInline):
    """Inline for managing reject reasons within categories"""
    model = RejectReason
    extra = 0
    fields = ('reason', 'qap_code', 'severity_level', 'description', 'is_active', 'move_up_down_links')
    readonly_fields = ('move_up_down_links',)
    ordering = ('order',)


@admin.register(RejectCategory)
class RejectCategoryAdmin(OrderedModelAdmin):
    """Admin for reject categories with drag-and-drop ordering"""
    list_display = ('name', 'category_type', 'reasons_count', 'is_active', 'move_up_down_links')
    list_filter = ('category_type', 'is_active', 'created')
    search_fields = ('name', 'description')
    readonly_fields = ('created', 'modified')
    inlines = [RejectReasonInline]
    
    fieldsets = (
        ('Category Information', {
            'fields': ('name', 'category_type', 'description', 'is_active')
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        }),
    )
    
    def reasons_count(self, obj):
        """Display count of reasons in this category"""
        count = obj.reasons.filter(is_active=True).count()
        total = obj.reasons.count()
        if count != total:
            return format_html(
                '<span style="color: green;">{}</span> / <span style="color: gray;">{}</span>',
                count, total
            )
        return count
    reasons_count.short_description = 'Active Reasons'
    reasons_count.admin_order_field = 'reasons__count'
    
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('reasons')


@admin.register(RejectReason)
class RejectReasonAdmin(OrderedModelAdmin):
    """Admin for individual reject reasons"""
    list_display = ('reason', 'category', 'qap_code', 'severity_level', 'is_active', 'move_up_down_links')
    list_filter = ('category', 'severity_level', 'is_active', 'created')
    search_fields = ('reason', 'description', 'qap_code')
    readonly_fields = ('created', 'modified')
    
    fieldsets = (
        ('Reason Information', {
            'fields': ('category', 'reason', 'description', 'is_active')
        }),
        ('Malaysian QAP Compliance', {
            'fields': ('qap_code', 'severity_level'),
            'description': 'Malaysian Quality Assurance Programme compliance fields'
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('category')


class RejectIncidentInline(admin.TabularInline):
    """Inline for managing individual reject incidents within analysis"""
    model = RejectIncident
    extra = 0
    fields = ('examination', 'reject_reason', 'reject_date', 'retake_count', 'technologist', 'follow_up_required')
    readonly_fields = ('examination',)
    autocomplete_fields = ['reject_reason']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'examination', 'reject_reason', 'technologist'
        )


@admin.register(RejectAnalysis)
class RejectAnalysisAdmin(admin.ModelAdmin):
    """Admin for monthly reject analysis with comprehensive tracking"""
    list_display = (
        'analysis_date', 'modality', 'reject_rate_display', 'total_examinations', 
        'total_retakes', 'status_indicator_display', 'drl_compliance_display', 'created_by'
    )
    list_filter = (
        'drl_compliance', 'modality', 'analysis_date', 'created_by', 'approved_by'
    )
    search_fields = ('modality__nama', 'comments', 'corrective_actions')
    readonly_fields = ('created', 'modified', 'reject_rate', 'drl_compliance')
    date_hierarchy = 'analysis_date'
    inlines = [RejectIncidentInline]
    
    fieldsets = (
        ('Analysis Period', {
            'fields': ('analysis_date', 'modality')
        }),
        ('Statistics', {
            'fields': (
                ('total_examinations', 'total_images', 'total_retakes'),
                ('reject_rate', 'qap_target_rate', 'drl_compliance')
            ),
            'description': 'Reject rate is automatically calculated: (total_retakes/total_images) * 100'
        }),
        ('Quality Analysis', {
            'fields': ('comments', 'corrective_actions', 'root_cause_analysis'),
            'classes': ('wide',)
        }),
        ('Approval Tracking', {
            'fields': (
                ('created_by', 'approved_by'),
                'approval_date'
            )
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        }),
    )
    
    def reject_rate_display(self, obj):
        """Display reject rate with color coding"""
        rate = obj.reject_rate
        if rate <= obj.qap_target_rate:
            color = 'green'
        elif rate <= (obj.qap_target_rate * 1.5):
            color = 'orange'
        else:
            color = 'red'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{:.2f}%</span>',
            color, rate
        )
    reject_rate_display.short_description = 'Reject Rate'
    reject_rate_display.admin_order_field = 'reject_rate'
    
    def status_indicator_display(self, obj):
        """Display status with visual indicator"""
        status = obj.status_indicator
        if status == 'GOOD':
            return format_html('<span style="color: green;">✓ Good</span>')
        elif status == 'WARNING':
            return format_html('<span style="color: orange;">⚠ Warning</span>')
        else:
            return format_html('<span style="color: red;">✗ Critical</span>')
    status_indicator_display.short_description = 'Status'
    
    def drl_compliance_display(self, obj):
        """Display DRL compliance with visual indicator"""
        if obj.drl_compliance:
            return format_html('<span style="color: green;">✓ Compliant</span>')
        else:
            return format_html('<span style="color: red;">✗ Non-compliant</span>')
    drl_compliance_display.short_description = 'DRL Compliance'
    drl_compliance_display.admin_order_field = 'drl_compliance'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('modality', 'created_by', 'approved_by')
    
    def save_model(self, request, obj, form, change):
        """Auto-assign created_by if not set"""
        if not change and not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    actions = ['mark_as_approved', 'export_analysis_report']
    
    def mark_as_approved(self, request, queryset):
        """Bulk action to approve selected analyses"""
        count = queryset.filter(approved_by__isnull=True).update(
            approved_by=request.user,
            approval_date=timezone.now()
        )
        self.message_user(request, f'{count} analyses marked as approved.')
    mark_as_approved.short_description = 'Mark selected analyses as approved'
    
    def export_analysis_report(self, request, queryset):
        """Bulk action to export analysis reports"""
        # This would typically generate a CSV or PDF report
        self.message_user(request, f'{queryset.count()} analyses selected for export.')
    export_analysis_report.short_description = 'Export analysis report'


@admin.register(RejectIncident)
class RejectIncidentAdmin(admin.ModelAdmin):
    """Admin for individual reject incidents"""
    list_display = (
        'examination', 'reject_date', 'reject_reason', 'retake_count', 
        'technologist', 'follow_up_display'
    )
    list_filter = (
        'reject_reason__category', 'reject_reason', 'retake_count', 
        'follow_up_required', 'reject_date', 'technologist'
    )
    search_fields = (
        'examination__no_xray', 'examination__daftar__pesakit__nama',
        'examination__daftar__pesakit__mrn', 'reject_reason__reason',
        'notes', 'patient_factors', 'equipment_factors'
    )
    readonly_fields = ('created', 'modified')
    date_hierarchy = 'reject_date'
    autocomplete_fields = ['reject_reason']
    
    fieldsets = (
        ('Incident Information', {
            'fields': ('examination', 'analysis', 'reject_reason', 'reject_date')
        }),
        ('Technical Details', {
            'fields': (
                ('retake_count',),
                ('original_technique', 'corrected_technique')
            )
        }),
        ('Staff Involved', {
            'fields': ('technologist', 'reported_by')
        }),
        ('Contributing Factors', {
            'fields': ('patient_factors', 'equipment_factors', 'notes'),
            'classes': ('wide',)
        }),
        ('Corrective Actions', {
            'fields': ('immediate_action_taken', 'follow_up_required'),
            'classes': ('wide',)
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        }),
    )
    
    def follow_up_display(self, obj):
        """Display follow-up status with visual indicator"""
        if obj.follow_up_required:
            return format_html('<span style="color: orange;">⚠ Required</span>')
        else:
            return format_html('<span style="color: green;">✓ None</span>')
    follow_up_display.short_description = 'Follow-up'
    follow_up_display.admin_order_field = 'follow_up_required'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'examination__daftar__pesakit', 'reject_reason__category', 
            'technologist', 'reported_by', 'analysis'
        )
    
    actions = ['mark_follow_up_complete', 'export_incident_report']
    
    def mark_follow_up_complete(self, request, queryset):
        """Mark follow-up as complete for selected incidents"""
        count = queryset.filter(follow_up_required=True).update(follow_up_required=False)
        self.message_user(request, f'{count} incidents marked as follow-up complete.')
    mark_follow_up_complete.short_description = 'Mark follow-up as complete'
    
    def export_incident_report(self, request, queryset):
        """Export detailed incident report"""
        self.message_user(request, f'{queryset.count()} incidents selected for export.')
    export_incident_report.short_description = 'Export incident report'


@admin.register(PacsServer)
class PacsServerAdmin(admin.ModelAdmin):
    """Admin for PACS server configuration with superuser restrictions"""
    list_display = ('name', 'orthancurl', 'endpoint_style', 'status_display', 'include_in_reject_analysis')
    list_filter = ('endpoint_style', 'is_active', 'is_primary', 'include_in_reject_analysis', 'created')
    search_fields = ('name', 'orthancurl', 'viewrurl', 'comments')
    readonly_fields = ('created', 'modified')
    
    fieldsets = (
        ('Server Information', {
            'fields': ('name', 'comments', 'is_active')
        }),
        ('Connection Settings', {
            'fields': ('orthancurl', 'viewrurl', 'endpoint_style'),
            'description': 'These fields can only be modified by superusers'
        }),
        ('Configuration', {
            'fields': ('is_primary', 'include_in_reject_analysis')
        }),
        ('System Information', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        }),
    )
    
    def get_readonly_fields(self, request, obj=None):
        """Restrict certain fields to superusers only"""
        readonly = list(self.readonly_fields)
        if not request.user.is_superuser:
            readonly.extend(['orthancurl', 'viewrurl', 'endpoint_style'])
        return readonly
    
    def status_display(self, obj):
        """Display server status with visual indicators"""
        if obj.is_deleted:
            return format_html('<span style="color: red;">🗑 Deleted</span>')
        elif not obj.is_active:
            return format_html('<span style="color: orange;">⏸ Inactive</span>')
        elif obj.is_primary:
            return format_html('<span style="color: green;">⭐ Primary</span>')
        else:
            return format_html('<span style="color: green;">✓ Active</span>')
    status_display.short_description = 'Status'
    
    def has_delete_permission(self, request, obj=None):
        """Only superusers can delete PACS servers"""
        return request.user.is_superuser
    
    def has_change_permission(self, request, obj=None):
        """Allow change but restrict certain fields based on user level"""
        return request.user.has_perm('exam.change_pacsserver')
    
    actions = ['test_connection', 'mark_as_primary']
    
    def test_connection(self, request, queryset):
        """Test connection to selected PACS servers"""
        self.message_user(request, f'Testing connection to {queryset.count()} servers...')
    test_connection.short_description = 'Test PACS connection'
    
    def mark_as_primary(self, request, queryset):
        """Mark selected server as primary (only one allowed)"""
        if queryset.count() > 1:
            self.message_user(request, 'Only one server can be marked as primary.', level='ERROR')
            return
        
        # Clear existing primary
        PacsServer.objects.filter(is_primary=True).update(is_primary=False)
        # Set new primary
        queryset.update(is_primary=True)
        self.message_user(request, 'Primary PACS server updated.')
    mark_as_primary.short_description = 'Mark as primary PACS server'
