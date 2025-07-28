#!/usr/bin/env python
import os
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.models import PacsConfig

def debug_orthanc_inconsistency(study_uid):
    """Deep dive into Orthanc inconsistency"""
    
    # Get Orthanc configuration
    pacs_config = PacsConfig.objects.first()
    if not pacs_config:
        print("ERROR: No PACS configuration found")
        return
    
    orthanc_url = pacs_config.orthancurl
    print(f"Orthanc URL: {orthanc_url}")
    print(f"Study UID: {study_uid}")
    print("=" * 60)
    
    # Method 1: Find study using tools/find (what we currently use)
    print("🔍 METHOD 1: Using /tools/find (current method)")
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
    
    if find_response.ok:
        find_result = find_response.json()
        if find_result:
            study_data = find_result[0]
            print(f"✅ Study found via /tools/find: {study_data.get('ID')}")
            print(f"   Series in study: {len(study_data.get('Series', []))}")
            
            # Examine series from find result
            for i, series_id in enumerate(study_data.get('Series', [])):
                print(f"\n   📁 Series {i+1}: {series_id}")
                
                # Get series details
                series_response = requests.get(f"{orthanc_url}/series/{series_id}")
                if series_response.ok:
                    series_data = series_response.json()
                    instances = series_data.get('Instances', [])
                    print(f"      Instances from series API: {len(instances)}")
                    
                    for j, instance_id in enumerate(instances):
                        print(f"      🏥 Instance {j+1}: {instance_id}")
                        
                        # Check instance existence
                        instance_check = requests.get(f"{orthanc_url}/instances/{instance_id}")
                        print(f"         Instance API: {instance_check.status_code}")
                        
                        if instance_check.ok:
                            instance_info = instance_check.json()
                            print(f"         File size: {instance_info.get('FileSize', 'Unknown')}")
                            print(f"         File UUID: {instance_info.get('FileUuid', 'Unknown')}")
                            
                            # Check file endpoint specifically
                            file_check = requests.head(f"{orthanc_url}/instances/{instance_id}/file")
                            print(f"         File endpoint: {file_check.status_code}")
                            if file_check.ok:
                                print(f"         File Content-Length: {file_check.headers.get('Content-Length', 'Unknown')}")
                else:
                    print(f"      ❌ Failed to get series {series_id}: {series_response.status_code}")
        else:
            print("❌ No results from /tools/find")
    else:
        print(f"❌ /tools/find failed: {find_response.status_code}")
    
    print("\n" + "=" * 60)
    
    # Method 2: Try direct studies API
    print("🔍 METHOD 2: Using /studies API")
    studies_response = requests.get(f"{orthanc_url}/studies")
    
    if studies_response.ok:
        studies_list = studies_response.json()
        print(f"✅ Total studies in Orthanc: {len(studies_list)}")
        
        # Look for our study
        for study_id in studies_list:
            study_info_response = requests.get(f"{orthanc_url}/studies/{study_id}")
            if study_info_response.ok:
                study_info = study_info_response.json()
                study_instance_uid = study_info.get('MainDicomTags', {}).get('StudyInstanceUID')
                
                if study_instance_uid == study_uid:
                    print(f"✅ Found study via /studies API: {study_id}")
                    print(f"   Series count: {len(study_info.get('Series', []))}")
                    
                    # Compare series between methods
                    api_series = study_info.get('Series', [])
                    find_series = study_data.get('Series', []) if 'study_data' in locals() else []
                    
                    print(f"   Series from /studies API: {api_series}")
                    print(f"   Series from /tools/find: {find_series}")
                    
                    if set(api_series) != set(find_series):
                        print("⚠️  INCONSISTENCY: Different series between methods!")
                    
                    break
        else:
            print("❌ Study not found in /studies API")
    else:
        print(f"❌ /studies API failed: {studies_response.status_code}")
    
    print("\n" + "=" * 60)
    
    # Method 3: Check Orthanc statistics and health
    print("🔍 METHOD 3: Orthanc health check")
    
    # System info
    system_response = requests.get(f"{orthanc_url}/system")
    if system_response.ok:
        system_info = system_response.json()
        print(f"✅ Orthanc version: {system_info.get('Version')}")
        print(f"   Database version: {system_info.get('DatabaseVersion')}")
        print(f"   API version: {system_info.get('ApiVersion')}")
    
    # Statistics
    stats_response = requests.get(f"{orthanc_url}/statistics")
    if stats_response.ok:
        stats = stats_response.json()
        print(f"✅ Total studies: {stats.get('CountStudies')}")
        print(f"   Total series: {stats.get('CountSeries')}")
        print(f"   Total instances: {stats.get('CountInstances')}")
        print(f"   Total disk size: {stats.get('TotalDiskSizeMB')} MB")
    
    print("\n" + "=" * 60)
    
    # Method 4: Alternative instance access
    print("🔍 METHOD 4: Alternative instance access patterns")
    
    if 'study_data' in locals():
        for series_id in study_data.get('Series', []):
            print(f"\n📁 Testing series: {series_id}")
            
            # Try different ways to access instances
            series_response = requests.get(f"{orthanc_url}/series/{series_id}")
            if series_response.ok:
                series_data = series_response.json()
                instances = series_data.get('Instances', [])
                
                for instance_id in instances:
                    print(f"   🏥 Testing instance: {instance_id}")
                    
                    # Method A: Direct instance access
                    instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}")
                    print(f"      Direct access: {instance_response.status_code}")
                    
                    # Method B: Instance file
                    file_response = requests.head(f"{orthanc_url}/instances/{instance_id}/file")
                    print(f"      File HEAD: {file_response.status_code}")
                    
                    # Method C: Instance preview (if supported)
                    preview_response = requests.head(f"{orthanc_url}/instances/{instance_id}/preview")
                    print(f"      Preview: {preview_response.status_code}")
                    
                    # Method D: Instance tags
                    tags_response = requests.get(f"{orthanc_url}/instances/{instance_id}/tags")
                    print(f"      Tags: {tags_response.status_code}")
                    
                    # Method E: Check if instance is actually available via find
                    find_instance_response = requests.post(
                        f"{orthanc_url}/tools/find",
                        headers={'Content-Type': 'application/json'},
                        json={
                            'Level': 'Instance',
                            'Query': {},
                            'Expand': False,
                        },
                        timeout=10
                    )
                    
                    if find_instance_response.ok:
                        all_instances = find_instance_response.json()
                        if instance_id in all_instances:
                            print(f"      ✅ Instance found in global find")
                        else:
                            print(f"      ❌ Instance NOT in global find")
                    
                    break  # Only test first instance per series
    
    print("\n" + "=" * 60)
    print("🔍 SUMMARY")
    print("If study metadata exists but instances are 404:")
    print("1. Orthanc database corruption")
    print("2. File system issues (files deleted but DB not updated)")
    print("3. Storage plugin issues")
    print("4. Remote server synchronization problems")
    print("5. Orthanc version compatibility issues")

if __name__ == '__main__':
    # Test with the problematic study
    study_uid = "1.3.6.1.4.1.29974.2021121501.202577093729.191129"
    debug_orthanc_inconsistency(study_uid)