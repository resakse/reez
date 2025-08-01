"""
Unit tests for Multiple PACS Server functionality

Tests the PacsServer model, MultiplePacsSearchView, and related functionality
for managing and searching across multiple PACS servers.
"""

import json
from unittest.mock import patch, Mock, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import PacsServer, PacsExam, Daftar
from pesakit.models import Pesakit


User = get_user_model()


class PacsServerModelTest(TestCase):
    """Test PacsServer model functionality"""
    
    def setUp(self):
        self.pacs_data = {
            'name': 'Test PACS Server',
            'orthancurl': 'http://test.example.com:8042',
            'viewrurl': 'http://test.example.com:3000/viewer',
            'endpoint_style': 'dicomweb',
            'comments': 'Test server for unit testing',
            'is_active': True,
            'is_primary': True
        }
    
    def test_create_pacs_server(self):
        """Test creating a new PACS server"""
        pacs_server = PacsServer.objects.create(**self.pacs_data)
        
        self.assertEqual(pacs_server.name, 'Test PACS Server')
        self.assertEqual(pacs_server.orthancurl, 'http://test.example.com:8042')
        self.assertTrue(pacs_server.is_active)
        self.assertTrue(pacs_server.is_primary)
        self.assertFalse(pacs_server.is_deleted)
    
    def test_unique_name_constraint(self):
        """Test that PACS server names must be unique"""
        PacsServer.objects.create(**self.pacs_data)
        
        with self.assertRaises(Exception):
            PacsServer.objects.create(**self.pacs_data)
    
    def test_primary_server_auto_management(self):
        """Test that only one server can be primary at a time"""
        # Create first primary server
        server1 = PacsServer.objects.create(**self.pacs_data)
        self.assertTrue(server1.is_primary)
        
        # Create second server as primary
        data2 = self.pacs_data.copy()
        data2['name'] = 'Second PACS Server'
        data2['orthancurl'] = 'http://test2.example.com:8042'
        server2 = PacsServer.objects.create(**data2)
        
        # Refresh from database
        server1.refresh_from_db()
        server2.refresh_from_db()
        
        # Only server2 should be primary now
        self.assertFalse(server1.is_primary)
        self.assertTrue(server2.is_primary)
    
    def test_get_image_proxy_url(self):
        """Test image proxy URL generation"""
        pacs_server = PacsServer.objects.create(**self.pacs_data)
        
        # Create the required models for PacsExam
        from exam.models import Modaliti, Exam, Pemeriksaan
        
        pesakit = Pesakit.objects.create(
            nama='Test Patient',
            nric='123456789012',
            mrn='TEST001'
        )
        daftar = Daftar.objects.create(
            pesakit=pesakit,
            study_instance_uid='1.2.3.4.5.6.7.8.9'
        )
        
        # Create modality and exam
        modaliti = Modaliti.objects.create(nama='X-Ray', singkatan='XR')
        exam = Exam.objects.create(exam='Chest X-Ray', modaliti=modaliti)
        
        # Create pemeriksaan (examination)
        pemeriksaan = Pemeriksaan.objects.create(
            daftar=daftar,
            exam=exam,
            no_xray='XR001'
        )
        
        # Create PacsExam linked to pemeriksaan and server
        pacs_exam = PacsExam.objects.create(
            exam=pemeriksaan,
            pacs_server=pacs_server,
            orthanc_id='test-orthanc-id'
        )
        
        proxy_url = pacs_exam.get_image_proxy_url('test-instance-id')
        expected_url = f"/api/pacs/instances/{pacs_server.id}/test-instance-id/configurable"
        self.assertEqual(proxy_url, expected_url)
    
    def test_str_representation(self):
        """Test string representation of PACS server"""
        pacs_server = PacsServer.objects.create(**self.pacs_data)
        expected_str = "Test PACS Server (Primary)"
        self.assertEqual(str(pacs_server), expected_str)


class PacsServerAPITest(APITestCase):
    """Test PACS Server API endpoints"""
    
    def setUp(self):
        # Create test users
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        self.regular_user = User.objects.create_user(
            username='user',
            password='testpass123'
        )
        
        # Create test PACS server
        self.pacs_server = PacsServer.objects.create(
            name='Test PACS Server',
            orthancurl='http://test.example.com:8042',
            viewrurl='http://test.example.com:3000/viewer',
            endpoint_style='dicomweb',
            comments='Test server',
            is_active=True,
            is_primary=True
        )
        
        self.client = APIClient()
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_list_pacs_servers_as_superuser(self):
        """Test listing PACS servers as superuser"""
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Test PACS Server')
    
    def test_list_pacs_servers_as_regular_user(self):
        """Test that regular users cannot list PACS servers"""
        token = self.get_jwt_token(self.regular_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_create_pacs_server_as_superuser(self):
        """Test creating PACS server as superuser"""
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-list')
        data = {
            'name': 'New Test Server',
            'orthancurl': 'http://new.example.com:8042',
            'viewrurl': 'http://new.example.com:3000/viewer',
            'endpoint_style': 'dicomweb',
            'comments': 'New test server',
            'is_active': True,
            'is_primary': False
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Test Server')
        self.assertTrue(PacsServer.objects.filter(name='New Test Server').exists())
    
    def test_set_primary_server(self):
        """Test setting a server as primary"""
        # Create second server
        server2 = PacsServer.objects.create(
            name='Second Server',
            orthancurl='http://second.example.com:8042',
            viewrurl='http://second.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=False
        )
        
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-set-primary', kwargs={'pk': server2.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Refresh from database
        self.pacs_server.refresh_from_db()
        server2.refresh_from_db()
        
        self.assertFalse(self.pacs_server.is_primary)
        self.assertTrue(server2.is_primary)
    
    def test_get_active_servers(self):
        """Test getting active PACS servers"""
        # Create inactive server
        PacsServer.objects.create(
            name='Inactive Server',
            orthancurl='http://inactive.example.com:8042',
            viewrurl='http://inactive.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=False,
            is_primary=False
        )
        
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-active')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # Only active server
        self.assertEqual(response.data[0]['name'], 'Test PACS Server')
    
    def test_get_primary_server(self):
        """Test getting primary PACS server"""
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-primary')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Test PACS Server')
        self.assertTrue(response.data['is_primary'])
    
    def test_soft_delete_server_with_examinations(self):
        """Test soft deletion of server that has examinations"""
        # Create patient and examination linked to the server
        from exam.models import Modaliti, Exam, Pemeriksaan
        
        pesakit = Pesakit.objects.create(
            nama='Test Patient',
            nric='123456789012',
            mrn='TEST001'
        )
        daftar = Daftar.objects.create(
            pesakit=pesakit,
            study_instance_uid='1.2.3.4.5.6.7.8.9'
        )
        
        # Create modality and exam
        modaliti = Modaliti.objects.create(nama='X-Ray', singkatan='XR')
        exam = Exam.objects.create(exam='Chest X-Ray', modaliti=modaliti)
        
        # Create pemeriksaan (examination)
        pemeriksaan = Pemeriksaan.objects.create(
            daftar=daftar,
            exam=exam,
            no_xray='XR001'
        )
        
        PacsExam.objects.create(
            exam=pemeriksaan,
            pacs_server=self.pacs_server
        )
        
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        url = reverse('bcs:pacs-server-detail', kwargs={'pk': self.pacs_server.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['soft_deleted'])
        
        # Server should be marked as deleted but still exist
        self.pacs_server.refresh_from_db()
        self.assertTrue(self.pacs_server.is_deleted)
        self.assertFalse(self.pacs_server.is_active)
        self.assertFalse(self.pacs_server.is_primary)


class MultiplePacsSearchTest(APITestCase):
    """Test Multiple PACS Search functionality"""
    
    def setUp(self):
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        # Create test PACS servers
        self.server1 = PacsServer.objects.create(
            name='Server 1',
            orthancurl='http://server1.example.com:8042',
            viewrurl='http://server1.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=True
        )
        
        self.server2 = PacsServer.objects.create(
            name='Server 2',
            orthancurl='http://server2.example.com:8042',
            viewrurl='http://server2.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=False
        )
        
        self.client = APIClient()
        token = self.get_jwt_token(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Mock Orthanc responses
        self.mock_study_data = {
            'ID': 'test-study-id',
            'MainDicomTags': {
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.9',
                'StudyDate': '20240101',
                'StudyTime': '120000',
                'StudyDescription': 'Test Study',
                'ModalitiesInStudy': 'CT',
                'InstitutionName': 'Test Hospital',
                'AccessionNumber': 'ACC001'
            },
            'PatientMainDicomTags': {
                'PatientName': 'Test^Patient',
                'PatientID': 'PAT001',
                'PatientBirthDate': '19900101',
                'PatientSex': 'M'
            },
            'Series': ['series-1', 'series-2']
        }
        
        self.mock_series_data = {
            'ID': 'series-1',
            'MainDicomTags': {
                'Modality': 'CT',
                'BodyPartExamined': 'CHEST',
                'ProtocolName': 'CHEST CT',
                'Manufacturer': 'SIEMENS',
                'AcquisitionDeviceProcessingDescription': 'HELICAL'
            },
            'Instances': ['instance-1', 'instance-2']
        }
        
        self.mock_instance_data = {
            'ID': 'instance-1',
            'MainDicomTags': {
                'BodyPartExamined': 'CHEST',
                'Manufacturer': 'SIEMENS'
            }
        }
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    @patch('exam.pacs_management_views.requests.post')
    @patch('exam.pacs_management_views.requests.get')
    def test_multiple_pacs_search_success(self, mock_get, mock_post):
        """Test successful multiple PACS search"""
        # Mock Orthanc find request
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = [self.mock_study_data]
        
        # Mock series and instance requests
        mock_get.side_effect = [
            # First server series request
            Mock(ok=True, json=lambda: self.mock_series_data),
            Mock(ok=True, json=lambda: self.mock_instance_data),
            # Second server series request
            Mock(ok=True, json=lambda: self.mock_series_data),
            Mock(ok=True, json=lambda: self.mock_instance_data),
        ]
        
        url = reverse('bcs:pacs-search-multiple')
        data = {
            'patientName': 'Test',
            'limit': 50
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['studies']), 2)  # One from each server
        
        # Check that server information is included
        study = response.data['studies'][0]
        self.assertIn('pacs_server_id', study)
        self.assertIn('pacs_server_name', study)
        
        # Check DICOM fields are properly extracted
        self.assertEqual(study['modality'], 'CT')
        self.assertEqual(study['bodyPartExamined'], 'CHEST')
        self.assertEqual(study['protocolName'], 'CHEST CT')
        self.assertEqual(study['manufacturer'], 'SIEMENS')
    
    @patch('exam.pacs_management_views.requests.post')
    def test_multiple_pacs_search_with_server_error(self, mock_post):
        """Test multiple PACS search with one server failing"""
        # First server succeeds, second fails
        mock_post.side_effect = [
            Mock(ok=True, json=lambda: [self.mock_study_data]),
            Mock(ok=False, status_code=500)
        ]
        
        url = reverse('bcs:pacs-search-multiple')
        data = {'limit': 50}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['studies']), 1)  # Only from successful server
        self.assertEqual(len(response.data['server_errors']), 1)  # One server error
    
    @patch('exam.pacs_management_views.requests.post')
    def test_multiple_pacs_search_pagination(self, mock_post):
        """Test pagination in multiple PACS search"""
        # Return multiple studies from each server
        studies = [self.mock_study_data.copy() for _ in range(3)]
        for i, study in enumerate(studies):
            study['ID'] = f'study-{i}'
            study['MainDicomTags']['StudyInstanceUID'] = f'1.2.3.4.5.6.7.8.{i}'
        
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = studies
        
        url = reverse('bcs:pacs-search-multiple')
        data = {'limit': 4}  # Total limit of 4, should be 2 per server
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        # Check pagination info
        pagination_info = response.data['pagination_info']
        self.assertEqual(pagination_info['total_limit'], 4)
        self.assertEqual(pagination_info['servers_count'], 2)
        self.assertEqual(pagination_info['per_server_limit'], 2)
    
    def test_multiple_pacs_search_no_active_servers(self):
        """Test multiple PACS search with no active servers"""
        # Deactivate all servers
        PacsServer.objects.update(is_active=False)
        
        url = reverse('bcs:pacs-search-multiple')
        data = {'limit': 50}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['studies']), 0)
        self.assertEqual(len(response.data['servers_searched']), 0)
    
    @patch('exam.pacs_management_views.requests.post')
    def test_multiple_pacs_search_specific_servers(self, mock_post):
        """Test multiple PACS search with specific server IDs"""
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = [self.mock_study_data]
        
        url = reverse('bcs:pacs-search-multiple')
        data = {
            'server_ids': [self.server1.id],  # Only search server1
            'limit': 50
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['servers_searched']), 1)
        self.assertEqual(response.data['servers_searched'][0]['id'], self.server1.id)


class PacsHealthCheckTest(APITestCase):
    """Test PACS Server health check functionality"""
    
    def setUp(self):
        self.superuser = User.objects.create_user(
            username='admin',
            password='testpass123',
            is_superuser=True
        )
        
        self.pacs_server = PacsServer.objects.create(
            name='Test Server',
            orthancurl='http://test.example.com:8042',
            viewrurl='http://test.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=True
        )
        
        self.client = APIClient()
        token = self.get_jwt_token(self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    @patch('exam.pacs_management_views.requests.get')
    def test_health_check_healthy_server(self, mock_get):
        """Test health check for healthy server"""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.elapsed.total_seconds.return_value = 0.1
        mock_get.return_value = mock_response
        
        url = reverse('bcs:pacs-server-health-check')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        server_health = response.data[str(self.pacs_server.id)]
        self.assertEqual(server_health['status'], 'healthy')
        self.assertEqual(server_health['name'], 'Test Server')
        self.assertTrue(server_health['is_active'])
        self.assertTrue(server_health['is_primary'])
    
    @patch('exam.pacs_management_views.requests.get')
    def test_health_check_unreachable_server(self, mock_get):
        """Test health check for unreachable server"""
        mock_get.side_effect = ConnectionError("Connection failed")
        
        url = reverse('bcs:pacs-server-health-check')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        server_health = response.data[str(self.pacs_server.id)]
        self.assertEqual(server_health['status'], 'unreachable')
        self.assertIn('error', server_health)


class BatchCheckImportStatusTest(APITestCase):
    """Test batch check import status functionality"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        # Create test patient and registration
        self.pesakit = Pesakit.objects.create(
            nama='Test Patient',
            nric='123456789012',
            mrn='TEST001'
        )
        
        self.daftar = Daftar.objects.create(
            pesakit=self.pesakit,
            study_instance_uid='1.2.3.4.5.6.7.8.9'
        )
        
        self.client = APIClient()
        token = self.get_jwt_token(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_batch_check_valid_uids(self):
        """Test batch check with valid study instance UIDs"""
        url = reverse('bcs:registration-batch-check-import-status')
        data = {
            'study_instance_uids': [
                '1.2.3.4.5.6.7.8.9',  # Exists
                '1.2.3.4.5.6.7.8.10'  # Doesn't exist
            ]
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        imported_studies = response.data['imported_studies']
        self.assertIn('1.2.3.4.5.6.7.8.9', imported_studies)
        self.assertEqual(imported_studies['1.2.3.4.5.6.7.8.9'], self.daftar.id)
        self.assertNotIn('1.2.3.4.5.6.7.8.10', imported_studies)
    
    def test_batch_check_empty_uids(self):
        """Test batch check with empty UIDs list"""
        url = reverse('bcs:registration-batch-check-import-status')
        data = {'study_instance_uids': []}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_batch_check_invalid_uids(self):
        """Test batch check with invalid UIDs (None, empty string)"""
        url = reverse('bcs:registration-batch-check-import-status')
        data = {
            'study_instance_uids': [
                '1.2.3.4.5.6.7.8.9',  # Valid
                '',  # Empty string
                None,  # None value
                '   '  # Whitespace only
            ]
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        # Should only process the valid UID
        imported_studies = response.data['imported_studies']
        self.assertEqual(len(imported_studies), 1)
        self.assertIn('1.2.3.4.5.6.7.8.9', imported_studies)
    
    def test_batch_check_no_valid_uids(self):
        """Test batch check when no UIDs are valid"""
        url = reverse('bcs:registration-batch-check-import-status')
        data = {
            'study_instance_uids': ['', None, '   ']
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['imported_studies']), 0)


class PacsUploadDestinationsTest(APITestCase):
    """Test PACS upload destinations functionality"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        # Create test PACS servers
        self.primary_server = PacsServer.objects.create(
            name='Primary Server',
            orthancurl='http://primary.example.com:8042',
            viewrurl='http://primary.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=True
        )
        
        self.secondary_server = PacsServer.objects.create(
            name='Secondary Server',
            orthancurl='http://secondary.example.com:8042',
            viewrurl='http://secondary.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            is_primary=False
        )
        
        # Create inactive server (should not appear in results)
        PacsServer.objects.create(
            name='Inactive Server',
            orthancurl='http://inactive.example.com:8042',
            viewrurl='http://inactive.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=False,
            is_primary=False
        )
        
        self.client = APIClient()
        token = self.get_jwt_token(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    
    def get_jwt_token(self, user):
        """Get JWT token for user"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_get_upload_destinations(self):
        """Test getting PACS upload destinations"""
        url = reverse('bcs:pacs-upload-destinations')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should return only active servers
        servers = response.data['servers']
        self.assertEqual(len(servers), 2)
        
        # Should identify primary server
        primary_server_id = response.data['primary_server_id']
        self.assertEqual(primary_server_id, self.primary_server.id)
        
        # Check server data
        server_names = [server['name'] for server in servers]
        self.assertIn('Primary Server', server_names)
        self.assertIn('Secondary Server', server_names)
        self.assertNotIn('Inactive Server', server_names)


if __name__ == '__main__':
    import unittest
    unittest.main()