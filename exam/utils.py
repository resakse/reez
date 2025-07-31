"""
Shared utility functions for DICOM processing and RIS operations
Used by both DICOM upload and PACS import to maintain DRY principle
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.conf import settings
from custom.katanama import titlecase


def generate_custom_accession(file_metadata):
    """
    Generate custom accession number from DICOM metadata for import
    Preserves original DICOM accession number with proper formatting
    
    Args:
        file_metadata (dict): DICOM metadata containing requesting_service, study_date, accession_number, institution_name
        
    Returns:
        str: Custom formatted accession number (max 16 chars)
    """
    from django.conf import settings
    
    # Get service code from RequestingService or InstitutionName
    requesting_service = file_metadata.get('requesting_service', '')
    institution_name = file_metadata.get('institution_name', '')
    study_date = file_metadata.get('study_date', '')
    original_accession = file_metadata.get('accession_number', '')
    
    # Use requesting_service first, fallback to institution_name, then default
    service_source = requesting_service or institution_name
    
    if service_source:
        # Extract first letters of each word in service name
        service_parts = service_source.strip().split()
        service_code = ''.join(part[0].upper() for part in service_parts if part)
    else:
        # Fallback to settings
        service_code = getattr(settings, 'KLINIKSHORT', 'KKP')
    
    # Extract year from StudyDate (YYYYMMDD format)
    if study_date and len(study_date) >= 4:
        year = study_date[:4]
    else:
        year = str(timezone.now().year)
    
    # Use original accession or fallback
    if not original_accession:
        original_accession = '1'
    
    # Calculate remaining space for accession number (max 16 total)
    prefix = f"{service_code}{year}"
    remaining_chars = 16 - len(prefix)
    remaining_chars = max(1, remaining_chars)  # At least 1 digit
    
    # Zero-pad the original accession number to fit remaining space
    try:
        accession_num = int(original_accession)
        formatted_accession = str(accession_num).zfill(remaining_chars)
    except (ValueError, TypeError):
        # If not a number, truncate and pad
        formatted_accession = original_accession[:remaining_chars].zfill(remaining_chars)
    
    # Combine and ensure total length <= 16
    result = f"{prefix}{formatted_accession}"
    return result[:16]


def find_or_create_patient(file_metadata, manual_patient_id=None):
    """
    Find or create patient from DICOM metadata
    
    Args:
        file_metadata (dict): DICOM metadata containing patient information
        manual_patient_id (str, optional): Manual override for patient ID
        
    Returns:
        Pesakit: Patient object
    """
    from pesakit.models import Pesakit
    from pesakit.utils import parse_identification_number
    from datetime import datetime, date
    
    patient_name = file_metadata.get('patient_name', 'Unknown Patient')
    patient_id = file_metadata.get('patient_id', '')
    patient_sex = file_metadata.get('patient_sex', '')
    patient_birth_date = file_metadata.get('patient_birth_date', '')
    
    print(f"DEBUG: Looking for patient with ID: '{patient_id}', Name: '{patient_name}'")
    
    # Manual override takes precedence
    if manual_patient_id:
        try:
            patient = Pesakit.objects.get(id=manual_patient_id)
            print(f"DEBUG: Found manual override patient: {patient.id}")
            return patient
        except Pesakit.DoesNotExist:
            pass
    
    # Try to find existing patient by Patient ID
    if patient_id:
        # First try exact NRIC match (raw)
        existing_patient = Pesakit.objects.filter(nric=patient_id).first()
        if existing_patient:
            print(f"DEBUG: Found existing patient by NRIC: {existing_patient.id} - {existing_patient.nama}")
            return existing_patient
        
        # Then try formatted NRIC (with dashes)
        nric_info = parse_identification_number(patient_id)
        if nric_info and nric_info.get('is_valid'):
            formatted_nric = nric_info['formatted']
            existing_patient = Pesakit.objects.filter(nric=formatted_nric).first()
            if existing_patient:
                print(f"DEBUG: Found existing patient by formatted NRIC: {existing_patient.id} - {existing_patient.nama}")
                return existing_patient
        
        # Try MRN match
        existing_patient = Pesakit.objects.filter(mrn=patient_id).first()
        if existing_patient:
            print(f"DEBUG: Found existing patient by MRN: {existing_patient.id} - {existing_patient.nama}")
            return existing_patient
        
        print(f"DEBUG: No existing patient found for ID: {patient_id}")
    
    # Create new patient from DICOM metadata
    print(f"DEBUG: Creating new patient with PatientID: '{patient_id}'")
    
    # Parse NRIC info for patient creation
    nric_info = None
    if patient_id:
        nric_info = parse_identification_number(patient_id)
    print(f"DEBUG: NRIC parsing result: {nric_info}")
    
    # Determine patient details from NRIC or DICOM tags
    if nric_info and nric_info.get('is_valid'):
        gender = nric_info['gender']
        formatted_nric = nric_info['formatted']
        birth_date = nric_info.get('birth_date')
        print(f"DEBUG: Using NRIC-derived data: NRIC={formatted_nric}, Gender={gender}")
    else:
        # Use DICOM tags as fallback
        dicom_sex = patient_sex.upper()
        if dicom_sex == 'M':
            gender = 'L'  # Male
        elif dicom_sex == 'F':
            gender = 'P'  # Female
        else:
            gender = 'L'  # Default to male
        
        formatted_nric = patient_id  # Use raw patient ID
        
        # Parse birth date from DICOM (YYYYMMDD format)
        birth_date = None
        if patient_birth_date and len(patient_birth_date) == 8:
            try:
                birth_date = datetime.strptime(patient_birth_date, '%Y%m%d').date()
            except ValueError:
                pass
        
        print(f"DEBUG: Using DICOM-derived data: NRIC={formatted_nric}, Gender={gender}")
    
    # Create new patient
    patient_data = {
        'nama': titlecase(patient_name),
        'nric': formatted_nric or f"UNK_{timezone.now().strftime('%Y%m%d%H%M%S')}",
        'mrn': patient_id or f"MRN_{timezone.now().strftime('%Y%m%d%H%M%S')}",  # Use PatientID as MRN
        'jantina': gender,
    }
    
    if birth_date:
        patient_data['t_lahir'] = birth_date
    
    print(f"DEBUG: Creating patient with data: {patient_data}")
    patient = Pesakit.objects.create(**patient_data)
    print(f"DEBUG: Created new patient ID {patient.id}: {patient.nama}")
    
    return patient


def find_or_create_exam_with_retries(exam_name, modaliti, part=None, defaults=None):
    """
    Find or create Exam with proper handling of unique constraint violations
    
    Args:
        exam_name (str): Examination name
        modaliti (Modaliti): Modality object
        part (Part, optional): Body part object
        defaults (dict, optional): Default values for creation
        
    Returns:
        tuple: (Exam object, created boolean)
    """
    from exam.models import Exam
    
    # Apply same transformation as the model's save method
    exam_name = titlecase(exam_name)
    
    if defaults is None:
        defaults = {'catatan': 'Imported from DICOM'}
    
    try:
        exam, created = Exam.objects.get_or_create(
            exam=exam_name,
            modaliti=modaliti,
            part=part,
            defaults=defaults
        )
        return exam, created
    except IntegrityError:
        # Handle race condition - another process created the same exam
        try:
            exam = Exam.objects.get(
                exam=exam_name,
                modaliti=modaliti,
                part=part
            )
            return exam, False
        except Exam.DoesNotExist:
            # If we still can't find it, retry the get_or_create once more
            exam, created = Exam.objects.get_or_create(
                exam=exam_name,
                modaliti=modaliti,
                part=part,
                defaults=defaults
            )
            return exam, created


def parse_dicom_examination_details(file_metadata):
    """
    Parse examination details from DICOM metadata
    
    Args:
        file_metadata (dict): DICOM metadata
        
    Returns:
        dict: Parsed examination details
    """
    body_part = file_metadata.get('body_part_examined', '').upper()
    acquisition_desc = file_metadata.get('acquisition_device_processing_description', '')
    modality = file_metadata.get('modality', 'OT')
    
    # Parse exam type and position from AcquisitionDeviceProcessingDescription
    # e.g., "CHEST,ERECT P->A" -> exam_type="CHEST", position="PA ERECT"
    exam_type = body_part or modality  # Default to body part or modality
    position = file_metadata.get('patient_position', '')
    
    if acquisition_desc:
        # Parse acquisition description (e.g., "CHEST,ERECT P->A")
        parts = acquisition_desc.split(',')
        if len(parts) >= 1:
            exam_type = parts[0].strip().upper()
        if len(parts) >= 2:
            pos_desc = parts[1].strip()
            # Parse position description (e.g., "ERECT P->A" -> "PA ERECT")
            if 'P->A' in pos_desc or 'P-A' in pos_desc:
                position = f"PA {pos_desc.replace('P->A', '').replace('P-A', '').strip()}"
            elif 'A->P' in pos_desc or 'A-P' in pos_desc:
                position = f"AP {pos_desc.replace('A->P', '').replace('A-P', '').strip()}"
            elif 'LAT' in pos_desc.upper():
                position = f"LAT {pos_desc.replace('LAT', '').strip()}"
            else:
                position = pos_desc
    
    # Get radiographer name
    radiographer_name = file_metadata.get('operators_name', '').strip()
    
    # Get laterality (L/R)
    laterality = file_metadata.get('laterality', '').upper()
    
    return {
        'exam_type': (exam_type or f"{modality} Study").strip(),
        'body_part': body_part.strip() if body_part else '',
        'position': position.strip() if position else '',
        'laterality': laterality.strip() if laterality else '',
        'radiographer_name': radiographer_name.strip() if radiographer_name else '',
        'modality': modality.strip() if modality else 'OT'
    }


def map_patient_position(position_str):
    """
    Map DICOM position string to standardized patient position
    
    Args:
        position_str (str): Raw position string from DICOM or parsing
        
    Returns:
        str: Mapped position value
    """
    if not position_str:
        return None
        
    pos = position_str.upper()
    position_map = {
        'AP': 'AP',
        'PA': 'PA', 
        'LAT': 'LAT',
        'LATERAL': 'LAT',
        'LEFT': 'LATERAL_LEFT',
        'RIGHT': 'LATERAL_RIGHT',
        'OBL': 'OBLIQUE',
        'OBLIQUE': 'OBLIQUE'
    }
    
    for key, value in position_map.items():
        if key in pos:
            return value
    
    # Return original if no mapping found
    return position_str


def create_daftar_for_study(patient, file_metadata, registration_data=None, user=None):
    """
    Create Daftar (study registration) for DICOM study
    
    Args:
        patient (Pesakit): Patient object
        file_metadata (dict): DICOM metadata
        registration_data (dict, optional): Additional registration data
        user (User, optional): User creating the registration
        
    Returns:
        Daftar: Created registration object
    """
    from exam.models import Daftar
    from wad.models import Ward
    
    if registration_data is None:
        registration_data = {}
    
    study_instance_uid = file_metadata.get('study_instance_uid', '')
    accession_number = generate_custom_accession(file_metadata)
    
    # Get study details
    modality_name = registration_data.get('modality') or file_metadata.get('modality', 'OT')
    referring_physician = (registration_data.get('referring_physician') or 
                          file_metadata.get('referring_physician') or 'Import')
    study_description = (registration_data.get('study_description') or 
                        file_metadata.get('study_description') or 'Imported Study')
    
    print(f"DEBUG: Creating daftar with pesakit={patient.id}, modality='{modality_name}', study_uid='{study_instance_uid}', accession='{accession_number}'")
    
    daftar = Daftar.objects.create(
        pesakit=patient,
        pemohon=referring_physician,
        study_description=study_description,
        modality=modality_name,
        study_instance_uid=study_instance_uid,
        parent_accession_number=accession_number or None,
        accession_number=accession_number or None,
        jxr=user,
        study_status='COMPLETED',
        tarikh=timezone.now()
    )
    
    print(f"DEBUG: Created daftar ID {daftar.id} for patient {patient.id} with accession '{daftar.parent_accession_number}'")
    
    # Add ward if specified
    if registration_data.get('ward_id'):
        try:
            ward = Ward.objects.get(id=registration_data['ward_id'])
            daftar.rujukan = ward
            daftar.save()
        except Ward.DoesNotExist:
            pass
    
    return daftar


def create_pemeriksaan_from_dicom(daftar, file_metadata, user=None):
    """
    Create Pemeriksaan (examination) from DICOM metadata
    
    Args:
        daftar (Daftar): Study registration object
        file_metadata (dict): DICOM metadata
        user (User, optional): User creating the examination
        
    Returns:
        Pemeriksaan: Created examination object
    """
    from exam.models import Pemeriksaan, Modaliti, Part
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    
    # Parse examination details
    exam_details = parse_dicom_examination_details(file_metadata)
    print(f"DEBUG: Parsed exam details: {exam_details}")
    
    # Find or create modality
    file_modality, _ = Modaliti.objects.get_or_create(
        nama=exam_details['modality'],
        defaults={'singkatan': exam_details['modality'][:5]}
    )
    
    # Find or create body part
    part = None
    if exam_details['body_part']:
        part, _ = Part.objects.get_or_create(
            part=exam_details['body_part']
        )
    
    # Find or create exam type with retry logic
    exam, created = find_or_create_exam_with_retries(
        exam_details['exam_type'],
        file_modality,
        part,
        {'catatan': 'Created from DICOM import'}
    )
    print(f"DEBUG: Exam {'created' if created else 'found'}: {exam.id} - {exam.exam}/{exam.modaliti.nama}/{exam.part.part if exam.part else None}")
    
    # Map position to patient_position
    patient_position_mapped = map_patient_position(exam_details['position'])
    
    # Find radiographer by name if provided
    radiographer = user
    if exam_details['radiographer_name'] and not radiographer:
        # Try to find user by name
        names = exam_details['radiographer_name'].split()
        if len(names) >= 2:
            radiographer = User.objects.filter(
                first_name__icontains=names[0],
                last_name__icontains=names[-1]
            ).first()
    
    # Build notes
    notes_parts = []
    if exam_details['laterality']:
        notes_parts.append(f"Laterality: {exam_details['laterality']}")
    if exam_details['radiographer_name']:
        notes_parts.append(f"Operator: {exam_details['radiographer_name']}")
    
    # Generate accession number for this examination
    accession_number = generate_custom_accession(file_metadata)
    
    # Create examination record
    print(f"DEBUG: Creating Pemeriksaan for daftar {daftar.id}, exam {exam.id}")
    pemeriksaan = Pemeriksaan.objects.create(
        daftar=daftar,
        exam=exam,
        accession_number=accession_number or None,
        no_xray=accession_number or f"IMP{timezone.now().strftime('%Y%m%d%H%M%S')}",
        patient_position=patient_position_mapped,
        laterality=exam_details['laterality'] if exam_details['laterality'] else None,
        catatan=", ".join(notes_parts) if notes_parts else None,
        jxr=radiographer,
        exam_status='COMPLETED'
    )
    
    print(f"DEBUG: Created Pemeriksaan ID {pemeriksaan.id} with accession '{pemeriksaan.accession_number}'")
    return pemeriksaan