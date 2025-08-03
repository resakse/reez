"""
Shared utility functions for DICOM processing and RIS operations
Used by both DICOM upload and PACS import to maintain DRY principle
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.conf import settings
from custom.katanama import titlecase
from datetime import datetime
import re


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
    
    # Try to infer race from name if not already set
    if not patient.bangsa:
        update_patient_race_if_empty(patient)
    
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
    
    # Parse study date from DICOM or use current time as fallback
    study_date_str = file_metadata.get('study_date', '')
    tarikh = timezone.now()  # Default fallback
    
    if study_date_str and len(study_date_str) == 8:
        try:
            # Convert DICOM date format (YYYYMMDD) to Django datetime
            from datetime import datetime
            study_date = datetime.strptime(study_date_str, '%Y%m%d').date()
            tarikh = timezone.make_aware(datetime.combine(study_date, datetime.min.time()))
        except ValueError:
            # Invalid date format, use current time
            pass
    
    print(f"DEBUG: Creating daftar with pesakit={patient.id}, modality='{modality_name}', study_uid='{study_instance_uid}', accession='{accession_number}', study_date='{study_date_str}'")
    
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
        tarikh=tarikh
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
    
    # Parse DICOM Content Date/Time
    content_date = None
    content_time = None
    content_datetime = None
    
    # Parse ContentDate (YYYYMMDD format)
    if file_metadata.get('content_date') and len(file_metadata['content_date']) == 8:
        try:
            content_date = datetime.strptime(file_metadata['content_date'], '%Y%m%d').date()
        except ValueError:
            print(f"DEBUG: Failed to parse ContentDate: {file_metadata['content_date']}")
    
    # Parse ContentTime (HHMMSS.FFFFFF format)
    if file_metadata.get('content_time'):
        try:
            # Handle various time formats (HHMMSS, HHMMSS.F, HHMMSS.FFFFFF)
            time_str = file_metadata['content_time']
            if '.' in time_str:
                # Handle fractional seconds
                time_parts = time_str.split('.')
                base_time = time_parts[0]
                fractional = time_parts[1][:6].ljust(6, '0')  # Pad or truncate to 6 digits
                content_time = datetime.strptime(base_time + fractional, '%H%M%S%f').time()
            else:
                # Handle without fractional seconds
                content_time = datetime.strptime(time_str, '%H%M%S').time()
        except ValueError:
            print(f"DEBUG: Failed to parse ContentTime: {file_metadata['content_time']}")
    
    # Combine ContentDate and ContentTime into content_datetime
    if content_date and content_time:
        content_datetime = datetime.combine(content_date, content_time)
        print(f"DEBUG: Parsed DICOM Content DateTime: {content_datetime}")
    
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
        exam_status='COMPLETED',
        # DICOM Content Date/Time fields
        content_date=content_date,
        content_time=content_time,
        content_datetime=content_datetime,
        content_datetime_source=file_metadata.get('datetime_source', ''),
    )
    
    print(f"DEBUG: Created Pemeriksaan ID {pemeriksaan.id} with accession '{pemeriksaan.accession_number}'")
    return pemeriksaan


def infer_race_from_name(full_name):
    """
    Infer race/ethnicity from Malaysian names using pattern matching
    
    Args:
        full_name (str): Patient's full name
        
    Returns:
        str: Inferred race ('MALAY', 'CHINESE', 'INDIAN', 'OTHER')
    """
    if not full_name or not isinstance(full_name, str):
        return 'OTHER'
    
    # Normalize name: remove extra spaces, convert to uppercase
    name = re.sub(r'\s+', ' ', full_name.strip().upper())
    
    # Malaysian Malay patterns
    malay_patterns = [
        # Common Malay prefixes and suffixes
        r'\bBIN\b', r'\bBINTI\b', r'\bABD\b', r'\bABDUL\b', r'\bABDULLAH\b',
        # Common Malay names
        r'\bMUHAMMAD\b', r'\bMOHAMMAD\b', r'\bAHMAD\b', r'\bMOHD\b', r'\bMD\b',
        r'\bSITI\b', r'\bNUR\b', r'\bNURUL\b', r'\bFATIMAH\b', r'\bAISHAH\b',
        # Malay surnames/components
        r'\bRAHMAN\b', r'\bRAHIM\b', r'\bRASHID\b', r'\bHASAN\b', r'\bHUSAIN\b',
        r'\bISMAIL\b', r'\bYUSUF\b', r'\bIBRAHIM\b', r'\bOTHMAN\b', r'\bOMARB\b',
        # Regional Malay names
        r'\bWAN\b', r'\bCHE\b', r'\bMAT\b', r'\bNIK\b'
    ]
    
    # Chinese patterns (transliterated names)
    chinese_patterns = [
        # Common Chinese surnames
        r'\bLIM\b', r'\bTAN\b', r'\bLEE\b', r'\bWONG\b', r'\bCHAN\b', r'\bLAU\b',
        r'\bTEO\b', r'\bNG\b', r'\bONG\b', r'\bYAP\b', r'\bSIM\b', r'\bHO\b',
        r'\bKOH\b', r'\bGOH\b', r'\bCHUA\b', r'\bTAY\b', r'\bLOW\b', r'\bKUEK\b',
        r'\bCHIN\b', r'\bLOOI\b', r'\bTONG\b', r'\bFOO\b', r'\bYEO\b', r'\bKHOO\b',
        r'\bCHEN\b', r'\bLIU\b', r'\bZHANG\b', r'\bWANG\b', r'\bLI\b', r'\bZHAO\b',
        # Hokkien/Teochew variations
        r'\bLIAW\b', r'\bLIEW\b', r'\bTIAW\b', r'\bCHOW\b', r'\bHOW\b',
        # Cantonese variations
        r'\bYAM\b', r'\bLAM\b', r'\bMOK\b', r'\bCHEUNG\b', r'\bLEUNG\b',
        # Hakka variations  
        r'\bTHONG\b', r'\bCHONG\b', r'\bFONG\b', r'\bYONG\b'
    ]
    
    # Indian patterns (Tamil, Malayalam, Telugu, Punjabi, etc.)
    indian_patterns = [
        # Common Tamil names and components
        r'\bA\/L\b', r'\bA\/P\b', r'\bS\/O\b', r'\bD\/O\b',  # Anak Lelaki/Perempuan, Son Of/Daughter Of
        r'\bRAMAN\b', r'\bKRISHNAN\b', r'\bSUBRAMANIAM\b', r'\bRAJU\b',
        r'\bNAIR\b', r'\bKUMAR\b', r'\bDEVI\b', r'\bPRIYA\b', r'\bVANI\b',
        # Telugu/Malayalam
        r'\bRAO\b', r'\bREDDY\b', r'\bMENON\b', r'\bPILLAI\b', r'\bNAMBIAR\b',
        # Punjabi/Sikh names
        r'\bSINGH\b', r'\bKAUR\b', r'\bJIT\b', r'\bPAL\b', r'\bDEEP\b',
        # General Indian patterns
        r'\bSHARMA\b', r'\bGUPTA\b', r'\bVERMA\b', r'\bAGARWAL\b', r'\bMISHRA\b',
        # South Indian specific
        r'\bBALAKRISHNAN\b', r'\bRAMAKRISHNAN\b', r'\bVENKATESH\b', r'\bSRINIVASAN\b',
        r'\bMURALI\b', r'\bSUNIL\b', r'\bANIL\b', r'\bVIJAY\b', r'\bRAJESH\b'
    ]
    
    # Score each race based on pattern matches
    malay_score = sum(1 for pattern in malay_patterns if re.search(pattern, name))
    chinese_score = sum(1 for pattern in chinese_patterns if re.search(pattern, name))
    indian_score = sum(1 for pattern in indian_patterns if re.search(pattern, name))
    
    # Additional logic for mixed names or ambiguous cases
    
    # If multiple BIN/BINTI found, strongly Malay
    if len(re.findall(r'\b(BIN|BINTI)\b', name)) >= 2:
        malay_score += 3
    
    # If single Chinese character names (common pattern)
    chinese_single_char_pattern = r'\b[A-Z]\s+[A-Z]{2,4}\s+[A-Z]{2,6}\b'
    if re.search(chinese_single_char_pattern, name):
        chinese_score += 2
        
    # Special case: Names with both patterns (mixed heritage)
    if malay_score > 0 and chinese_score > 0:
        # Favor the higher score but reduce confidence
        if malay_score > chinese_score:
            malay_score += 1
        else:
            chinese_score += 1
    
    # Determine race based on highest score
    max_score = max(malay_score, chinese_score, indian_score)
    
    if max_score == 0:
        return 'OTHER'  # No clear patterns found
    elif malay_score == max_score:
        return 'MALAY'
    elif chinese_score == max_score:
        return 'CHINESE'
    elif indian_score == max_score:
        return 'INDIAN'
    else:
        return 'OTHER'


def update_patient_race_if_empty(patient):
    """
    Update patient's race field if it's empty by inferring from name
    
    Args:
        patient: Pesakit object
        
    Returns:
        bool: True if race was updated, False otherwise
    """
    if patient.bangsa or not patient.nama:
        return False  # Race already set or no name to work with
    
    inferred_race = infer_race_from_name(patient.nama)
    
    if inferred_race != 'OTHER':
        patient.bangsa = inferred_race
        patient.save(update_fields=['bangsa'])
        print(f"DEBUG: Updated patient {patient.id} race to {inferred_race} based on name '{patient.nama}'")
        return True
    
    return False


def get_orthanc_monthly_images(year, month, modality=None, pacs_server=None):
    """
    Get monthly image counts from Orthanc PACS servers for reject analysis
    
    Args:
        year (int): Year for analysis
        month (int): Month for analysis (1-12)
        modality (str, optional): Filter by specific modality
        pacs_server (PacsServer, optional): Specific PACS server to query
        
    Returns:
        dict: Statistics containing total_images, total_studies, modality_breakdown
    """
    import requests
    import calendar
    from datetime import datetime, date
    from exam.models import PacsServer
    
    # Get target month date range
    start_date = date(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = date(year, month, last_day)
    
    # Convert to DICOM date format (YYYYMMDD)
    start_dicom = start_date.strftime('%Y%m%d')
    end_dicom = end_date.strftime('%Y%m%d')
    
    # Get PACS servers to query
    if pacs_server:
        pacs_servers = [pacs_server]
    else:
        pacs_servers = PacsServer.objects.filter(
            is_active=True,
            include_in_reject_analysis=True
        )
    
    if not pacs_servers:
        return {
            'total_images': 0,
            'total_studies': 0,
            'modality_breakdown': {},
            'error': 'No active PACS servers configured for reject analysis'
        }
    
    total_images = 0
    total_studies = 0
    modality_breakdown = {}
    errors = []
    
    for server in pacs_servers:
        try:
            # Build Orthanc API URL
            base_url = server.orthancurl.rstrip('/')
            
            # Query studies for the month
            studies_url = f"{base_url}/studies"
            
            # Get all studies (Orthanc doesn't support date filtering directly)
            response = requests.get(studies_url, timeout=30)
            response.raise_for_status()
            
            study_ids = response.json()
            
            monthly_studies = []
            server_images = 0
            server_modality_breakdown = {}
            
            # Filter studies by date and modality
            for study_id in study_ids:
                try:
                    # Get study metadata
                    study_url = f"{base_url}/studies/{study_id}"
                    study_response = requests.get(study_url, timeout=10)
                    study_response.raise_for_status()
                    
                    study_data = study_response.json()
                    main_dicom_tags = study_data.get('MainDicomTags', {})
                    
                    # Check study date
                    study_date = main_dicom_tags.get('StudyDate', '')
                    if not study_date or len(study_date) != 8:
                        continue
                    
                    # Filter by date range
                    if not (start_dicom <= study_date <= end_dicom):
                        continue
                    
                    # Get modality from series
                    series_ids = study_data.get('Series', [])
                    study_modalities = set()
                    study_image_count = 0
                    
                    for series_id in series_ids:
                        try:
                            series_url = f"{base_url}/series/{series_id}"
                            series_response = requests.get(series_url, timeout=10)
                            series_response.raise_for_status()
                            
                            series_data = series_response.json()
                            series_tags = series_data.get('MainDicomTags', {})
                            series_modality = series_tags.get('Modality', 'UN')
                            
                            # Filter by modality if specified
                            if modality and series_modality != modality:
                                continue
                            
                            study_modalities.add(series_modality)
                            
                            # Count instances (images) in this series
                            instance_count = len(series_data.get('Instances', []))
                            study_image_count += instance_count
                            
                            # Update modality breakdown
                            if series_modality not in server_modality_breakdown:
                                server_modality_breakdown[series_modality] = {
                                    'images': 0,
                                    'studies': 0
                                }
                            server_modality_breakdown[series_modality]['images'] += instance_count
                            
                        except requests.RequestException:
                            # Skip problematic series but continue
                            continue
                    
                    # Only count study if it matches our criteria
                    if study_image_count > 0 and (not modality or modality in study_modalities):
                        monthly_studies.append(study_id)
                        server_images += study_image_count
                        
                        # Update study counts for modalities
                        for mod in study_modalities:
                            if not modality or mod == modality:
                                if mod in server_modality_breakdown:
                                    server_modality_breakdown[mod]['studies'] += 1
                
                except requests.RequestException:
                    # Skip problematic studies but continue
                    continue
            
            # Aggregate results from this server
            total_images += server_images
            total_studies += len(monthly_studies)
            
            # Merge modality breakdowns
            for mod, counts in server_modality_breakdown.items():
                if mod not in modality_breakdown:
                    modality_breakdown[mod] = {'images': 0, 'studies': 0}
                modality_breakdown[mod]['images'] += counts['images']
                modality_breakdown[mod]['studies'] += counts['studies']
            
            print(f"DEBUG: PACS {server.name} - Found {server_images} images in {len(monthly_studies)} studies for {year}-{month:02d}")
            
        except requests.RequestException as e:
            error_msg = f"Failed to query PACS server {server.name}: {str(e)}"
            errors.append(error_msg)
            print(f"ERROR: {error_msg}")
            continue
        except Exception as e:
            error_msg = f"Unexpected error with PACS server {server.name}: {str(e)}"
            errors.append(error_msg)
            print(f"ERROR: {error_msg}")
            continue
    
    result = {
        'total_images': total_images,
        'total_studies': total_studies,
        'modality_breakdown': modality_breakdown,
        'month_year': f"{calendar.month_name[month]} {year}",
        'date_range': f"{start_dicom} - {end_dicom}"
    }
    
    if errors:
        result['warnings'] = errors
    
    return result


def calculate_reject_analysis_from_pacs(analysis_date, modality, auto_save=True):
    """
    Calculate reject analysis statistics by querying PACS servers
    
    Args:
        analysis_date (date): First day of the month to analyze
        modality (Modaliti): Modality object to analyze
        auto_save (bool): Whether to automatically save the analysis
        
    Returns:
        dict: Analysis data or RejectAnalysis object if auto_save=True
    """
    from exam.models import RejectAnalysis, Pemeriksaan
    from django.db.models import Count
    
    year = analysis_date.year
    month = analysis_date.month
    
    # Get PACS image counts
    pacs_data = get_orthanc_monthly_images(year, month, modality.singkatan)
    
    if 'error' in pacs_data:
        return {'error': pacs_data['error']}
    
    # Get examination counts from RIS database
    # Count examinations created in the month for this modality
    examination_count = Pemeriksaan.objects.filter(
        created__year=year,
        created__month=month,
        exam__modaliti=modality
    ).count()
    
    # Get modality-specific data from PACS
    modality_data = pacs_data['modality_breakdown'].get(modality.singkatan, {
        'images': 0,
        'studies': 0
    })
    
    total_images = modality_data['images']
    total_studies = modality_data['studies']
    
    # Use examination count from RIS if higher than PACS studies
    # (RIS is more reliable for examination counts)
    total_examinations = max(examination_count, total_studies)
    
    # For reject analysis, we need to estimate retakes
    # This is a simplified calculation - in reality, you'd need DICOM tags or manual data entry
    # For now, assume retakes are images beyond 1 per examination
    estimated_retakes = max(0, total_images - total_examinations)
    
    analysis_data = {
        'analysis_date': analysis_date,
        'modality': modality,
        'total_examinations': total_examinations,
        'total_images': total_images,
        'total_retakes': estimated_retakes,
        'pacs_studies': total_studies,
        'ris_examinations': examination_count,
        'calculation_method': 'PACS_AUTOMATED',
        'pacs_warnings': pacs_data.get('warnings', [])
    }
    
    if auto_save:
        # Create or update analysis
        analysis, created = RejectAnalysis.objects.update_or_create(
            analysis_date=analysis_date,
            modality=modality,
            defaults={
                'total_examinations': total_examinations,
                'total_images': total_images,
                'total_retakes': estimated_retakes,
                'comments': f"Auto-calculated from PACS data. RIS exams: {examination_count}, PACS studies: {total_studies}"
            }
        )
        analysis_data['analysis_object'] = analysis
        analysis_data['created'] = created
    
    return analysis_data