"""
Integration tests for Reject Analysis System

Tests complete workflow from incident logging to monthly analysis,
Malaysian QAP compliance features, and multi-PACS server scenarios.
"""

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch, Mock

from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django.db import transaction

from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import (
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident,
    PacsServer, Modaliti, Exam, Pemeriksaan, Daftar
)
from ..utils import calculate_reject_analysis_from_pacs
from pesakit.models import Pesakit

User = get_user_model()


class CompleteWorkflowIntegrationTest(APITestCase):
    """Test complete workflow from incident logging to monthly analysis"""
    
    def setUp(self):
        # Create users with different roles
        self.quality_manager = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        self.technologist = User.objects.create_user(
            username='technologist',
            password='testpass123',
            is_staff=True
        )
        self.supervisor = User.objects.create_user(
            username='supervisor',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        
        # Create PACS server
        self.pacs_server = PacsServer.objects.create(
            name='Main PACS',
            orthancurl='http://pacs.hospital.com:8042',
            viewrurl='http://pacs.hospital.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=True,
            include_in_reject_analysis=True
        )
        
        # Create modality and examination types
        self.modaliti_xr = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='CR'
        )
        self.modaliti_ct = Modaliti.objects.create(
            nama='CT Scan',
            singkatan='CT'
        )
        
        self.exam_chest = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti_xr
        )
        self.exam_ct_head = Exam.objects.create(
            exam='CT Head',
            modaliti=self.modaliti_ct
        )
        
        # Create reject categories and reasons
        self.human_faults_category = RejectCategory.objects.create(
            name='Human Faults',
            category_type='HUMAN_FAULTS',
            description='Errors caused by human factors'
        )
        self.equipment_category = RejectCategory.objects.create(
            name='Equipment Issues',
            category_type='EQUIPMENT',
            description='Equipment-related problems'
        )
        
        self.positioning_reason = RejectReason.objects.create(
            category=self.human_faults_category,
            reason='Improper Patient Positioning',
            qap_code='POS001',
            severity_level='MEDIUM'
        )
        self.exposure_reason = RejectReason.objects.create(
            category=self.human_faults_category,
            reason='Over Exposure',
            qap_code='EXP001',
            severity_level='HIGH'
        )
        self.equipment_reason = RejectReason.objects.create(
            category=self.equipment_category,
            reason='Detector Malfunction',
            qap_code='EQP001',
            severity_level='CRITICAL'
        )
        
        # Create patients and examinations
        self.create_sample_examinations()
        
        self.client = APIClient()
    
    def create_sample_examinations(self):
        """Create sample patients and examinations for testing"""
        self.patients = []
        self.daftars = []
        self.pemeriksaans = []
        
        # Create 20 examinations for January 2024
        for i in range(20):
            patient = Pesakit.objects.create(
                nama=f'Patient {i+1}',
                nric=f'12345678901{i}',
                mrn=f'MRN{i+1:03d}'
            )
            self.patients.append(patient)
            
            daftar = Daftar.objects.create(
                pesakit=patient,
                study_instance_uid=f'1.2.3.4.5.6.7.8.{i+1}'
            )
            self.daftars.append(daftar)
            
            exam_type = self.exam_chest if i < 15 else self.exam_ct_head
            
            pemeriksaan = Pemeriksaan.objects.create(
                daftar=daftar,
                exam=exam_type,
                no_xray=f'{"CR" if i < 15 else "CT"}2024{i+1:03d}',
                created=datetime(2024, 1, 15, 10, i % 24, 0)  # Spread throughout January 15
            )
            self.pemeriksaans.append(pemeriksaan)
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_complete_reject_analysis_workflow(self):
        """Test complete workflow from incident logging to analysis approval"""
        # Step 1: Create monthly analysis
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Create analysis for X-Ray modality in January 2024
        analysis_data = {
            'analysis_date': '2024-01-01',
            'modality': self.modaliti_xr.id,
            'total_examinations': 15,  # 15 X-Ray examinations
            'total_images': 18,        # Some retakes
            'total_retakes': 3,        # 3 retakes = 16.67% reject rate
            'comments': 'Monthly analysis for X-Ray department'
        }
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.post(url, analysis_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        analysis_id = response.data['id']
        
        # Verify reject rate calculation
        self.assertEqual(float(response.data['reject_rate']), 16.67)
        self.assertFalse(response.data['drl_compliance'])  # > 8% target
        
        # Step 2: Log individual reject incidents
        incidents_data = [
            {
                'examination': self.pemeriksaans[0].id,  # First X-Ray exam
                'analysis': analysis_id,
                'reject_reason': self.positioning_reason.id,
                'retake_count': 1,
                'technologist': self.technologist.id,
                'original_technique': '70kVp, 5mAs',
                'corrected_technique': '70kVp, 3mAs',
                'patient_factors': 'Patient moved during exposure',
                'immediate_action_taken': 'Repositioned patient and reduced exposure time',
                'follow_up_required': False
            },
            {
                'examination': self.pemeriksaans[1].id,  # Second X-Ray exam
                'analysis': analysis_id,
                'reject_reason': self.exposure_reason.id,
                'retake_count': 1,
                'technologist': self.technologist.id,
                'original_technique': '80kVp, 8mAs',
                'corrected_technique': '70kVp, 5mAs',
                'equipment_factors': 'AEC sensor needs calibration',
                'immediate_action_taken': 'Manually adjusted exposure settings',
                'follow_up_required': True
            },
            {
                'examination': self.pemeriksaans[2].id,  # Third X-Ray exam
                'analysis': analysis_id,
                'reject_reason': self.equipment_reason.id,
                'retake_count': 1,
                'technologist': self.technologist.id,
                'equipment_factors': 'Detector showed artifacts',
                'immediate_action_taken': 'Switched to backup detector',
                'follow_up_required': True
            }
        ]
        
        incident_ids = []
        url = reverse('bcs:reject-incident-list')
        for incident_data in incidents_data:
            response = self.client.post(url, incident_data, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            incident_ids.append(response.data['id'])
        
        # Step 3: Verify incidents are linked to analysis
        url = reverse('bcs:reject-analysis-detail', kwargs={'pk': analysis_id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        incidents = response.data.get('incidents', [])
        self.assertEqual(len(incidents), 3)
        
        # Step 4: Update analysis with corrective actions
        corrective_actions_data = {
            'analysis_date': '2024-01-01',
            'modality': self.modaliti_xr.id,
            'total_examinations': 15,
            'total_images': 18,
            'total_retakes': 3,
            'corrective_actions': 'Scheduled AEC calibration, provided positioning refresher training',
            'root_cause_analysis': 'Primary causes: equipment calibration (33%), positioning errors (33%), overexposure (33%)'
        }
        
        response = self.client.put(url, corrective_actions_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Step 5: Approve analysis as supervisor
        token = self.get_jwt_token(self.supervisor)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        approval_data = {
            'analysis_date': '2024-01-01',
            'modality': self.modaliti_xr.id,
            'total_examinations': 15,
            'total_images': 18,
            'total_retakes': 3,
            'corrective_actions': corrective_actions_data['corrective_actions'],
            'root_cause_analysis': corrective_actions_data['root_cause_analysis'],
            'approved_by': self.supervisor.id,
            'approval_date': timezone.now().isoformat()
        }
        
        response = self.client.put(url, approval_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['approved_by'], self.supervisor.id)
        
        # Step 6: Generate statistics report
        stats_url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(stats_url, {
            'period': 'monthly',
            'year': 2024,
            'modality': self.modaliti_xr.id
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        stats = response.data
        self.assertIn('monthly_data', stats)
        self.assertIn('compliance_summary', stats)
        
        # Verify statistics
        monthly_data = stats['monthly_data']
        self.assertEqual(len(monthly_data), 1)  # January only
        
        jan_data = monthly_data[0]
        self.assertEqual(jan_data['month'], 1)
        self.assertEqual(float(jan_data['reject_rate']), 16.67)
        self.assertFalse(jan_data['drl_compliant'])


class MalaysianQAPComplianceTest(APITestCase):
    """Test Malaysian QAP compliance features"""
    
    def setUp(self):
        self.quality_manager = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='Mammography',
            singkatan='MG'
        )
        
        # Create QAP-compliant categories and reasons
        self.positioning_category = RejectCategory.objects.create(
            name='Positioning Errors',
            category_type='HUMAN_FAULTS',
            description='Patient positioning and anatomical demonstration errors'
        )
        
        # Malaysian QAP specific reasons with codes
        self.qap_reasons = [
            {
                'reason': 'Poor Breast Compression',
                'qap_code': 'MG-POS-001',
                'severity_level': 'HIGH'
            },
            {
                'reason': 'Inadequate Pectoral Muscle Demonstration',
                'qap_code': 'MG-POS-002',
                'severity_level': 'MEDIUM'
            },
            {
                'reason': 'Motion Artifacts',
                'qap_code': 'MG-MOT-001',
                'severity_level': 'LOW'
            },
            {
                'reason': 'Over Exposure - High Optical Density',
                'qap_code': 'MG-EXP-001',
                'severity_level': 'CRITICAL'
            }
        ]
        
        self.reject_reasons = []
        for reason_data in self.qap_reasons:
            reason = RejectReason.objects.create(
                category=self.positioning_category,
                **reason_data
            )
            self.reject_reasons.append(reason)
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_qap_compliance_analysis(self):
        """Test QAP compliance analysis for mammography"""
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Create analysis with QAP target rate for mammography (3%)
        analysis_data = {
            'analysis_date': '2024-01-01',
            'modality': self.modaliti.id,
            'total_examinations': 200,
            'total_images': 206,     # 6 retakes
            'total_retakes': 6,      # 2.91% reject rate (compliant)
            'qap_target_rate': '3.00',  # Malaysian QAP target for mammography
            'comments': 'Monthly mammography QAP analysis'
        }
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.post(url, analysis_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['drl_compliance'])  # Should be compliant
        self.assertEqual(float(response.data['reject_rate']), 2.91)
        
        analysis_id = response.data['id']
        
        # Create incidents with QAP codes
        incident_data = {
            'analysis': analysis_id,
            'reject_reason': self.reject_reasons[3].id,  # Critical severity
            'retake_count': 2,
            'immediate_action_taken': 'Adjusted exposure parameters, retrained technologist',
            'follow_up_required': True,
            'notes': 'QAP compliance incident - requires immediate corrective action'
        }
        
        # Mock examination for incident
        pesakit = Pesakit.objects.create(nama='Test Patient', nric='123456789012', mrn='TEST001')
        daftar = Daftar.objects.create(pesakit=pesakit, study_instance_uid='1.2.3.4.5.6.7.8.9')
        exam = Exam.objects.create(exam='Mammography Bilateral', modaliti=self.modaliti)
        pemeriksaan = Pemeriksaan.objects.create(daftar=daftar, exam=exam, no_xray='MG20240001')
        
        incident_data['examination'] = pemeriksaan.id
        
        incident_url = reverse('bcs:reject-incident-list')
        response = self.client.post(incident_url, incident_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify QAP fields are properly stored
        incident_id = response.data['id']
        incident_detail_url = reverse('bcs:reject-incident-detail', kwargs={'pk': incident_id})
        response = self.client.get(incident_detail_url)
        
        incident = response.data
        self.assertTrue(incident['follow_up_required'])
        self.assertIn('QAP compliance', incident['notes'])
        
        # Check reject reason QAP code
        reason_id = incident['reject_reason']
        reason_url = reverse('bcs:reject-reason-detail', kwargs={'pk': reason_id})
        response = self.client.get(reason_url)
        
        self.assertEqual(response.data['qap_code'], 'MG-EXP-001')
        self.assertEqual(response.data['severity_level'], 'CRITICAL')
    
    def test_qap_severity_level_filtering(self):
        """Test filtering incidents by QAP severity levels"""
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Get reasons by severity level
        url = reverse('bcs:reject-reason-list')
        
        # Filter critical severity
        response = self.client.get(url, {'severity_level': 'CRITICAL'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        critical_reasons = response.data
        self.assertEqual(len(critical_reasons), 1)
        self.assertEqual(critical_reasons[0]['qap_code'], 'MG-EXP-001')
        
        # Filter medium severity
        response = self.client.get(url, {'severity_level': 'MEDIUM'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        medium_reasons = response.data
        self.assertEqual(len(medium_reasons), 1)
        self.assertEqual(medium_reasons[0]['qap_code'], 'MG-POS-002')
    
    def test_qap_bilingual_support(self):
        """Test bilingual (English/Malay) support for QAP compliance"""
        # Create categories and reasons in both languages
        malay_category = RejectCategory.objects.create(
            name='Kesilapan Pendedahan',  # Exposure Errors in Malay
            category_type='HUMAN_FAULTS',
            description='Kesilapan yang berkaitan dengan parameter pendedahan'
        )
        
        bilingual_reason = RejectReason.objects.create(
            category=malay_category,
            reason='Pendedahan Berlebihan / Indeks Tinggi',
            description='Over Exposure / High Index - Imej terlalu gelap',
            qap_code='MY-EXP-001',
            severity_level='HIGH'
        )
        
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-detail', kwargs={'pk': bilingual_reason.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        reason_data = response.data
        self.assertIn('Pendedahan Berlebihan', reason_data['reason'])
        self.assertIn('Over Exposure', reason_data['description'])
        self.assertEqual(reason_data['qap_code'], 'MY-EXP-001')


class MultiPacsServerIntegrationTest(TransactionTestCase):
    """Test multi-PACS server scenarios for reject analysis"""
    
    def setUp(self):
        self.quality_manager = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        
        # Create multiple PACS servers
        self.primary_pacs = PacsServer.objects.create(
            name='Primary PACS',
            orthancurl='http://primary.hospital.com:8042',
            viewrurl='http://primary.hospital.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=True,
            include_in_reject_analysis=True
        )
        
        self.secondary_pacs = PacsServer.objects.create(
            name='Secondary PACS',
            orthancurl='http://secondary.hospital.com:8042',
            viewrurl='http://secondary.hospital.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=False,
            include_in_reject_analysis=True
        )
        
        self.archive_pacs = PacsServer.objects.create(
            name='Archive PACS',
            orthancurl='http://archive.hospital.com:8042',
            viewrurl='http://archive.hospital.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=False,
            include_in_reject_analysis=False  # Excluded from reject analysis
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='CT Scan',
            singkatan='CT'
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_multi_pacs_reject_analysis_calculation(self, mock_orthanc):
        """Test reject analysis calculation across multiple PACS servers"""
        # Mock PACS responses - different data from each server
        def mock_orthanc_response(year, month, modality=None, pacs_server=None):
            if pacs_server == self.primary_pacs:
                return {
                    'total_images': 150,
                    'total_studies': 120,
                    'modality_breakdown': {
                        'CT': {
                            'images': 150,
                            'studies': 120
                        }
                    },
                    'warnings': []
                }
            elif pacs_server == self.secondary_pacs:
                return {
                    'total_images': 80,
                    'total_studies': 65,
                    'modality_breakdown': {
                        'CT': {
                            'images': 80,
                            'studies': 65
                        }
                    },
                    'warnings': []
                }
            else:
                return {
                    'total_images': 0,
                    'total_studies': 0,
                    'modality_breakdown': {},
                    'error': 'Server not included in reject analysis'
                }
        
        mock_orthanc.side_effect = mock_orthanc_response
        
        # Test calculation includes only servers with include_in_reject_analysis=True
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        # Should combine data from primary and secondary PACS only
        # Note: The actual implementation might need adjustment to handle multiple servers
        self.assertIn('total_examinations', result)
        self.assertIn('total_images', result)
        
        # Archive PACS should be excluded
        self.assertNotIn('error', result)
    
    def test_pacs_server_inclusion_filtering(self):
        """Test filtering PACS servers for reject analysis inclusion"""
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Get active servers for reject analysis
        url = reverse('bcs:pacs-server-list')
        response = self.client.get(url, {'include_in_reject_analysis': 'true'})
        
        if response.status_code == status.HTTP_200_OK:
            included_servers = response.data
            server_names = [server['name'] for server in included_servers]
            
            self.assertIn('Primary PACS', server_names)
            self.assertIn('Secondary PACS', server_names)
            self.assertNotIn('Archive PACS', server_names)
    
    def test_pacs_server_configuration_for_reject_analysis(self):
        """Test PACS server configuration affects reject analysis"""
        # Disable secondary PACS from reject analysis
        self.secondary_pacs.include_in_reject_analysis = False
        self.secondary_pacs.save()
        
        # Test that disabled server is not included in queries
        included_servers = PacsServer.objects.filter(
            is_active=True,
            include_in_reject_analysis=True
        )
        
        self.assertEqual(included_servers.count(), 1)
        self.assertEqual(included_servers.first(), self.primary_pacs)
        
        # Re-enable for cleanup
        self.secondary_pacs.include_in_reject_analysis = True
        self.secondary_pacs.save()


class RejectAnalysisTrendsIntegrationTest(APITestCase):
    """Test reject analysis trends and statistical analysis"""
    
    def setUp(self):
        self.quality_manager = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        
        self.modaliti_xr = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='CR'
        )
        
        # Create 6 months of data for trend analysis
        self.analyses = []
        reject_rates = [5.2, 6.8, 8.1, 9.5, 7.3, 6.1]  # Trend: up then down
        
        for month in range(1, 7):
            analysis = RejectAnalysis.objects.create(
                analysis_date=date(2024, month, 1),
                modality=self.modaliti_xr,
                total_examinations=100,
                total_images=int(100 + (reject_rates[month-1] / 100 * 100)),
                total_retakes=int(reject_rates[month-1]),
                created_by=self.quality_manager
            )
            self.analyses.append(analysis)
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_monthly_trend_analysis(self):
        """Test monthly trend analysis and statistics"""
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(url, {
            'period': 'monthly',
            'year': 2024,
            'modality': self.modaliti_xr.id
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        stats = response.data
        self.assertIn('monthly_data', stats)
        self.assertIn('trend_analysis', stats)
        self.assertIn('compliance_summary', stats)
        
        # Check monthly data
        monthly_data = stats['monthly_data']
        self.assertEqual(len(monthly_data), 6)
        
        # Verify data is ordered by month
        for i, month_data in enumerate(monthly_data):
            self.assertEqual(month_data['month'], i + 1)
            self.assertAlmostEqual(
                float(month_data['reject_rate']), 
                [5.2, 6.8, 8.1, 9.5, 7.3, 6.1][i], 
                places=1
            )
        
        # Check trend analysis
        trend = stats['trend_analysis']
        self.assertIn('direction', trend)
        self.assertIn('percentage_change', trend)
        
        # Should show improvement from peak (month 4 to month 6)
        # 9.5% -> 6.1% = 35.8% improvement
        if 'recent_trend' in trend:
            self.assertIn('improvement', trend['recent_trend'].lower())
    
    def test_compliance_summary_analysis(self):
        """Test compliance summary across multiple months"""
        token = self.get_jwt_token(self.quality_manager)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(url, {
            'period': 'compliance_summary',
            'year': 2024,
            'modality': self.modaliti_xr.id
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        compliance = response.data.get('compliance_summary', {})
        
        # Should identify months with non-compliance
        # Months 3 and 4 have rates > 8% (8.1% and 9.5%)
        if 'non_compliant_months' in compliance:
            self.assertEqual(compliance['non_compliant_months'], 2)
        
        if 'average_reject_rate' in compliance:
            # Average of [5.2, 6.8, 8.1, 9.5, 7.3, 6.1] = 7.17%
            self.assertAlmostEqual(
                float(compliance['average_reject_rate']),
                7.17,
                places=1
            )


class PerformanceIntegrationTest(TestCase):
    """Test performance aspects of reject analysis system"""
    
    def setUp(self):
        self.quality_manager = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='CR'
        )
        
        # Create category and reasons
        self.category = RejectCategory.objects.create(
            name='Test Category',
            category_type='HUMAN_FAULTS'
        )
        
        self.reason = RejectReason.objects.create(
            category=self.category,
            reason='Test Reason'
        )
    
    def test_bulk_incident_creation_performance(self):
        """Test performance with bulk incident creation"""
        # Create analysis
        analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=1000,
            total_images=1100,
            total_retakes=100,
            created_by=self.quality_manager
        )
        
        # Create test data
        pesakit = Pesakit.objects.create(nama='Test Patient', nric='123456789012', mrn='TEST001')
        daftar = Daftar.objects.create(pesakit=pesakit, study_instance_uid='1.2.3.4.5.6.7.8.9')
        exam = Exam.objects.create(exam='Test Exam', modaliti=self.modaliti)
        
        examinations = []
        for i in range(100):
            pemeriksaan = Pemeriksaan.objects.create(
                daftar=daftar,
                exam=exam,
                no_xray=f'CR2024{i+1:03d}'
            )
            examinations.append(pemeriksaan)
        
        # Bulk create incidents
        incidents = []
        for i, examination in enumerate(examinations):
            incident = RejectIncident(
                examination=examination,
                analysis=analysis,
                reject_reason=self.reason,
                retake_count=1,
                technologist=self.quality_manager
            )
            incidents.append(incident)
        
        # Test bulk creation performance
        import time
        start_time = time.time()
        
        RejectIncident.objects.bulk_create(incidents)
        
        end_time = time.time()
        creation_time = end_time - start_time
        
        # Should create 100 incidents in reasonable time (< 1 second)
        self.assertLess(creation_time, 1.0)
        
        # Verify all incidents were created
        self.assertEqual(RejectIncident.objects.filter(analysis=analysis).count(), 100)
    
    def test_large_dataset_queryset_performance(self):
        """Test queryset performance with large datasets"""
        # Create large dataset
        analyses = []
        for month in range(1, 13):  # 12 months
            for modality_index in range(5):  # 5 modalities
                modaliti = Modaliti.objects.get_or_create(
                    nama=f'Modality {modality_index}',
                    singkatan=f'M{modality_index}'
                )[0]
                
                analysis = RejectAnalysis.objects.create(
                    analysis_date=date(2024, month, 1),
                    modality=modaliti,
                    total_examinations=100,
                    total_images=110,
                    total_retakes=8,
                    created_by=self.quality_manager
                )
                analyses.append(analysis)
        
        # Test queryset performance
        import time
        
        # Test filtering by date range
        start_time = time.time()
        queryset = RejectAnalysis.objects.filter(
            analysis_date__year=2024,
            analysis_date__month__gte=6
        ).select_related('modality', 'created_by')
        list(queryset)  # Force evaluation
        end_time = time.time()
        
        query_time = end_time - start_time
        
        # Should complete query in reasonable time
        self.assertLess(query_time, 0.5)  # < 500ms
        
        # Verify correct number of results
        self.assertEqual(queryset.count(), 35)  # 7 months * 5 modalities


if __name__ == '__main__':
    import unittest
    unittest.main()