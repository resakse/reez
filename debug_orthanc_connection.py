#!/usr/bin/env python3
"""
Debug Orthanc connection and endpoint accessibility
"""
import requests
import json

def debug_orthanc():
    print("🔍 DEBUGGING ORTHANC CONNECTION")
    print("=" * 50)
    
    orthanc_url = "http://192.168.20.172:8042"
    
    # Test 1: Basic connectivity
    print("1. Testing basic connectivity...")
    try:
        response = requests.get(f"{orthanc_url}/system", timeout=10)
        if response.ok:
            system_info = response.json()
            print(f"✅ Orthanc system accessible")
            print(f"   Version: {system_info.get('Version', 'unknown')}")
            print(f"   Name: {system_info.get('Name', 'unknown')}")
            print(f"   Database: {system_info.get('DatabaseBackendPlugin', 'SQLite')}")
        else:
            print(f"❌ System endpoint failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # Test 2: Check if studies exist
    print(f"\n2. Checking for studies...")
    try:
        studies_response = requests.get(f"{orthanc_url}/studies", timeout=10)
        if studies_response.ok:
            studies = studies_response.json()
            print(f"✅ Found {len(studies)} studies")
            if studies:
                print(f"   Sample study ID: {studies[0]}")
                
                # Test accessing the first study
                study_id = studies[0]
                study_response = requests.get(f"{orthanc_url}/studies/{study_id}", timeout=10)
                if study_response.ok:
                    print(f"✅ Can access study metadata")
                    study_data = study_response.json()
                    study_uid = study_data.get('MainDicomTags', {}).get('StudyInstanceUID')
                    print(f"   Study UID: {study_uid}")
                    
                    # Check series in this study
                    series_list = study_data.get('Series', [])
                    print(f"   Series count: {len(series_list)}")
                    
                    if series_list:
                        series_id = series_list[0]
                        series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=10)
                        if series_response.ok:
                            print(f"✅ Can access series metadata")
                            series_data = series_response.json()
                            instances = series_data.get('Instances', [])
                            print(f"   Instances count: {len(instances)}")
                            
                            if instances:
                                instance_id = instances[0]
                                print(f"   Testing instance: {instance_id}")
                                
                                # Test instance metadata
                                instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}", timeout=10)
                                if instance_response.ok:
                                    print(f"✅ Can access instance metadata")
                                    
                                    # Test file endpoint
                                    file_response = requests.head(f"{orthanc_url}/instances/{instance_id}/file", timeout=5)
                                    print(f"   /file endpoint: {'✅' if file_response.ok else f'❌ {file_response.status_code}'}")
                                    
                                    # Test preview endpoint
                                    preview_response = requests.head(f"{orthanc_url}/instances/{instance_id}/preview", timeout=5)
                                    print(f"   /preview endpoint: {'✅' if preview_response.ok else f'❌ {preview_response.status_code}'}")
                                    
                                else:
                                    print(f"❌ Cannot access instance metadata: {instance_response.status_code}")
                        else:
                            print(f"❌ Cannot access series metadata: {series_response.status_code}")
                else:
                    print(f"❌ Cannot access study metadata: {study_response.status_code}")
        else:
            print(f"❌ Studies endpoint failed: {studies_response.status_code}")
    except Exception as e:
        print(f"❌ Studies check failed: {e}")
    
    # Test 3: Check find endpoint vs direct access
    print(f"\n3. Comparing find endpoint vs direct access...")
    try:
        # Use find to get instances
        find_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={'Level': 'Instance', 'Query': {}, 'Limit': 3},
            timeout=10
        )
        
        if find_response.ok:
            found_instances = find_response.json()
            print(f"✅ Find returned {len(found_instances)} instances")
            
            for i, instance_id in enumerate(found_instances[:2]):
                print(f"\n   Testing instance {i+1}: {instance_id}")
                
                # Test direct access
                direct_response = requests.head(f"{orthanc_url}/instances/{instance_id}", timeout=5)
                print(f"     Direct access: {'✅' if direct_response.ok else f'❌ {direct_response.status_code}'}")
                
                # Test file access
                file_response = requests.head(f"{orthanc_url}/instances/{instance_id}/file", timeout=5)
                print(f"     File access: {'✅' if file_response.ok else f'❌ {file_response.status_code}'}")
        else:
            print(f"❌ Find endpoint failed: {find_response.status_code}")
    except Exception as e:
        print(f"❌ Find comparison failed: {e}")
    
    # Test 4: Check if there's a URL rewriting issue
    print(f"\n4. Testing potential URL routing issues...")
    alternative_urls = [
        f"{orthanc_url}",
        f"{orthanc_url}/orthanc",
        f"{orthanc_url}/api",
        f"{orthanc_url}/dicom-web",
    ]
    
    for base_url in alternative_urls:
        try:
            test_response = requests.get(f"{base_url}/system", timeout=5)
            if test_response.ok:
                print(f"✅ Alternative URL works: {base_url}")
            else:
                print(f"❌ Alternative URL failed: {base_url} ({test_response.status_code})")
        except Exception as e:
            print(f"❌ Alternative URL error: {base_url} ({e})")

if __name__ == "__main__":
    debug_orthanc()