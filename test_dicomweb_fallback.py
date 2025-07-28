#!/usr/bin/env python3
"""
Test script to verify DICOMweb fallback implementation
"""
import os
import sys
import django
import requests

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
django.setup()

from exam.models import PacsConfig

def test_dicomweb_fallback():
    print("🧪 TESTING DICOMWEB FALLBACK IMPLEMENTATION")
    print("=" * 50)
    
    # Get PACS configuration
    pacs_config = PacsConfig.objects.first()
    if not pacs_config:
        print("❌ No PACS configuration found")
        return
    
    orthanc_url = pacs_config.orthancurl
    print(f"Orthanc URL: {orthanc_url}")
    
    # Test 1: Find a test study
    print("\n1. Finding test study...")
    try:
        studies_response = requests.post(
            f"{orthanc_url}/tools/find",
            headers={'Content-Type': 'application/json'},
            json={'Level': 'Study', 'Query': {}, 'Limit': 1, 'Expand': True},
            timeout=10
        )
        
        if not studies_response.ok or not studies_response.json():
            print("❌ No studies found in Orthanc")
            return
            
        study = studies_response.json()[0]
        study_uid = study['MainDicomTags']['StudyInstanceUID']
        print(f"✅ Found test study: {study_uid}")
        
        # Test 2: Get first instance from this study
        print("\n2. Finding test instance...")
        first_series_id = study['Series'][0] if study['Series'] else None
        if not first_series_id:
            print("❌ No series in study")
            return
            
        series_response = requests.get(f"{orthanc_url}/series/{first_series_id}", timeout=10)
        if not series_response.ok:
            print("❌ Cannot access series")
            return
            
        series_data = series_response.json()
        first_instance_id = series_data['Instances'][0] if series_data['Instances'] else None
        if not first_instance_id:
            print("❌ No instances in series")
            return
            
        print(f"✅ Found test instance: {first_instance_id}")
        
        # Test 3: Check if /file endpoint works
        print("\n3. Testing /file endpoint...")
        file_response = requests.head(f"{orthanc_url}/instances/{first_instance_id}/file", timeout=5)
        file_works = file_response.ok
        print(f"{'✅' if file_works else '❌'} /file endpoint: {file_response.status_code}")
        
        # Test 4: Get instance metadata for DICOMweb
        print("\n4. Getting instance metadata...")
        instance_response = requests.get(f"{orthanc_url}/instances/{first_instance_id}", timeout=10)
        if not instance_response.ok:
            print("❌ Cannot get instance metadata")
            return
            
        instance_data = instance_response.json()
        sop_instance_uid = instance_data['MainDicomTags']['SOPInstanceUID']
        series_instance_uid = series_data['MainDicomTags']['SeriesInstanceUID']
        
        print(f"✅ Instance UIDs obtained")
        print(f"   Study UID: {study_uid}")
        print(f"   Series UID: {series_instance_uid}")
        print(f"   SOP UID: {sop_instance_uid}")
        
        # Test 5: Test DICOMweb endpoint
        print("\n5. Testing DICOMweb endpoint...")
        dicomweb_url = f"{orthanc_url}/dicom-web/studies/{study_uid}/series/{series_instance_uid}/instances/{sop_instance_uid}"
        print(f"DICOMweb URL: {dicomweb_url}")
        
        dicomweb_response = requests.head(dicomweb_url, timeout=10)
        dicomweb_works = dicomweb_response.ok
        print(f"{'✅' if dicomweb_works else '❌'} DICOMweb endpoint: {dicomweb_response.status_code}")
        
        # Test 6: Test our Django proxy endpoints
        print("\n6. Testing Django proxy endpoints...")
        django_base_url = "http://localhost:8000/api/pacs/instances"
        
        # Test /file proxy
        file_proxy_url = f"{django_base_url}/{first_instance_id}/file"
        print(f"Testing: {file_proxy_url}")
        file_proxy_response = requests.head(file_proxy_url, timeout=10)
        print(f"{'✅' if file_proxy_response.ok else '❌'} Django /file proxy: {file_proxy_response.status_code}")
        
        # Test /dicomweb proxy
        dicomweb_proxy_url = f"{django_base_url}/{first_instance_id}/dicomweb"
        print(f"Testing: {dicomweb_proxy_url}")
        dicomweb_proxy_response = requests.head(dicomweb_proxy_url, timeout=10)
        print(f"{'✅' if dicomweb_proxy_response.ok else '❌'} Django DICOMweb proxy: {dicomweb_proxy_response.status_code}")
        
        # Test 7: Test the image IDs endpoint that does fallback
        print("\n7. Testing image IDs endpoint with fallback...")
        image_ids_url = f"http://localhost:8000/api/pacs/studies/{study_uid}/image-ids/"
        print(f"Testing: {image_ids_url}")
        
        image_ids_response = requests.get(image_ids_url, timeout=30)
        if image_ids_response.ok:
            image_ids_data = image_ids_response.json()
            image_count = len(image_ids_data.get('imageIds', []))
            print(f"✅ Image IDs endpoint: {image_count} images found")
            
            # Check what kind of URLs were generated
            if image_ids_data.get('imageIds'):
                sample_image_id = image_ids_data['imageIds'][0]
                if '/dicomweb' in sample_image_id:
                    print("✅ Using DICOMweb fallback URLs")
                elif '/file' in sample_image_id:
                    print("✅ Using standard /file URLs")
                else:
                    print(f"❓ Unknown URL format: {sample_image_id}")
        else:
            print(f"❌ Image IDs endpoint failed: {image_ids_response.status_code}")
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 SUMMARY")
        print("=" * 50)
        print(f"/file endpoint works: {'✅' if file_works else '❌'}")
        print(f"DICOMweb endpoint works: {'✅' if dicomweb_works else '❌'}")
        print(f"Fallback should activate: {'✅' if not file_works and dicomweb_works else '❌'}")
        
        if not file_works and not dicomweb_works:
            print("🚨 BOTH endpoints are broken - this is a serious Orthanc configuration issue")
        elif not file_works and dicomweb_works:
            print("✅ Perfect scenario for DICOMweb fallback")
        elif file_works:
            print("ℹ️  /file endpoint works - no fallback needed")
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_dicomweb_fallback()