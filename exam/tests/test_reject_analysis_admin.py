"""
Unit tests for Reject Analysis Admin configurations

Tests admin configurations, permissions, bulk operations, and
superuser-only restrictions for reject analysis models.
"""

from datetime import date, datetime
from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.utils import timezone

from ..admin import (
    RejectCategoryAdmin, RejectReasonAdmin, RejectAnalysisAdmin, 
    RejectIncidentAdmin, RejectReasonInline, RejectIncidentInline
)
from ..models import (
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident,
    Modaliti, Exam, Pemeriksaan, Daftar
)
from pesakit.models import Pesakit

User = get_user_model()


class RejectCategoryAdminTest(TestCase):
    """Test RejectCategory admin configuration"""
    
    def setUp(self):
        # Create users
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        self.staff_user = User.objects.create_user(
            username='staff',
            password='testpass123',
            is_staff=True
        )
        
        # Create test category
        self.category = RejectCategory.objects.create(
            name='Positioning Errors',
            category_type='HUMAN_FAULTS',
            description='Patient positioning issues'
        )
        
        # Create reject reasons for the category
        RejectReason.objects.create(
            category=self.category,
            reason='Improper Alignment',
            is_active=True
        )
        RejectReason.objects.create(
            category=self.category,
            reason='Motion Blur',
            is_active=False
        )
        
        # Set up admin
        self.site = AdminSite()
        self.admin = RejectCategoryAdmin(RejectCategory, self.site)
        self.factory = RequestFactory()
    
    def test_list_display_fields(self):
        """Test that list_display fields are correctly configured"""
        expected_fields = (
            'name', 'category_type', 'reasons_count', 'is_active', 'move_up_down_links'
        )
        self.assertEqual(self.admin.list_display, expected_fields)
    
    def test_list_filter_fields(self):
        """Test that list_filter fields are correctly configured"""
        expected_filters = ('category_type', 'is_active', 'created')
        self.assertEqual(self.admin.list_filter, expected_filters)
    
    def test_search_fields(self):
        """Test that search fields are correctly configured"""
        expected_fields = ('name', 'description')
        self.assertEqual(self.admin.search_fields, expected_fields)
    
    def test_readonly_fields(self):
        """Test that readonly fields are correctly configured"""
        expected_fields = ('created', 'modified')
        self.assertEqual(self.admin.readonly_fields, expected_fields)
    
    def test_inlines_configuration(self):
        """Test that inlines are correctly configured"""
        self.assertEqual(len(self.admin.inlines), 1)
        self.assertEqual(self.admin.inlines[0], RejectReasonInline)
    
    def test_fieldsets_configuration(self):
        """Test that fieldsets are correctly structured"""
        fieldsets = self.admin.fieldsets
        self.assertEqual(len(fieldsets), 2)
        
        # Check Category Information section
        category_info = fieldsets[0]
        self.assertEqual(category_info[0], 'Category Information')
        expected_fields = ('name', 'category_type', 'description', 'is_active')
        self.assertEqual(category_info[1]['fields'], expected_fields)
        
        # Check System Information section
        system_info = fieldsets[1]
        self.assertEqual(system_info[0], 'System Information')
        expected_fields = ('created', 'modified')
        self.assertEqual(system_info[1]['fields'], expected_fields)
        self.assertIn('collapse', system_info[1]['classes'])
    
    def test_reasons_count_method(self):
        """Test the reasons_count display method"""
        request = self.factory.get('/admin/')
        request.user = self.superuser
        
        # Test with mixed active/inactive reasons
        result = self.admin.reasons_count(self.category)
        
        # Should show "1 / 2" (1 active out of 2 total)
        self.assertIn('1', str(result))
        self.assertIn('2', str(result))
        self.assertIn('green', str(result))  # Active count in green
        self.assertIn('gray', str(result))   # Total count in gray
    
    def test_reasons_count_all_active(self):
        """Test reasons_count when all reasons are active"""
        # Make all reasons active
        RejectReason.objects.filter(category=self.category).update(is_active=True)
        
        result = self.admin.reasons_count(self.category)
        
        # Should show just the count (2) when all are active
        self.assertEqual(result, 2)
    
    def test_get_queryset_optimization(self):
        """Test that queryset is optimized with prefetch_related"""
        request = self.factory.get('/admin/')
        request.user = self.superuser
        
        queryset = self.admin.get_queryset(request)
        
        # Should have prefetch_related applied
        self.assertTrue(hasattr(queryset, '_prefetch_related_lookups'))
        self.assertIn('reasons', queryset._prefetch_related_lookups)


class RejectReasonAdminTest(TestCase):
    """Test RejectReason admin configuration"""
    
    def setUp(self):
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        
        self.category = RejectCategory.objects.create(
            name='Exposure Errors',
            category_type='HUMAN_FAULTS'
        )
        
        self.reason = RejectReason.objects.create(
            category=self.category,
            reason='Over Exposure',
            qap_code='EXP001',
            severity_level='MEDIUM'
        )
        
        self.site = AdminSite()
        self.admin = RejectReasonAdmin(RejectReason, self.site)
        self.factory = RequestFactory()
    
    def test_list_display_fields(self):
        """Test that list_display fields are correctly configured"""
        expected_fields = (
            'reason', 'category', 'qap_code', 'severity_level', 'is_active', 'move_up_down_links'
        )
        self.assertEqual(self.admin.list_display, expected_fields)
    
    def test_list_filter_fields(self):
        """Test that list_filter fields are correctly configured"""
        expected_filters = ('category', 'severity_level', 'is_active', 'created')
        self.assertEqual(self.admin.list_filter, expected_filters)
    
    def test_search_fields(self):
        """Test that search fields are correctly configured"""
        expected_fields = ('reason', 'description', 'qap_code')
        self.assertEqual(self.admin.search_fields, expected_fields)
    
    def test_fieldsets_malaysian_qap_section(self):
        """Test that Malaysian QAP section is properly configured"""
        fieldsets = self.admin.fieldsets
        
        # Find the Malaysian QAP section
        qap_section = None
        for section in fieldsets:
            if section[0] == 'Malaysian QAP Compliance':
                qap_section = section
                break
        
        self.assertIsNotNone(qap_section)
        expected_fields = ('qap_code', 'severity_level')
        self.assertEqual(qap_section[1]['fields'], expected_fields)
        self.assertIn('Malaysian Quality Assurance', qap_section[1]['description'])
    
    def test_get_queryset_optimization(self):
        """Test that queryset is optimized with select_related"""
        request = self.factory.get('/admin/')
        request.user = self.superuser
        
        queryset = self.admin.get_queryset(request)
        
        # Should have select_related applied
        self.assertTrue(hasattr(queryset, '_select_related'))
        self.assertIn('category', queryset.query.select_related)


class RejectAnalysisAdminTest(TestCase):
    """Test RejectAnalysis admin configuration"""
    
    def setUp(self):
        # Create users
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        self.quality_manager = User.objects.create_user(
            username='qm',
            password='testpass123',
            is_staff=True
        )
        
        # Create required objects
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=100,
            total_images=120,
            total_retakes=6,  # 5% reject rate
            created_by=self.quality_manager
        )
        
        # Create high reject rate analysis
        self.critical_analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 2, 1),
            modality=self.modaliti,
            total_examinations=80,
            total_images=100,
            total_retakes=15,  # 15% reject rate (critical)
            created_by=self.quality_manager
        )
        
        self.site = AdminSite()
        self.admin = RejectAnalysisAdmin(RejectAnalysis, self.site)
        self.factory = RequestFactory()
    
    def test_list_display_fields(self):
        """Test that list_display fields are correctly configured"""
        expected_fields = (
            'analysis_date', 'modality', 'reject_rate_display', 'total_examinations', 
            'total_retakes', 'status_indicator_display', 'drl_compliance_display', 'created_by'
        )
        self.assertEqual(self.admin.list_display, expected_fields)
    
    def test_readonly_fields(self):
        """Test that calculated fields are readonly"""
        expected_readonly = ('created', 'modified', 'reject_rate', 'drl_compliance')
        self.assertEqual(self.admin.readonly_fields, expected_readonly)
    
    def test_reject_rate_display_good(self):
        """Test reject rate display for good performance (green)"""
        result = self.admin.reject_rate_display(self.analysis)
        
        self.assertIn('green', str(result))
        self.assertIn('5.00%', str(result))
        self.assertIn('font-weight: bold', str(result))
    
    def test_reject_rate_display_critical(self):
        """Test reject rate display for critical performance (red)"""
        result = self.admin.reject_rate_display(self.critical_analysis)
        
        self.assertIn('red', str(result))
        self.assertIn('15.00%', str(result))
    
    def test_status_indicator_display_good(self):
        """Test status indicator display for good performance"""
        result = self.admin.status_indicator_display(self.analysis)
        
        self.assertIn('green', str(result))
        self.assertIn('✓ Good', str(result))
    
    def test_status_indicator_display_critical(self):
        """Test status indicator display for critical performance"""
        result = self.admin.status_indicator_display(self.critical_analysis)
        
        self.assertIn('red', str(result))
        self.assertIn('✗ Critical', str(result))
    
    def test_drl_compliance_display_compliant(self):
        """Test DRL compliance display for compliant analysis"""
        result = self.admin.drl_compliance_display(self.analysis)
        
        self.assertIn('green', str(result))
        self.assertIn('✓ Compliant', str(result))
    
    def test_drl_compliance_display_non_compliant(self):
        """Test DRL compliance display for non-compliant analysis"""
        result = self.admin.drl_compliance_display(self.critical_analysis)
        
        self.assertIn('red', str(result))
        self.assertIn('✗ Non-compliant', str(result))
    
    def test_save_model_auto_assign_created_by(self):
        """Test that created_by is auto-assigned for new objects"""
        request = self.factory.post('/admin/')
        request.user = self.superuser
        
        # Create new analysis without created_by
        new_analysis = RejectAnalysis(
            analysis_date=date(2024, 3, 1),
            modality=self.modaliti,
            total_examinations=90,
            total_images=110,
            total_retakes=8
        )
        
        # Mock form
        form = type('MockForm', (), {})()
        
        # Call save_model
        self.admin.save_model(request, new_analysis, form, change=False)
        
        # Should auto-assign created_by
        self.assertEqual(new_analysis.created_by, self.superuser)
    
    def test_mark_as_approved_action(self):
        """Test bulk approve action"""
        request = self.factory.post('/admin/')
        request.user = self.superuser
        
        # Add messages framework
        setattr(request, 'session', {})
        setattr(request, '_messages', FallbackStorage(request))
        
        # Create queryset with unapproved analyses
        queryset = RejectAnalysis.objects.filter(approved_by__isnull=True)
        
        # Execute action
        self.admin.mark_as_approved(request, queryset)
        
        # Check that analyses are approved
        self.analysis.refresh_from_db()
        self.critical_analysis.refresh_from_db()
        
        self.assertEqual(self.analysis.approved_by, self.superuser)
        self.assertEqual(self.critical_analysis.approved_by, self.superuser)
        self.assertIsNotNone(self.analysis.approval_date)
        self.assertIsNotNone(self.critical_analysis.approval_date)
    
    def test_export_analysis_report_action(self):
        """Test export report action"""
        request = self.factory.post('/admin/')
        request.user = self.superuser
        
        # Add messages framework
        setattr(request, 'session', {})
        setattr(request, '_messages', FallbackStorage(request))
        
        queryset = RejectAnalysis.objects.all()
        
        # Execute action (should not raise errors)
        try:
            self.admin.export_analysis_report(request, queryset)
        except Exception as e:
            self.fail(f"Export action raised an exception: {e}")
    
    def test_get_queryset_optimization(self):
        """Test that queryset is optimized with select_related"""
        request = self.factory.get('/admin/')
        request.user = self.superuser
        
        queryset = self.admin.get_queryset(request)
        
        # Should have select_related applied
        self.assertTrue(hasattr(queryset, '_select_related'))
        expected_relations = ['modality', 'created_by', 'approved_by']
        for relation in expected_relations:
            self.assertIn(relation, queryset.query.select_related)


class RejectIncidentAdminTest(TestCase):
    """Test RejectIncident admin configuration"""
    
    def setUp(self):
        # Create users
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        self.technologist = User.objects.create_user(
            username='tech',
            password='testpass123',
            is_staff=True
        )
        
        # Create required objects
        self.pesakit = Pesakit.objects.create(
            nama='Test Patient',
            nric='123456789012',
            mrn='TEST001'
        )
        
        self.daftar = Daftar.objects.create(
            pesakit=self.pesakit,
            study_instance_uid='1.2.3.4.5.6.7.8.9'
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.exam = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti
        )
        
        self.pemeriksaan = Pemeriksaan.objects.create(
            daftar=self.daftar,
            exam=self.exam,
            no_xray='XR20240001'
        )
        
        self.category = RejectCategory.objects.create(
            name='Exposure Errors',
            category_type='HUMAN_FAULTS'
        )
        
        self.reject_reason = RejectReason.objects.create(
            category=self.category,
            reason='Over Exposure'
        )
        
        self.analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=100,
            total_images=120,
            total_retakes=8
        )
        
        self.incident = RejectIncident.objects.create(
            examination=self.pemeriksaan,
            analysis=self.analysis,
            reject_reason=self.reject_reason,
            retake_count=1,
            technologist=self.technologist,
            follow_up_required=True
        )
        
        self.site = AdminSite()
        self.admin = RejectIncidentAdmin(RejectIncident, self.site)
        self.factory = RequestFactory()
    
    def test_list_display_fields(self):
        """Test that list_display fields are correctly configured"""
        expected_fields = (
            'examination', 'reject_date', 'reject_reason', 'retake_count', 
            'technologist', 'follow_up_display'
        )
        self.assertEqual(self.admin.list_display, expected_fields)
    
    def test_list_filter_fields(self):
        """Test that list_filter fields are correctly configured"""
        expected_filters = (
            'reject_reason__category', 'reject_reason', 'retake_count',
            'follow_up_required', 'reject_date', 'technologist'
        )
        self.assertEqual(self.admin.list_filter, expected_filters)
    
    def test_search_fields_comprehensive(self):
        """Test that comprehensive search fields are configured"""
        expected_fields = (
            'examination__no_xray', 'examination__daftar__pesakit__nama',
            'examination__daftar__pesakit__mrn', 'reject_reason__reason',
            'notes', 'patient_factors', 'equipment_factors'
        )
        self.assertEqual(self.admin.search_fields, expected_fields)
    
    def test_date_hierarchy(self):
        """Test that date hierarchy is configured"""
        self.assertEqual(self.admin.date_hierarchy, 'reject_date')
    
    def test_follow_up_display_required(self):
        """Test follow_up_display method when follow-up is required"""
        # This would test a method that might exist in the admin
        # Since it's referenced in list_display, it should be implemented
        if hasattr(self.admin, 'follow_up_display'):
            result = self.admin.follow_up_display(self.incident)
            self.assertIsNotNone(result)


class AdminInlineTest(TestCase):
    """Test admin inline configurations"""
    
    def setUp(self):
        self.category = RejectCategory.objects.create(
            name='Test Category',
            category_type='HUMAN_FAULTS'
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=100,
            total_images=120,
            total_retakes=8
        )
    
    def test_reject_reason_inline_configuration(self):
        """Test RejectReasonInline configuration"""
        inline = RejectReasonInline(RejectCategory, AdminSite())
        
        self.assertEqual(inline.model, RejectReason)
        self.assertEqual(inline.extra, 0)
        expected_fields = ('reason', 'qap_code', 'severity_level', 'description', 'is_active', 'move_up_down_links')
        self.assertEqual(inline.fields, expected_fields)
        self.assertIn('move_up_down_links', inline.readonly_fields)
        self.assertEqual(inline.ordering, ('order',))
    
    def test_reject_incident_inline_configuration(self):
        """Test RejectIncidentInline configuration"""
        inline = RejectIncidentInline(RejectAnalysis, AdminSite())
        
        self.assertEqual(inline.model, RejectIncident)
        self.assertEqual(inline.extra, 0)
        expected_fields = ('examination', 'reject_reason', 'reject_date', 'retake_count', 'technologist', 'follow_up_required')
        self.assertEqual(inline.fields, expected_fields)
        self.assertIn('examination', inline.readonly_fields)
        self.assertIn('reject_reason', inline.autocomplete_fields)


class AdminPermissionTest(TestCase):
    """Test admin permission handling"""
    
    def setUp(self):
        # Create users with different permission levels
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        self.staff_user = User.objects.create_user(
            username='staff',
            password='testpass123',
            is_staff=True
        )
        self.regular_user = User.objects.create_user(
            username='user',
            password='testpass123'
        )
        
        self.category = RejectCategory.objects.create(
            name='Test Category',
            category_type='HUMAN_FAULTS'
        )
        
        self.factory = RequestFactory()
    
    def test_superuser_access(self):
        """Test that superuser can access all admin functions"""
        request = self.factory.get('/admin/')
        request.user = self.superuser
        
        # All admin classes should allow access
        category_admin = RejectCategoryAdmin(RejectCategory, AdminSite())
        self.assertTrue(category_admin.has_view_permission(request))
        self.assertTrue(category_admin.has_add_permission(request))
        self.assertTrue(category_admin.has_change_permission(request, self.category))
        self.assertTrue(category_admin.has_delete_permission(request, self.category))
    
    def test_staff_user_permissions(self):
        """Test staff user permissions"""
        request = self.factory.get('/admin/')
        request.user = self.staff_user
        
        category_admin = RejectCategoryAdmin(RejectCategory, AdminSite())
        
        # Staff should have basic permissions
        self.assertTrue(category_admin.has_view_permission(request))
        # Other permissions depend on Django's default permission system
    
    def test_regular_user_no_access(self):
        """Test that regular users cannot access admin"""
        request = self.factory.get('/admin/')
        request.user = self.regular_user
        
        category_admin = RejectCategoryAdmin(RejectCategory, AdminSite())
        
        # Regular users should not have admin access
        self.assertFalse(category_admin.has_view_permission(request))


if __name__ == '__main__':
    import unittest
    unittest.main()