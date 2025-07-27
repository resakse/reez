#!/usr/bin/env python3
"""
Test script to debug PACS search functionality
This script tests the Orthanc REST API connection and searches for studies
"""

import requests
import json
import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.models import PacsConfig

def get_orthanc_url():
    """Get Orthanc URL from PacsConfig"""
    try:
        pacs_config = PacsConfig.objects.first()
        if pacs_config:
            return pacs_config.orthancurl
        else:
            print("No PacsConfig found in database")
            return None
    except Exception as e:
        print(f"Error getting PacsConfig: {e}")
        return None

def test_orthanc_connection(orthanc_url):
    """Test basic connection to Orthanc"""
    try:
        print(f"Testing connection to: {orthanc_url}")
        response = requests.get(f"{orthanc_url}/system", timeout=10)
        if response.status_code == 200:
            system_info = response.json()
            print("✅ Orthanc connection successful!")
            print(f"   Version: {system_info.get('Version', 'Unknown')}")
            print(f"   Name: {system_info.get('Name', 'Unknown')}")
            return True
        else:
            print(f"❌ Orthanc connection failed: HTTP {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Orthanc connection error: {e}")
        return False

def test_studies_endpoint(orthanc_url):
    """Test the /studies endpoint to see if any studies exist"""
    try:
        print(f"\nTesting studies endpoint...")
        response = requests.get(f"{orthanc_url}/studies", timeout=10)
        if response.status_code == 200:
            studies = response.json()
            print(f"✅ Studies endpoint accessible!")
            print(f"   Total studies in PACS: {len(studies)}")
            
            # Show first few study IDs if they exist
            if studies:
                print("   First few study IDs:")
                for i, study_id in enumerate(studies[:5]):
                    print(f"     {i+1}. {study_id}")
            else:
                print("   No studies found in PACS")
            
            return len(studies)
        else:
            print(f"❌ Studies endpoint failed: HTTP {response.status_code}")
            return 0
    except requests.exceptions.RequestException as e:
        print(f"❌ Studies endpoint error: {e}")
        return 0

def test_patients_endpoint(orthanc_url):
    """Test the /patients endpoint to see if any patients exist"""
    try:
        print(f"\nTesting patients endpoint...")
        response = requests.get(f"{orthanc_url}/patients", timeout=10)
        if response.status_code == 200:
            patients = response.json()
            print(f"✅ Patients endpoint accessible!")
            print(f"   Total patients in PACS: {len(patients)}")
            
            # Show first few patient IDs if they exist
            if patients:
                print("   First few patient IDs:")
                for i, patient_id in enumerate(patients[:5]):
                    print(f"     {i+1}. {patient_id}")
            else:
                print("   No patients found in PACS")
            
            return len(patients)
        else:
            print(f"❌ Patients endpoint failed: HTTP {response.status_code}")
            return 0
    except requests.exceptions.RequestException as e:
        print(f"❌ Patients endpoint error: {e}")
        return 0

def test_find_all_studies(orthanc_url):
    """Test the /tools/find endpoint with minimal query to find all studies"""
    try:
        print(f"\nTesting find endpoint with empty query...")
        query_data = {
            "Level": "Study",
            "Query": {},
            "Expand": True,
            "Limit": 10
        }
        
        response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json=query_data,
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            print(f"✅ Find endpoint accessible!")
            print(f"   Found {len(results)} studies with empty query")
            
            # Show details of first study if exists
            if results:
                first_study = results[0]
                print("   First study details:")
                print(f"     ID: {first_study.get('ID', 'N/A')}")
                print(f"     Patient Name: {first_study.get('PatientMainDicomTags', {}).get('PatientName', 'N/A')}")
                print(f"     Patient ID: {first_study.get('PatientMainDicomTags', {}).get('PatientID', 'N/A')}")
                print(f"     Study Date: {first_study.get('MainDicomTags', {}).get('StudyDate', 'N/A')}")
                print(f"     Study Description: {first_study.get('MainDicomTags', {}).get('StudyDescription', 'N/A')}")
                print(f"     Modalities: {first_study.get('MainDicomTags', {}).get('ModalitiesInStudy', 'N/A')}")
            
            return len(results)
        else:
            print(f"❌ Find endpoint failed: HTTP {response.status_code}")
            print(f"   Response: {response.text}")
            return 0
    except requests.exceptions.RequestException as e:
        print(f"❌ Find endpoint error: {e}")
        return 0

def test_find_with_wildcard(orthanc_url):
    """Test the /tools/find endpoint with wildcard search"""
    try:
        print(f"\nTesting find endpoint with wildcard query...")
        query_data = {
            "Level": "Study",
            "Query": {
                "PatientName": "*"
            },
            "Expand": True,
            "Limit": 10
        }
        
        response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json=query_data,
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            print(f"✅ Wildcard search successful!")
            print(f"   Found {len(results)} studies with PatientName: *")
            return len(results)
        else:
            print(f"❌ Wildcard search failed: HTTP {response.status_code}")
            print(f"   Response: {response.text}")
            return 0
    except requests.exceptions.RequestException as e:
        print(f"❌ Wildcard search error: {e}")
        return 0

def main():
    """Main test function"""
    print("=== PACS Browser Test Script ===\n")
    
    # Get Orthanc URL from database
    orthanc_url = get_orthanc_url()
    if not orthanc_url:
        print("❌ Cannot get Orthanc URL from database")
        return
    
    # Test basic connection
    if not test_orthanc_connection(orthanc_url):
        print("❌ Cannot connect to Orthanc - stopping tests")
        return
    
    # Test various endpoints
    num_studies = test_studies_endpoint(orthanc_url)
    num_patients = test_patients_endpoint(orthanc_url)
    num_found_empty = test_find_all_studies(orthanc_url)
    num_found_wildcard = test_find_with_wildcard(orthanc_url)
    
    print(f"\n=== Summary ===")
    print(f"Orthanc URL: {orthanc_url}")
    print(f"Studies via /studies: {num_studies}")
    print(f"Patients via /patients: {num_patients}")
    print(f"Studies via /tools/find (empty query): {num_found_empty}")
    print(f"Studies via /tools/find (wildcard): {num_found_wildcard}")
    
    if num_studies == 0:
        print(f"\n💡 The PACS appears to be empty - no studies found")
        print(f"   This could be why the PACS Browser shows 'no study found'")
        print(f"   Try uploading some DICOM files to Orthanc first")
    elif num_found_empty == 0:
        print(f"\n⚠️  Studies exist but /tools/find is not returning them")
        print(f"   This might be a query formatting issue")
    else:
        print(f"\n✅ PACS Browser should work - studies are accessible")

if __name__ == "__main__":
    main()