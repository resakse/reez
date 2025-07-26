from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model

from exam.models import (
    Daftar, Pemeriksaan, Exam, Modaliti, Part, 
    generate_study_accession, generate_exam_accession
)
from pesakit.models import Pesakit
from wad.models import Ward

User = get_user_model()


class AccessionNumberGenerationTest(TestCase):
    """Test cases for new accession number generation functions"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        self.patient = Pesakit.objects.create(
            nama='Test Patient',
            nric='990101-01-1234',
            jantina='L',
            jxr=self.user
        )
        
        self.ward = Ward.objects.create(wad='Test Ward')
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.part = Part.objects.create(part='CHEST')
        
        self.exam = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti,
            part=self.part
        )

    def test_generate_study_accession_first_study(self):
        """Test generating first study accession number"""
        accession = generate_study_accession("XR")
        year = timezone.now().year
        expected = f"KKP{year}XR0000001"
        
        self.assertEqual(accession, expected)
        self.assertTrue(accession.endswith("0000001"))
        self.assertIn(str(year), accession)
        self.assertIn("XR", accession)

    def test_generate_study_accession_incremental(self):
        """Test that study accession numbers increment correctly"""
        # Create first study
        study1 = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        # Create second study
        study2 = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        # Check that accession numbers are incremental
        accession1 = study1.parent_accession_number
        accession2 = study2.parent_accession_number
        
        self.assertIsNotNone(accession1)
        self.assertIsNotNone(accession2)
        self.assertTrue(accession1.endswith("0000001"))
        self.assertTrue(accession2.endswith("0000002"))

    def test_generate_study_accession_different_modalities(self):
        """Test study accession generation for different modalities"""
        accession_xr = generate_study_accession("XR")
        accession_ct = generate_study_accession("CT")
        
        self.assertIn("XR", accession_xr)
        self.assertIn("CT", accession_ct)
        self.assertNotEqual(accession_xr, accession_ct)

    def test_generate_exam_accession_first_exam(self):
        """Test generating first exam accession number"""
        accession = generate_exam_accession()
        year = timezone.now().year
        expected_prefix = f"KKP{year}"
        
        self.assertTrue(accession.startswith(expected_prefix))
        self.assertTrue(accession.endswith("0000000001"))

    def test_generate_exam_accession_incremental(self):
        """Test that exam accession numbers increment correctly"""
        # Create study first
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        # Create first exam
        exam1 = Pemeriksaan.objects.create(
            daftar=study,
            exam=self.exam,
            jxr=self.user
        )
        
        # Create second exam
        exam2 = Pemeriksaan.objects.create(
            daftar=study,
            exam=self.exam,
            jxr=self.user
        )
        
        # Check that accession numbers are incremental
        accession1 = exam1.accession_number
        accession2 = exam2.accession_number
        
        self.assertIsNotNone(accession1)
        self.assertIsNotNone(accession2)
        
        # Extract the last 10 digits to compare
        number1 = int(accession1[-10:])
        number2 = int(accession2[-10:])
        
        self.assertEqual(number2, number1 + 1)


class StudyModelTest(TestCase):
    """Test cases for Study (Daftar) model functionality"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        self.patient = Pesakit.objects.create(
            nama='Test Patient',
            nric='990101-01-1234',
            jantina='L',
            jxr=self.user
        )
        
        self.ward = Ward.objects.create(wad='Test Ward')

    def test_study_auto_generates_parent_accession(self):
        """Test that study automatically generates parent accession number"""
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        self.assertIsNotNone(study.parent_accession_number)
        self.assertIn("XR", study.parent_accession_number)
        self.assertEqual(study.requested_procedure_id, study.parent_accession_number)

    def test_study_generates_study_instance_uid(self):
        """Test that study generates unique study instance UID"""
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        self.assertIsNotNone(study.study_instance_uid)
        self.assertTrue(len(study.study_instance_uid) > 0)

    def test_study_default_status(self):
        """Test that study has correct default status"""
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        self.assertEqual(study.study_status, 'SCHEDULED')

    def test_study_legacy_accession_compatibility(self):
        """Test that legacy accession field is populated for compatibility"""
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )
        
        # Legacy accession_number should be set to parent_accession_number
        self.assertEqual(study.accession_number, study.parent_accession_number)


class ExaminationModelTest(TestCase):
    """Test cases for Examination (Pemeriksaan) model functionality"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        self.patient = Pesakit.objects.create(
            nama='Test Patient',
            nric='990101-01-1234',
            jantina='L',
            jxr=self.user
        )
        
        self.ward = Ward.objects.create(wad='Test Ward')
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.part = Part.objects.create(part='CHEST')
        
        self.exam = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti,
            part=self.part
        )
        
        self.study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            jxr=self.user
        )

    def test_examination_auto_generates_accession(self):
        """Test that examination automatically generates accession number"""
        examination = Pemeriksaan.objects.create(
            daftar=self.study,
            exam=self.exam,
            jxr=self.user
        )
        
        self.assertIsNotNone(examination.accession_number)
        self.assertEqual(examination.scheduled_step_id, examination.accession_number)

    def test_examination_default_status(self):
        """Test that examination has correct default status"""
        examination = Pemeriksaan.objects.create(
            daftar=self.study,
            exam=self.exam,
            jxr=self.user
        )
        
        self.assertEqual(examination.exam_status, 'SCHEDULED')
        self.assertEqual(examination.sequence_number, 1)

    def test_examination_legacy_no_xray_compatibility(self):
        """Test that legacy no_xray field is populated for compatibility"""
        examination = Pemeriksaan.objects.create(
            daftar=self.study,
            exam=self.exam,
            jxr=self.user
        )
        
        # Legacy no_xray should be set to accession_number
        self.assertEqual(examination.no_xray, examination.accession_number)

    def test_examination_positioning_fields(self):
        """Test examination positioning fields"""
        examination = Pemeriksaan.objects.create(
            daftar=self.study,
            exam=self.exam,
            patient_position='AP',
            body_position='ERECT',
            jxr=self.user
        )
        
        self.assertEqual(examination.patient_position, 'AP')
        self.assertEqual(examination.body_position, 'ERECT')

    def test_examination_with_catatan(self):
        """Test examination with radiographer comments"""
        catatan_text = "Patient could not extend fingers fully"
        examination = Pemeriksaan.objects.create(
            daftar=self.study,
            exam=self.exam,
            catatan=catatan_text,
            jxr=self.user
        )
        
        self.assertEqual(examination.catatan, catatan_text)


class ParentChildWorkflowTest(TestCase):
    """Test cases for parent-child study workflow"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        self.patient = Pesakit.objects.create(
            nama='Test Patient',
            nric='990101-01-1234',
            jantina='L',
            jxr=self.user
        )
        
        self.ward = Ward.objects.create(wad='Test Ward')
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='XR'
        )
        
        self.chest_part = Part.objects.create(part='CHEST')
        self.hand_part = Part.objects.create(part='HAND')
        
        self.chest_exam = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti,
            part=self.chest_part
        )
        
        self.hand_exam = Exam.objects.create(
            exam='Hand X-Ray',
            modaliti=self.modaliti,
            part=self.hand_part
        )

    def test_grouped_examinations_workflow(self):
        """Test complete grouped examinations workflow"""
        # Create parent study
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            study_description="Multi-part X-Ray Series",
            jxr=self.user
        )
        
        # Create multiple child examinations
        chest_exam = Pemeriksaan.objects.create(
            daftar=study,
            exam=self.chest_exam,
            patient_position='PA',
            body_position='ERECT',
            sequence_number=1,
            jxr=self.user
        )
        
        hand_exam = Pemeriksaan.objects.create(
            daftar=study,
            exam=self.hand_exam,
            patient_position='AP',
            body_position='ERECT',
            sequence_number=2,
            catatan="Patient could not fully extend fingers",
            jxr=self.user
        )
        
        # Verify parent study has parent accession
        self.assertIsNotNone(study.parent_accession_number)
        self.assertIn("XR", study.parent_accession_number)
        
        # Verify child examinations have individual accessions
        self.assertIsNotNone(chest_exam.accession_number)
        self.assertIsNotNone(hand_exam.accession_number)
        self.assertNotEqual(chest_exam.accession_number, hand_exam.accession_number)
        
        # Verify both examinations are linked to same study
        self.assertEqual(chest_exam.daftar, study)
        self.assertEqual(hand_exam.daftar, study)
        
        # Verify sequence numbers
        self.assertEqual(chest_exam.sequence_number, 1)
        self.assertEqual(hand_exam.sequence_number, 2)
        
        # Verify study has correct examination count
        self.assertEqual(study.pemeriksaan.count(), 2)

    def test_mwl_structure_compliance(self):
        """Test that the structure complies with DICOM MWL standards"""
        # Create study with examinations
        study = Daftar.objects.create(
            pesakit=self.patient,
            rujukan=self.ward,
            modality="XR",
            study_description="XR Series",
            study_priority="MEDIUM",
            jxr=self.user
        )
        
        examination = Pemeriksaan.objects.create(
            daftar=study,
            exam=self.chest_exam,
            jxr=self.user
        )
        
        # Verify DICOM MWL compliance
        # Parent study should have:
        self.assertIsNotNone(study.parent_accession_number)  # Requested Procedure ID
        self.assertIsNotNone(study.study_instance_uid)       # Study Instance UID
        self.assertEqual(study.requested_procedure_id, study.parent_accession_number)
        
        # Child examination should have:
        self.assertIsNotNone(examination.accession_number)   # Individual Accession Number
        self.assertIsNotNone(examination.scheduled_step_id)  # Scheduled Procedure Step ID
        self.assertEqual(examination.scheduled_step_id, examination.accession_number)


class AccessionNumberFormatTest(TestCase):
    """Test cases for accession number format validation"""
    
    def test_study_accession_format(self):
        """Test study accession number format"""
        accession = generate_study_accession("XR")
        year = timezone.now().year
        
        # Format should be: KKP{YEAR}{MODALITY}{7-digits}
        # Example: KKP2025XR0000001
        self.assertTrue(accession.startswith("KKP"))
        self.assertIn(str(year), accession)
        self.assertIn("XR", accession)
        self.assertTrue(accession.endswith("0000001"))
        self.assertEqual(len(accession), 16)  # KKP(3) + YEAR(4) + XR(2) + 7digits(7)

    def test_exam_accession_format(self):
        """Test exam accession number format"""
        accession = generate_exam_accession()
        year = timezone.now().year
        
        # Format should be: KKP{YEAR}{10-digits}
        # Example: KKP202500000001
        self.assertTrue(accession.startswith("KKP"))
        self.assertIn(str(year), accession)
        self.assertTrue(accession.endswith("0000000001"))
        self.assertEqual(len(accession), 17)  # KKP(3) + YEAR(4) + 10digits(10)

    def test_accession_uniqueness(self):
        """Test that accession numbers are unique when created in database"""
        # Create users and setup data for testing
        user = User.objects.create_user(username='testuser', password='pass')
        patient = Pesakit.objects.create(nama='Test', nric='990101-01-1234', jantina='L', jxr=user)
        ward = Ward.objects.create(wad='Test Ward')
        modaliti = Modaliti.objects.create(nama='X-Ray', singkatan='XR')
        part = Part.objects.create(part='CHEST')
        exam = Exam.objects.create(exam='Test Exam', modaliti=modaliti, part=part)
        
        # Create multiple studies and examinations to test uniqueness
        studies = []
        examinations = []
        
        for i in range(5):
            study = Daftar.objects.create(
                pesakit=patient,
                rujukan=ward,
                modality="XR",
                jxr=user
            )
            studies.append(study)
            
            examination = Pemeriksaan.objects.create(
                daftar=study,
                exam=exam,
                jxr=user
            )
            examinations.append(examination)
        
        # Verify all accession numbers are unique
        study_accessions = [s.parent_accession_number for s in studies]
        exam_accessions = [e.accession_number for e in examinations]
        
        # Test study accession uniqueness
        self.assertEqual(len(study_accessions), len(set(study_accessions)))
        
        # Test exam accession uniqueness  
        self.assertEqual(len(exam_accessions), len(set(exam_accessions)))
        
        # Test they are properly incremented
        for i in range(1, len(studies)):
            current_num = int(studies[i].parent_accession_number[-7:])
            previous_num = int(studies[i-1].parent_accession_number[-7:])
            self.assertEqual(current_num, previous_num + 1)
        
        for i in range(1, len(examinations)):
            current_num = int(examinations[i].accession_number[-10:])
            previous_num = int(examinations[i-1].accession_number[-10:])
            self.assertEqual(current_num, previous_num + 1)