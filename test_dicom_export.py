#!/usr/bin/env python
"""
Test script for DICOM worklist export functionality

This script tests the DICOM worklist export API endpoints including:
- JSON format export
- DICOM datasets export (for debugging)
- CSV export for CR/DR machine import
- Query filtering and format validation

Run with: poetry run python test_dicom_export.py
"""

import os
import sys
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.models import Daftar, Pemeriksaan, Exam, Modaliti, Part
from pesakit.models import Pesakit
from wad.models import Ward
from django.contrib.auth import get_user_model

User = get_user_model()

def test_dicom_export():
    """Test the DICOM worklist export functionality"""
    print("🧪 Testing DICOM Worklist Export...")
    
    # Setup test data
    print("📊 Setting up test data...")
    
    try:
        user = User.objects.get(username='testapi')
    except User.DoesNotExist:
        user = User.objects.create_user(username='testapi', password='testpass123')
    
    # Get JWT token
    base_url = 'http://localhost:8000'
    token_response = requests.post(f'{base_url}/api/token/', json={
        'username': 'testapi',
        'password': 'testpass123'
    })
    
    if token_response.status_code != 200:
        print(f"❌ Failed to get token: {token_response.status_code}")
        return False
    
    token_data = token_response.json()
    auth_headers = {
        'Authorization': f'Bearer {token_data["access"]}',
        'Content-Type': 'application/json'
    }
    
    print("✅ Authentication successful")
    
    # Test 1: JSON Export
    print("\n🔍 Testing JSON export...")
    
    response = requests.get(f'{base_url}/api/dicom/worklist/export/', headers=auth_headers)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    json_data = response.json()
    assert 'count' in json_data, "Missing count in JSON response"
    assert 'worklist_items' in json_data, "Missing worklist_items in JSON response"
    
    print(f"✅ JSON export returned {json_data['count']} worklist items")
    
    # Test 2: DICOM Datasets Export
    print("\n🔍 Testing DICOM datasets export...")
    
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?format=dicom_datasets', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    dicom_data = response.json()
    assert 'count' in dicom_data, "Missing count in DICOM response"
    assert 'dicom_datasets' in dicom_data, "Missing dicom_datasets in response"
    
    if dicom_data['count'] > 0:
        # Verify DICOM dataset structure
        first_dataset = dicom_data['dicom_datasets'][0]
        required_fields = ['PatientName', 'PatientID', 'StudyInstanceUID', 'AccessionNumber']
        for field in required_fields:
            assert field in first_dataset, f"Missing required DICOM field: {field}"
        
        print(f"✅ DICOM datasets export returned {dicom_data['count']} datasets")
        print(f"   - Sample patient: {first_dataset.get('PatientName', 'N/A')}")
        print(f"   - Sample accession: {first_dataset.get('AccessionNumber', 'N/A')}")
    else:
        print("✅ DICOM datasets export returned 0 datasets (no scheduled studies)")
    
    # Test 3: CSV Export
    print("\n🔍 Testing CSV export...")
    
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?format=csv', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.headers['Content-Type'] == 'text/csv', "Expected CSV content type"
    assert 'attachment' in response.headers.get('Content-Disposition', ''), "Expected attachment disposition"
    
    csv_content = response.text
    lines = csv_content.strip().split('\n')
    assert len(lines) >= 1, "CSV should have at least header row"
    
    # Verify CSV headers
    expected_headers = [
        'PatientName', 'PatientID', 'PatientSex', 'PatientBirthDate',
        'StudyInstanceUID', 'AccessionNumber', 'StudyDescription'
    ]
    header_line = lines[0]
    for header in expected_headers:
        assert header in header_line, f"Missing CSV header: {header}"
    
    print(f"✅ CSV export returned {len(lines)} lines (including header)")
    print(f"   - Headers: {header_line[:100]}{'...' if len(header_line) > 100 else ''}")
    
    # Test 4: Query Filtering
    print("\n🔍 Testing query filtering...")
    
    # Test modality filter
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?modality=XR', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    filtered_data = response.json()
    print(f"✅ Modality filter (XR) returned {filtered_data['count']} items")
    
    # Test date filter (today)
    from datetime import date
    today = date.today().isoformat()
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?date={today}', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    date_filtered_data = response.json()
    print(f"✅ Date filter ({today}) returned {date_filtered_data['count']} items")
    
    # Test 5: Invalid Format Handling
    print("\n🔍 Testing invalid format handling...")
    
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?format=invalid_format', 
        headers=auth_headers
    )
    assert response.status_code == 400, f"Expected 400 for invalid format, got {response.status_code}"
    
    error_data = response.json()
    assert 'error' in error_data, "Expected error message for invalid format"
    
    print("✅ Invalid format properly rejected")
    
    # Test 6: Format Combinations
    print("\n🔍 Testing format combinations...")
    
    # CSV with filters
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?format=csv&modality=XR&date={today}', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert response.headers['Content-Type'] == 'text/csv', "Expected CSV content type"
    
    print("✅ CSV export with filters working")
    
    # DICOM datasets with filters
    response = requests.get(
        f'{base_url}/api/dicom/worklist/export/?format=dicom_datasets&modality=XR', 
        headers=auth_headers
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    print("✅ DICOM datasets export with filters working")
    
    print("\n🎉 All DICOM export tests passed!")
    print("\n📋 Summary:")
    print("   ✅ JSON format export")
    print("   ✅ DICOM datasets export")
    print("   ✅ CSV format export")
    print("   ✅ Query filtering (modality, date)")
    print("   ✅ Invalid format handling")
    print("   ✅ Format combinations with filters")
    print("\n💡 Export formats available:")
    print("   - JSON: /api/dicom/worklist/export/")
    print("   - DICOM: /api/dicom/worklist/export/?format=dicom_datasets")
    print("   - CSV: /api/dicom/worklist/export/?format=csv")
    print("   - Filters: ?modality=XR&date=2025-01-26&accession=KKP123&patient_id=123456")
    
    return True

if __name__ == '__main__':
    try:
        success = test_dicom_export()
        if success:
            print("\n🚀 DICOM Worklist Export: READY!")
            sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)