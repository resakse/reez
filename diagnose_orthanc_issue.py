#!/usr/bin/env python3
"""
Comprehensive Orthanc issue diagnosis based on configuration
"""
import requests
import json

def diagnose_orthanc():
    print("🔍 COMPREHENSIVE ORTHANC DIAGNOSIS")
    print("=" * 60)
    
    orthanc_url = "http://192.168.20.172:8042"
    
    # 1. Test basic system information
    print("1. ORTHANC SYSTEM INFO")
    print("-" * 30)
    try:
        system_response = requests.get(f"{orthanc_url}/system", timeout=10)
        if system_response.ok:
            system_info = system_response.json()
            print(f"✅ Orthanc Version: {system_info.get('Version')}")
            print(f"✅ Database Backend: {system_info.get('DatabaseBackendPlugin', 'SQLite')}")
            print(f"✅ Storage Area Plugin: {system_info.get('StorageAreaPlugin', 'Filesystem')}")
            print(f"✅ Has Stone Web Viewer: {system_info.get('HasStoneWebViewer', False)}")
        else:
            print(f"❌ System endpoint failed: {system_response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to Orthanc: {e}")
        return
    
    # 2. Check database vs storage consistency
    print(f"\n2. DATABASE VS STORAGE CONSISTENCY")
    print("-" * 40)
    
    try:
        # Get studies from database
        studies_response = requests.get(f"{orthanc_url}/studies", timeout=10)
        if not studies_response.ok:
            print(f"❌ Cannot access studies: {studies_response.status_code}")
            return
            
        studies = studies_response.json()
        print(f"✅ Database reports {len(studies)} studies")
        
        if not studies:
            print("❌ No studies found in database")
            return
            
        # Test first study in detail
        study_id = studies[0]
        print(f"\n   Testing study: {study_id}")
        
        # Get study metadata
        study_response = requests.get(f"{orthanc_url}/studies/{study_id}", timeout=10)
        if study_response.ok:
            study_data = study_response.json()
            study_uid = study_data.get('MainDicomTags', {}).get('StudyInstanceUID')
            series_list = study_data.get('Series', [])
            print(f"   ✅ Study metadata accessible: {study_uid}")
            print(f"   ✅ Series count: {len(series_list)}")
            
            # Test series access
            if series_list:
                series_id = series_list[0]
                series_response = requests.get(f"{orthanc_url}/series/{series_id}", timeout=10)
                if series_response.ok:
                    series_data = series_response.json()
                    instances = series_data.get('Instances', [])
                    print(f"   ✅ Series metadata accessible")
                    print(f"   ✅ Instances count: {len(instances)}")
                    
                    # Here's the critical test: instance accessibility
                    if instances:
                        instance_id = instances[0]
                        print(f"\n   Testing instance: {instance_id}")
                        
                        # Test instance metadata access
                        instance_response = requests.get(f"{orthanc_url}/instances/{instance_id}", timeout=5)
                        instance_accessible = instance_response.ok
                        print(f"   {'✅' if instance_accessible else '❌'} Instance metadata: {instance_response.status_code}")
                        
                        if not instance_accessible:
                            print(f"   🚨 CRITICAL: Instance exists in database but metadata not accessible!")
                            print(f"   🚨 This indicates Orthanc database corruption or version mismatch")
                            
                            # Check if it's a database schema issue
                            statistics_response = requests.get(f"{orthanc_url}/statistics", timeout=10)
                            if statistics_response.ok:
                                stats = statistics_response.json()
                                print(f"   📊 Database statistics:")
                                print(f"      Instances: {stats.get('CountInstances', 'unknown')}")
                                print(f"      Studies: {stats.get('CountStudies', 'unknown')}")
                                print(f"      Series: {stats.get('CountSeries', 'unknown')}")
                                
                                db_instances = stats.get('CountInstances', 0)
                                if db_instances > 0:
                                    print(f"   🚨 Database claims {db_instances} instances exist but they're not accessible")
                                    print(f"   🚨 This suggests Orthanc database schema corruption")
                        else:
                            # Instance metadata is accessible, test file access
                            file_response = requests.head(f"{orthanc_url}/instances/{instance_id}/file", timeout=5)
                            print(f"   {'✅' if file_response.ok else '❌'} Instance file: {file_response.status_code}")
                            
                            preview_response = requests.head(f"{orthanc_url}/instances/{instance_id}/preview", timeout=5)
                            print(f"   {'✅' if preview_response.ok else '❌'} Instance preview: {preview_response.status_code}")
                    else:
                        print(f"   ❌ No instances in series")
                else:
                    print(f"   ❌ Series metadata not accessible: {series_response.status_code}")
            else:
                print(f"   ❌ No series in study")
        else:
            print(f"   ❌ Study metadata not accessible: {study_response.status_code}")
            
    except Exception as e:
        print(f"❌ Database consistency check failed: {e}")
    
    # 3. Check for Stone Web Viewer and plugins
    print(f"\n3. PLUGIN AND VIEWER STATUS")
    print("-" * 35)
    
    try:
        # Check plugins
        plugins_response = requests.get(f"{orthanc_url}/plugins", timeout=10)
        if plugins_response.ok:
            plugins = plugins_response.json()
            print(f"✅ Loaded plugins: {len(plugins)}")
            for plugin in plugins:
                print(f"   - {plugin}")
        else:
            print(f"❌ Cannot access plugins: {plugins_response.status_code}")
            
        # Check Stone Web Viewer specifically
        stone_response = requests.get(f"{orthanc_url}/app/stone-webviewer/", timeout=5)
        print(f"{'✅' if stone_response.ok else '❌'} Stone Web Viewer: {stone_response.status_code}")
        
    except Exception as e:
        print(f"❌ Plugin check failed: {e}")
    
    # 4. Database schema version check
    print(f"\n4. DATABASE SCHEMA ANALYSIS")
    print("-" * 35)
    
    try:
        # Check if we can determine database version/schema
        # This is a diagnostic endpoint that might give us clues
        changes_response = requests.get(f"{orthanc_url}/changes?limit=1", timeout=10)
        if changes_response.ok:
            print(f"✅ Changes endpoint accessible")
        else:
            print(f"❌ Changes endpoint failed: {changes_response.status_code}")
            
        # Check tools endpoint
        tools_response = requests.get(f"{orthanc_url}/tools", timeout=10)
        if tools_response.ok:
            tools = tools_response.json()
            print(f"✅ Available tools: {', '.join(tools)}")
        else:
            print(f"❌ Tools endpoint failed: {tools_response.status_code}")
            
    except Exception as e:
        print(f"❌ Schema analysis failed: {e}")
    
    # 5. Recommendations
    print(f"\n5. DIAGNOSIS AND RECOMMENDATIONS")
    print("-" * 40)
    print("Based on the tests above:")
    print()
    print("IF instance metadata is NOT accessible (404 errors):")
    print("  🚨 CRITICAL: Orthanc database corruption detected")
    print("  💡 Solutions:")
    print("     1. Stop Orthanc service")
    print("     2. Backup /var/lib/orthanc/db-v6/")
    print("     3. Delete Orthanc database files (keep DICOM files)")
    print("     4. Restart Orthanc (will rebuild database)")
    print("     5. Re-import DICOM files from storage")
    print()
    print("IF instance metadata IS accessible but files are not:")
    print("  ⚠️  Storage configuration issue")
    print("  💡 Solutions:")
    print("     1. Check /var/lib/orthanc/db-v6/ permissions")
    print("     2. Verify StorageDirectory in orthanc.json")
    print("     3. Check disk space and file system health")
    print()
    print("IF Stone Web Viewer works but REST API doesn't:")
    print("  🤔 Stone Web Viewer uses different access method")
    print("  💡 Solutions:")
    print("     1. Update to latest Orthanc version")
    print("     2. Check plugin compatibility")
    print("     3. Use Stone Web Viewer as primary viewer")

if __name__ == "__main__":
    diagnose_orthanc()