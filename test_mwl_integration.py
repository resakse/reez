#!/usr/bin/env python
"""
Test script for DICOM MWL integration

This script tests the DICOM MWL service functionality including:
- Study Instance UID generation
- MWL worklist creation
- DICOM dataset creation
- Parent-child study relationships

Run with: poetry run python test_mwl_integration.py
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from exam.dicom_mwl import mwl_service
from exam.models import Daftar, Pemeriksaan, Exam, Modaliti, Part
from pesakit.models import Pesakit
from wad.models import Ward
from django.contrib.auth import get_user_model

User = get_user_model()

def test_mwl_service():
    """Test the DICOM MWL service functionality"""
    print("🧪 Testing DICOM MWL Service...")
    
    # Create test data (reuse existing if available)
    print("📊 Setting up test data...")
    
    try:
        user = User.objects.get(username='testapi')
    except User.DoesNotExist:
        user = User.objects.create_user(username='testapi', password='testpass123')
    
    patient, created = Pesakit.objects.get_or_create(
        nric='991201-01-1234',
        defaults={
            'nama': 'Test Patient MWL',
            'jantina': 'L',
            'jxr': user
        }
    )
    
    ward, created = Ward.objects.get_or_create(wad='Test Ward MWL')
    modaliti, created = Modaliti.objects.get_or_create(
        singkatan='XR',
        defaults={'nama': 'X-Ray'}
    )
    
    chest_part, created = Part.objects.get_or_create(part='CHEST')
    hand_part, created = Part.objects.get_or_create(part='HAND')
    
    import time
    timestamp = int(time.time()) % 10000
    
    chest_exam, created = Exam.objects.get_or_create(
        exam=f'Chest X-Ray MWL Test {timestamp}',
        modaliti=modaliti,
        part=chest_part,
        defaults={'contrast': False, 'status_ca': 'ENABLE'}
    )
    
    hand_exam, created = Exam.objects.get_or_create(
        exam=f'Hand X-Ray MWL Test {timestamp}',
        modaliti=modaliti,
        part=hand_part,
        defaults={'contrast': False, 'status_ca': 'ENABLE'}
    )
    
    print("✅ Test data created")
    
    # Test 1: Study Instance UID Generation
    print("\n🔍 Testing Study Instance UID generation...")
    
    study = Daftar.objects.create(
        pesakit=patient,
        rujukan=ward,
        study_description='MWL Test Study',
        study_priority='HIGH',
        modality='XR',
        study_status='SCHEDULED'
    )
    
    assert study.parent_accession_number is not None, "Parent accession number should be generated"
    assert study.study_instance_uid is not None, "Study Instance UID should be generated"
    assert study.study_instance_uid.startswith('1.2.826.0.1.3680043.8.498'), "Study UID should use org root"
    
    print(f"✅ Generated Study UID: {study.study_instance_uid}")
    print(f"✅ Generated Accession: {study.parent_accession_number}")
    
    # Test 2: Create examinations
    print("\n🔍 Testing examination creation...")
    
    exam1 = Pemeriksaan.objects.create(
        daftar=study,
        exam=chest_exam,
        patient_position='AP',
        body_position='ERECT',
        exam_status='SCHEDULED',
        catatan='Chest X-ray for respiratory evaluation'
    )
    
    exam2 = Pemeriksaan.objects.create(
        daftar=study,
        exam=hand_exam,
        patient_position='PA',
        body_position='ERECT',
        laterality='Kanan',
        exam_status='SCHEDULED',
        catatan='Right hand injury follow-up'
    )
    
    assert exam1.accession_number is not None, "Examination accession number should be generated"
    assert exam2.accession_number is not None, "Examination accession number should be generated"
    assert exam1.scheduled_step_id is not None, "Scheduled step ID should be generated"
    
    print(f"✅ Created examinations with accession numbers:")
    print(f"   - Chest: {exam1.accession_number}")
    print(f"   - Hand: {exam2.accession_number}")
    
    # Test 3: MWL Service - Get worklist items
    print("\n🔍 Testing MWL worklist generation...")
    
    worklist_items = mwl_service.get_worklist_items()
    assert len(worklist_items) >= 2, f"Should have at least 2 worklist items, got {len(worklist_items)}"
    
    # Find our test items
    test_items = [item for item in worklist_items if item['StudyInstanceUID'] == study.study_instance_uid]
    assert len(test_items) == 2, f"Should have 2 test items, got {len(test_items)}"
    
    print(f"✅ Generated {len(test_items)} MWL items")
    
    # Test 4: DICOM Dataset creation
    print("\n🔍 Testing DICOM dataset creation...")
    
    for i, item in enumerate(test_items):
        dataset = mwl_service.create_dicom_dataset(item)
        
        # Verify required DICOM fields
        assert hasattr(dataset, 'PatientName'), "PatientName should be present"
        assert hasattr(dataset, 'PatientID'), "PatientID should be present"
        assert hasattr(dataset, 'StudyInstanceUID'), "StudyInstanceUID should be present"
        assert hasattr(dataset, 'AccessionNumber'), "AccessionNumber should be present"
        assert hasattr(dataset, 'ScheduledProcedureStepSequence'), "SPS sequence should be present"
        
        sps = dataset.ScheduledProcedureStepSequence[0]
        assert hasattr(sps, 'ScheduledProcedureStepID'), "SPS ID should be present"
        assert hasattr(sps, 'Modality'), "Modality should be present"
        assert hasattr(sps, 'ScheduledProcedureStepStartDate'), "SPS start date should be present"
        
        print(f"✅ DICOM dataset {i+1}:")
        print(f"   - Patient: {dataset.PatientName}")
        print(f"   - Accession: {dataset.AccessionNumber}")
        print(f"   - Study UID: {dataset.StudyInstanceUID}")
        print(f"   - SPS ID: {sps.ScheduledProcedureStepID}")
        print(f"   - Modality: {sps.Modality}")
    
    # Test 5: Query filtering
    print("\n🔍 Testing MWL query filtering...")
    
    # Test by accession number
    filtered_items = mwl_service.get_worklist_items({
        'AccessionNumber': study.parent_accession_number
    })
    assert len(filtered_items) == 2, f"Accession filter should return 2 items, got {len(filtered_items)}"
    
    # Test by patient ID
    filtered_items = mwl_service.get_worklist_items({
        'PatientID': patient.nric
    })
    assert len(filtered_items) >= 2, f"Patient ID filter should return at least 2 items, got {len(filtered_items)}"
    
    # Test by modality
    filtered_items = mwl_service.get_worklist_items({
        'Modality': 'XR'
    })
    assert len(filtered_items) >= 2, f"Modality filter should return at least 2 items, got {len(filtered_items)}"
    
    print("✅ Query filtering working correctly")
    
    # Test 6: Study Instance UID consistency
    print("\n🔍 Testing Study UID consistency...")
    
    # Reload study from database
    study_reloaded = Daftar.objects.get(id=study.id)
    assert study_reloaded.study_instance_uid == study.study_instance_uid, "Study UID should be consistent"
    
    # Ensure UID service works
    uid_from_service = mwl_service.ensure_study_instance_uid(study_reloaded)
    assert uid_from_service == study.study_instance_uid, "UID service should return same UID"
    
    print("✅ Study UID consistency verified")
    
    # Cleanup
    print("\n🧹 Cleaning up test data...")
    study.delete()  # This will cascade to examinations
    patient.delete()
    ward.delete()
    chest_exam.delete()
    hand_exam.delete()
    chest_part.delete()
    hand_part.delete()
    modaliti.delete()
    
    print("✅ Cleanup completed")
    
    print("\n🎉 All DICOM MWL tests passed!")
    print("\n📋 Summary:")
    print("   ✅ Study Instance UID generation")
    print("   ✅ Examination accession number generation")
    print("   ✅ MWL worklist creation")
    print("   ✅ DICOM dataset creation")
    print("   ✅ Query filtering")
    print("   ✅ Study UID consistency")
    
    return True

if __name__ == '__main__':
    try:
        success = test_mwl_service()
        if success:
            print("\n🚀 DICOM MWL Integration: READY!")
            sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)