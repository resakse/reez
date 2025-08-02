#!/usr/bin/env python3
"""
Test script for Media Distribution API endpoints
"""

import os
import sys
import django
import json
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.models import MediaDistribution, Daftar
from pesakit.models import Pesakit
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

User = get_user_model()

def create_test_data():
    """Create test data for media distribution testing"""
    print("=== Creating Test Data ===")
    
    # Get or create a test patient
    patient, created = Pesakit.objects.get_or_create(
        nric='123456-12-1234',
        defaults={
            'nama': 'Test Patient',
            'mrn': 'MRN001', 
            'jantina': 'L',
            'bangsa': 'Melayu'
        }
    )
    status_str = 'created' if created else 'exists'
    print(f"Patient: {patient.nama} ({status_str})")
    
    # Get or create a test study (Daftar)
    study, created = Daftar.objects.get_or_create(
        pesakit=patient,
        tarikh=datetime.now().date(),
        parent_accession_number='ACC001',
        defaults={
            'study_description': 'Chest X-Ray',
            'study_status': 'COMPLETED',
            'study_instance_uid': 'test.study.uid.001',
            'ambulatori': 'OUTPATIENT'
        }
    )
    status_str = 'created' if created else 'exists'
    print(f"Study: {study.parent_accession_number} ({status_str})")
    
    # Create test user for authentication
    user, created = User.objects.get_or_create(
        username='testuser',
        defaults={
            'first_name': 'Test',
            'last_name': 'User',
            'email': 'test@example.com'
        }
    )
    status_str = 'created' if created else 'exists'
    print(f"User: {user.username} ({status_str})")
    
    # Clean up old test distributions
    MediaDistribution.objects.filter(daftar=study).delete()
    
    # Create test media distributions
    test_distributions = [
        {
            'daftar': study,
            'media_type': 'CD',
            'quantity': 1,
            'status': 'REQUESTED',
            'urgency': 'NORMAL',
            'comments': 'Test CD request'
        },
        {
            'daftar': study,
            'media_type': 'DVD', 
            'quantity': 2,
            'status': 'READY',
            'urgency': 'URGENT',
            'comments': 'Test DVD request - urgent'
        },
        {
            'daftar': study,
            'media_type': 'X-Ray Film',
            'quantity': 5,
            'status': 'COLLECTED',
            'urgency': 'STAT',
            'comments': 'Test film request - completed',
            'collected_by': 'John Doe',
            'collected_by_ic': '789012-34-5678',
            'relationship_to_patient': 'Self',
            'collection_datetime': datetime.now()
        }
    ]
    
    for i, dist_data in enumerate(test_distributions):
        dist = MediaDistribution.objects.create(**dist_data)
        print(f"Distribution {i+1}: {dist.media_type} - {dist.status} (created)")
    
    return patient, study, user

def test_api_endpoints():
    """Test the Media Distribution API endpoints"""
    print("\n=== Testing API Endpoints ===")
    
    patient, study, user = create_test_data()
    
    # Create API client
    client = Client()
    
    # Test authentication
    print("\n1. Testing Authentication...")
    login_response = client.post('/api/token/', {
        'username': user.username,
        'password': 'testpass123'  # This won't work, but we'll use direct auth
    })
    
    # For testing, we'll create a direct API request
    from rest_framework.test import APIClient
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    
    # Test GET /api/media-distributions/
    print("2. Testing GET /api/media-distributions/")
    try:
        response = api_client.get('/api/media-distributions/')
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Count: {data.get('count', 0)}")
            print(f"   Results: {len(data.get('results', []))}")
        else:
            print(f"   Error: {response.content}")
    except Exception as e:
        print(f"   Exception: {e}")
    
    # Test POST /api/media-distributions/
    print("3. Testing POST /api/media-distributions/")
    try:
        post_data = {
            'daftar_id': study.id,
            'media_type': 'USB',
            'quantity': 1,
            'urgency': 'NORMAL',
            'comments': 'API test request'
        }
        response = api_client.post('/api/media-distributions/', post_data, format='json')
        print(f"   Status: {response.status_code}")
        if response.status_code == 201:
            data = response.json()
            print(f"   Created ID: {data.get('id')}")
            print(f"   Media Type: {data.get('media_type')}")
            new_dist_id = data.get('id')
        else:
            print(f"   Error: {response.content}")
            new_dist_id = None
    except Exception as e:
        print(f"   Exception: {e}")
        new_dist_id = None
    
    # Test custom actions if we have a distribution
    if new_dist_id:
        print(f"4. Testing custom actions with distribution ID {new_dist_id}")
        
        # Test mark ready
        try:
            response = api_client.patch(f'/api/media-distributions/{new_dist_id}/mark-ready/')
            print(f"   Mark Ready Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   New Status: {data.get('status')}")
        except Exception as e:
            print(f"   Mark Ready Exception: {e}")
        
        # Test record collection
        try:
            collection_data = {
                'collected_by': 'Jane Smith',
                'collected_by_ic': '987654-32-1098',
                'relationship_to_patient': 'Spouse',
                'comments': 'API test collection'
            }
            response = api_client.patch(f'/api/media-distributions/{new_dist_id}/collect/', 
                                     collection_data, format='json')
            print(f"   Collect Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   Final Status: {data.get('status')}")
                print(f"   Collected By: {data.get('collected_by')}")
        except Exception as e:
            print(f"   Collect Exception: {e}")
    
    # Test stats endpoint
    print("5. Testing GET /api/media-distributions/stats/")
    try:
        response = api_client.get('/api/media-distributions/stats/')
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Total Requests: {data.get('total_requests')}")
            print(f"   Status Breakdown: {data.get('status_breakdown')}")
        else:
            print(f"   Error: {response.content}")
    except Exception as e:
        print(f"   Exception: {e}")
    
    # Test filtering
    print("6. Testing filtering")
    try:
        response = api_client.get('/api/media-distributions/?status=READY')
        print(f"   Filter by READY Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Ready Count: {data.get('count', 0)}")
        
        response = api_client.get('/api/media-distributions/?media_type=CD')
        print(f"   Filter by CD Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   CD Count: {data.get('count', 0)}")
            
    except Exception as e:
        print(f"   Filter Exception: {e}")

def check_model_structure():
    """Check the MediaDistribution model structure"""
    print("\n=== Checking Model Structure ===")
    
    # Check model fields
    fields = MediaDistribution._meta.fields
    print("MediaDistribution fields:")
    for field in fields:
        print(f"  - {field.name}: {field.__class__.__name__}")
    
    # Check current data count
    count = MediaDistribution.objects.count()
    print(f"\nCurrent MediaDistribution count: {count}")
    
    if count > 0:
        latest = MediaDistribution.objects.latest('created')
        print(f"Latest distribution: {latest.media_type} - {latest.status}")

def main():
    """Main test function"""
    print("Media Distribution API Test Suite")
    print("=" * 50)
    
    try:
        check_model_structure()
        test_api_endpoints()
        print("\n=== Test Complete ===")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()