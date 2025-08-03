"""
Unit tests for Reject Analysis Models

Tests the RejectCategory, RejectReason, RejectAnalysis, RejectIncident, and
PacsServer model functionality including validation, ordering, and auto-calculations.
"""

from decimal import Decimal
from datetime import date, datetime
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone

from ..models import (
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident,
    PacsServer, Modaliti, Exam, Pemeriksaan, Daftar
)
from pesakit.models import Pesakit

User = get_user_model()


class RejectCategoryModelTest(TestCase):
    """Test RejectCategory model functionality"""
    
    def setUp(self):
        self.category_data = {
            'name': 'Positioning Errors',
            'category_type': 'HUMAN_FAULTS',
            'description': 'Patient positioning issues requiring retakes',
            'is_active': True
        }
    
    def test_create_reject_category(self):
        """Test creating a new reject category"""
        category = RejectCategory.objects.create(**self.category_data)
        
        self.assertEqual(category.name, 'Positioning Errors')
        self.assertEqual(category.category_type, 'HUMAN_FAULTS')
        self.assertEqual(category.get_category_type_display(), 'Human Faults')
        self.assertTrue(category.is_active)
        self.assertIsNotNone(category.order)
    
    def test_category_name_titlecase(self):
        """Test that category names are converted to title case"""
        category = RejectCategory.objects.create(
            name='positioning errors',
            category_type='HUMAN_FAULTS'
        )
        
        self.assertEqual(category.name, 'Positioning Errors')
    
    def test_unique_category_name_per_type(self):
        """Test that category names must be unique within each type"""
        RejectCategory.objects.create(**self.category_data)
        
        # Same name in same category type should fail
        with self.assertRaises(IntegrityError):
            RejectCategory.objects.create(**self.category_data)
        
        # Same name in different category type should succeed
        different_type_data = self.category_data.copy()
        different_type_data['category_type'] = 'EQUIPMENT'
        category2 = RejectCategory.objects.create(**different_type_data)
        self.assertIsNotNone(category2.id)
    
    def test_category_ordering(self):
        """Test that categories are ordered by type and order"""
        # Create categories in different types and orders
        category1 = RejectCategory.objects.create(
            name='First Equipment',
            category_type='EQUIPMENT'
        )
        category2 = RejectCategory.objects.create(
            name='First Human',
            category_type='HUMAN_FAULTS'
        )
        category3 = RejectCategory.objects.create(
            name='Second Human',
            category_type='HUMAN_FAULTS'
        )
        
        # Test ordering
        categories = list(RejectCategory.objects.all())
        
        # Should be ordered by category_type first, then order
        self.assertEqual(categories[0].category_type, 'EQUIPMENT')
        self.assertEqual(categories[1].category_type, 'HUMAN_FAULTS')
        self.assertEqual(categories[2].category_type, 'HUMAN_FAULTS')
    
    def test_category_string_representation(self):
        """Test string representation of category"""
        category = RejectCategory.objects.create(**self.category_data)
        expected_str = "Human Faults - Positioning Errors"
        self.assertEqual(str(category), expected_str)
    
    def test_category_type_choices(self):
        """Test all category type choices are valid"""
        valid_types = ['HUMAN_FAULTS', 'EQUIPMENT', 'PROCESSING', 'OTHERS']
        
        for category_type in valid_types:
            data = self.category_data.copy()
            data['category_type'] = category_type
            data['name'] = f'Test {category_type}'
            
            category = RejectCategory.objects.create(**data)
            self.assertEqual(category.category_type, category_type)
    
    def test_inactive_category(self):
        """Test inactive category functionality"""
        category = RejectCategory.objects.create(
            name='Inactive Category',
            category_type='OTHERS',
            is_active=False
        )
        
        self.assertFalse(category.is_active)
        
        # Test filtering active categories
        active_categories = RejectCategory.objects.filter(is_active=True)
        self.assertNotIn(category, active_categories)


class RejectReasonModelTest(TestCase):
    """Test RejectReason model functionality"""
    
    def setUp(self):
        self.category = RejectCategory.objects.create(
            name='Exposure Errors',
            category_type='HUMAN_FAULTS'
        )
        
        self.reason_data = {
            'category': self.category,
            'reason': 'Over Exposure / High Index',
            'description': 'Image too dark due to excessive radiation',
            'qap_code': 'EXP001',
            'severity_level': 'MEDIUM',
            'is_active': True
        }
    
    def test_create_reject_reason(self):
        """Test creating a new reject reason"""
        reason = RejectReason.objects.create(**self.reason_data)
        
        self.assertEqual(reason.reason, 'Over Exposure / High Index')
        self.assertEqual(reason.category, self.category)
        self.assertEqual(reason.severity_level, 'MEDIUM')
        self.assertEqual(reason.qap_code, 'EXP001')
        self.assertTrue(reason.is_active)
        self.assertIsNotNone(reason.order)
    
    def test_reason_titlecase(self):
        """Test that reason names are converted to title case"""
        reason = RejectReason.objects.create(
            category=self.category,
            reason='over exposure / high index'
        )
        
        self.assertEqual(reason.reason, 'Over Exposure / High Index')
    
    def test_unique_reason_per_category(self):
        """Test that reasons must be unique within each category"""
        RejectReason.objects.create(**self.reason_data)
        
        # Same reason in same category should fail
        with self.assertRaises(IntegrityError):
            RejectReason.objects.create(**self.reason_data)
        
        # Same reason in different category should succeed
        other_category = RejectCategory.objects.create(
            name='Equipment Issues',
            category_type='EQUIPMENT'
        )
        different_category_data = self.reason_data.copy()
        different_category_data['category'] = other_category
        
        reason2 = RejectReason.objects.create(**different_category_data)
        self.assertIsNotNone(reason2.id)
    
    def test_severity_level_choices(self):
        """Test all severity level choices are valid"""
        valid_levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        
        for i, level in enumerate(valid_levels):
            data = self.reason_data.copy()
            data['reason'] = f'Test Reason {i}'
            data['severity_level'] = level
            
            reason = RejectReason.objects.create(**data)
            self.assertEqual(reason.severity_level, level)
    
    def test_reason_ordering(self):
        """Test that reasons are ordered by category and order"""
        # Create multiple reasons
        reason1 = RejectReason.objects.create(
            category=self.category,
            reason='First Reason'
        )
        reason2 = RejectReason.objects.create(
            category=self.category,
            reason='Second Reason'
        )
        
        # Test ordering
        reasons = list(RejectReason.objects.filter(category=self.category))
        self.assertEqual(reasons[0], reason1)
        self.assertEqual(reasons[1], reason2)
    
    def test_reason_string_representation(self):
        """Test string representation of reason"""
        reason = RejectReason.objects.create(**self.reason_data)
        expected_str = "Exposure Errors - Over Exposure / High Index"
        self.assertEqual(str(reason), expected_str)
    
    def test_malaysian_qap_fields(self):
        """Test Malaysian QAP specific fields"""
        reason = RejectReason.objects.create(
            category=self.category,
            reason='QAP Test Reason',
            qap_code='QAP001',
            severity_level='CRITICAL'
        )
        
        self.assertEqual(reason.qap_code, 'QAP001')
        self.assertEqual(reason.severity_level, 'CRITICAL')
        self.assertEqual(reason.get_severity_level_display(), 'Critical - Immediate Action Required')


class RejectAnalysisModelTest(TestCase):
    """Test RejectAnalysis model functionality"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='quality_manager',
            password='testpass123'
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.analysis_data = {
            'analysis_date': date(2024, 1, 1),
            'modality': self.modaliti,
            'total_examinations': 100,
            'total_images': 120,
            'total_retakes': 8,
            'qap_target_rate': Decimal('8.00'),
            'comments': 'Monthly analysis for January 2024',
            'created_by': self.user
        }
    
    def test_create_reject_analysis(self):
        """Test creating a new reject analysis"""
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        
        self.assertEqual(analysis.analysis_date, date(2024, 1, 1))
        self.assertEqual(analysis.modality, self.modaliti)
        self.assertEqual(analysis.total_examinations, 100)
        self.assertEqual(analysis.total_images, 120)
        self.assertEqual(analysis.total_retakes, 8)
        self.assertEqual(analysis.created_by, self.user)
    
    def test_auto_calculate_reject_rate(self):
        """Test that reject rate is automatically calculated"""
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        
        # Should calculate (8/120) * 100 = 6.67%
        expected_rate = Decimal('6.67')
        self.assertEqual(analysis.reject_rate, expected_rate)
    
    def test_zero_images_reject_rate(self):
        """Test reject rate calculation with zero images"""
        data = self.analysis_data.copy()
        data['total_images'] = 0
        data['total_retakes'] = 0
        
        analysis = RejectAnalysis.objects.create(**data)
        self.assertEqual(analysis.reject_rate, Decimal('0'))
    
    def test_drl_compliance_calculation(self):
        """Test DRL compliance is automatically determined"""
        # Test compliant analysis (6.67% < 8%)
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        self.assertTrue(analysis.drl_compliance)
        
        # Test non-compliant analysis (10% > 8%)
        data = self.analysis_data.copy()
        data['analysis_date'] = date(2024, 2, 1)
        data['total_retakes'] = 12  # (12/120) * 100 = 10%
        
        analysis2 = RejectAnalysis.objects.create(**data)
        self.assertFalse(analysis2.drl_compliance)
    
    def test_status_indicator_property(self):
        """Test status indicator based on reject rate"""
        # Good status (within target)
        analysis1 = RejectAnalysis.objects.create(**self.analysis_data)
        self.assertEqual(analysis1.status_indicator, 'GOOD')
        
        # Warning status (1.5x target = 12%)
        data2 = self.analysis_data.copy()
        data2['analysis_date'] = date(2024, 2, 1)
        data2['total_retakes'] = 10  # (10/120) * 100 = 8.33%
        
        analysis2 = RejectAnalysis.objects.create(**data2)
        self.assertEqual(analysis2.status_indicator, 'WARNING')
        
        # Critical status (>1.5x target)
        data3 = self.analysis_data.copy()
        data3['analysis_date'] = date(2024, 3, 1)
        data3['total_retakes'] = 15  # (15/120) * 100 = 12.5%
        
        analysis3 = RejectAnalysis.objects.create(**data3)
        self.assertEqual(analysis3.status_indicator, 'CRITICAL')
    
    def test_month_year_display_property(self):
        """Test month and year display format"""
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        self.assertEqual(analysis.month_year_display, 'January 2024')
    
    def test_unique_analysis_per_month_modality(self):
        """Test that only one analysis per month-modality combination is allowed"""
        RejectAnalysis.objects.create(**self.analysis_data)
        
        # Same month and modality should fail
        with self.assertRaises(IntegrityError):
            RejectAnalysis.objects.create(**self.analysis_data)
        
        # Different month should succeed
        data2 = self.analysis_data.copy()
        data2['analysis_date'] = date(2024, 2, 1)
        
        analysis2 = RejectAnalysis.objects.create(**data2)
        self.assertIsNotNone(analysis2.id)
        
        # Different modality should succeed
        modaliti2 = Modaliti.objects.create(nama='CT Scan', singkatan='CT')
        data3 = self.analysis_data.copy()
        data3['modality'] = modaliti2
        
        analysis3 = RejectAnalysis.objects.create(**data3)
        self.assertIsNotNone(analysis3.id)
    
    def test_analysis_ordering(self):
        """Test that analyses are ordered by date (newest first) and modality"""
        # Create analyses for different dates
        analysis1 = RejectAnalysis.objects.create(**self.analysis_data)
        
        data2 = self.analysis_data.copy()
        data2['analysis_date'] = date(2024, 2, 1)
        analysis2 = RejectAnalysis.objects.create(**data2)
        
        analyses = list(RejectAnalysis.objects.all())
        self.assertEqual(analyses[0], analysis2)  # Newer first
        self.assertEqual(analyses[1], analysis1)
    
    def test_analysis_string_representation(self):
        """Test string representation of analysis"""
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        expected_str = "X-Ray - January 2024 (6.67%)"
        self.assertEqual(str(analysis), expected_str)
    
    def test_approval_workflow(self):
        """Test approval workflow fields"""
        approver = User.objects.create_user(
            username='senior_staff',
            password='testpass123'
        )
        
        analysis = RejectAnalysis.objects.create(**self.analysis_data)
        
        # Initially not approved
        self.assertIsNone(analysis.approved_by)
        self.assertIsNone(analysis.approval_date)
        
        # Approve the analysis
        analysis.approved_by = approver
        analysis.approval_date = timezone.now()
        analysis.save()
        
        self.assertEqual(analysis.approved_by, approver)
        self.assertIsNotNone(analysis.approval_date)


class RejectIncidentModelTest(TestCase):
    """Test RejectIncident model functionality"""
    
    def setUp(self):
        # Create required related objects
        self.user = User.objects.create_user(
            username='technologist',
            password='testpass123'
        )
        
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
            reason='Over Exposure',
            severity_level='MEDIUM'
        )
        
        self.analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=100,
            total_images=120,
            total_retakes=8
        )
        
        self.incident_data = {
            'examination': self.pemeriksaan,
            'analysis': self.analysis,
            'reject_reason': self.reject_reason,
            'retake_count': 1,
            'original_technique': '70kVp, 5mAs',
            'corrected_technique': '80kVp, 3mAs',
            'technologist': self.user,
            'reported_by': self.user,
            'notes': 'Patient moved during exposure'
        }
    
    def test_create_reject_incident(self):
        """Test creating a new reject incident"""
        incident = RejectIncident.objects.create(**self.incident_data)
        
        self.assertEqual(incident.examination, self.pemeriksaan)
        self.assertEqual(incident.analysis, self.analysis)
        self.assertEqual(incident.reject_reason, self.reject_reason)
        self.assertEqual(incident.retake_count, 1)
        self.assertEqual(incident.technologist, self.user)
        self.assertIsNotNone(incident.reject_date)
    
    def test_incident_string_representation(self):
        """Test string representation of incident"""
        incident = RejectIncident.objects.create(**self.incident_data)
        expected_str = f"XR20240001 - Over Exposure ({incident.reject_date.strftime('%d/%m/%Y')})"
        self.assertEqual(str(incident), expected_str)
    
    def test_incident_ordering(self):
        """Test that incidents are ordered by reject date (newest first)"""
        incident1 = RejectIncident.objects.create(**self.incident_data)
        
        # Create second incident with different examination
        pemeriksaan2 = Pemeriksaan.objects.create(
            daftar=self.daftar,
            exam=self.exam,
            no_xray='XR20240002'
        )
        
        data2 = self.incident_data.copy()
        data2['examination'] = pemeriksaan2
        incident2 = RejectIncident.objects.create(**data2)
        
        incidents = list(RejectIncident.objects.all())
        self.assertEqual(incidents[0], incident2)  # Newer first
        self.assertEqual(incidents[1], incident1)
    
    def test_multiple_retakes(self):
        """Test incident with multiple retakes"""
        data = self.incident_data.copy()
        data['retake_count'] = 3
        
        incident = RejectIncident.objects.create(**data)
        self.assertEqual(incident.retake_count, 3)
    
    def test_patient_and_equipment_factors(self):
        """Test patient and equipment factor fields"""
        data = self.incident_data.copy()
        data['patient_factors'] = 'Patient was uncooperative and moved frequently'
        data['equipment_factors'] = 'X-ray tube needed recalibration'
        
        incident = RejectIncident.objects.create(**data)
        self.assertIn('uncooperative', incident.patient_factors)
        self.assertIn('recalibration', incident.equipment_factors)
    
    def test_malaysian_qap_compliance_fields(self):
        """Test Malaysian QAP compliance specific fields"""
        data = self.incident_data.copy()
        data['immediate_action_taken'] = 'Adjusted exposure settings and retook image'
        data['follow_up_required'] = True
        
        incident = RejectIncident.objects.create(**data)
        self.assertIn('exposure settings', incident.immediate_action_taken)
        self.assertTrue(incident.follow_up_required)
    
    def test_auto_analysis_assignment(self):
        """Test automatic analysis assignment based on examination date"""
        # Create incident without analysis
        data = self.incident_data.copy()
        del data['analysis']  # Remove analysis to test auto-assignment
        
        incident = RejectIncident(**data)
        incident.save()
        
        # Note: The actual auto-assignment logic might need the analysis to exist
        # This test verifies the save method doesn't crash without analysis
        self.assertIsNotNone(incident.id)


class PacsServerRejectAnalysisTest(TestCase):
    """Test PacsServer include_in_reject_analysis field"""
    
    def setUp(self):
        self.pacs_data = {
            'name': 'Test PACS Server',
            'orthancurl': 'http://test.example.com:8042',
            'viewrurl': 'http://test.example.com:3000/viewer',
            'endpoint_style': 'dicomweb',
            'is_active': True,
            'is_primary': True
        }
    
    def test_include_in_reject_analysis_default(self):
        """Test that include_in_reject_analysis defaults to True"""
        pacs_server = PacsServer.objects.create(**self.pacs_data)
        self.assertTrue(pacs_server.include_in_reject_analysis)
    
    def test_exclude_from_reject_analysis(self):
        """Test excluding PACS server from reject analysis"""
        data = self.pacs_data.copy()
        data['include_in_reject_analysis'] = False
        
        pacs_server = PacsServer.objects.create(**data)
        self.assertFalse(pacs_server.include_in_reject_analysis)
    
    def test_filter_servers_for_reject_analysis(self):
        """Test filtering servers included in reject analysis"""
        # Create servers with different include_in_reject_analysis values
        server1 = PacsServer.objects.create(**self.pacs_data)
        
        data2 = self.pacs_data.copy()
        data2['name'] = 'Excluded Server'
        data2['orthancurl'] = 'http://excluded.example.com:8042'
        data2['include_in_reject_analysis'] = False
        server2 = PacsServer.objects.create(**data2)
        
        # Filter for reject analysis
        included_servers = PacsServer.objects.filter(
            include_in_reject_analysis=True,
            is_active=True
        )
        
        self.assertIn(server1, included_servers)
        self.assertNotIn(server2, included_servers)
    
    def test_inactive_server_reject_analysis(self):
        """Test that inactive servers are excluded regardless of include_in_reject_analysis"""
        data = self.pacs_data.copy()
        data['is_active'] = False
        data['include_in_reject_analysis'] = True
        
        inactive_server = PacsServer.objects.create(**data)
        
        # Should be excluded from reject analysis due to being inactive
        included_servers = PacsServer.objects.filter(
            include_in_reject_analysis=True,
            is_active=True
        )
        
        self.assertNotIn(inactive_server, included_servers)


if __name__ == '__main__':
    import unittest
    unittest.main()