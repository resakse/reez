#!/usr/bin/env python3
"""
Debug the thumbnail issue - understand why 614 thumbnails are still being created
"""

def debug_scenario():
    """Debug what's actually happening with the thumbnails"""
    print("=== Debugging Thumbnail Issue ===")
    print()
    
    # Scenario 1: What SHOULD happen for CT study
    print("📋 EXPECTED BEHAVIOR:")
    print("CT Study with 614 images across 2 series")
    print("✅ Study page should pass only 2 imageIds (first image per series)")
    print("✅ SimpleDicomViewer should detect seriesInfo.length > 1")
    print("✅ Should create only 2 series thumbnails")
    print()
    
    # Scenario 2: What's probably happening
    print("🔍 LIKELY ISSUE:")
    print("1. Series endpoint fails or doesn't exist")
    print("2. Fallback to getStudyImageIds() loads ALL 614 images")
    print("3. SimpleDicomViewer receives imageIds array with 614 images")
    print("4. Even with series logic, it tries to create thumbnails for each")
    print()
    
    # Show the debugging steps
    print("🛠️ DEBUGGING STEPS:")
    print("1. Check browser console for '🔍 DEBUG: Attempting to fetch series metadata'")
    print("2. Check if status is 404/500 (series endpoint not working)")
    print("3. Check if '❌ DEBUG: Series response failed' appears")
    print("4. Check THUMBNAIL DEBUG log to see actual counts")
    print()
    
    # Possible fixes
    print("🔧 POSSIBLE FIXES:")
    print("A. Fix series endpoint (/api/pacs/studies/{uid}/series/)")
    print("B. Add hard limit in SimpleDicomViewer to never create >10 thumbnails")
    print("C. Force series mode for ANY study with multiple series info")
    print()
    
    # Test the logic
    scenarios = [
        {
            "name": "Current Issue (614 images loaded)",
            "imageIds_count": 614,
            "seriesInfo": [
                {"seriesDescription": "CT Series 1", "instanceCount": 307},
                {"seriesDescription": "CT Series 2", "instanceCount": 307}
            ]
        },
        {
            "name": "Fixed Scenario (2 images loaded)",
            "imageIds_count": 2,
            "seriesInfo": [
                {"seriesDescription": "CT Series 1", "instanceCount": 307},
                {"seriesDescription": "CT Series 2", "instanceCount": 307}
            ]
        }
    ]
    
    for scenario in scenarios:
        print(f"📊 SCENARIO: {scenario['name']}")
        imageIds_count = scenario['imageIds_count']
        seriesInfo = scenario['seriesInfo']
        
        # Apply our logic
        shouldUseSeriesThumbnails = len(seriesInfo) > 1
        
        if shouldUseSeriesThumbnails:
            # Series thumbnails: one per series
            thumbnail_count = len(seriesInfo)
            print(f"   Series Mode: {thumbnail_count} thumbnails (one per series)")
        else:
            # Individual thumbnails: one per image
            thumbnail_count = imageIds_count
            print(f"   Image Mode: {thumbnail_count} thumbnails (one per image)")
        
        if thumbnail_count > 10:
            print(f"   ❌ STILL HAMMERING SERVER: {thumbnail_count} thumbnail requests!")
        else:
            print(f"   ✅ SERVER SAFE: Only {thumbnail_count} thumbnail requests")
        print()

def test_emergency_fix():
    """Test an emergency fix - hard limit on thumbnails"""
    print("🚨 EMERGENCY FIX TEST:")
    print("Add hard limit to prevent >5 thumbnails regardless of logic")
    print()
    
    test_cases = [
        {"imageIds": 614, "seriesInfo": 2, "description": "Large CT study"},
        {"imageIds": 100, "seriesInfo": 3, "description": "Large MRI study"}, 
        {"imageIds": 2, "seriesInfo": 1, "description": "Small X-ray study"},
    ]
    
    for case in test_cases:
        imageIds_count = case['imageIds']
        seriesInfo_count = case['seriesInfo']
        
        # Current logic
        shouldUseSeriesThumbnails = seriesInfo_count > 1
        if shouldUseSeriesThumbnails:
            thumbnail_count = seriesInfo_count
        else:
            thumbnail_count = imageIds_count
        
        # EMERGENCY FIX: Hard limit
        thumbnail_count = min(thumbnail_count, 5)
        
        print(f"{case['description']}: {thumbnail_count} thumbnails (max 5)")
    
    print()
    print("This emergency fix would prevent server hammering while we debug the root cause.")

if __name__ == '__main__':
    debug_scenario()
    test_emergency_fix()