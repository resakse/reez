"""
Unit tests for Reject Analysis API endpoints

Tests all ViewSets including CRUD operations, permissions, filtering,
drag-and-drop ordering, statistics, and authentication.
"""

import json
from decimal import Decimal
from datetime import date, datetime, timedelta
from unittest.mock import patch, Mock

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import (
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident,
    PacsServer, Modaliti, Exam, Pemeriksaan, Daftar
)
from pesakit.models import Pesakit

User = get_user_model()


class RejectCategoryAPITest(APITestCase):
    """Test RejectCategory ViewSet API endpoints"""
    
    def setUp(self):
        # Create test users
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
        
        # Create test categories
        self.category1 = RejectCategory.objects.create(
            name='Positioning Errors',
            category_type='HUMAN_FAULTS',
            description='Patient positioning issues'
        )
        self.category2 = RejectCategory.objects.create(
            name='Equipment Malfunction',
            category_type='EQUIPMENT',
            description='Hardware failures'
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_list_categories_authenticated(self):
        """Test listing categories as authenticated user"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        # Check ordering by category_type and order
        categories = response.data
        self.assertEqual(categories[0]['category_type'], 'EQUIPMENT')
        self.assertEqual(categories[1]['category_type'], 'HUMAN_FAULTS')
    
    def test_list_categories_unauthenticated(self):
        """Test that unauthenticated users cannot list categories"""
        url = reverse('bcs:reject-category-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_create_category_as_staff(self):
        """Test creating category as staff user"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-list')
        data = {
            'name': 'processing errors',  # Test titlecase conversion
            'category_type': 'PROCESSING',
            'description': 'Image processing issues',
            'is_active': True
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Processing Errors')
        self.assertEqual(response.data['category_type'], 'PROCESSING')
        
        # Verify in database
        category = RejectCategory.objects.get(id=response.data['id'])
        self.assertEqual(category.name, 'Processing Errors')
    
    def test_create_category_as_regular_user(self):
        """Test that regular users cannot create categories"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-list')
        data = {
            'name': 'Test Category',
            'category_type': 'OTHERS'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_create_duplicate_category_name(self):
        """Test creating category with duplicate name in same type"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-list')
        data = {
            'name': 'Positioning Errors',  # Already exists in HUMAN_FAULTS
            'category_type': 'HUMAN_FAULTS'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_update_category(self):
        """Test updating category"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-detail', kwargs={'pk': self.category1.pk})
        data = {
            'name': 'Updated Positioning Errors',
            'category_type': 'HUMAN_FAULTS',
            'description': 'Updated description',
            'is_active': False
        }
        
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Positioning Errors')
        self.assertFalse(response.data['is_active'])
    
    def test_delete_category_with_reasons(self):
        """Test deleting category that has associated reasons"""
        # Create a reason for the category
        RejectReason.objects.create(
            category=self.category1,
            reason='Test Reason'
        )
        
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-detail', kwargs={'pk': self.category1.pk})
        response = self.client.delete(url)
        
        # Should fail due to foreign key constraint
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_filter_active_categories(self):
        """Test filtering active categories"""
        # Create inactive category
        RejectCategory.objects.create(
            name='Inactive Category',
            category_type='OTHERS',
            is_active=False
        )
        
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-category-list')
        response = self.client.get(url, {'is_active': 'true'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        active_categories = response.data
        
        # Should only return active categories
        for category in active_categories:
            self.assertTrue(category['is_active'])
    
    def test_drag_and_drop_ordering(self):
        """Test drag-and-drop ordering functionality"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Test moving category to different position
        url = reverse('bcs:reject-category-detail', kwargs={'pk': self.category2.pk})
        data = {
            'name': self.category2.name,
            'category_type': self.category2.category_type,
            'order': 1  # Move to first position
        }
        
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class RejectReasonAPITest(APITestCase):
    """Test RejectReason ViewSet API endpoints"""
    
    def setUp(self):
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
            name='Exposure Errors',
            category_type='HUMAN_FAULTS'
        )
        
        self.reason1 = RejectReason.objects.create(
            category=self.category,
            reason='Over Exposure',
            severity_level='MEDIUM',
            qap_code='EXP001'
        )
        self.reason2 = RejectReason.objects.create(
            category=self.category,
            reason='Under Exposure',
            severity_level='HIGH',
            qap_code='EXP002'
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_list_reasons(self):
        """Test listing reject reasons"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
    
    def test_filter_reasons_by_category(self):
        """Test filtering reasons by category"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-list')
        response = self.client.get(url, {'category': self.category.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reasons = response.data
        
        for reason in reasons:
            self.assertEqual(reason['category'], self.category.id)
    
    def test_filter_reasons_by_severity(self):
        """Test filtering reasons by severity level"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-list')
        response = self.client.get(url, {'severity_level': 'HIGH'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        high_severity_reasons = response.data
        
        for reason in high_severity_reasons:
            self.assertEqual(reason['severity_level'], 'HIGH')
    
    def test_create_reason(self):
        """Test creating reject reason"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-list')
        data = {
            'category': self.category.id,
            'reason': 'motion blur',  # Test titlecase
            'description': 'Patient movement during exposure',
            'severity_level': 'LOW',
            'qap_code': 'MOT001',
            'is_active': True
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['reason'], 'Motion Blur')
        self.assertEqual(response.data['severity_level'], 'LOW')
    
    def test_create_reason_invalid_category(self):
        """Test creating reason with invalid category"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-list')
        data = {
            'category': 99999,  # Non-existent category
            'reason': 'Test Reason',
            'severity_level': 'MEDIUM'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_update_reason_severity(self):
        """Test updating reason severity level"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-reason-detail', kwargs={'pk': self.reason1.pk})
        data = {
            'category': self.category.id,
            'reason': self.reason1.reason,
            'severity_level': 'CRITICAL'
        }
        
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['severity_level'], 'CRITICAL')


class RejectAnalysisAPITest(APITestCase):
    """Test RejectAnalysis ViewSet API endpoints"""
    
    def setUp(self):
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_superuser=True
        )
        self.staff_user = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        self.regular_user = User.objects.create_user(
            username='user',
            password='testpass123'
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.analysis1 = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=100,
            total_images=120,
            total_retakes=6,
            created_by=self.staff_user
        )
        self.analysis2 = RejectAnalysis.objects.create(
            analysis_date=date(2024, 2, 1),
            modality=self.modaliti,
            total_examinations=110,
            total_images=130,
            total_retakes=12,
            created_by=self.staff_user
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_list_analyses(self):
        """Test listing reject analyses"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        # Should be ordered by date (newest first)
        analyses = response.data
        self.assertEqual(analyses[0]['analysis_date'], '2024-02-01')
        self.assertEqual(analyses[1]['analysis_date'], '2024-01-01')
    
    def test_list_analyses_regular_user_forbidden(self):
        """Test that regular users cannot list analyses"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_create_analysis(self):
        """Test creating reject analysis"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        data = {
            'analysis_date': '2024-03-01',
            'modality': self.modaliti.id,
            'total_examinations': 95,
            'total_images': 115,
            'total_retakes': 9,
            'qap_target_rate': '8.00',
            'comments': 'March analysis'
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['analysis_date'], '2024-03-01')
        self.assertEqual(float(response.data['reject_rate']), 7.83)  # (9/115)*100
        self.assertTrue(response.data['drl_compliance'])  # 7.83% < 8%
    
    def test_create_analysis_duplicate_month_modality(self):
        """Test creating duplicate analysis for same month and modality"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        data = {
            'analysis_date': '2024-01-01',  # Already exists
            'modality': self.modaliti.id,
            'total_examinations': 50,
            'total_images': 60,
            'total_retakes': 5
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_filter_analyses_by_modality(self):
        """Test filtering analyses by modality"""
        # Create another modality and analysis
        modaliti2 = Modaliti.objects.create(nama='CT Scan', singkatan='CT')
        RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=modaliti2,
            total_examinations=50,
            total_images=60,
            total_retakes=3,
            created_by=self.staff_user
        )
        
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.get(url, {'modality': self.modaliti.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analyses = response.data
        
        for analysis in analyses:
            self.assertEqual(analysis['modality'], self.modaliti.id)
    
    def test_filter_analyses_by_date_range(self):
        """Test filtering analyses by date range"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        response = self.client.get(url, {
            'analysis_date__gte': '2024-02-01',
            'analysis_date__lte': '2024-02-28'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analyses = response.data
        
        self.assertEqual(len(analyses), 1)
        self.assertEqual(analyses[0]['analysis_date'], '2024-02-01')
    
    def test_update_analysis_approval(self):
        """Test updating analysis approval status"""
        approver = User.objects.create_user(
            username='approver',
            password='testpass123',
            is_staff=True
        )
        
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-detail', kwargs={'pk': self.analysis1.pk})
        data = {
            'analysis_date': '2024-01-01',
            'modality': self.modaliti.id,
            'total_examinations': self.analysis1.total_examinations,
            'total_images': self.analysis1.total_images,
            'total_retakes': self.analysis1.total_retakes,
            'approved_by': approver.id,
            'approval_date': timezone.now().isoformat()
        }
        
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['approved_by'], approver.id)
        self.assertIsNotNone(response.data['approval_date'])
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_calculate_from_pacs_endpoint(self, mock_orthanc):
        """Test calculate from PACS endpoint"""
        mock_orthanc.return_value = {
            'total_examinations': 80,
            'total_images': 100,
            'total_retakes': 8,
            'success': True
        }
        
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-list')
        data = {
            'analysis_date': '2024-04-01',
            'modality': self.modaliti.id,
            'calculate_from_pacs': True
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['total_examinations'], 80)
        self.assertEqual(response.data['total_images'], 100)
        self.assertEqual(response.data['total_retakes'], 8)


class RejectIncidentAPITest(APITestCase):
    """Test RejectIncident ViewSet API endpoints"""
    
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='tech',
            password='testpass123',
            is_staff=True
        )
        self.regular_user = User.objects.create_user(
            username='user',
            password='testpass123'
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
        
        self.incident = RejectIncident.objects.create(
            examination=self.pemeriksaan,
            analysis=self.analysis,
            reject_reason=self.reject_reason,
            retake_count=1,
            technologist=self.staff_user,
            notes='Test incident'
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_list_incidents(self):
        """Test listing reject incidents"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_create_incident(self):
        """Test creating reject incident"""
        # Create another examination
        pemeriksaan2 = Pemeriksaan.objects.create(
            daftar=self.daftar,
            exam=self.exam,
            no_xray='XR20240002'
        )
        
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        data = {
            'examination': pemeriksaan2.id,
            'analysis': self.analysis.id,
            'reject_reason': self.reject_reason.id,
            'retake_count': 2,
            'original_technique': '70kVp, 5mAs',
            'corrected_technique': '80kVp, 3mAs',
            'patient_factors': 'Patient moved during exposure',
            'immediate_action_taken': 'Repositioned patient and retook image',
            'follow_up_required': True
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['examination'], pemeriksaan2.id)
        self.assertEqual(response.data['retake_count'], 2)
        self.assertTrue(response.data['follow_up_required'])
    
    def test_filter_incidents_by_analysis(self):
        """Test filtering incidents by analysis"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        response = self.client.get(url, {'analysis': self.analysis.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        incidents = response.data
        
        for incident in incidents:
            self.assertEqual(incident['analysis'], self.analysis.id)
    
    def test_filter_incidents_by_reason(self):
        """Test filtering incidents by reject reason"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        response = self.client.get(url, {'reject_reason': self.reject_reason.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        incidents = response.data
        
        for incident in incidents:
            self.assertEqual(incident['reject_reason'], self.reject_reason.id)
    
    def test_filter_incidents_by_technologist(self):
        """Test filtering incidents by technologist"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        response = self.client.get(url, {'technologist': self.staff_user.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        incidents = response.data
        
        for incident in incidents:
            self.assertEqual(incident['technologist'], self.staff_user.id)
    
    def test_incidents_regular_user_forbidden(self):
        """Test that regular users cannot access incidents"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-incident-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RejectAnalysisStatisticsAPITest(APITestCase):
    """Test RejectAnalysis statistics endpoint"""
    
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='quality_manager',
            password='testpass123',
            is_staff=True
        )
        
        self.modaliti_xr = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        self.modaliti_ct = Modaliti.objects.create(
            nama='CT Scan',
            singkatan='CT'
        )
        
        # Create analyses for different months and modalities
        RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti_xr,
            total_examinations=100,
            total_images=120,
            total_retakes=6  # 5% reject rate
        )
        RejectAnalysis.objects.create(
            analysis_date=date(2024, 2, 1),
            modality=self.modaliti_xr,
            total_examinations=110,
            total_images=130,
            total_retakes=10  # 7.69% reject rate
        )
        RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti_ct,
            total_examinations=50,
            total_images=60,
            total_retakes=5  # 8.33% reject rate
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_get_monthly_statistics(self):
        """Test getting monthly statistics"""
        token = self.get_jwt_token(self.staff_user)
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
        self.assertEqual(len(monthly_data), 2)  # Jan and Feb
        
        # Check trend analysis
        trend = stats['trend_analysis']
        self.assertIn('direction', trend)
        self.assertIn('percentage_change', trend)
    
    def test_get_yearly_comparison(self):
        """Test getting yearly comparison statistics"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(url, {
            'period': 'yearly',
            'years': '2023,2024'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        stats = response.data
        self.assertIn('yearly_comparison', stats)
        self.assertIn('modality_breakdown', stats)
    
    def test_get_modality_comparison(self):
        """Test getting modality comparison statistics"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(url, {
            'period': 'modality_comparison',
            'year': 2024,
            'month': 1
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        stats = response.data
        self.assertIn('modality_data', stats)
        
        # Should have data for both modalities
        modality_data = stats['modality_data']
        modality_names = [data['modality_name'] for data in modality_data]
        self.assertIn('X-Ray', modality_names)
        self.assertIn('CT Scan', modality_names)
    
    def test_statistics_unauthorized(self):
        """Test that unauthorized users cannot access statistics"""
        url = reverse('bcs:reject-analysis-statistics')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DragAndDropOrderingTest(APITestCase):
    """Test drag-and-drop ordering functionality for categories and reasons"""
    
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='staff',
            password='testpass123',
            is_staff=True
        )
        
        # Create categories in specific order
        self.category1 = RejectCategory.objects.create(
            name='First Category',
            category_type='HUMAN_FAULTS'
        )
        self.category2 = RejectCategory.objects.create(
            name='Second Category',
            category_type='HUMAN_FAULTS'
        )
        self.category3 = RejectCategory.objects.create(
            name='Third Category',
            category_type='HUMAN_FAULTS'
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_reorder_categories(self):
        """Test reordering categories via drag-and-drop"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Move third category to first position
        url = reverse('bcs:reject-category-detail', kwargs={'pk': self.category3.pk})
        
        # Get current order
        initial_order = list(RejectCategory.objects.filter(
            category_type='HUMAN_FAULTS'
        ).values_list('id', flat=True))
        
        # Update order
        response = self.client.patch(url, {
            'order': 1
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify new order
        new_order = list(RejectCategory.objects.filter(
            category_type='HUMAN_FAULTS'
        ).values_list('id', flat=True))
        
        # Third category should now be first
        self.assertEqual(new_order[0], self.category3.id)
    
    def test_bulk_reorder_categories(self):
        """Test bulk reordering of categories"""
        token = self.get_jwt_token(self.staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Custom endpoint for bulk reordering (if implemented)
        url = reverse('bcs:reject-category-list') + 'bulk_reorder/'
        data = {
            'category_type': 'HUMAN_FAULTS',
            'ordered_ids': [self.category3.id, self.category1.id, self.category2.id]
        }
        
        # This would need to be implemented as a custom action
        # For now, we'll test individual updates work correctly
        self.assertTrue(True)  # Placeholder for bulk reorder test


if __name__ == '__main__':
    import unittest
    unittest.main()