#!/usr/bin/env python3
"""
Test our RIS app's image loading to see exactly what's failing
"""
import requests
import json

def test_our_app():
    print("🧪 TESTING OUR RIS APP IMAGE LOADING")
    print("=" * 50)
    
    # Test our Django API
    django_url = "http://localhost:8000"
    
    # Get a study that we know exists
    test_study_uid = "1.3.6.1.4.1.29974.2021121501.202577093729.191129"
    
    print(f"1. Testing our image IDs endpoint...")
    try:
        response = requests.get(f"{django_url}/api/pacs/studies/{test_study_uid}/image-ids/", timeout=30)
        print(f"   Status: {response.status_code}")
        
        if response.ok:
            data = response.json()
            image_count = len(data.get('imageIds', []))
            print(f"   ✅ Response received")
            print(f"   📊 Image count: {image_count}")
            print(f"   📝 Warning: {data.get('warning', 'None')}")
            
            if data.get('debug_info'):
                debug = data['debug_info']
                print(f"   🔍 Debug info:")
                print(f"      Database inconsistency: {debug.get('database_inconsistency', False)}")
                print(f"      Stone Web Viewer URL: {debug.get('stone_web_viewer_url', 'Not provided')}")
            
            if image_count == 0:
                print(f"   ❌ No images returned - this explains why our app shows no images")
                if data.get('warning'):
                    print(f"   💡 Our fallback should trigger with this warning")
            else:
                print(f"   ✅ Images returned - let's test if they actually work")
                # Test first image
                if data.get('imageIds'):
                    first_image = data['imageIds'][0]
                    print(f"   🔗 Testing first image: {first_image}")
                    
                    # Extract the Django proxy URL
                    if 'wadouri:' in first_image:
                        proxy_url = first_image.replace('wadouri:', '')
                        test_response = requests.head(proxy_url, timeout=10)
                        print(f"   📡 Image proxy test: {test_response.status_code}")
                        
                        if test_response.ok:
                            print(f"   ✅ Image proxy works - the issue might be in the frontend")
                        else:
                            print(f"   ❌ Image proxy fails - backend issue confirmed")
        else:
            print(f"   ❌ Request failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {error_data}")
            except:
                print(f"   Error text: {response.text[:200]}")
                
    except Exception as e:
        print(f"   ❌ Request error: {e}")
    
    print(f"\n2. Testing Stone Web Viewer direct access...")
    try:
        stone_url = f"http://192.168.20.172:8042/stone-webviewer/index.html?study={test_study_uid}"
        print(f"   🔗 Stone URL: {stone_url}")
        
        # Test if Stone Web Viewer endpoint exists
        stone_test = requests.head("http://192.168.20.172:8042/stone-webviewer/", timeout=5)
        print(f"   📡 Stone endpoint test: {stone_test.status_code}")
        
        if stone_test.ok:
            print(f"   ✅ Stone Web Viewer is accessible")
            print(f"   💡 Our fallback button should work with this URL")
        else:
            print(f"   ❌ Stone Web Viewer endpoint not accessible")
            
    except Exception as e:
        print(f"   ❌ Stone test error: {e}")

if __name__ == "__main__":
    test_our_app()