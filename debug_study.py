#!/usr/bin/env python
import os
import django
import requests

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.models import PacsConfig

def debug_study(study_uid):
    """Debug a specific study to understand instance ID issues"""
    
    # Get Orthanc configuration
    pacs_config = PacsConfig.objects.first()
    if not pacs_config:
        print("ERROR: No PACS configuration found")
        return
    
    orthanc_url = pacs_config.orthancurl
    print(f"Orthanc URL: {orthanc_url}")
    print(f"Study UID: {study_uid}")
    print("-" * 50)
    
    # Step 1: Find the study
    find_response = requests.post(
        f"{orthanc_url}/tools/find",
        headers={'Content-Type': 'application/json'},
        json={
            'Level': 'Study',
            'Query': {'StudyInstanceUID': study_uid},
            'Expand': True,
        },
        timeout=30
    )
    
    if not find_response.ok:
        print(f"ERROR: Failed to find study: {find_response.status_code}")
        return
    
    find_result = find_response.json()
    if not find_result:
        print("ERROR: Study not found")
        return
    
    study_data = find_result[0]
    print(f"Study found: {study_data.get('ID')}")
    print(f"Series count: {len(study_data.get('Series', []))}")
    
    # Step 2: Examine each series
    for i, series_id in enumerate(study_data.get('Series', [])):
        print(f"\n--- Series {i+1}: {series_id} ---")
        
        # Get series details
        series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=30)
        if not series_response.ok:
            print(f"ERROR: Failed to get series {series_id}: {series_response.status_code}")
            continue
        
        series_data = series_response.json()
        series_tags = series_data.get('MainDicomTags', {})
        instances = series_data.get('Instances', [])
        
        print(f"Series Description: {series_tags.get('SeriesDescription', 'N/A')}")
        print(f"Modality: {series_tags.get('Modality', 'N/A')}")
        print(f"Instance count: {len(instances)}")
        
        # Step 3: Check each instance
        for j, instance_id in enumerate(instances):
            print(f"  Instance {j+1}: {instance_id}")
            
            # Check if instance exists
            instance_check = requests.head(f"{orthanc_url}/instances/{instance_id}", timeout=5)
            print(f"    Instance exists: {instance_check.ok} (status: {instance_check.status_code})")
            
            if instance_check.ok:
                # Check if /file endpoint works
                file_check = requests.head(f"{orthanc_url}/instances/{instance_id}/file", timeout=5)
                print(f"    File endpoint: {file_check.ok} (status: {file_check.status_code})")
                
                if file_check.ok:
                    content_length = file_check.headers.get('Content-Length', 'Unknown')
                    print(f"    File size: {content_length} bytes")
                else:
                    print(f"    File endpoint error: {file_check.text if hasattr(file_check, 'text') else 'Unknown'}")
            
            # Get instance metadata if available
            try:
                instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}", timeout=5)
                if instance_response.ok:
                    instance_data = instance_response.json()
                    main_tags = instance_data.get('MainDicomTags', {})
                    sop_uid = main_tags.get('SOPInstanceUID', 'N/A')
                    print(f"    SOP Instance UID: {sop_uid}")
                else:
                    print(f"    Failed to get instance metadata: {instance_response.status_code}")
            except Exception as e:
                print(f"    Instance metadata error: {e}")

if __name__ == '__main__':
    # Test with the study we found
    study_uid = "1.3.6.1.4.1.29974.2021121501.202577093729.191129"
    debug_study(study_uid)