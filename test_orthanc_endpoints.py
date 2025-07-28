#!/usr/bin/env python3
"""
Test various Orthanc endpoints to understand what works
"""
import requests
import json

def test_orthanc_endpoints():
    print("🔍 TESTING ORTHANC ENDPOINTS")
    print("=" * 50)
    
    orthanc_url = "http://192.168.20.172:8042"
    
    # Get a test instance
    print("1. Finding test instance...")
    try:
        studies_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={'Level': 'Instance', 'Query': {}, 'Limit': 1},
            timeout=10
        )
        
        if not studies_response.ok or not studies_response.json():
            print("❌ No instances found")
            return
            
        instance_id = studies_response.json()[0]
        print(f"✅ Found test instance: {instance_id}")
        
        # Test different endpoints
        endpoints_to_test = [
            f"/instances/{instance_id}",                    # Metadata (should work)
            f"/instances/{instance_id}/file",               # DICOM file (broken)
            f"/instances/{instance_id}/content",            # Raw content
            f"/instances/{instance_id}/preview",            # PNG preview
            f"/instances/{instance_id}/image-uint8",        # 8-bit image data
            f"/instances/{instance_id}/image-uint16",       # 16-bit image data
            f"/instances/{instance_id}/frames/0",           # Frame data
            f"/instances/{instance_id}/tags",               # All DICOM tags
            f"/web-viewer/instances/{instance_id}",         # Web viewer endpoint
            f"/wado/studies/1.2.3/series/1.2.3/instances/1.2.3", # WADO endpoint
        ]
        
        print(f"\n2. Testing endpoints for instance {instance_id}...")
        working_endpoints = []
        
        for endpoint in endpoints_to_test:
            full_url = f"{orthanc_url}{endpoint}"
            try:
                response = requests.head(full_url, timeout=5)
                status = "✅" if response.ok else f"❌ {response.status_code}"
                print(f"   {endpoint}: {status}")
                
                if response.ok:
                    working_endpoints.append(endpoint)
                    
            except Exception as e:
                print(f"   {endpoint}: ❌ ERROR: {e}")
        
        print(f"\n3. Working endpoints ({len(working_endpoints)}):")
        for endpoint in working_endpoints:
            print(f"   ✅ {endpoint}")
            
        # Test if we can get actual pixel data
        print(f"\n4. Testing pixel data extraction...")
        for endpoint in [f"/instances/{instance_id}/preview", f"/instances/{instance_id}/image-uint8"]:
            if endpoint in working_endpoints:
                try:
                    full_url = f"{orthanc_url}{endpoint}"
                    response = requests.get(full_url, timeout=10)
                    if response.ok:
                        content_type = response.headers.get('Content-Type', 'unknown')
                        size = len(response.content)
                        print(f"   ✅ {endpoint}: {content_type}, {size} bytes")
                    else:
                        print(f"   ❌ {endpoint}: {response.status_code}")
                except Exception as e:
                    print(f"   ❌ {endpoint}: ERROR: {e}")
        
        # Check Stone Web Viewer specific endpoints
        print(f"\n5. Testing Stone Web Viewer endpoints...")
        stone_endpoints = [
            "/app/stone-webviewer/",
            "/stone-webviewer/",
            "/plugins/stone-webviewer/",
        ]
        
        for endpoint in stone_endpoints:
            try:
                full_url = f"{orthanc_url}{endpoint}"
                response = requests.head(full_url, timeout=5)
                status = "✅" if response.ok else f"❌ {response.status_code}"
                print(f"   {endpoint}: {status}")
            except Exception as e:
                print(f"   {endpoint}: ❌ ERROR: {e}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    test_orthanc_endpoints()