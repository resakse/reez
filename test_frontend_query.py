#!/usr/bin/env python3
"""
Test script to mimic the exact frontend PACS query logic
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

def test_frontend_search_scenarios(orthanc_url):
    """Test various search scenarios that frontend would use"""
    
    test_cases = [
        {
            "name": "Empty search (Search All Studies button)",
            "query": {}
        },
        {
            "name": "Patient name wildcard search",
            "query": {"PatientName": "*NUR*"}
        },
        {
            "name": "Patient ID search",
            "query": {"PatientID": "*425*"}
        },
        {
            "name": "Date range search",
            "query": {"StudyDate": "20241001-20241031"}
        },
        {
            "name": "Modality search (CT)",
            "query": {"ModalitiesInStudy": "CT"}
        },
        {
            "name": "Study description search",
            "query": {"StudyDescription": "*CT*"}
        },
        {
            "name": "Combined search",
            "query": {
                "PatientName": "*NUR*",
                "StudyDate": "20241001-"
            }
        }
    ]
    
    for test_case in test_cases:
        print(f"\n--- Testing: {test_case['name']} ---")
        
        query_data = {
            "Level": "Study",
            "Query": test_case['query'],
            "Expand": True,
            "Limit": 100
        }
        
        print(f"Query: {json.dumps(query_data, indent=2)}")
        
        try:
            response = requests.post(
                f"{orthanc_url}/tools/find",
                headers={'Content-Type': 'application/json'},
                json=query_data,
                timeout=10
            )
            
            if response.status_code == 200:
                results = response.json()
                print(f"✅ Success: Found {len(results)} studies")
                
                if results:
                    # Show first result details
                    first_study = results[0]
                    print("   Sample result:")
                    print(f"     Patient Name: {first_study.get('PatientMainDicomTags', {}).get('PatientName', 'N/A')}")
                    print(f"     Patient ID: {first_study.get('PatientMainDicomTags', {}).get('PatientID', 'N/A')}")
                    print(f"     Study Date: {first_study.get('MainDicomTags', {}).get('StudyDate', 'N/A')}")
                    print(f"     Modalities: {first_study.get('MainDicomTags', {}).get('ModalitiesInStudy', 'N/A')}")
                    print(f"     Study Description: {first_study.get('MainDicomTags', {}).get('StudyDescription', 'N/A')}")
                else:
                    print("   No results returned")
            else:
                print(f"❌ Failed: HTTP {response.status_code}")
                print(f"   Response: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Error: {e}")

def test_exact_frontend_query(orthanc_url):
    """Test with exact query that frontend would send when clicking 'Search All Studies'"""
    print(f"\n=== Testing Exact Frontend 'Search All Studies' Query ===")
    
    # This is exactly what the frontend sends when user clicks "Search All Studies"
    query_data = {
        "Level": "Study",
        "Query": {},
        "Expand": True,
        "Limit": 100
    }
    
    print(f"Sending exact frontend query:")
    print(f"URL: {orthanc_url}/tools/find")
    print(f"Method: POST")
    print(f"Headers: {{'Content-Type': 'application/json'}}")
    print(f"Body: {json.dumps(query_data, indent=2)}")
    
    try:
        response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json=query_data,
            timeout=10
        )
        
        print(f"\nResponse:")
        print(f"Status: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            results = response.json()
            print(f"✅ SUCCESS: Found {len(results)} studies")
            
            if results:
                print(f"\nFirst 3 results:")
                for i, study in enumerate(results[:3]):
                    print(f"  {i+1}. ID: {study.get('ID', 'N/A')}")
                    print(f"     Patient: {study.get('PatientMainDicomTags', {}).get('PatientName', 'N/A')}")
                    print(f"     Study Date: {study.get('MainDicomTags', {}).get('StudyDate', 'N/A')}")
                    print(f"     Study UID: {study.get('MainDicomTags', {}).get('StudyInstanceUID', 'N/A')}")
                    
                # This should match what frontend processes
                formatted_studies = []
                for study in results:
                    formatted_study = {
                        'ID': study.get('ID', ''),
                        'StudyInstanceUID': study.get('MainDicomTags', {}).get('StudyInstanceUID', ''),
                        'PatientName': study.get('PatientMainDicomTags', {}).get('PatientName', 'Unknown'),
                        'PatientID': study.get('PatientMainDicomTags', {}).get('PatientID', 'Unknown'),
                        'PatientBirthDate': study.get('PatientMainDicomTags', {}).get('PatientBirthDate', ''),
                        'PatientSex': study.get('PatientMainDicomTags', {}).get('PatientSex', ''),
                        'StudyDate': study.get('MainDicomTags', {}).get('StudyDate', ''),
                        'StudyTime': study.get('MainDicomTags', {}).get('StudyTime', ''),
                        'StudyDescription': study.get('MainDicomTags', {}).get('StudyDescription', ''),
                        'Modality': study.get('MainDicomTags', {}).get('ModalitiesInStudy', '').split(',')[0] if study.get('MainDicomTags', {}).get('ModalitiesInStudy') else 'Unknown',
                        'SeriesCount': len(study.get('Series', [])),
                        'ImageCount': 0,
                        'InstitutionName': study.get('MainDicomTags', {}).get('InstitutionName', '')
                    }
                    formatted_studies.append(formatted_study)
                
                print(f"\nFormatted for frontend (first result):")
                print(json.dumps(formatted_studies[0], indent=2))
                print(f"\n✅ Frontend should show {len(formatted_studies)} studies")
            else:
                print("❌ No studies returned - this would show 'no study found' in frontend")
        else:
            print(f"❌ FAILED: HTTP {response.status_code}")
            print(f"Response body: {response.text}")
            print("This would cause 'no study found' error in frontend")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: {e}")
        print("This would cause 'no study found' error in frontend")

def main():
    """Main test function"""
    print("=== Frontend PACS Query Test ===\n")
    
    # Get Orthanc URL from database
    orthanc_url = get_orthanc_url()
    if not orthanc_url:
        print("❌ Cannot get Orthanc URL from database")
        return
    
    print(f"Using Orthanc URL: {orthanc_url}")
    
    # Test various search scenarios
    test_frontend_search_scenarios(orthanc_url)
    
    # Test exact frontend query
    test_exact_frontend_query(orthanc_url)

if __name__ == "__main__":
    main()