from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from audit.models import AuditLog
from .models import DicomAnnotation
import json

User = get_user_model()


class DicomAnnotationModelTest(TestCase):
    """Test cases for DicomAnnotation model"""
    
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='radiologist1',
            first_name='Dr. John',
            last_name='Smith',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='radiologist2',
            first_name='Dr. Jane',
            last_name='Doe',
            password='testpass123'
        )
        
        self.annotation_data = {
            'study_instance_uid': '1.2.826.0.1.3680043.8.498.12345',
            'series_instance_uid': '1.2.826.0.1.3680043.8.498.12346',
            'sop_instance_uid': '1.2.826.0.1.3680043.8.498.12347',
            'image_id': 'wadouri:http://localhost:8042/wado?requestType=WADO&studyUID=1.2.826.0.1.3680043.8.498.12345',
            'annotation_type': 'length',
            'annotation_data': {
                'handles': {
                    'points': [[100, 100], [200, 200]],
                    'activeHandleIndex': 0
                },
                'length': 141.42,
                'unit': 'mm'
            },
            'label': 'Test Measurement',
            'measurement_value': 141.42,
            'measurement_unit': 'mm'
        }
    
    def test_create_annotation(self):
        """Test creating a new annotation"""
        annotation = DicomAnnotation.objects.create(
            user=self.user1,
            **self.annotation_data
        )
        
        self.assertEqual(annotation.user, self.user1)
        self.assertEqual(annotation.annotation_type, 'length')
        self.assertEqual(annotation.measurement_value, 141.42)
        self.assertTrue(annotation.created_at)
        self.assertTrue(annotation.modified_at)
        
        # Check audit log was created
        audit_logs = AuditLog.objects.filter(
            resource_type='DicomAnnotation',
            resource_id=str(annotation.pk),
            action='CREATE'
        )
        self.assertEqual(audit_logs.count(), 1)
    
    def test_annotation_ownership(self):
        """Test annotation ownership methods"""
        annotation = DicomAnnotation.objects.create(
            user=self.user1,
            **self.annotation_data
        )
        
        # User1 can delete and edit
        self.assertTrue(annotation.can_delete(self.user1))
        self.assertTrue(annotation.can_edit(self.user1))
        
        # User2 cannot delete or edit
        self.assertFalse(annotation.can_delete(self.user2))
        self.assertFalse(annotation.can_edit(self.user2))
    
    def test_annotation_str_representation(self):
        """Test string representation of annotation"""
        annotation = DicomAnnotation.objects.create(
            user=self.user1,
            **self.annotation_data
        )
        
        expected_str = f"length - Test Measurement by {self.user1.get_full_name()}"
        self.assertEqual(str(annotation), expected_str)
    
    def test_annotation_display_name(self):
        """Test display name generation"""
        annotation = DicomAnnotation.objects.create(
            user=self.user1,
            **self.annotation_data
        )
        
        self.assertEqual(annotation.get_display_name(), "Length - Test Measurement")
        self.assertEqual(annotation.get_measurement_display(), "141.42 mm")
    
    def test_annotation_deletion_audit(self):
        """Test that deletion creates audit log"""
        annotation = DicomAnnotation.objects.create(
            user=self.user1,
            **self.annotation_data
        )
        annotation_id = annotation.pk
        
        # Delete annotation
        annotation.delete()
        
        # Check deletion audit log was created
        delete_logs = AuditLog.objects.filter(
            resource_type='DicomAnnotation',
            resource_id=str(annotation_id),
            action='DELETE'
        )
        self.assertEqual(delete_logs.count(), 1)


class DicomAnnotationAPITest(APITestCase):
    """Test cases for DicomAnnotation API endpoints"""
    
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='radiologist1',
            first_name='Dr. John',
            last_name='Smith',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='radiologist2',
            first_name='Dr. Jane',
            last_name='Doe',
            password='testpass123'
        )
        
        # Create JWT tokens for authentication
        self.token1 = RefreshToken.for_user(self.user1).access_token
        self.token2 = RefreshToken.for_user(self.user2).access_token
        
        self.client1 = APIClient()
        self.client1.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token1}')
        
        self.client2 = APIClient()
        self.client2.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token2}')
        
        self.annotation_data = {
            'study_instance_uid': '1.2.826.0.1.3680043.8.498.12345',
            'series_instance_uid': '1.2.826.0.1.3680043.8.498.12346',
            'sop_instance_uid': '1.2.826.0.1.3680043.8.498.12347',
            'image_id': 'wadouri:http://localhost:8042/wado?requestType=WADO&studyUID=1.2.826.0.1.3680043.8.498.12345',
            'annotation_type': 'length',
            'annotation_data': {
                'handles': {'points': [[100, 100], [200, 200]]},
                'length': 141.42
            },
            'label': 'Test Measurement',
            'measurement_value': 141.42,
            'measurement_unit': 'mm'
        }
    
    def test_create_annotation_api(self):
        """Test creating annotation via API"""
        url = reverse('dicom-annotations-list')
        response = self.client1.post(url, self.annotation_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DicomAnnotation.objects.count(), 1)
        
        annotation = DicomAnnotation.objects.first()
        self.assertEqual(annotation.user, self.user1)
        self.assertEqual(annotation.annotation_type, 'length')
    
    def test_list_annotations_api(self):
        """Test listing annotations via API"""
        # Create annotations for both users
        DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        annotation_data_2 = self.annotation_data.copy()
        annotation_data_2['label'] = 'User 2 Annotation'
        DicomAnnotation.objects.create(user=self.user2, **annotation_data_2)
        
        url = reverse('dicom-annotations-list')
        response = self.client1.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Handle paginated response format
        if 'results' in response.data:
            self.assertEqual(len(response.data['results']), 2)  # Both annotations visible to user1
        else:
            self.assertEqual(len(response.data), 2)
    
    def test_filter_by_study_uid(self):
        """Test filtering annotations by study UID"""
        # Create annotation with different study UID
        different_study_data = self.annotation_data.copy()
        different_study_data['study_instance_uid'] = '1.2.826.0.1.3680043.8.498.99999'
        
        DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        DicomAnnotation.objects.create(user=self.user1, **different_study_data)
        
        url = reverse('dicom-annotations-list')
        response = self.client1.get(url, {'study_uid': self.annotation_data['study_instance_uid']})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Handle paginated response format
        if 'results' in response.data:
            self.assertEqual(len(response.data['results']), 1)
            self.assertEqual(response.data['results'][0]['study_instance_uid'], self.annotation_data['study_instance_uid'])
        else:
            self.assertEqual(len(response.data), 1)
            self.assertEqual(response.data[0]['study_instance_uid'], self.annotation_data['study_instance_uid'])
    
    def test_by_study_endpoint(self):
        """Test the by_study custom endpoint"""
        DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        url = reverse('dicom-annotations-by-study')
        response = self.client1.get(url, {'study_uid': self.annotation_data['study_instance_uid']})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_my_annotations_endpoint(self):
        """Test the my_annotations custom endpoint"""
        # Create annotations for both users
        DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        annotation_data_2 = self.annotation_data.copy()
        annotation_data_2['label'] = 'User 2 Annotation'
        DicomAnnotation.objects.create(user=self.user2, **annotation_data_2)
        
        url = reverse('dicom-annotations-my-annotations')
        response = self.client1.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # Only user1's annotation
        self.assertEqual(response.data[0]['label'], 'Test Measurement')
    
    def test_delete_own_annotation(self):
        """Test user can delete their own annotation"""
        annotation = DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        url = reverse('dicom-annotations-detail', kwargs={'pk': annotation.pk})
        response = self.client1.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(DicomAnnotation.objects.count(), 0)
    
    def test_cannot_delete_others_annotation(self):
        """Test user cannot delete other user's annotation"""
        annotation = DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        url = reverse('dicom-annotations-detail', kwargs={'pk': annotation.pk})
        response = self.client2.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(DicomAnnotation.objects.count(), 1)  # Annotation still exists
    
    def test_cannot_edit_others_annotation(self):
        """Test user cannot edit other user's annotation"""
        annotation = DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        url = reverse('dicom-annotations-detail', kwargs={'pk': annotation.pk})
        update_data = {'label': 'Modified Label'}
        response = self.client2.patch(url, update_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Verify annotation wasn't modified
        annotation.refresh_from_db()
        self.assertEqual(annotation.label, 'Test Measurement')
    
    def test_bulk_delete_endpoint(self):
        """Test bulk delete functionality"""
        annotation1 = DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        annotation_data_2 = self.annotation_data.copy()
        annotation_data_2['label'] = 'Second Annotation'
        annotation2 = DicomAnnotation.objects.create(user=self.user1, **annotation_data_2)
        
        # Create annotation for user2 (should not be deleted)
        annotation_data_3 = self.annotation_data.copy()
        annotation_data_3['label'] = 'User 2 Annotation'
        annotation3 = DicomAnnotation.objects.create(user=self.user2, **annotation_data_3)
        
        url = reverse('dicom-annotations-bulk-delete')
        bulk_data = {'annotation_ids': [annotation1.pk, annotation2.pk, annotation3.pk]}
        response = self.client1.delete(url, bulk_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Successfully deleted 2 annotations', response.data['message'])
        
        # Only user1's annotations should be deleted
        self.assertEqual(DicomAnnotation.objects.count(), 1)
        self.assertTrue(DicomAnnotation.objects.filter(user=self.user2).exists())
    
    def test_unauthenticated_access_denied(self):
        """Test unauthenticated users cannot access the API"""
        client = APIClient()  # No authentication
        
        url = reverse('dicom-annotations-list')
        response = client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_annotation_serializer_fields(self):
        """Test annotation serializer returns expected fields"""
        annotation = DicomAnnotation.objects.create(user=self.user1, **self.annotation_data)
        
        url = reverse('dicom-annotations-detail', kwargs={'pk': annotation.pk})
        response = self.client1.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        expected_fields = [
            'id', 'study_instance_uid', 'series_instance_uid', 
            'sop_instance_uid', 'image_id', 'frame_number',
            'annotation_type', 'annotation_data', 'label', 'description',
            'measurement_value', 'measurement_unit', 'created_at', 'modified_at',
            'user_full_name', 'user_username', 'can_delete', 'can_edit',
            'display_name', 'measurement_display'
        ]
        
        for field in expected_fields:
            self.assertIn(field, response.data)
        
        # Verify user-specific fields
        self.assertEqual(response.data['user_full_name'], self.user1.get_full_name())
        self.assertEqual(response.data['user_username'], self.user1.username)
        self.assertTrue(response.data['can_delete'])
        self.assertTrue(response.data['can_edit'])


class AnnotationAuditTest(TestCase):
    """Test audit logging for annotation operations"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='radiologist1',
            first_name='Dr. John',
            last_name='Smith',
            password='testpass123'
        )
        
        self.annotation_data = {
            'study_instance_uid': '1.2.826.0.1.3680043.8.498.12345',
            'series_instance_uid': '1.2.826.0.1.3680043.8.498.12346',
            'sop_instance_uid': '1.2.826.0.1.3680043.8.498.12347',
            'image_id': 'wadouri:http://localhost:8042/wado',
            'annotation_type': 'length',
            'annotation_data': {'length': 141.42},
            'label': 'Test Measurement',
            'measurement_value': 141.42,
            'measurement_unit': 'mm'
        }
    
    def test_create_audit_logging(self):
        """Test audit log creation for new annotations"""
        initial_count = AuditLog.objects.count()
        
        annotation = DicomAnnotation.objects.create(user=self.user, **self.annotation_data)
        
        # Should have one more audit log entry
        self.assertEqual(AuditLog.objects.count(), initial_count + 1)
        
        # Verify audit log details
        audit_log = AuditLog.objects.latest('timestamp')
        self.assertEqual(audit_log.user, self.user)
        self.assertEqual(audit_log.action, 'CREATE')
        self.assertEqual(audit_log.resource_type, 'DicomAnnotation')
        self.assertEqual(audit_log.resource_id, str(annotation.pk))
        self.assertTrue(audit_log.success)
        self.assertIsNotNone(audit_log.new_data)
    
    def test_update_audit_logging(self):
        """Test audit log creation for annotation updates"""
        annotation = DicomAnnotation.objects.create(user=self.user, **self.annotation_data)
        initial_count = AuditLog.objects.count()
        
        # Update the annotation
        annotation.label = 'Updated Label'
        annotation.save()
        
        # Should have one more audit log entry
        self.assertEqual(AuditLog.objects.count(), initial_count + 1)
        
        # Verify update audit log
        audit_log = AuditLog.objects.latest('timestamp')
        self.assertEqual(audit_log.action, 'UPDATE')
        self.assertIsNotNone(audit_log.old_data)
        self.assertIsNotNone(audit_log.new_data)
    
    def test_delete_audit_logging(self):
        """Test audit log creation for annotation deletion"""
        annotation = DicomAnnotation.objects.create(user=self.user, **self.annotation_data)
        annotation_id = annotation.pk
        initial_count = AuditLog.objects.count()
        
        # Delete the annotation
        annotation.delete()
        
        # Should have one more audit log entry
        self.assertEqual(AuditLog.objects.count(), initial_count + 1)
        
        # Verify delete audit log
        audit_log = AuditLog.objects.latest('timestamp')
        self.assertEqual(audit_log.action, 'DELETE')
        self.assertEqual(audit_log.resource_id, str(annotation_id))
        self.assertIsNotNone(audit_log.old_data)
        self.assertTrue(audit_log.success)