#!/usr/bin/env python
import requests

orthanc_url = "http://192.168.20.172:8042"
instance_id = "168a6389-324d0bd1-034b0d5f-372b42ef-20dcf22a"

# Test various Orthanc endpoints for this instance
endpoints = [
    "",  # Basic instance info
    "/file",  # DICOM file
    "/content",  # Alternative file access
    "/preview",  # Image preview
    "/tags",  # DICOM tags
    "/simplified-tags",  # Simplified tags
    "/header",  # DICOM header
    "/frames",  # Frame info
    "/image-uint8",  # Image as uint8
    "/image-uint16",  # Image as uint16
    "/rendered",  # Rendered image
    "/matlab",  # Matlab format
    "/raw",  # Raw data
    "/attachment/dicom/data"  # Alternative DICOM data
]

print(f"Testing instance: {instance_id}")
print("=" * 60)

for endpoint in endpoints:
    url = f"{orthanc_url}/instances/{instance_id}{endpoint}"
    try:
        response = requests.head(url, timeout=5)
        status = "✅ OK" if response.ok else f"❌ {response.status_code}"
        content_length = response.headers.get('Content-Length', 'Unknown')
        content_type = response.headers.get('Content-Type', 'Unknown')
        
        print(f"{endpoint or '(base)':<20} {status:<10} Size: {content_length:<10} Type: {content_type}")
        
        # If this endpoint works and has substantial content, it might be usable
        if response.ok and content_length and content_length != 'Unknown':
            try:
                if int(content_length) > 10000:  # > 10KB suggests real DICOM data
                    print(f"    🎯 POTENTIAL ALTERNATIVE: {endpoint}")
            except:
                pass
                
    except Exception as e:
        print(f"{endpoint or '(base)':<20} ERROR: {e}")

print("\n" + "=" * 60)

# Also check if we can get the raw instance data as JSON
print("Checking instance metadata...")
try:
    response = requests.get(f"{orthanc_url}/instances/{instance_id}")
    if response.ok:
        data = response.json()
        print(f"File UUID: {data.get('FileUuid', 'Unknown')}")
        print(f"File Size: {data.get('FileSize', 'Unknown')}")
        print(f"Instance Type: {data.get('Type', 'Unknown')}")
        
        # Check if this instance has attachments
        attachments = data.get('Attachments', {})
        print(f"Attachments: {list(attachments.keys())}")
        
        for attachment_name, attachment_info in attachments.items():
            print(f"  {attachment_name}: Size={attachment_info.get('Size', 'Unknown')}, UUID={attachment_info.get('Uuid', 'Unknown')}")
            
            # Test attachment access
            attachment_url = f"{orthanc_url}/instances/{instance_id}/attachments/{attachment_name}/data"
            try:
                attach_response = requests.head(attachment_url, timeout=5)
                attach_status = "✅ OK" if attach_response.ok else f"❌ {attach_response.status_code}"
                print(f"    Access: {attach_status}")
                
                if attach_response.ok:
                    print(f"    🎯 WORKING ATTACHMENT ENDPOINT: /attachments/{attachment_name}/data")
            except Exception as e:
                print(f"    Access: ERROR {e}")
    else:
        print(f"Failed to get instance metadata: {response.status_code}")
except Exception as e:
    print(f"Error getting instance metadata: {e}")