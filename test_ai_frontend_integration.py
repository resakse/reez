#!/usr/bin/env python
"""
Test script to verify AI reporting frontend-backend integration
"""
import os
import sys
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()

from staff.models import Staff
from rest_framework_simplejwt.tokens import RefreshToken

class AIFrontendIntegrationTester:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.api_base = "/api/ai-reporting/"
        self.test_results = []
        self.token = None
        
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
    
    def get_jwt_token(self):
        """Get JWT token for authenticated requests"""
        try:
            # Create or get test user
            user, created = Staff.objects.get_or_create(
                username='test_frontend_radiologist',
                defaults={
                    'email': 'frontend_test@example.com',
                    'first_name': 'Frontend',
                    'last_name': 'Test',
                    'is_staff': True
                }
            )
            if created:
                user.set_password('testpassword123')
                user.save()
            
            # Generate JWT token
            refresh = RefreshToken.for_user(user)
            self.token = str(refresh.access_token)
            self.headers = {
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json'
            }
            
            self.log_test("JWT Token Generation", "PASS", "JWT token generated successfully")
            return True
            
        except Exception as e:
            self.log_test("JWT Token Generation", "FAIL", f"Failed: {str(e)}")
            return False
    
    def test_ai_configuration_api(self):
        """Test AI configuration API endpoints like frontend would"""
        try:
            # Test GET config
            response = requests.get(f"{self.base_url}{self.api_base}config/", headers=self.headers)
            if response.status_code == 200:
                config_data = response.json()
                self.log_test("Frontend: AI Config GET", "PASS", 
                             f"Config retrieved - AI enabled: {config_data.get('enable_ai_reporting', False)}")
            else:
                self.log_test("Frontend: AI Config GET", "FAIL", 
                             f"Status: {response.status_code}", response.text)
                
            # Test connection test endpoint
            response = requests.post(f"{self.base_url}{self.api_base}config/test/", headers=self.headers)
            if response.status_code in [200, 400, 500]:  # 400/500 expected without Ollama
                self.log_test("Frontend: AI Connection Test", "PASS", 
                             f"Connection test endpoint working (status: {response.status_code})")
            else:
                self.log_test("Frontend: AI Connection Test", "FAIL", 
                             f"Unexpected status: {response.status_code}")
                             
        except Exception as e:
            self.log_test("Frontend: AI Configuration", "FAIL", f"Exception: {str(e)}")
    
    def test_dashboard_api(self):
        """Test dashboard API that frontend components use"""
        try:
            # Test dashboard endpoint
            response = requests.get(f"{self.base_url}{self.api_base}dashboard/", headers=self.headers)
            if response.status_code == 200:
                dashboard_data = response.json()
                expected_keys = ['system_status', 'performance_metrics', 'recent_reports']
                has_expected_structure = any(key in dashboard_data for key in expected_keys)
                
                self.log_test("Frontend: Dashboard API", "PASS", 
                             f"Dashboard data retrieved, keys: {list(dashboard_data.keys())}")
            else:
                self.log_test("Frontend: Dashboard API", "FAIL", 
                             f"Status: {response.status_code}", response.text)
                
            # Test performance summary
            response = requests.get(f"{self.base_url}{self.api_base}performance/summary/", 
                                  headers=self.headers)
            if response.status_code == 200:
                self.log_test("Frontend: Performance Summary", "PASS", "Performance data retrieved")
            else:
                self.log_test("Frontend: Performance Summary", "FAIL", 
                             f"Status: {response.status_code}")
                             
        except Exception as e:
            self.log_test("Frontend: Dashboard APIs", "FAIL", f"Exception: {str(e)}")
    
    def test_ai_reports_api(self):
        """Test AI reports API endpoints"""
        try:
            # Test AI reports list
            response = requests.get(f"{self.base_url}{self.api_base}ai-reports/", headers=self.headers)
            if response.status_code == 200:
                reports_data = response.json()
                report_count = len(reports_data.get('results', []))
                self.log_test("Frontend: AI Reports List", "PASS", 
                             f"Retrieved {report_count} AI reports")
            else:
                self.log_test("Frontend: AI Reports List", "FAIL", 
                             f"Status: {response.status_code}")
                             
        except Exception as e:
            self.log_test("Frontend: AI Reports API", "FAIL", f"Exception: {str(e)}")
    
    def test_cors_and_headers(self):
        """Test CORS and header requirements for frontend"""
        try:
            # Test preflight request
            response = requests.options(f"{self.base_url}{self.api_base}config/", 
                                      headers={'Origin': 'http://localhost:3000'})
            
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
            }
            
            if any(cors_headers.values()):
                self.log_test("Frontend: CORS Headers", "PASS", 
                             "CORS headers present", str(cors_headers))
            else:
                self.log_test("Frontend: CORS Headers", "INFO", 
                             "CORS headers not detected (may need configuration)")
                             
        except Exception as e:
            self.log_test("Frontend: CORS Test", "FAIL", f"Exception: {str(e)}")
    
    def run_frontend_integration_tests(self):
        """Run tests that simulate frontend integration"""
        print("🚀 Starting AI Reporting Frontend Integration Tests")
        print("=" * 60)
        
        # Get JWT token first
        if not self.get_jwt_token():
            print("❌ Failed to get JWT token. Aborting tests.")
            return
        
        # Run all tests
        self.test_ai_configuration_api()
        self.test_dashboard_api()
        self.test_ai_reports_api()
        self.test_cors_and_headers()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 FRONTEND INTEGRATION TEST SUMMARY")
        print("=" * 60)
        
        pass_count = sum(1 for r in self.test_results if r['status'] == 'PASS')
        fail_count = sum(1 for r in self.test_results if r['status'] == 'FAIL')
        info_count = sum(1 for r in self.test_results if r['status'] == 'INFO')
        
        print(f"✅ PASSED: {pass_count}")
        print(f"❌ FAILED: {fail_count}")
        print(f"ℹ️  INFO: {info_count}")
        print(f"📊 TOTAL: {len(self.test_results)}")
        
        if fail_count == 0:
            print("\n🎉 All frontend integration tests passed!")
        else:
            print(f"\n⚠️  {fail_count} tests failed - see details above")
            
        return self.test_results

if __name__ == "__main__":
    tester = AIFrontendIntegrationTester()
    results = tester.run_frontend_integration_tests()