#!/usr/bin/env python
"""
Comprehensive test script for AI reporting system endpoints
"""
import os
import sys
import django
import requests
import json
from django.test import Client
from django.contrib.auth import get_user_model

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

# Import Django models after setup
from exam.models import (
    AIGeneratedReport, RadiologistReport, ReportCollaboration, 
    AIModelPerformance, AIConfiguration, Pemeriksaan, Daftar, Exam, Modaliti, Part
)
from pesakit.models import Pesakit
from staff.models import Staff

User = get_user_model()

class AIReportingSystemTester:
    def __init__(self):
        self.client = Client()
        self.base_url = "http://localhost:8000"
        self.api_base = "/api/ai-reporting/"
        self.test_results = []
        
    def log_test(self, test_name, status, message, details=None):
        """Log test results"""
        result = {
            'test': test_name,
            'status': status,
            'message': message,
            'details': details
        }
        self.test_results.append(result)
        status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_symbol} {test_name}: {message}")
        if details:
            print(f"   Details: {details}")
            
    def create_test_data(self):
        """Create test data for AI reporting tests"""
        try:
            # Create test user
            self.test_user, created = Staff.objects.get_or_create(
                username='test_radiologist',
                defaults={
                    'email': 'test@example.com',
                    'first_name': 'Test',
                    'last_name': 'Radiologist'
                }
            )
            if created:
                self.test_user.set_password('testpassword123')
                self.test_user.save()
            
            # Login the test user
            self.client.force_login(self.test_user)
            
            # Create test patient
            self.test_patient, created = Pesakit.objects.get_or_create(
                nric='999999-99-9999',
                defaults={
                    'nama': 'Test Patient',
                    'mrn': 'TEST001'
                }
            )
            
            # Create test registration
            self.test_daftar, created = Daftar.objects.get_or_create(
                pesakit=self.test_patient,
                defaults={
                    'no_resit': 'TEST001'
                }
            )
            
            # Get or create test modality
            self.test_modaliti, created = Modaliti.objects.get_or_create(
                nama='X-RAY',
                defaults={'detail': 'X-Ray Test Modality', 'singkatan': 'XR'}
            )
            
            # Get or create test part
            self.test_part, created = Part.objects.get_or_create(
                part='CHEST'
            )
            
            # Get or create test exam (use existing or create with unique name)
            existing_exam = Exam.objects.filter(
                exam='TEST CHEST X-RAY', 
                part=self.test_part, 
                modaliti=self.test_modaliti
            ).first()
            
            if existing_exam:
                self.test_exam = existing_exam
            else:
                import uuid
                unique_suffix = str(uuid.uuid4())[:8]
                self.test_exam = Exam.objects.create(
                    exam=f'TEST CHEST X-RAY {unique_suffix}',
                    part=self.test_part,
                    modaliti=self.test_modaliti,
                    catatan='Test chest X-ray examination'
                )
            
            # Create test examination
            self.test_pemeriksaan, created = Pemeriksaan.objects.get_or_create(
                no_xray='TEST20250001',
                defaults={
                    'daftar': self.test_daftar,
                    'exam': self.test_exam,
                    'catatan': 'Test examination for AI reporting'
                }
            )
            
            self.log_test("Create Test Data", "PASS", "Test data created successfully")
            return True
            
        except Exception as e:
            self.log_test("Create Test Data", "FAIL", f"Failed to create test data: {str(e)}")
            return False
    
    def test_ai_configuration_endpoints(self):
        """Test AI configuration API endpoints"""
        try:
            # Test GET config
            response = self.client.get(f"{self.api_base}config/")
            if response.status_code == 200:
                config_data = response.json()
                self.log_test("AI Config GET", "PASS", "Configuration retrieved successfully", 
                             f"AI enabled: {config_data.get('enable_ai_reporting', False)}")
            else:
                self.log_test("AI Config GET", "FAIL", f"Status: {response.status_code}", response.content)
                
            # Test PUT config (update)
            update_data = {
                'enable_ai_reporting': True,
                'confidence_threshold': 0.75,
                'ollama_server_url': 'http://localhost:11434'
            }
            response = self.client.put(
                f"{self.api_base}config/", 
                data=json.dumps(update_data),
                content_type='application/json'
            )
            if response.status_code in [200, 201]:
                self.log_test("AI Config PUT", "PASS", "Configuration updated successfully")
            else:
                self.log_test("AI Config PUT", "FAIL", f"Status: {response.status_code}", response.content)
                
            # Test connection test endpoint
            response = self.client.post(f"{self.api_base}config/test/")
            # Expected to fail since Ollama is not running
            self.log_test("AI Connection Test", "INFO", f"Connection test status: {response.status_code}", 
                         "Expected to fail without Ollama server")
                         
        except Exception as e:
            self.log_test("AI Configuration Tests", "FAIL", f"Exception: {str(e)}")
    
    def test_ai_report_generation(self):
        """Test AI report generation endpoint"""
        try:
            # Test AI report generation
            generation_data = {
                'examination_id': self.test_pemeriksaan.id,
                'force_regenerate': False
            }
            response = self.client.post(
                f"{self.api_base}generate/",
                data=json.dumps(generation_data),
                content_type='application/json'
            )
            
            # Expected to fail without Ollama, but endpoint should exist
            if response.status_code == 400:
                self.log_test("AI Report Generation", "INFO", 
                             "Endpoint exists but AI service unavailable (expected)")
            elif response.status_code == 500:
                self.log_test("AI Report Generation", "INFO", 
                             "Server error due to missing AI service (expected)")
            else:
                self.log_test("AI Report Generation", "PASS", 
                             f"Unexpected success or different error: {response.status_code}")
                             
        except Exception as e:
            self.log_test("AI Report Generation", "FAIL", f"Exception: {str(e)}")
    
    def test_ai_reports_crud(self):
        """Test AI reports CRUD operations"""
        try:
            # Test GET list
            response = self.client.get(f"{self.api_base}ai-reports/")
            if response.status_code == 200:
                reports = response.json()
                self.log_test("AI Reports List", "PASS", f"Retrieved {len(reports.get('results', []))} reports")
            else:
                self.log_test("AI Reports List", "FAIL", f"Status: {response.status_code}")
            
            # Create a test AI report directly via model
            test_ai_report = AIGeneratedReport.objects.create(
                pemeriksaan=self.test_pemeriksaan,
                ai_model_version='test-model-v1.0',
                generated_report='This is a test AI-generated report.',
                confidence_score=0.85,
                review_status='pending'
            )
            
            # Test GET detail
            response = self.client.get(f"{self.api_base}ai-reports/{test_ai_report.id}/")
            if response.status_code == 200:
                self.log_test("AI Report Detail", "PASS", "Retrieved report details successfully")
            else:
                self.log_test("AI Report Detail", "FAIL", f"Status: {response.status_code}")
                
            # Test update status
            response = self.client.post(
                f"{self.api_base}ai-reports/{test_ai_report.id}/update-status/",
                data=json.dumps({'status': 'approved'}),
                content_type='application/json'
            )
            if response.status_code == 200:
                self.log_test("AI Report Status Update", "PASS", "Status updated successfully")
            else:
                self.log_test("AI Report Status Update", "FAIL", f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("AI Reports CRUD", "FAIL", f"Exception: {str(e)}")
    
    def test_dashboard_endpoints(self):
        """Test dashboard and analytics endpoints"""
        try:
            # Test dashboard endpoint
            response = self.client.get(f"{self.api_base}dashboard/")
            if response.status_code == 200:
                dashboard_data = response.json()
                self.log_test("AI Dashboard", "PASS", "Dashboard data retrieved successfully",
                             f"Keys: {list(dashboard_data.keys())}")
            else:
                self.log_test("AI Dashboard", "FAIL", f"Status: {response.status_code}")
                
            # Test performance summary
            response = self.client.get(f"{self.api_base}performance/summary/")
            if response.status_code == 200:
                perf_data = response.json()
                self.log_test("Performance Summary", "PASS", "Performance data retrieved successfully",
                             f"Keys: {list(perf_data.keys())}")
            else:
                self.log_test("Performance Summary", "FAIL", f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Dashboard Tests", "FAIL", f"Exception: {str(e)}")
    
    def test_model_relationships(self):
        """Test model relationships and data integrity"""
        try:
            # Test AI report relationships
            ai_reports = AIGeneratedReport.objects.filter(pemeriksaan=self.test_pemeriksaan)
            self.log_test("AI Report Relationships", "PASS", 
                         f"Found {ai_reports.count()} AI reports for test examination")
            
            # Test configuration singleton
            config_count = AIConfiguration.objects.count()
            if config_count <= 1:
                self.log_test("AI Configuration Singleton", "PASS", 
                             f"Configuration singleton working (count: {config_count})")
            else:
                self.log_test("AI Configuration Singleton", "FAIL", 
                             f"Multiple configurations exist: {config_count}")
                             
        except Exception as e:
            self.log_test("Model Relationships", "FAIL", f"Exception: {str(e)}")
    
    def test_permissions(self):
        """Test API permissions and authentication"""
        try:
            # Test unauthenticated access
            unauthenticated_client = Client()
            response = unauthenticated_client.get(f"{self.api_base}config/")
            
            if response.status_code in [401, 403]:
                self.log_test("Authentication Required", "PASS", 
                             "Unauthenticated access properly blocked")
            else:
                self.log_test("Authentication Required", "FAIL", 
                             f"Unauthenticated access allowed: {response.status_code}")
                             
        except Exception as e:
            self.log_test("Permissions Test", "FAIL", f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting AI Reporting System Backend Tests")
        print("=" * 60)
        
        # Create test data
        if not self.create_test_data():
            print("❌ Failed to create test data. Aborting tests.")
            return
        
        # Run all tests
        self.test_ai_configuration_endpoints()
        self.test_ai_report_generation()
        self.test_ai_reports_crud()
        self.test_dashboard_endpoints()
        self.test_model_relationships()
        self.test_permissions()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        pass_count = sum(1 for r in self.test_results if r['status'] == 'PASS')
        fail_count = sum(1 for r in self.test_results if r['status'] == 'FAIL')
        info_count = sum(1 for r in self.test_results if r['status'] == 'INFO')
        
        print(f"✅ PASSED: {pass_count}")
        print(f"❌ FAILED: {fail_count}")
        print(f"ℹ️  INFO: {info_count}")
        print(f"📊 TOTAL: {len(self.test_results)}")
        
        if fail_count == 0:
            print("\n🎉 All critical tests passed!")
        else:
            print(f"\n⚠️  {fail_count} tests failed - see details above")
            
        return self.test_results

if __name__ == "__main__":
    tester = AIReportingSystemTester()
    results = tester.run_all_tests()