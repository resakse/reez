#!/usr/bin/env python3
"""
Test script for the PACS API using JWT authentication (like frontend)
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

User = get_user_model()

def get_jwt_token():
    """Get JWT token by logging in like the frontend does"""
    
    # Get superuser credentials
    try:
        user = User.objects.get(is_superuser=True)
        username = user.username
        # For this test, assume password is 'admin' or prompt user
        password = input(f"Enter password for {username}: ")
    except User.DoesNotExist:
        print("❌ No superuser found")
        return None
    
    # Login to get JWT token
    login_response = requests.post(
        'http://localhost:8000/api/token/',
        headers={'Content-Type': 'application/json'},
        json={'username': username, 'password': password}
    )
    
    if login_response.status_code == 200:
        tokens = login_response.json()
        print(f"✅ JWT token obtained")
        return tokens['access']
    else:
        print(f"❌ Login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        return None

def test_pacs_search_with_jwt(access_token):
    """Test PACS search with JWT authentication"""
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    # Test empty search
    print("\n--- Testing PACS Search with JWT ---")
    response = requests.post(
        'http://localhost:8000/api/pacs/search/',
        headers=headers,
        json={}
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
            print(f"❌ Error: {response.text}")
    
    # Test patient name search
    print("\n--- Testing Patient Name Search ---")
    response = requests.post(
        'http://localhost:8000/api/pacs/search/',
        headers=headers,
        json={"patientName": "NUR"}
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
            print(f"❌ Error: {response.text}")

def test_pacs_stats_with_jwt(access_token):
    """Test PACS stats with JWT authentication"""
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    print("\n--- Testing PACS Stats with JWT ---")
    response = requests.get(
        'http://localhost:8000/api/pacs/stats/',
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ PACS Statistics:")
        print(f"   Total Studies: {data.get('totalStudies', 0)}")
        print(f"   Total Patients: {data.get('totalPatients', 0)}")
        print(f"   Total Series: {data.get('totalSeries', 0)}")
        print(f"   Total Instances: {data.get('totalInstances', 0)}")
    else:
        try:
            error_data = response.json()
            print(f"❌ Error: {error_data}")
        except:
            print(f"❌ Error: {response.text}")

def main():
    """Main test function"""
    print("=== PACS API JWT Test ===")
    
    # Get JWT token
    access_token = get_jwt_token()
    if not access_token:
        print("❌ Cannot get JWT token")
        return
    
    # Test endpoints with JWT
    test_pacs_search_with_jwt(access_token)
    test_pacs_stats_with_jwt(access_token)
    
    print("\n✅ JWT tests completed!")

if __name__ == "__main__":
    main()