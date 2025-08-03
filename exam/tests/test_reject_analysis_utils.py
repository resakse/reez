"""
Unit tests for Reject Analysis Utility Functions

Tests the get_orthanc_monthly_images and calculate_reject_analysis_from_pacs
functions with mocked PACS/Orthanc API responses and error handling.
"""

import json
from datetime import date, datetime
from unittest.mock import patch, Mock, MagicMock
from requests.exceptions import ConnectionError, Timeout, HTTPError

from django.test import TestCase
from django.contrib.auth import get_user_model

from ..models import (
    RejectAnalysis, PacsServer, Modaliti, Exam, Pemeriksaan, Daftar
)
from ..utils import get_orthanc_monthly_images, calculate_reject_analysis_from_pacs
from pesakit.models import Pesakit

User = get_user_model()


class GetOrthancMonthlyImagesTest(TestCase):
    """Test get_orthanc_monthly_images function"""
    
    def setUp(self):
        # Create test PACS servers
        self.active_server = PacsServer.objects.create(
            name='Active PACS',
            orthancurl='http://active.example.com:8042',
            viewrurl='http://active.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            include_in_reject_analysis=True
        )
        
        self.inactive_server = PacsServer.objects.create(
            name='Inactive PACS',
            orthancurl='http://inactive.example.com:8042',
            viewrurl='http://inactive.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=False,
            include_in_reject_analysis=True
        )
        
        self.excluded_server = PacsServer.objects.create(
            name='Excluded PACS',
            orthancurl='http://excluded.example.com:8042',
            viewrurl='http://excluded.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            include_in_reject_analysis=False
        )
        
        # Mock DICOM data
        self.mock_study_data = {
            'ID': 'study-123',
            'MainDicomTags': {
                'StudyDate': '20240115',  # January 15, 2024
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.9',
                'StudyDescription': 'Chest X-Ray'
            },
            'Series': ['series-1', 'series-2']
        }
        
        self.mock_series_data = {
            'ID': 'series-1',
            'MainDicomTags': {
                'Modality': 'CR',
                'SeriesDescription': 'Chest AP'
            },
            'Instances': ['instance-1', 'instance-2']
        }
        
        self.mock_out_of_range_study = {
            'ID': 'study-456',
            'MainDicomTags': {
                'StudyDate': '20240215',  # February 15, 2024 (out of range)
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.10'
            },
            'Series': ['series-3']
        }
    
    @patch('exam.utils.requests.get')
    def test_successful_query_single_server(self, mock_get):
        """Test successful query of a single PACS server"""
        # Mock responses
        mock_responses = [
            # Studies list
            Mock(ok=True, json=lambda: ['study-123']),
            # Study details
            Mock(ok=True, json=lambda: self.mock_study_data),
            # Series details
            Mock(ok=True, json=lambda: self.mock_series_data)
        ]
        mock_get.side_effect = mock_responses
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1, 
            pacs_server=self.active_server
        )
        
        self.assertIn('total_images', result)
        self.assertIn('total_studies', result)
        self.assertIn('modality_breakdown', result)
        
        # Should have found 1 study with 2 images
        self.assertEqual(result['total_studies'], 1)
        self.assertEqual(result['total_images'], 2)
        
        # Should have CR modality breakdown
        modality_breakdown = result['modality_breakdown']
        self.assertIn('CR', modality_breakdown)
        self.assertEqual(modality_breakdown['CR']['images'], 2)
        self.assertEqual(modality_breakdown['CR']['studies'], 1)
    
    @patch('exam.utils.requests.get')
    def test_multiple_servers_query(self, mock_get):
        """Test querying multiple PACS servers"""
        # Mock responses for both servers
        mock_responses = [
            # First server studies list
            Mock(ok=True, json=lambda: ['study-123']),
            # First server study details
            Mock(ok=True, json=lambda: self.mock_study_data),
            # First server series details
            Mock(ok=True, json=lambda: self.mock_series_data),
            # Second server studies list (different server same pattern)
            Mock(ok=True, json=lambda: ['study-456']),
            Mock(ok=True, json=lambda: self.mock_study_data),
            Mock(ok=True, json=lambda: self.mock_series_data)
        ]
        mock_get.side_effect = mock_responses
        
        # Create another active server
        server2 = PacsServer.objects.create(
            name='Second Active PACS',
            orthancurl='http://second.example.com:8042',
            viewrurl='http://second.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            include_in_reject_analysis=True
        )
        
        result = get_orthanc_monthly_images(year=2024, month=1)
        
        # Should combine results from both servers
        self.assertEqual(result['total_studies'], 2)
        self.assertEqual(result['total_images'], 4)
    
    @patch('exam.utils.requests.get')
    def test_date_filtering(self, mock_get):
        """Test that studies outside date range are filtered out"""
        # Mock responses with studies both in and out of range
        mock_responses = [
            # Studies list
            Mock(ok=True, json=lambda: ['study-123', 'study-456']),
            # In-range study
            Mock(ok=True, json=lambda: self.mock_study_data),
            Mock(ok=True, json=lambda: self.mock_series_data),
            # Out-of-range study
            Mock(ok=True, json=lambda: self.mock_out_of_range_study),
        ]
        mock_get.side_effect = mock_responses
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1,  # January
            pacs_server=self.active_server
        )
        
        # Should only count the January study
        self.assertEqual(result['total_studies'], 1)
        self.assertEqual(result['total_images'], 2)
    
    @patch('exam.utils.requests.get')
    def test_modality_filtering(self, mock_get):
        """Test filtering by specific modality"""
        # Mock series with different modalities
        cr_series = {
            'ID': 'series-cr',
            'MainDicomTags': {'Modality': 'CR'},
            'Instances': ['instance-1', 'instance-2']
        }
        ct_series = {
            'ID': 'series-ct',
            'MainDicomTags': {'Modality': 'CT'},
            'Instances': ['instance-3', 'instance-4', 'instance-5']
        }
        
        study_with_multiple_modalities = {
            'ID': 'study-multi',
            'MainDicomTags': {
                'StudyDate': '20240115',
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.11'
            },
            'Series': ['series-cr', 'series-ct']
        }
        
        mock_responses = [
            # Studies list
            Mock(ok=True, json=lambda: ['study-multi']),
            # Study details
            Mock(ok=True, json=lambda: study_with_multiple_modalities),
            # CR series
            Mock(ok=True, json=lambda: cr_series),
            # CT series
            Mock(ok=True, json=lambda: ct_series)
        ]
        mock_get.side_effect = mock_responses
        
        # Filter by CR modality only
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1, 
            modality='CR',
            pacs_server=self.active_server
        )
        
        # Should only count CR images
        modality_breakdown = result['modality_breakdown']
        self.assertIn('CR', modality_breakdown)
        self.assertEqual(modality_breakdown['CR']['images'], 2)
        
        # CT should not be included when filtering for CR
        if 'CT' in modality_breakdown:
            self.assertEqual(modality_breakdown['CT']['images'], 0)
    
    @patch('exam.utils.requests.get')
    def test_connection_error_handling(self, mock_get):
        """Test handling of connection errors"""
        mock_get.side_effect = ConnectionError("Connection failed")
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1,
            pacs_server=self.active_server
        )
        
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_studies'], 0)
        self.assertIn('warnings', result)
        self.assertTrue(len(result['warnings']) > 0)
    
    @patch('exam.utils.requests.get')
    def test_http_error_handling(self, mock_get):
        """Test handling of HTTP errors"""
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = HTTPError("404 Not Found")
        mock_get.return_value = mock_response
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1,
            pacs_server=self.active_server
        )
        
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_studies'], 0)
        self.assertIn('warnings', result)
    
    @patch('exam.utils.requests.get')
    def test_timeout_handling(self, mock_get):
        """Test handling of request timeouts"""
        mock_get.side_effect = Timeout("Request timed out")
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1,
            pacs_server=self.active_server
        )
        
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_studies'], 0)
        self.assertIn('warnings', result)
    
    def test_no_active_servers(self):
        """Test behavior when no active servers are configured"""
        # Deactivate all servers
        PacsServer.objects.update(is_active=False)
        
        result = get_orthanc_monthly_images(year=2024, month=1)
        
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_studies'], 0)
        self.assertIn('error', result)
        self.assertIn('No active PACS servers', result['error'])
    
    def test_excluded_servers_not_queried(self):
        """Test that servers excluded from reject analysis are not queried"""
        # Only the excluded server should be available
        PacsServer.objects.filter(include_in_reject_analysis=True).update(is_active=False)
        
        result = get_orthanc_monthly_images(year=2024, month=1)
        
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_studies'], 0)
        self.assertIn('error', result)
    
    @patch('exam.utils.requests.get')
    def test_invalid_study_date_handling(self, mock_get):
        """Test handling of studies with invalid or missing dates"""
        invalid_date_study = {
            'ID': 'study-invalid',
            'MainDicomTags': {
                'StudyDate': 'invalid-date',  # Invalid format
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.12'
            },
            'Series': ['series-1']
        }
        
        missing_date_study = {
            'ID': 'study-missing',
            'MainDicomTags': {
                'StudyInstanceUID': '1.2.3.4.5.6.7.8.13'
                # StudyDate missing
            },
            'Series': ['series-2']
        }
        
        mock_responses = [
            # Studies list
            Mock(ok=True, json=lambda: ['study-invalid', 'study-missing']),
            # Invalid date study
            Mock(ok=True, json=lambda: invalid_date_study),
            # Missing date study
            Mock(ok=True, json=lambda: missing_date_study)
        ]
        mock_get.side_effect = mock_responses
        
        result = get_orthanc_monthly_images(
            year=2024, 
            month=1,
            pacs_server=self.active_server
        )
        
        # Should skip both invalid studies
        self.assertEqual(result['total_studies'], 0)
        self.assertEqual(result['total_images'], 0)
    
    @patch('exam.utils.requests.get')
    def test_partial_server_failure(self, mock_get):
        """Test handling when some servers fail but others succeed"""
        # Create two servers
        server2 = PacsServer.objects.create(
            name='Second PACS',
            orthancurl='http://second.example.com:8042',
            viewrurl='http://second.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            include_in_reject_analysis=True
        )
        
        # First server succeeds, second server fails
        def side_effect_func(*args, **kwargs):
            url = args[0]
            if 'active.example.com' in url:
                if '/studies' in url and not url.endswith('/studies'):
                    return Mock(ok=True, json=lambda: self.mock_study_data)
                elif url.endswith('/studies'):
                    return Mock(ok=True, json=lambda: ['study-123'])
                elif '/series/' in url:
                    return Mock(ok=True, json=lambda: self.mock_series_data)
            elif 'second.example.com' in url:
                raise ConnectionError("Second server failed")
            return Mock(ok=True, json=lambda: [])
        
        mock_get.side_effect = side_effect_func
        
        result = get_orthanc_monthly_images(year=2024, month=1)
        
        # Should have data from successful server
        self.assertEqual(result['total_studies'], 1)
        self.assertEqual(result['total_images'], 2)
        
        # Should have warnings about failed server
        self.assertIn('warnings', result)
        self.assertTrue(len(result['warnings']) > 0)


class CalculateRejectAnalysisFromPacsTest(TestCase):
    """Test calculate_reject_analysis_from_pacs function"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='quality_manager',
            password='testpass123'
        )
        
        self.modaliti = Modaliti.objects.create(
            nama='X-Ray',
            singkatan='CR'
        )
        
        self.exam = Exam.objects.create(
            exam='Chest X-Ray',
            modaliti=self.modaliti
        )
        
        # Create test examinations in RIS
        self.pesakit = Pesakit.objects.create(
            nama='Test Patient',
            nric='123456789012',
            mrn='TEST001'
        )
        
        self.daftar = Daftar.objects.create(
            pesakit=self.pesakit,
            study_instance_uid='1.2.3.4.5.6.7.8.9'
        )
        
        # Create examinations for January 2024
        for i in range(5):
            Pemeriksaan.objects.create(
                daftar=self.daftar,
                exam=self.exam,
                no_xray=f'CR2024000{i+1}',
                created=datetime(2024, 1, 15, 10, 0, 0)  # January 15, 2024
            )
        
        # Create PACS server
        self.pacs_server = PacsServer.objects.create(
            name='Test PACS',
            orthancurl='http://test.example.com:8042',
            viewrurl='http://test.example.com:3000/viewer',
            endpoint_style='dicomweb',
            is_active=True,
            include_in_reject_analysis=True
        )
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_successful_calculation_with_auto_save(self, mock_orthanc):
        """Test successful calculation with automatic saving"""
        mock_orthanc.return_value = {
            'total_images': 8,
            'total_studies': 5,
            'modality_breakdown': {
                'CR': {
                    'images': 8,
                    'studies': 5
                }
            },
            'warnings': []
        }
        
        analysis_date = date(2024, 1, 1)
        result = calculate_reject_analysis_from_pacs(
            analysis_date=analysis_date,
            modality=self.modaliti,
            auto_save=True
        )
        
        # Should create analysis object
        self.assertIn('analysis_object', result)
        analysis = result['analysis_object']
        
        self.assertEqual(analysis.analysis_date, analysis_date)
        self.assertEqual(analysis.modality, self.modaliti)
        self.assertEqual(analysis.total_examinations, 5)  # Max of RIS(5) and PACS(5)
        self.assertEqual(analysis.total_images, 8)
        self.assertEqual(analysis.total_retakes, 3)  # 8 images - 5 examinations
        
        # Verify it's saved to database
        saved_analysis = RejectAnalysis.objects.get(
            analysis_date=analysis_date,
            modality=self.modaliti
        )
        self.assertEqual(saved_analysis.total_examinations, 5)
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_calculation_without_auto_save(self, mock_orthanc):
        """Test calculation without automatic saving"""
        mock_orthanc.return_value = {
            'total_images': 10,
            'total_studies': 6,
            'modality_breakdown': {
                'CR': {
                    'images': 10,
                    'studies': 6
                }
            }
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        # Should return data without saving
        self.assertNotIn('analysis_object', result)
        self.assertEqual(result['total_examinations'], 6)  # Max of RIS(5) and PACS(6)
        self.assertEqual(result['total_images'], 10)
        self.assertEqual(result['total_retakes'], 4)  # 10 images - 6 examinations
        
        # Should not be saved to database
        self.assertFalse(
            RejectAnalysis.objects.filter(
                analysis_date=date(2024, 1, 1),
                modality=self.modaliti
            ).exists()
        )
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_ris_examination_count_higher(self, mock_orthanc):
        """Test when RIS has more examinations than PACS studies"""
        mock_orthanc.return_value = {
            'total_images': 6,
            'total_studies': 3,  # Less than RIS examinations (5)
            'modality_breakdown': {
                'CR': {
                    'images': 6,
                    'studies': 3
                }
            }
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        # Should use RIS examination count as it's higher
        self.assertEqual(result['total_examinations'], 5)  # RIS count
        self.assertEqual(result['ris_examinations'], 5)
        self.assertEqual(result['pacs_studies'], 3)
        self.assertEqual(result['total_retakes'], 1)  # 6 images - 5 examinations
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_pacs_error_handling(self, mock_orthanc):
        """Test handling of PACS errors"""
        mock_orthanc.return_value = {
            'error': 'No active PACS servers configured'
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        self.assertIn('error', result)
        self.assertEqual(result['error'], 'No active PACS servers configured')
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_zero_images_calculation(self, mock_orthanc):
        """Test calculation when no images are found"""
        mock_orthanc.return_value = {
            'total_images': 0,
            'total_studies': 0,
            'modality_breakdown': {}
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        # Should use RIS examination count
        self.assertEqual(result['total_examinations'], 5)  # From RIS
        self.assertEqual(result['total_images'], 0)
        self.assertEqual(result['total_retakes'], 0)  # Can't be negative
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_update_existing_analysis(self, mock_orthanc):
        """Test updating existing analysis"""
        # Create existing analysis
        existing_analysis = RejectAnalysis.objects.create(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            total_examinations=10,
            total_images=12,
            total_retakes=2,
            comments='Original analysis'
        )
        
        mock_orthanc.return_value = {
            'total_images': 15,
            'total_studies': 8,
            'modality_breakdown': {
                'CR': {
                    'images': 15,
                    'studies': 8
                }
            }
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=True
        )
        
        # Should update existing analysis
        updated_analysis = result['analysis_object']
        self.assertEqual(updated_analysis.id, existing_analysis.id)
        self.assertEqual(updated_analysis.total_examinations, 8)
        self.assertEqual(updated_analysis.total_images, 15)
        self.assertEqual(updated_analysis.total_retakes, 7)  # 15 - 8
        
        # Comments should be updated
        self.assertIn('Auto-calculated from PACS', updated_analysis.comments)
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_modality_not_in_pacs_breakdown(self, mock_orthanc):
        """Test when modality is not found in PACS breakdown"""
        mock_orthanc.return_value = {
            'total_images': 20,
            'total_studies': 10,
            'modality_breakdown': {
                'CT': {  # Different modality
                    'images': 20,
                    'studies': 10
                }
            }
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,  # CR modality
            auto_save=False
        )
        
        # Should use default values for missing modality
        self.assertEqual(result['total_examinations'], 5)  # From RIS
        self.assertEqual(result['total_images'], 0)  # Not found in breakdown
        self.assertEqual(result['total_retakes'], 0)
    
    @patch('exam.utils.get_orthanc_monthly_images')
    def test_calculation_method_tracking(self, mock_orthanc):
        """Test that calculation method is tracked"""
        mock_orthanc.return_value = {
            'total_images': 8,
            'total_studies': 5,
            'modality_breakdown': {
                'CR': {
                    'images': 8,
                    'studies': 5
                }
            },
            'warnings': ['Some minor warning']
        }
        
        result = calculate_reject_analysis_from_pacs(
            analysis_date=date(2024, 1, 1),
            modality=self.modaliti,
            auto_save=False
        )
        
        self.assertEqual(result['calculation_method'], 'PACS_AUTOMATED')
        self.assertIn('pacs_warnings', result)
        self.assertEqual(result['pacs_warnings'], ['Some minor warning'])
    
    def test_no_examinations_in_ris(self):
        """Test calculation when no examinations exist in RIS for the month"""
        # Delete all examinations
        Pemeriksaan.objects.all().delete()
        
        with patch('exam.utils.get_orthanc_monthly_images') as mock_orthanc:
            mock_orthanc.return_value = {
                'total_images': 10,
                'total_studies': 8,
                'modality_breakdown': {
                    'CR': {
                        'images': 10,
                        'studies': 8
                    }
                }
            }
            
            result = calculate_reject_analysis_from_pacs(
                analysis_date=date(2024, 1, 1),
                modality=self.modaliti,
                auto_save=False
            )
            
            # Should use PACS study count
            self.assertEqual(result['total_examinations'], 8)
            self.assertEqual(result['ris_examinations'], 0)
            self.assertEqual(result['pacs_studies'], 8)
            self.assertEqual(result['total_retakes'], 2)  # 10 images - 8 studies


if __name__ == '__main__':
    import unittest
    unittest.main()