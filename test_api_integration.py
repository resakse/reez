#!/usr/bin/env python
"""
Simple API integration test script for the new grouped examination endpoints.
Run this with: poetry run python test_api_integration.py
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
import json
import requests

from exam.models import Daftar, Pemeriksaan, Exam, Modaliti, Part
from pesakit.models import Pesakit
from wad.models import Ward

User = get_user_model()

def test_api_endpoints():
    """Test the new API endpoints"""
    print("🧪 Testing API Integration...")
    
    # Create test data
    print("📊 Creating test data...")
    
    # Create or get user
    try:
        user = User.objects.create_user(
            username='testapi',
            password='testpass123'
        )
        print("Created new test user")
    except Exception:
        user = User.objects.get(username='testapi')
        print("Using existing test user")
    
    # Create or get patient with unique NRIC
    import time
    unique_nric = f'990101-01-{int(time.time()) % 10000:04d}'
    patient, created = Pesakit.objects.get_or_create(
        nric=unique_nric,
        defaults={
            'nama': 'Test Patient API',
            'jantina': 'L',
            'jxr': user
        }
    )
    
    # Create or get ward
    ward, created = Ward.objects.get_or_create(wad='Test Ward API')
    
    # Create or get modality
    modaliti, created = Modaliti.objects.get_or_create(
        singkatan='XR',
        defaults={'nama': 'X-Ray'}
    )
    
    # Create or get parts
    chest_part, created = Part.objects.get_or_create(part='CHEST')
    hand_part, created = Part.objects.get_or_create(part='HAND')
    
    # Create or get exams with more specific lookup
    chest_exam, created = Exam.objects.get_or_create(
        exam='Chest X-Ray',
        modaliti=modaliti,
        part=chest_part,
        defaults={
            'contrast': False,
            'status_ca': 'ENABLE'
        }
    )
    
    hand_exam, created = Exam.objects.get_or_create(
        exam='Hand X-Ray',
        modaliti=modaliti,
        part=hand_part,
        defaults={
            'contrast': False,
            'status_ca': 'ENABLE'
        }
    )
    
    # Get JWT token
    print("🔐 Getting JWT token...")
    base_url = 'http://localhost:8000'
    
    token_response = requests.post(f'{base_url}/api/token/', json={
        'username': 'testapi',
        'password': 'testpass123'
    })
    
    if token_response.status_code != 200:
        print(f"❌ Failed to get token: {token_response.status_code}")
        print(f"Response: {token_response.text}")
        raise Exception("Authentication failed")
    
    token_data = token_response.json()
    access_token = token_data['access']
    
    # Set up headers for authenticated requests
    auth_headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    print("✅ Test data created successfully")
    
    # Test 1: Position Choices API
    print("\n🔍 Testing Position Choices API...")
    response = requests.get(f'{base_url}/api/choices/positions/', headers=auth_headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert 'patient_positions' in data, "Missing patient_positions in response"
    assert 'body_positions' in data, "Missing body_positions in response"
    assert 'laterality_choices' in data, "Missing laterality_choices in response"
    
    print("✅ Position Choices API working correctly")
    
    # Test 2: Grouped Examination Creation API
    print("\n🔍 Testing Grouped Examination Creation API...")
    
    grouped_data = {
        'pesakit_id': patient.id,
        'modality': 'XR',
        'study_description': 'Multi-part X-Ray Series',
        'study_priority': 'MEDIUM',
        'rujukan_id': ward.id,
        'pemohon': 'Dr. Test',
        'no_resit': 'RCT001',
        'ambulatori': 'Berjalan',
        'hamil': False,
        'examinations': [
            {
                'exam_id': chest_exam.id,
                'patient_position': 'AP',
                'body_position': 'ERECT',
                'catatan': 'Normal chest X-ray'
            },
            {
                'exam_id': hand_exam.id,
                'patient_position': 'PA',
                'body_position': 'ERECT',
                'laterality': 'Kanan',
                'catatan': 'Right hand injury follow-up'
            }
        ]
    }
    
    response = requests.post(
        f'{base_url}/api/examinations/grouped/',
        json=grouped_data,
        headers=auth_headers
    )
    
    if response.status_code != 201:
        print(f"Error response: {response.status_code}")
        print(f"Response content: {response.text}")
    assert response.status_code == 201, f"Expected 201, got {response.status_code}"
    
    response_data = response.json()
    assert 'study' in response_data, "Missing study in response"
    assert 'examinations' in response_data, "Missing examinations in response"
    assert len(response_data['examinations']) == 2, "Expected 2 examinations"
    
    study_id = response_data['study']['id']
    parent_accession = response_data['study']['parent_accession_number']
    
    print(f"✅ Created grouped study: {parent_accession}")
    print(f"   - Study ID: {study_id}")
    print(f"   - Examinations: {len(response_data['examinations'])}")
    
    # Verify in database
    study = Daftar.objects.get(id=study_id)
    examinations = study.pemeriksaan.all()
    
    assert study.parent_accession_number == parent_accession
    assert examinations.count() == 2
    assert examinations.filter(exam=chest_exam).exists()
    assert examinations.filter(exam=hand_exam).exists()
    
    print("✅ Database verification passed")
    
    # Test 3: Grouped MWL API
    print("\n🔍 Testing Grouped MWL API...")
    
    response = requests.get(f'{base_url}/api/mwl/grouped/', headers=auth_headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    mwl_data = response.json()
    assert 'count' in mwl_data, "Missing count in MWL response"
    assert 'results' in mwl_data, "Missing results in MWL response"
    assert mwl_data['count'] >= 1, f"Expected at least 1 study, got {mwl_data['count']}"
    
    # Find our created study in the results
    study_entry = None
    for entry in mwl_data['results']:
        if entry['parent_accession_number'] == parent_accession:
            study_entry = entry
            break
    
    assert study_entry is not None, f"Created study {parent_accession} not found in MWL results"
    assert len(study_entry['examinations']) == 2
    
    # Check child examinations
    chest_found = False
    hand_found = False
    
    for exam in study_entry['examinations']:
        if 'Chest' in exam['exam_description']:
            chest_found = True
            assert exam['patient_position'] == 'AP'
            assert exam['body_position'] == 'ERECT'
        elif 'Hand' in exam['exam_description']:
            hand_found = True
            assert exam['patient_position'] == 'PA'
            assert exam['laterality'] == 'Kanan'
    
    assert chest_found and hand_found, "Not all examinations found in MWL"
    
    print("✅ Grouped MWL API working correctly")
    
    # Test 4: MWL Filtering
    print("\n🔍 Testing MWL Filtering...")
    
    response = requests.get(f'{base_url}/api/mwl/grouped/?modality=XR&priority=MEDIUM', headers=auth_headers)
    assert response.status_code == 200
    
    filtered_data = response.json()
    assert filtered_data['count'] >= 1, f"Filtering should return at least 1 study (our test study)"
    
    # Verify our study is in the filtered results
    our_study_found = any(entry['parent_accession_number'] == parent_accession for entry in filtered_data['results'])
    assert our_study_found, "Our test study should be in the filtered results"
    
    response = requests.get(f'{base_url}/api/mwl/grouped/?modality=NONEXISTENT', headers=auth_headers)
    filtered_data = response.json()
    assert filtered_data['count'] == 0, "Non-existent modality filter should return 0 studies"
    
    print("✅ MWL filtering working correctly")
    
    print("\n🎉 All API integration tests passed!")
    print("\n📋 Summary:")
    print(f"   ✅ Position Choices API: /api/choices/positions/")
    print(f"   ✅ Grouped Examination API: /api/examinations/grouped/")
    print(f"   ✅ Grouped MWL API: /api/mwl/grouped/")
    print(f"   ✅ MWL Filtering: Query parameters working")
    print(f"\n   📊 Created study: {parent_accession}")
    print(f"   📊 With {examinations.count()} examinations")
    
    # Cleanup
    print("\n🧹 Cleaning up test data...")
    try:
        study.delete()  # This will cascade to examinations
        patient.delete()
        ward.delete()
        modaliti.delete()
        chest_part.delete()
        hand_part.delete()
        # Don't delete user in case other tests are using it
        print("✅ Cleanup completed")
    except Exception as e:
        print(f"⚠️ Cleanup warning: {e}")
    return True

if __name__ == '__main__':
    try:
        success = test_api_endpoints()
        if success:
            print("\n🚀 Phase 2 API Integration: COMPLETE!")
            sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)