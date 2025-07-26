"""
DICOM Modality Worklist (MWL) Service for CR/DR Machine Integration

This module provides DICOM Modality Worklist functionality for the RIS system,
supporting parent-child study relationships and CR/DR machine integration.

Key Features:
- DICOM C-FIND SCU requests handling
- Parent-child study hierarchy support
- Scheduled Procedure Steps (SPS) management
- Study Instance UID generation and management
- Integration with Orthanc PACS
"""

import logging
import uuid
from datetime import datetime, date
from typing import List, Dict, Optional, Any
from django.conf import settings
from django.utils import timezone

from pydicom import Dataset
from pydicom.uid import generate_uid, UID
from pynetdicom import AE, evt, debug_logger
from pynetdicom.sop_class import ModalityWorklistInformationFind

from .models import Daftar, Pemeriksaan, PacsConfig
from .serializers import GroupedMWLWorklistSerializer

logger = logging.getLogger(__name__)

class DicomMWLService:
    """
    DICOM Modality Worklist Service
    
    Handles DICOM MWL requests from CR/DR machines and provides
    worklist data with parent-child study support.
    """
    
    def __init__(self):
        self.ae = AE()
        self.ae.add_supported_context(ModalityWorklistInformationFind)
        self.ae.ae_title = getattr(settings, 'DICOM_AE_TITLE', 'RIS_MWL_SCP')
        
    def generate_study_instance_uid(self) -> str:
        """Generate a unique Study Instance UID"""
        # Generate a standard DICOM UID without prefix to avoid validation issues
        return generate_uid()
    
    def generate_sop_instance_uid(self) -> str:
        """Generate a unique SOP Instance UID"""
        return generate_uid()
        
    def ensure_study_instance_uid(self, study: Daftar) -> str:
        """
        Ensure a study has a Study Instance UID, generating one if needed
        """
        if not study.study_instance_uid:
            study.study_instance_uid = self.generate_study_instance_uid()
            study.save(update_fields=['study_instance_uid'])
            logger.info(f"Generated Study Instance UID for study {study.parent_accession_number}: {study.study_instance_uid}")
        
        return study.study_instance_uid
    
    def get_worklist_items(self, query_params: Dict[str, Any] = None) -> List[Dict]:
        """
        Get worklist items for MWL requests
        
        Args:
            query_params: DICOM query parameters (PatientID, AccessionNumber, etc.)
            
        Returns:
            List of worklist items with parent-child structure
        """
        # Get scheduled studies
        studies = Daftar.objects.filter(
            study_status__in=['SCHEDULED', 'IN_PROGRESS']
        ).select_related('pesakit').prefetch_related('pemeriksaan__exam__part')
        
        # Apply query filters if provided
        if query_params:
            if 'AccessionNumber' in query_params and query_params['AccessionNumber']:
                studies = studies.filter(parent_accession_number=query_params['AccessionNumber'])
            
            if 'PatientID' in query_params and query_params['PatientID']:
                studies = studies.filter(pesakit__nric=query_params['PatientID'])
            
            if 'StudyDate' in query_params and query_params['StudyDate']:
                try:
                    study_date = datetime.strptime(query_params['StudyDate'], '%Y%m%d').date()
                    studies = studies.filter(tarikh__date=study_date)
                except ValueError:
                    logger.warning(f"Invalid StudyDate format: {query_params['StudyDate']}")
            
            if 'Modality' in query_params and query_params['Modality']:
                studies = studies.filter(modality=query_params['Modality'])
        
        # Convert to MWL format
        worklist_items = []
        for study in studies:
            # Ensure Study Instance UID
            study_uid = self.ensure_study_instance_uid(study)
            
            # Create worklist item for each examination
            for examination in study.pemeriksaan.all():
                worklist_item = self._create_mwl_item(study, examination, study_uid)
                worklist_items.append(worklist_item)
        
        logger.info(f"Generated {len(worklist_items)} MWL items for query: {query_params}")
        return worklist_items
    
    def _create_mwl_item(self, study: Daftar, examination: Pemeriksaan, study_uid: str) -> Dict:
        """
        Create a single MWL item from study and examination data
        """
        patient = study.pesakit
        
        # Calculate patient age
        patient_age = ''
        if patient.t_lahir:
            birth_date = patient.t_lahir
            if isinstance(birth_date, str):
                try:
                    birth_date = datetime.strptime(birth_date, '%Y-%m-%d').date()
                except ValueError:
                    birth_date = None
            
            if birth_date:
                today = date.today()
                age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
                patient_age = f"{age:03d}Y"  # Format as 025Y for 25 years
        
        # Format scheduled date/time
        scheduled_datetime = study.scheduled_datetime or study.tarikh
        if scheduled_datetime:
            scheduled_date = scheduled_datetime.strftime('%Y%m%d')
            scheduled_time = scheduled_datetime.strftime('%H%M%S')
        else:
            scheduled_date = timezone.now().strftime('%Y%m%d')
            scheduled_time = timezone.now().strftime('%H%M%S')
        
        # Get modality from examination
        modality = examination.exam.modaliti.singkatan if examination.exam.modaliti else 'XR'
        
        mwl_item = {
            # Patient Information
            'PatientName': patient.nama or '',
            'PatientID': patient.nric or '',
            'PatientBirthDate': patient.t_lahir.strftime('%Y%m%d') if patient.t_lahir else '',
            'PatientSex': 'M' if patient.jantina == 'L' else 'F' if patient.jantina == 'P' else '',
            'PatientAge': patient_age,
            
            # Study Information
            'StudyInstanceUID': study_uid,
            'AccessionNumber': study.parent_accession_number or '',
            'StudyDescription': study.study_description or examination.exam.exam,
            'StudyDate': scheduled_date,
            'StudyTime': scheduled_time,
            'StudyPriority': study.study_priority or 'MEDIUM',
            
            # Examination/Procedure Information
            'RequestedProcedureID': study.requested_procedure_id or study.parent_accession_number,
            'RequestedProcedureDescription': study.study_description or examination.exam.exam,
            
            # Scheduled Procedure Step (SPS)
            'ScheduledProcedureStepID': examination.scheduled_step_id,
            'ScheduledProcedureStepDescription': examination.exam.exam,
            'ScheduledStationAETitle': getattr(settings, 'DICOM_AE_TITLE', 'RIS_MWL_SCP'),
            'ScheduledProcedureStepStartDate': scheduled_date,
            'ScheduledProcedureStepStartTime': scheduled_time,
            'Modality': modality,
            'ScheduledPerformingPhysicianName': study.pemohon or '',
            
            # Body Part and Position Information
            'CodeValue': examination.exam.part.part if examination.exam.part else '',
            'CodeMeaning': examination.exam.part.part if examination.exam.part else '',
            'PatientPosition': examination.patient_position or '',
            
            # Additional RIS Information
            'ReferringPhysicianName': study.pemohon or '',
            'StudyComments': study.study_comments or examination.catatan or '',
            'PregnancyStatus': '3' if study.hamil else '4',  # 3=pregnant, 4=not pregnant
            
            # Internal tracking
            'ExaminationAccessionNumber': examination.accession_number,
            'SequenceNumber': examination.sequence_number,
            'ExamStatus': examination.exam_status,
        }
        
        return mwl_item
    
    def create_dicom_dataset(self, mwl_item: Dict) -> Dataset:
        """
        Create a DICOM Dataset from MWL item for C-FIND response
        """
        ds = Dataset()
        
        # Patient Module
        ds.PatientName = mwl_item.get('PatientName', '')
        ds.PatientID = mwl_item.get('PatientID', '')
        ds.PatientBirthDate = mwl_item.get('PatientBirthDate', '')
        ds.PatientSex = mwl_item.get('PatientSex', '')
        ds.PatientAge = mwl_item.get('PatientAge', '')
        
        # General Study Module
        ds.StudyInstanceUID = mwl_item.get('StudyInstanceUID', '')
        ds.AccessionNumber = mwl_item.get('AccessionNumber', '')
        ds.StudyDescription = mwl_item.get('StudyDescription', '')
        ds.StudyDate = mwl_item.get('StudyDate', '')
        ds.StudyTime = mwl_item.get('StudyTime', '')
        ds.ReferringPhysicianName = mwl_item.get('ReferringPhysicianName', '')
        
        # Requested Procedure Module
        ds.RequestedProcedureID = mwl_item.get('RequestedProcedureID', '')
        ds.RequestedProcedureDescription = mwl_item.get('RequestedProcedureDescription', '')
        ds.StudyInstanceUID = mwl_item.get('StudyInstanceUID', '')
        
        # Scheduled Procedure Step Module
        sps = Dataset()
        sps.ScheduledProcedureStepID = mwl_item.get('ScheduledProcedureStepID', '')
        sps.ScheduledProcedureStepDescription = mwl_item.get('ScheduledProcedureStepDescription', '')
        sps.ScheduledStationAETitle = mwl_item.get('ScheduledStationAETitle', '')
        sps.ScheduledProcedureStepStartDate = mwl_item.get('ScheduledProcedureStepStartDate', '')
        sps.ScheduledProcedureStepStartTime = mwl_item.get('ScheduledProcedureStepStartTime', '')
        sps.Modality = mwl_item.get('Modality', 'XR')
        sps.ScheduledPerformingPhysicianName = mwl_item.get('ScheduledPerformingPhysicianName', '')
        
        # Patient Position
        if mwl_item.get('PatientPosition'):
            sps.PatientPosition = mwl_item['PatientPosition']
        
        # Add SPS to dataset
        ds.ScheduledProcedureStepSequence = [sps]
        
        return ds
    
    def handle_mwl_request(self, event) -> List[Dataset]:
        """
        Handle incoming DICOM C-FIND MWL request
        """
        identifier = event.identifier
        logger.info(f"Received MWL C-FIND request: {identifier}")
        
        # Extract query parameters from DICOM identifier
        query_params = {}
        if hasattr(identifier, 'AccessionNumber') and identifier.AccessionNumber:
            query_params['AccessionNumber'] = identifier.AccessionNumber
        if hasattr(identifier, 'PatientID') and identifier.PatientID:
            query_params['PatientID'] = identifier.PatientID
        if hasattr(identifier, 'StudyDate') and identifier.StudyDate:
            query_params['StudyDate'] = identifier.StudyDate
        if hasattr(identifier, 'ScheduledProcedureStepSequence'):
            sps = identifier.ScheduledProcedureStepSequence[0]
            if hasattr(sps, 'Modality') and sps.Modality:
                query_params['Modality'] = sps.Modality
        
        # Get worklist items
        worklist_items = self.get_worklist_items(query_params)
        
        # Convert to DICOM datasets
        datasets = []
        for item in worklist_items:
            ds = self.create_dicom_dataset(item)
            datasets.append(ds)
        
        logger.info(f"Returning {len(datasets)} MWL items")
        return datasets
    
    def start_mwl_server(self, port: int = 11112):
        """
        Start the DICOM MWL SCP server
        """
        def handle_find(event):
            """Handle C-FIND request"""
            try:
                datasets = self.handle_mwl_request(event)
                for ds in datasets:
                    yield (0x0000, ds)  # Success status
            except Exception as e:
                logger.error(f"Error handling MWL request: {e}")
                yield (0x0110, None)  # Processing failure
        
        # Bind event handler
        handlers = [(evt.EVT_C_FIND, handle_find)]
        
        # Start server
        logger.info(f"Starting DICOM MWL SCP server on port {port}")
        self.ae.start_server(('', port), block=True, evt_handlers=handlers)
    
    def query_orthanc_studies(self, accession_number: str = None) -> List[Dict]:
        """
        Query Orthanc PACS for studies
        """
        try:
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                logger.warning("No PACS configuration found")
                return []
            
            # Use existing dicom.py function
            from .dicom import get_dicom
            if accession_number:
                result = get_dicom(accession_number)
                return [result] if result != 'Tiada Data' else []
            
            # For broader queries, implement additional logic here
            return []
            
        except Exception as e:
            logger.error(f"Error querying Orthanc: {e}")
            return []

# Global MWL service instance
mwl_service = DicomMWLService()