"""
AI Reporting Services for Radiology Information System

This module provides AI-powered report generation services with:
- Ollama LLM integration for medical report generation
- Orthanc PACS integration for DICOM image analysis
- Quality assurance and confidence scoring
- Collaborative radiologist workflow support
"""

import logging
import time
import json
import requests
import asyncio
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import (
    AIGeneratedReport, AIConfiguration, Pemeriksaan, PacsServer,
    AIModelPerformance, ReportCollaboration
)

logger = logging.getLogger(__name__)


class OrthancPACSClient:
    """
    Client for interfacing with Orthanc PACS server
    Handles DICOM image retrieval and metadata extraction
    """
    
    def __init__(self, pacs_server: Optional[PacsServer] = None):
        """
        Initialize Orthanc client with PACS server configuration
        
        Args:
            pacs_server: PacsServer instance, defaults to primary server
        """
        if pacs_server is None:
            pacs_server = PacsServer.objects.filter(is_primary=True, is_active=True).first()
            if not pacs_server:
                raise ValueError("No active primary PACS server configured")
        
        self.pacs_server = pacs_server
        self.base_url = pacs_server.orthancurl.rstrip('/')
        self.session = requests.Session()
        
        # Set timeout for requests
        self.timeout = 30
        
        logger.info(f"Initialized Orthanc client for {self.base_url}")
    
    def get_study_info(self, study_id: str) -> Optional[Dict[str, Any]]:
        """
        Get study information from Orthanc
        
        Args:
            study_id: Orthanc study ID
            
        Returns:
            Study information dict or None if not found
        """
        try:
            url = f"{self.base_url}/studies/{study_id}"
            response = self.session.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                logger.warning(f"Study {study_id} not found in PACS")
                return None
            else:
                logger.error(f"Error getting study {study_id}: {response.status_code}")
                return None
                
        except requests.RequestException as e:
            logger.error(f"Request error getting study {study_id}: {e}")
            return None
    
    def get_study_series(self, study_id: str) -> List[Dict[str, Any]]:
        """
        Get all series for a study
        
        Args:
            study_id: Orthanc study ID
            
        Returns:
            List of series information dicts
        """
        try:
            url = f"{self.base_url}/studies/{study_id}/series"
            response = self.session.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                series_ids = response.json()
                series_info = []
                
                for series_id in series_ids:
                    series_url = f"{self.base_url}/series/{series_id}"
                    series_response = self.session.get(series_url, timeout=self.timeout)
                    
                    if series_response.status_code == 200:
                        series_info.append(series_response.json())
                    
                return series_info
            else:
                logger.error(f"Error getting series for study {study_id}: {response.status_code}")
                return []
                
        except requests.RequestException as e:
            logger.error(f"Request error getting series for study {study_id}: {e}")
            return []
    
    def get_series_instances(self, series_id: str) -> List[str]:
        """
        Get all instance IDs for a series
        
        Args:
            series_id: Orthanc series ID
            
        Returns:
            List of instance IDs
        """
        try:
            url = f"{self.base_url}/series/{series_id}/instances"
            response = self.session.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Error getting instances for series {series_id}: {response.status_code}")
                return []
                
        except requests.RequestException as e:
            logger.error(f"Request error getting instances for series {series_id}: {e}")
            return []
    
    def get_instance_image(self, instance_id: str, format: str = 'png') -> Optional[bytes]:
        """
        Get image data for an instance
        
        Args:
            instance_id: Orthanc instance ID
            format: Image format ('png', 'jpeg', etc.)
            
        Returns:
            Image bytes or None if error
        """
        try:
            url = f"{self.base_url}/instances/{instance_id}/preview"
            response = self.session.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.content
            else:
                logger.error(f"Error getting image for instance {instance_id}: {response.status_code}")
                return None
                
        except requests.RequestException as e:
            logger.error(f"Request error getting image for instance {instance_id}: {e}")
            return None
    
    def get_instance_dicom_tags(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """
        Get DICOM tags for an instance
        
        Args:
            instance_id: Orthanc instance ID
            
        Returns:
            DICOM tags dict or None if error
        """
        try:
            url = f"{self.base_url}/instances/{instance_id}/tags"
            response = self.session.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Error getting tags for instance {instance_id}: {response.status_code}")
                return None
                
        except requests.RequestException as e:
            logger.error(f"Request error getting tags for instance {instance_id}: {e}")
            return None
    
    def find_study_by_accession(self, accession_number: str) -> Optional[str]:
        """
        Find study ID by accession number
        
        Args:
            accession_number: Study accession number
            
        Returns:
            Orthanc study ID or None if not found
        """
        try:
            query_data = {
                "Level": "Study",
                "Query": {
                    "AccessionNumber": accession_number
                }
            }
            
            url = f"{self.base_url}/tools/find"
            response = self.session.post(url, json=query_data, timeout=self.timeout)
            
            if response.status_code == 200:
                results = response.json()
                if results:
                    return results[0]  # Return first match
                else:
                    logger.info(f"No study found for accession {accession_number}")
                    return None
            else:
                logger.error(f"Error finding study by accession {accession_number}: {response.status_code}")
                return None
                
        except requests.RequestException as e:
            logger.error(f"Request error finding study by accession {accession_number}: {e}")
            return None


class DICOMProcessor:
    """
    Processes DICOM images for AI analysis
    Extracts metadata and prepares images for ML models
    """
    
    def __init__(self, orthanc_client: OrthancPACSClient):
        """
        Initialize DICOM processor
        
        Args:
            orthanc_client: Configured Orthanc client
        """
        self.orthanc_client = orthanc_client
        self.logger = logging.getLogger(__name__ + '.DICOMProcessor')
    
    def extract_study_metadata(self, study_id: str) -> Dict[str, Any]:
        """
        Extract relevant metadata from a study
        
        Args:
            study_id: Orthanc study ID
            
        Returns:
            Structured metadata dict
        """
        study_info = self.orthanc_client.get_study_info(study_id)
        if not study_info:
            return {}
        
        # Extract main DICOM tags
        main_tags = study_info.get('MainDicomTags', {})
        patient_tags = study_info.get('PatientMainDicomTags', {})
        
        metadata = {
            'study_instance_uid': main_tags.get('StudyInstanceUID'),
            'study_date': main_tags.get('StudyDate'),
            'study_time': main_tags.get('StudyTime'),
            'study_description': main_tags.get('StudyDescription'),
            'accession_number': main_tags.get('AccessionNumber'),
            'referring_physician': main_tags.get('ReferringPhysicianName'),
            'patient_id': patient_tags.get('PatientID'),
            'patient_name': patient_tags.get('PatientName'),
            'patient_birth_date': patient_tags.get('PatientBirthDate'),
            'patient_sex': patient_tags.get('PatientSex'),
            'modality': None,  # Will be determined from series
            'series_count': len(study_info.get('Series', [])),
            'instances_count': study_info.get('CountInstances', 0)
        }
        
        return metadata
    
    def get_study_modalities(self, study_id: str) -> List[str]:
        """
        Get all modalities in a study
        
        Args:
            study_id: Orthanc study ID
            
        Returns:
            List of modality strings
        """
        series_list = self.orthanc_client.get_study_series(study_id)
        modalities = set()
        
        for series in series_list:
            modality = series.get('MainDicomTags', {}).get('Modality')
            if modality:
                modalities.add(modality)
        
        return list(modalities)
    
    def select_representative_images(self, study_id: str, max_images: int = 5) -> List[Tuple[str, str]]:
        """
        Select representative images from a study for AI analysis
        
        Args:
            study_id: Orthanc study ID
            max_images: Maximum number of images to select
            
        Returns:
            List of (series_id, instance_id) tuples
        """
        series_list = self.orthanc_client.get_study_series(study_id)
        selected_images = []
        
        # Sort series by instance count (prefer series with more images)
        series_list.sort(key=lambda x: x.get('CountInstances', 0), reverse=True)
        
        for series in series_list:
            if len(selected_images) >= max_images:
                break
            
            series_id = series['ID']
            instances = self.orthanc_client.get_series_instances(series_id)
            
            if instances:
                # Select middle instance from series (often most representative)
                middle_index = len(instances) // 2
                instance_id = instances[middle_index]
                selected_images.append((series_id, instance_id))
        
        return selected_images
    
    def prepare_images_for_ai(self, study_id: str) -> Dict[str, Any]:
        """
        Prepare images and metadata for AI processing
        
        Args:
            study_id: Orthanc study ID
            
        Returns:
            Dict with images, metadata, and processing info
        """
        start_time = time.time()
        
        try:
            # Extract metadata
            metadata = self.extract_study_metadata(study_id)
            modalities = self.get_study_modalities(study_id)
            
            # Select representative images
            selected_images = self.select_representative_images(study_id)
            
            # Prepare image data
            images_data = []
            for series_id, instance_id in selected_images:
                # Get image
                image_bytes = self.orthanc_client.get_instance_image(instance_id)
                if image_bytes:
                    # Get DICOM tags for context
                    dicom_tags = self.orthanc_client.get_instance_dicom_tags(instance_id)
                    
                    image_info = {
                        'series_id': series_id,
                        'instance_id': instance_id,
                        'image_data': image_bytes,
                        'dicom_tags': dicom_tags
                    }
                    images_data.append(image_info)
            
            processing_time = time.time() - start_time
            
            result = {
                'study_id': study_id,
                'metadata': metadata,
                'modalities': modalities,
                'images': images_data,
                'processing_time': processing_time,
                'success': True,
                'errors': []
            }
            
            self.logger.info(f"Prepared {len(images_data)} images from study {study_id} in {processing_time:.2f}s")
            return result
            
        except Exception as e:
            self.logger.error(f"Error preparing images for study {study_id}: {e}")
            return {
                'study_id': study_id,
                'success': False,
                'errors': [str(e)],
                'processing_time': time.time() - start_time
            }


class OllamaAIService:
    """
    AI service for generating radiology reports using Ollama
    Supports multiple models and quality assurance
    """
    
    def __init__(self, config: Optional[AIConfiguration] = None):
        """
        Initialize AI service with configuration
        
        Args:
            config: AI configuration, defaults to current system config
        """
        if config is None:
            config = AIConfiguration.get_current_config()
        
        self.config = config
        self.logger = logging.getLogger(__name__ + '.OllamaAIService')
        
        # Verify Ollama server is accessible
        self._verify_ollama_connection()
    
    def _verify_ollama_connection(self) -> bool:
        """
        Verify connection to Ollama server
        
        Returns:
            True if connection successful
        """
        try:
            response = requests.get(
                f"{self.config.ollama_server_url}/api/version",
                timeout=10
            )
            if response.status_code == 200:
                self.logger.info("Ollama server connection verified")
                return True
            else:
                self.logger.error(f"Ollama server returned status {response.status_code}")
                return False
        except requests.RequestException as e:
            self.logger.error(f"Cannot connect to Ollama server: {e}")
            return False
    
    def _generate_with_ollama(self, model: str, prompt: str, images: List[bytes] = None) -> Dict[str, Any]:
        """
        Generate text using Ollama API
        
        Args:
            model: Model name to use
            prompt: Text prompt
            images: Optional list of image bytes for vision models
            
        Returns:
            Generation result dict
        """
        try:
            request_data = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Lower temperature for medical accuracy
                    "top_p": 0.9
                }
            }
            
            # Add images for vision models if provided
            if images:
                import base64
                encoded_images = []
                for img_bytes in images:
                    encoded = base64.b64encode(img_bytes).decode('utf-8')
                    encoded_images.append(encoded)
                request_data["images"] = encoded_images
            
            start_time = time.time()
            response = requests.post(
                f"{self.config.ollama_server_url}/api/generate",
                json=request_data,
                timeout=self.config.max_processing_time_seconds
            )
            
            if response.status_code == 200:
                result = response.json()
                processing_time = time.time() - start_time
                
                return {
                    'success': True,
                    'response': result.get('response', ''),
                    'model': model,
                    'processing_time': processing_time,
                    'token_count': result.get('eval_count', 0),
                    'prompt_tokens': result.get('prompt_eval_count', 0)
                }
            else:
                self.logger.error(f"Ollama API error {response.status_code}: {response.text}")
                return {
                    'success': False,
                    'error': f"API error {response.status_code}",
                    'processing_time': time.time() - start_time
                }
                
        except requests.Timeout:
            self.logger.error(f"Ollama request timeout for model {model}")
            return {
                'success': False,
                'error': 'Request timeout',
                'processing_time': self.config.max_processing_time_seconds
            }
        except Exception as e:
            self.logger.error(f"Error generating with Ollama: {e}")
            return {
                'success': False,
                'error': str(e),
                'processing_time': 0
            }
    
    def analyze_images(self, images: List[bytes], metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze medical images using vision-language model
        
        Args:
            images: List of image bytes
            metadata: Study metadata for context
            
        Returns:
            Analysis result dict
        """
        # Construct prompt for medical image analysis
        modality = metadata.get('modality', 'Unknown')
        study_description = metadata.get('study_description', '')
        patient_age = self._calculate_patient_age(metadata.get('patient_birth_date'))
        patient_sex = metadata.get('patient_sex', 'Unknown')
        
        prompt = f"""
        You are an expert radiologist analyzing {modality} images.
        
        Patient Information:
        - Age: {patient_age}
        - Sex: {patient_sex}
        - Study: {study_description}
        
        Please analyze the provided medical images and provide:
        1. Technical Assessment: Image quality, positioning, artifacts
        2. Anatomical Findings: Normal and abnormal findings
        3. Pathological Assessment: Any pathological changes observed
        4. Critical Findings: Any urgent or critical findings requiring immediate attention
        5. Confidence Level: Your confidence in the analysis (0-100%)
        
        Format your response as structured sections. Be specific and use appropriate medical terminology.
        If you identify any critical findings, clearly state them at the beginning.
        """
        
        result = self._generate_with_ollama(
            model=self.config.vision_language_model,
            prompt=prompt,
            images=images
        )
        
        if result['success']:
            # Parse the response to extract structured information
            analysis = self._parse_image_analysis(result['response'])
            analysis.update({
                'model_used': self.config.vision_language_model,
                'processing_time': result['processing_time'],
                'token_count': result.get('token_count', 0)
            })
            return analysis
        else:
            return {
                'success': False,
                'error': result.get('error', 'Unknown error'),
                'processing_time': result.get('processing_time', 0)
            }
    
    def generate_report(self, image_analysis: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate structured radiology report from image analysis
        
        Args:
            image_analysis: Results from image analysis
            metadata: Study metadata
            
        Returns:
            Generated report dict
        """
        # Construct prompt for report generation
        findings = image_analysis.get('findings', '')
        critical_findings = image_analysis.get('critical_findings', [])
        confidence = image_analysis.get('confidence_score', 0.5)
        
        prompt = f"""
        You are an expert radiologist writing a formal radiology report.
        
        Based on the following image analysis, generate a complete radiology report:
        
        FINDINGS FROM IMAGE ANALYSIS:
        {findings}
        
        CRITICAL FINDINGS IDENTIFIED:
        {', '.join(critical_findings) if critical_findings else 'None'}
        
        Please structure the report with the following sections:
        
        CLINICAL HISTORY:
        [Brief relevant clinical history if available, otherwise indicate "Not provided"]
        
        TECHNIQUE:
        [Imaging technique and parameters used]
        
        FINDINGS:
        [Detailed description of imaging findings, organized by anatomical region]
        
        IMPRESSION:
        [Concise summary with differential diagnosis or most likely diagnosis]
        
        RECOMMENDATIONS:
        [Follow-up recommendations, additional imaging, or clinical correlation needed]
        
        Use professional medical language and be concise but comprehensive.
        If critical findings were identified, mention them prominently in both FINDINGS and IMPRESSION.
        """
        
        result = self._generate_with_ollama(
            model=self.config.medical_llm_model,
            prompt=prompt
        )
        
        if result['success']:
            # Parse the report into structured sections
            report = self._parse_report_sections(result['response'])
            report.update({
                'full_report': result['response'],
                'model_used': self.config.medical_llm_model,
                'processing_time': result['processing_time'],
                'confidence_score': confidence,
                'critical_findings': critical_findings,
                'metadata': metadata
            })
            return report
        else:
            return {
                'success': False,
                'error': result.get('error', 'Unknown error'),
                'processing_time': result.get('processing_time', 0)
            }
    
    def quality_assurance_check(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform quality assurance check on generated report
        
        Args:
            report: Generated report dict
            
        Returns:
            QA results dict
        """
        if not self.config.enable_qa_validation:
            return {
                'qa_enabled': False,
                'qa_score': 1.0,
                'qa_comments': 'Quality assurance disabled'
            }
        
        prompt = f"""
        You are a senior radiologist performing quality assurance review.
        
        Please review the following radiology report for:
        1. Medical accuracy and appropriateness
        2. Completeness of findings description
        3. Appropriate use of medical terminology
        4. Logical consistency between findings and impression
        5. Proper recommendations based on findings
        
        REPORT TO REVIEW:
        {report.get('full_report', '')}
        
        Please provide:
        1. Overall Quality Score (0-100%)
        2. Specific Issues Identified (if any)
        3. Recommendations for Improvement
        4. Approval Status (APPROVE/REVISE/REJECT)
        
        Format your response clearly with these sections.
        """
        
        result = self._generate_with_ollama(
            model=self.config.qa_model,
            prompt=prompt
        )
        
        if result['success']:
            qa_analysis = self._parse_qa_response(result['response'])
            qa_analysis.update({
                'qa_model_used': self.config.qa_model,
                'qa_processing_time': result['processing_time']
            })
            return qa_analysis
        else:
            return {
                'qa_enabled': True,
                'qa_score': 0.0,
                'qa_error': result.get('error', 'Unknown error'),
                'approval_status': 'REJECT'
            }
    
    def _calculate_patient_age(self, birth_date: str) -> str:
        """Calculate patient age from birth date"""
        if not birth_date:
            return "Unknown"
        
        try:
            # DICOM date format: YYYYMMDD
            birth_dt = datetime.strptime(birth_date, '%Y%m%d')
            today = datetime.now()
            age = today.year - birth_dt.year
            if today.month < birth_dt.month or (today.month == birth_dt.month and today.day < birth_dt.day):
                age -= 1
            return f"{age} years"
        except:
            return "Unknown"
    
    def _parse_image_analysis(self, response: str) -> Dict[str, Any]:
        """Parse image analysis response into structured format"""
        # Simple parsing - in production, you might use more sophisticated NLP
        sections = {}
        current_section = None
        current_content = []
        
        for line in response.split('\n'):
            line = line.strip()
            if line.upper().startswith(('TECHNICAL', 'ANATOMICAL', 'PATHOLOGICAL', 'CRITICAL', 'CONFIDENCE')):
                if current_section:
                    sections[current_section] = '\n'.join(current_content)
                current_section = line.split(':')[0].lower().replace(' ', '_')
                current_content = [line.split(':', 1)[1] if ':' in line else '']
            elif current_section:
                current_content.append(line)
        
        if current_section:
            sections[current_section] = '\n'.join(current_content)
        
        # Extract confidence score
        confidence_text = sections.get('confidence_level', '50%')
        try:
            confidence = float(confidence_text.strip('%')) / 100.0
        except:
            confidence = 0.5
        
        # Extract critical findings
        critical_text = sections.get('critical_findings', '')
        critical_findings = [finding.strip() for finding in critical_text.split(',') if finding.strip()]
        
        return {
            'success': True,
            'findings': sections.get('anatomical_findings', '') + '\n' + sections.get('pathological_assessment', ''),
            'technical_assessment': sections.get('technical_assessment', ''),
            'critical_findings': critical_findings,
            'confidence_score': confidence,
            'raw_response': response
        }
    
    def _parse_report_sections(self, response: str) -> Dict[str, Any]:
        """Parse report response into structured sections"""
        sections = {
            'clinical_history': '',
            'technique': '',
            'findings': '',
            'impression': '',
            'recommendations': ''
        }
        
        current_section = None
        current_content = []
        
        for line in response.split('\n'):
            line = line.strip()
            line_upper = line.upper()
            
            if line_upper.startswith(('CLINICAL HISTORY', 'TECHNIQUE', 'FINDINGS', 'IMPRESSION', 'RECOMMENDATIONS')):
                if current_section:
                    sections[current_section] = '\n'.join(current_content).strip()
                
                if 'CLINICAL' in line_upper:
                    current_section = 'clinical_history'
                elif 'TECHNIQUE' in line_upper:
                    current_section = 'technique'
                elif 'FINDINGS' in line_upper:
                    current_section = 'findings'
                elif 'IMPRESSION' in line_upper:
                    current_section = 'impression'
                elif 'RECOMMENDATIONS' in line_upper:
                    current_section = 'recommendations'
                
                current_content = [line.split(':', 1)[1] if ':' in line else '']
            elif current_section and line:
                current_content.append(line)
        
        if current_section:
            sections[current_section] = '\n'.join(current_content).strip()
        
        return {
            'success': True,
            'report_sections': sections
        }
    
    def _parse_qa_response(self, response: str) -> Dict[str, Any]:
        """Parse QA response"""
        # Extract quality score
        qa_score = 0.8  # Default
        approval_status = 'REVISE'  # Default
        issues = []
        recommendations = []
        
        for line in response.split('\n'):
            line = line.strip()
            if 'score' in line.lower() and '%' in line:
                try:
                    score_text = ''.join(filter(str.isdigit, line))
                    if score_text:
                        qa_score = float(score_text) / 100.0
                except:
                    pass
            elif line.upper().startswith(('APPROVE', 'REVISE', 'REJECT')):
                approval_status = line.upper().split()[0]
        
        return {
            'qa_enabled': True,
            'qa_score': qa_score,
            'qa_issues': issues,
            'qa_recommendations': recommendations,
            'approval_status': approval_status,
            'qa_comments': response
        }


class AIReportingService:
    """
    Main service for AI-powered radiology reporting
    Orchestrates the complete workflow from DICOM to final report
    """
    
    def __init__(self):
        """Initialize the AI reporting service"""
        self.config = AIConfiguration.get_current_config()
        self.orthanc_client = OrthancPACSClient()
        self.dicom_processor = DICOMProcessor(self.orthanc_client)
        self.ai_service = OllamaAIService(self.config)
        self.logger = logging.getLogger(__name__ + '.AIReportingService')
    
    def generate_ai_report(self, pemeriksaan: Pemeriksaan) -> AIGeneratedReport:
        """
        Generate complete AI report for an examination
        
        Args:
            pemeriksaan: Examination instance
            
        Returns:
            AIGeneratedReport instance
        """
        start_time = time.time()
        processing_errors = []
        processing_warnings = []
        
        try:
            # Check if AI reporting is enabled
            if not self.config.enable_ai_reporting:
                raise ValueError("AI reporting is disabled in configuration")
            
            if self.config.maintenance_mode:
                raise ValueError("AI reporting is in maintenance mode")
            
            # Find study in PACS
            accession_number = pemeriksaan.accession_number
            if not accession_number:
                raise ValueError("No accession number available for examination")
            
            study_id = self.orthanc_client.find_study_by_accession(accession_number)
            if not study_id:
                raise ValueError(f"Study not found in PACS for accession {accession_number}")
            
            # Prepare DICOM data
            dicom_data = self.dicom_processor.prepare_images_for_ai(study_id)
            if not dicom_data['success']:
                processing_errors.extend(dicom_data['errors'])
                raise ValueError("Failed to prepare DICOM images for analysis")
            
            # Analyze images with AI
            if not dicom_data['images']:
                processing_warnings.append("No images available for AI analysis")
                raise ValueError("No images available for AI analysis")
            
            images = [img['image_data'] for img in dicom_data['images']]
            analysis_result = self.ai_service.analyze_images(images, dicom_data['metadata'])
            
            if not analysis_result['success']:
                processing_errors.append(f"Image analysis failed: {analysis_result.get('error', 'Unknown error')}")
                raise ValueError("AI image analysis failed")
            
            # Generate report
            report_result = self.ai_service.generate_report(analysis_result, dicom_data['metadata'])
            if not report_result['success']:
                processing_errors.append(f"Report generation failed: {report_result.get('error', 'Unknown error')}")
                raise ValueError("AI report generation failed")
            
            # Quality assurance check
            qa_result = self.ai_service.quality_assurance_check(report_result)
            
            # Calculate total processing time
            total_processing_time = time.time() - start_time
            
            # Create AI report record
            ai_report = AIGeneratedReport.objects.create(
                pemeriksaan=pemeriksaan,
                ai_model_version=self.config.vision_language_model,
                ai_model_type='vision_language',
                generated_report=report_result['full_report'],
                report_sections=report_result.get('report_sections', {}),
                confidence_score=report_result.get('confidence_score', 0.5),
                section_confidence=self._calculate_section_confidence(report_result),
                quality_metrics=qa_result,
                critical_findings=report_result.get('critical_findings', []),
                critical_findings_confidence=self._calculate_critical_findings_confidence(report_result),
                orthanc_study_id=study_id,
                orthanc_series_ids=[img['series_id'] for img in dicom_data['images']],
                dicom_metadata=dicom_data['metadata'],
                processing_time_seconds=total_processing_time,
                processing_errors=processing_errors,
                processing_warnings=processing_warnings
            )
            
            # Set review status based on confidence and QA
            self._set_initial_review_status(ai_report, qa_result)
            
            # Send notifications if critical findings detected
            if ai_report.requires_urgent_review:
                self._send_critical_findings_notification(ai_report)
            
            self.logger.info(f"Generated AI report for examination {pemeriksaan.no_xray} in {total_processing_time:.2f}s")
            return ai_report
            
        except Exception as e:
            self.logger.error(f"Error generating AI report for examination {pemeriksaan.no_xray}: {e}")
            
            # Create failed report record
            ai_report = AIGeneratedReport.objects.create(
                pemeriksaan=pemeriksaan,
                ai_model_version=self.config.vision_language_model,
                ai_model_type='vision_language',
                generated_report=f"AI report generation failed: {str(e)}",
                report_sections={},
                confidence_score=0.0,
                section_confidence={},
                quality_metrics={'error': str(e)},
                critical_findings=[],
                critical_findings_confidence=0.0,
                review_status='rejected',
                orthanc_study_id=study_id if 'study_id' in locals() else None,
                orthanc_series_ids=[],
                dicom_metadata={},
                processing_time_seconds=time.time() - start_time,
                processing_errors=processing_errors + [str(e)],
                processing_warnings=processing_warnings
            )
            
            return ai_report
    
    def _calculate_section_confidence(self, report_result: Dict[str, Any]) -> Dict[str, float]:
        """Calculate confidence scores for each report section"""
        base_confidence = report_result.get('confidence_score', 0.5)
        sections = report_result.get('report_sections', {})
        
        section_confidence = {}
        for section_name, content in sections.items():
            # Simple heuristic: longer sections get slightly higher confidence
            length_factor = min(len(content) / 200.0, 1.0)  # Normalize to 0-1
            section_confidence[section_name] = min(base_confidence + (length_factor * 0.1), 1.0)
        
        return section_confidence
    
    def _calculate_critical_findings_confidence(self, report_result: Dict[str, Any]) -> float:
        """Calculate confidence for critical findings detection"""
        critical_findings = report_result.get('critical_findings', [])
        base_confidence = report_result.get('confidence_score', 0.5)
        
        if not critical_findings:
            return 0.0
        
        # Higher confidence if multiple critical findings detected
        finding_count_factor = min(len(critical_findings) / 3.0, 1.0)
        return min(base_confidence + (finding_count_factor * 0.2), 1.0)
    
    def _set_initial_review_status(self, ai_report: AIGeneratedReport, qa_result: Dict[str, Any]):
        """Set initial review status based on confidence and QA results"""
        qa_score = qa_result.get('qa_score', 0.0)
        approval_status = qa_result.get('approval_status', 'REVISE')
        
        if (self.config.auto_approve_routine_reports and 
            ai_report.confidence_score >= self.config.confidence_threshold and
            qa_score >= 0.8 and 
            approval_status == 'APPROVE' and
            not ai_report.critical_findings):
            ai_report.review_status = 'approved'
        elif ai_report.critical_findings or ai_report.requires_urgent_review:
            ai_report.review_status = 'pending'
        else:
            ai_report.review_status = 'pending'
        
        ai_report.save()
    
    def _send_critical_findings_notification(self, ai_report: AIGeneratedReport):
        """Send notification for critical findings"""
        if not self.config.notify_on_critical_findings or not self.config.notification_emails:
            return
        
        try:
            subject = f"URGENT: Critical Findings Detected - {ai_report.pemeriksaan.no_xray}"
            
            context = {
                'ai_report': ai_report,
                'pemeriksaan': ai_report.pemeriksaan,
                'patient': ai_report.pemeriksaan.daftar.pesakit,
                'critical_findings': ai_report.critical_findings,
                'confidence': ai_report.critical_findings_confidence
            }
            
            message = render_to_string('exam/ai_critical_findings_notification.txt', context)
            
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=self.config.notification_emails,
                fail_silently=False
            )
            
            self.logger.info(f"Sent critical findings notification for {ai_report.pemeriksaan.no_xray}")
            
        except Exception as e:
            self.logger.error(f"Failed to send critical findings notification: {e}")