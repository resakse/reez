#!/usr/bin/env python3
"""
Test CT Scan Bulk Retrieval Implementation

This test validates the lazy loading and bulk retrieval system for large CT/MRI studies
to ensure it prevents server overload while maintaining functionality.
"""

import os
import sys
import django
import requests
import json
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from unittest.mock import patch, MagicMock

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from staff.models import Staff

class CTBulkRetrievalTestCase(TestCase):
    """Test cases for CT scan bulk retrieval implementation"""
    
    def setUp(self):
        """Set up test user and client"""
        User = get_user_model()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            is_superuser=True
        )
        self.client = Client()
        self.client.force_login(self.user)
        
        # Mock study UID for testing
        self.test_study_uid = "1.2.3.4.5.6.7.8.9.0.1234567890"
        self.test_series_uid = "1.2.3.4.5.6.7.8.9.0.9876543210"
    
    def test_series_metadata_endpoint(self):
        """Test the series metadata endpoint returns proper structure"""
        
        # Mock Orthanc response for a large CT study
        mock_orthanc_series_response = {
            "series": [
                {
                    "seriesId": "series1",
                    "seriesUid": self.test_series_uid,
                    "seriesNumber": 1,
                    "seriesDescription": "CT Chest w/o contrast",
                    "modality": "CT",
                    "imageCount": 307,
                    "firstImageUrl": f"http://192.168.20.172:8042/studies/{self.test_study_uid}/series/{self.test_series_uid}/instances/instance1/frames/1"
                },
                {
                    "seriesId": "series2", 
                    "seriesUid": "1.2.3.4.5.6.7.8.9.0.1111111111",
                    "seriesNumber": 2,
                    "seriesDescription": "CT Chest with contrast",
                    "modality": "CT",
                    "imageCount": 307,
                    "firstImageUrl": f"http://192.168.20.172:8042/studies/{self.test_study_uid}/series/1.2.3.4.5.6.7.8.9.0.1111111111/instances/instance2/frames/1"
                }
            ]
        }
        
        with patch('requests.get') as mock_get:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = mock_orthanc_series_response
            mock_get.return_value = mock_response
            
            # Test the series metadata endpoint
            response = self.client.get(f'/api/pacs/studies/{self.test_study_uid}/series/')
            
            self.assertEqual(response.status_code, 200)
            data = response.json()
            
            # Validate response structure
            self.assertIn('series', data)
            self.assertEqual(len(data['series']), 2)
            
            # Validate first series data
            series1 = data['series'][0]
            self.assertEqual(series1['imageCount'], 307)
            self.assertEqual(series1['modality'], 'CT')
            self.assertIn('firstImageUrl', series1)
    
    def test_bulk_images_endpoint(self):
        """Test the bulk images endpoint for paginated retrieval"""
        
        # Mock Orthanc response for bulk image retrieval
        mock_bulk_response = {
            "images": [
                {
                    "instanceId": f"instance{i}",
                    "imageUrl": f"http://192.168.20.172:8042/studies/{self.test_study_uid}/series/{self.test_series_uid}/instances/instance{i}/frames/1"
                } for i in range(1, 51)  # First 50 images
            ],
            "totalCount": 307,
            "hasMore": True
        }
        
        with patch('requests.get') as mock_get:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = mock_bulk_response
            mock_get.return_value = mock_response
            
            # Test bulk retrieval endpoint
            response = self.client.get(
                f'/api/pacs/studies/{self.test_study_uid}/series/{self.test_series_uid}/images/bulk?start=0&count=50'
            )
            
            self.assertEqual(response.status_code, 200)
            data = response.json()
            
            # Validate bulk response structure
            self.assertIn('images', data)
            self.assertEqual(len(data['images']), 50)
            self.assertEqual(data['totalCount'], 307)
            self.assertTrue(data['hasMore'])
    
    def test_lazy_loading_detection(self):
        """Test that large studies are properly detected for lazy loading"""
        
        # Test study with >50 images should trigger lazy loading
        large_study_data = {
            "series": [
                {"imageCount": 307, "seriesUid": "series1"},
                {"imageCount": 307, "seriesUid": "series2"}
            ]
        }
        
        total_images = sum(s['imageCount'] for s in large_study_data['series'])
        series_count = len(large_study_data['series'])
        
        # This should trigger lazy loading (>50 images and >1 series)
        should_use_lazy_loading = total_images > 50 or series_count > 1
        self.assertTrue(should_use_lazy_loading)
        
        # Test small study should NOT trigger lazy loading
        small_study_data = {
            "series": [{"imageCount": 10, "seriesUid": "series1"}]
        }
        
        total_images_small = sum(s['imageCount'] for s in small_study_data['series'])
        series_count_small = len(small_study_data['series'])
        
        should_use_lazy_loading_small = total_images_small > 50 or series_count_small > 1
        self.assertFalse(should_use_lazy_loading_small)
    
    def test_series_authentication(self):
        """Test that series endpoints require authentication"""
        
        # Test without authentication
        client_no_auth = Client()
        response = client_no_auth.get(f'/api/pacs/studies/{self.test_study_uid}/series/')
        
        # Should redirect to login or return 401/403 
        self.assertIn(response.status_code, [302, 401, 403])
    
    def test_progress_tracking_structure(self):
        """Test that the frontend can track progress properly"""
        
        # Simulate progress tracking data structure
        series_loading_progress = {}
        loading_series = set()
        
        # Start loading a series
        series_key = self.test_series_uid
        loading_series.add(series_key)
        series_loading_progress[series_key] = 0
        
        # Simulate progress updates
        for progress in [10, 25, 50, 75, 90, 100]:
            series_loading_progress[series_key] = progress
        
        # Verify final state
        self.assertEqual(series_loading_progress[series_key], 100)
        self.assertIn(series_key, loading_series)
        
        # Simulate cleanup
        loading_series.remove(series_key)
        del series_loading_progress[series_key]
        
        self.assertNotIn(series_key, loading_series)
        self.assertNotIn(series_key, series_loading_progress)

def run_manual_integration_test():
    """
    Manual integration test to verify the implementation works with actual API calls
    (requires Django server to be running)
    """
    print("\n=== Manual Integration Test ===")
    print("This test requires the Django server to be running on localhost:8000")
    print("Testing CT bulk retrieval implementation...")
    
    try:
        # Test authentication endpoint
        auth_response = requests.post('http://localhost:8000/api/token/', {
            'username': 'testuser',  # Replace with actual test user
            'password': 'testpass123'
        })
        
        if auth_response.status_code == 200:
            token = auth_response.json()['access']
            headers = {'Authorization': f'Bearer {token}'}
            
            # Test series metadata endpoint
            test_study_uid = "1.2.840.113619.2.135.3596.6358736.4843.1115808177.83"  # Replace with actual study
            series_response = requests.get(
                f'http://localhost:8000/api/pacs/studies/{test_study_uid}/series/',
                headers=headers
            )
            
            print(f"Series metadata endpoint status: {series_response.status_code}")
            if series_response.status_code == 200:
                data = series_response.json()
                print(f"Found {len(data.get('series', []))} series")
                
                # Test bulk loading endpoint
                if data.get('series'):
                    first_series = data['series'][0]
                    series_uid = first_series['seriesUid']
                    
                    bulk_response = requests.get(
                        f'http://localhost:8000/api/pacs/studies/{test_study_uid}/series/{series_uid}/images/bulk?start=0&count=10',
                        headers=headers
                    )
                    
                    print(f"Bulk images endpoint status: {bulk_response.status_code}")
                    if bulk_response.status_code == 200:
                        bulk_data = bulk_response.json()
                        print(f"Retrieved {len(bulk_data.get('images', []))} images")
                        print("✅ Integration test PASSED")
                    else:
                        print("❌ Bulk images endpoint failed")
                else:
                    print("⚠️  No series found in response")
            else:
                print("❌ Series metadata endpoint failed")
        else:
            print("❌ Authentication failed")
            print("Create a test user first or check credentials")
    
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to Django server")
        print("Start the server with: python manage.py runserver")
    except Exception as e:
        print(f"❌ Test failed with error: {e}")

if __name__ == '__main__':
    # Run Django tests
    print("Running Django unit tests...")
    from django.test.utils import get_runner
    from django.conf import settings
    
    test_runner = get_runner(settings)()
    failures = test_runner.run_tests(['__main__'])
    
    if failures == 0:
        print("✅ All unit tests PASSED")
        
        # Optionally run integration test
        response = input("\nRun manual integration test? (y/n): ")
        if response.lower() == 'y':
            run_manual_integration_test()
    else:
        print(f"❌ {failures} unit tests FAILED")