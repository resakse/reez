#!/usr/bin/env python3
"""
Test script for the new Django PACS API endpoint
"""

import requests
import json
import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.test import Client
from exam.models import PacsConfig

User = get_user_model()

def test_pacs_api():
    """Test the PACS API endpoint"""
    
    # Create test client
    client = Client()
    
    # Create a test user (or use existing superuser)
    try:
        user = User.objects.get(is_superuser=True)
        print(f"✅ Using existing superuser: {user.username}")
    except User.DoesNotExist:
        print("❌ No superuser found - create one first")
        return
    
    # Login the user
    client.force_login(user)
    print("✅ User logged in")
    
    # Test empty search (should return all studies)
    print("\n--- Testing Empty Search ---")
    response = client.post(
        '/api/pacs/search/',
        data=json.dumps({}),
        content_type='application/json'
    )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success: Found {data.get('total', 0)} studies")
        if data.get('studies'):
            first_study = data['studies'][0]
            print(f"   First study: {first_study.get('patientName', 'N/A')} - {first_study.get('studyDate', 'N/A')}")
    else:
        try:
            error_data = response.json()
            print(f"❌ Error: {error_data}")
        except:
            print(f"❌ Error: {response.content}")
    
    # Test patient name search
    print("\n--- Testing Patient Name Search ---")
    response = client.post(
        '/api/pacs/search/',
        data=json.dumps({"patientName": "NUR"}),
        content_type='application/json'
    )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success: Found {data.get('total', 0)} studies with 'NUR' in name")
    else:
        try:
            error_data = response.json()
            print(f"❌ Error: {error_data}")
        except:
            print(f"❌ Error: {response.content}")
    
    # Test date range search
    print("\n--- Testing Date Range Search ---")
    response = client.post(
        '/api/pacs/search/',
        data=json.dumps({
            "dateFrom": "2024-10-01",
            "dateTo": "2024-10-31"
        }),
        content_type='application/json'
    )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success: Found {data.get('total', 0)} studies in October 2024")
    else:
        try:
            error_data = response.json()
            print(f"❌ Error: {error_data}")
        except:
            print(f"❌ Error: {response.content}")

def test_pacs_stats():
    """Test the PACS stats endpoint"""
    
    client = Client()
    
    # Get superuser
    try:
        user = User.objects.get(is_superuser=True)
    except User.DoesNotExist:
        print("❌ No superuser found for stats test")
        return
    
    client.force_login(user)
    
    print("\n--- Testing PACS Stats ---")
    response = client.get('/api/pacs/stats/')
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PACS Statistics:")
        print(f"   Total Studies: {data.get('totalStudies', 0)}")
        print(f"   Total Patients: {data.get('totalPatients', 0)}")
        print(f"   Total Series: {data.get('totalSeries', 0)}")
        print(f"   Total Instances: {data.get('totalInstances', 0)}")
        print(f"   Disk Usage: {data.get('diskUsage', 0)} bytes")
    else:
        try:
            error_data = response.json()
            print(f"❌ Error: {error_data}")
        except:
            print(f"❌ Error: {response.content}")

def main():
    """Main test function"""
    print("=== PACS API Test ===")
    
    # Check PACS config
    pacs_config = PacsConfig.objects.first()
    if not pacs_config:
        print("❌ No PACS configuration found")
        return
    
    print(f"📡 PACS URL: {pacs_config.orthancurl}")
    
    # Test API endpoints
    test_pacs_api()
    test_pacs_stats()
    
    print("\n✅ API tests completed!")

if __name__ == "__main__":
    main()