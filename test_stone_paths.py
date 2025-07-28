#!/usr/bin/env python3
"""
Test different Stone Web Viewer paths to find the working one
"""
import requests

def test_stone_paths():
    print("🔍 TESTING STONE WEB VIEWER PATHS")
    print("=" * 40)
    
    orthanc_url = "http://192.168.20.172:8042"
    
    # Test different possible Stone Web Viewer paths
    stone_paths = [
        "/stone-webviewer/",
        "/app/stone-webviewer/", 
        "/plugins/stone-webviewer/",
        "/web-viewer/",
        "/app/web-viewer/",
        "/ohif/",
        "/app/ohif/",
        "/ui/",
        "/app/ui/",
        "/osimis-viewer/",
        "/app/osimis-viewer/"
    ]
    
    working_paths = []
    
    for path in stone_paths:
        try:
            full_url = f"{orthanc_url}{path}"
            response = requests.head(full_url, timeout=5)
            status = "✅" if response.ok else f"❌ {response.status_code}"
            print(f"   {path:<25} {status}")
            
            if response.ok:
                working_paths.append(path)
                
        except Exception as e:
            print(f"   {path:<25} ❌ ERROR: {e}")
    
    print(f"\n📊 WORKING PATHS ({len(working_paths)}):")
    for path in working_paths:
        print(f"   ✅ {orthanc_url}{path}")
        
    if working_paths:
        print(f"\n🎯 RECOMMENDED STONE WEB VIEWER URL:")
        test_study = "1.3.6.1.4.1.29974.2021121501.202577093729.191129"
        recommended_path = working_paths[0]
        print(f"   {orthanc_url}{recommended_path}index.html?study={test_study}")
    else:
        print(f"\n❌ NO WORKING STONE WEB VIEWER PATHS FOUND")
        print(f"   But you said OHIF works - let's check what viewer you're actually using")

    # Also test the main Orthanc explorer
    print(f"\n🔍 TESTING ORTHANC EXPLORER:")
    try:
        explorer_response = requests.head(f"{orthanc_url}/app/explorer.html", timeout=5)
        explorer_status = "✅" if explorer_response.ok else f"❌ {explorer_response.status_code}"
        print(f"   /app/explorer.html: {explorer_status}")
        
        # Test root
        root_response = requests.head(f"{orthanc_url}/", timeout=5)
        root_status = "✅" if root_response.ok else f"❌ {root_response.status_code}"
        print(f"   / (root): {root_status}")
        
    except Exception as e:
        print(f"   ❌ Explorer test error: {e}")

if __name__ == "__main__":
    test_stone_paths()