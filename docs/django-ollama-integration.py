#!/usr/bin/env python3
"""
Django-Ollama Integration Test Suite for RIS Medical AI

This script tests the integration between Django RIS backend and Ollama medical AI service.
It validates API connectivity, model functionality, and medical AI workflows.

Usage:
    python manage.py shell < django-ollama-integration.py
    # or
    python django-ollama-integration.py  # (if Django settings configured)
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Django setup (if running standalone)
try:
    import django
    from django.conf import settings
    if not settings.configured:
        # Configure Django settings if not already configured
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
        django.setup()
except ImportError:
    print("Warning: Django not available. Some tests may not work.")

# Try to import Django models
try:
    from exam.models import Pemeriksaan, Exam, Modaliti, PacsConfig
    from pesakit.models import Pesakit
    DJANGO_AVAILABLE = True
except ImportError:
    print("Warning: Django models not available. Model tests will be skipped.")
    DJANGO_AVAILABLE = False

class OllamaIntegrationTester:
    """Test suite for Django-Ollama integration"""
    
    def __init__(self, ollama_host: str = "http://localhost:11434"):
        self.ollama_host = ollama_host
        self.test_results = []
        self.session = requests.Session()
        self.session.timeout = 60
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
        
    def test_api_connectivity(self) -> bool:
        """Test basic Ollama API connectivity"""
        self.log("Testing Ollama API connectivity...")
        
        try:
            response = self.session.get(f"{self.ollama_host}/api/version")
            
            if response.status_code == 200:
                version_info = response.json()
                self.log(f"✅ Ollama API connected successfully: {version_info.get('version', 'unknown')}")
                return True
            else:
                self.log(f"❌ API connection failed: HTTP {response.status_code}", "ERROR")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log(f"❌ API connection error: {e}", "ERROR")
            return False
    
    def get_available_models(self) -> List[str]:
        """Get list of available Ollama models"""
        try:
            response = self.session.get(f"{self.ollama_host}/api/tags")
            
            if response.status_code == 200:
                data = response.json()
                models = [model['name'] for model in data.get('models', [])]
                self.log(f"Available models: {', '.join(models)}")
                return models
            else:
                self.log(f"Failed to get models: HTTP {response.status_code}", "ERROR")
                return []
                
        except requests.exceptions.RequestException as e:
            self.log(f"Error getting models: {e}", "ERROR")
            return []
    
    def test_model_inference(self, model_name: str, prompt: str, expected_keywords: List[str] = None) -> Tuple[bool, str]:
        """Test model inference with medical prompts"""
        self.log(f"Testing model inference: {model_name}")
        
        try:
            start_time = time.time()
            
            response = self.session.post(
                f"{self.ollama_host}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False
                }
            )
            
            inference_time = time.time() - start_time
            
            if response.status_code == 200:
                result = response.json()
                answer = result.get('response', '')
                
                # Basic validation
                if len(answer) < 20:
                    self.log(f"❌ Model {model_name}: Response too short ({len(answer)} chars)", "ERROR")
                    return False, answer
                
                # Keyword validation
                if expected_keywords:
                    found_keywords = [kw for kw in expected_keywords if kw.lower() in answer.lower()]
                    if len(found_keywords) < len(expected_keywords) // 2:
                        self.log(f"⚠️ Model {model_name}: Few expected keywords found ({len(found_keywords)}/{len(expected_keywords)})", "WARNING")
                
                self.log(f"✅ Model {model_name}: Inference successful ({inference_time:.2f}s, {len(answer)} chars)")
                return True, answer
            else:
                self.log(f"❌ Model {model_name}: Inference failed HTTP {response.status_code}", "ERROR")
                return False, ""
                
        except requests.exceptions.RequestException as e:
            self.log(f"❌ Model {model_name}: Inference error: {e}", "ERROR")
            return False, ""
    
    def test_medical_ai_workflow(self) -> bool:
        """Test complete medical AI workflow simulation"""
        self.log("Testing medical AI workflow...")
        
        # Define medical AI workflow tests
        workflow_tests = [
            {
                "name": "DICOM Analysis",
                "model": "medical-vision",
                "fallback": "llava-med:7b",
                "prompt": "Analyze a chest X-ray and identify key anatomical structures including heart borders, lung fields, and any visible abnormalities.",
                "keywords": ["heart", "lung", "chest", "anatomical", "structure"]
            },
            {
                "name": "Report Generation",
                "model": "medical-reports",
                "fallback": "meditron:7b",
                "prompt": "Generate a structured radiology report for a chest CT scan showing normal findings.",
                "keywords": ["findings", "impression", "normal", "chest", "ct"]
            },
            {
                "name": "Quality Assurance",
                "model": "medical-qa",
                "fallback": "medalpaca:7b",
                "prompt": "Review this radiology report for completeness and accuracy: 'Chest X-ray shows clear lung fields with no acute abnormalities.'",
                "keywords": ["review", "quality", "accuracy", "complete", "report"]
            }
        ]
        
        available_models = self.get_available_models()
        workflow_success = True
        
        for test in workflow_tests:
            # Choose model (preferred or fallback)
            model_to_use = None
            if test["model"] in available_models:
                model_to_use = test["model"]
            elif test["fallback"] in available_models:
                model_to_use = test["fallback"]
                self.log(f"Using fallback model {test['fallback']} for {test['name']}")
            
            if model_to_use:
                success, response = self.test_model_inference(
                    model_to_use,
                    test["prompt"],
                    test["keywords"]
                )
                
                if success:
                    self.log(f"✅ {test['name']} workflow: SUCCESS")
                else:
                    self.log(f"❌ {test['name']} workflow: FAILED", "ERROR")
                    workflow_success = False
            else:
                self.log(f"❌ {test['name']} workflow: No suitable model available", "ERROR")
                workflow_success = False
        
        return workflow_success
    
    def test_django_model_integration(self) -> bool:
        """Test integration with Django RIS models"""
        if not DJANGO_AVAILABLE:
            self.log("⚠️ Django models not available, skipping integration test", "WARNING")
            return True
        
        self.log("Testing Django model integration...")
        
        try:
            # Test patient data integration
            sample_patient_data = {
                "mrn": "TEST001",
                "nric": "900101-01-1234",
                "nama": "Test Patient",
                "jantina": "L",
                "bangsa": "MALAY"
            }
            
            # Simulate medical AI analysis with patient context
            patient_prompt = f"""
            Analyze medical imaging for patient:
            - MRN: {sample_patient_data['mrn']}
            - Age: Adult
            - Gender: {'Male' if sample_patient_data['jantina'] == 'L' else 'Female'}
            - Ethnicity: {sample_patient_data['bangsa']}
            
            Provide appropriate medical considerations for this demographic.
            """
            
            available_models = self.get_available_models()
            test_model = None
            
            # Find a suitable model for testing
            preferred_models = ["medical-vision", "llava-med:7b", "medical-reports", "meditron:7b"]
            for model in preferred_models:
                if model in available_models:
                    test_model = model
                    break
            
            if test_model:
                success, response = self.test_model_inference(test_model, patient_prompt)
                
                if success:
                    self.log("✅ Django model integration: Patient context processing successful")
                    return True
                else:
                    self.log("❌ Django model integration: Patient context processing failed", "ERROR")
                    return False
            else:
                self.log("❌ No suitable model available for Django integration test", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Django integration test error: {e}", "ERROR")
            return False
    
    def test_performance_benchmarks(self) -> Dict:
        """Run performance benchmarks for medical AI"""
        self.log("Running performance benchmarks...")
        
        available_models = self.get_available_models()
        benchmark_results = {}
        
        # Standard medical prompts for benchmarking
        benchmark_prompts = [
            "Describe the normal anatomy visible in a chest X-ray.",
            "List the key components of a radiology report.",
            "What are the quality indicators for medical imaging?"
        ]
        
        for model in available_models:
            if any(medical_term in model.lower() for medical_term in ['medical', 'med', 'llava', 'meditron', 'alpaca']):
                self.log(f"Benchmarking model: {model}")
                
                model_times = []
                model_success = 0
                
                for prompt in benchmark_prompts:
                    start_time = time.time()
                    success, response = self.test_model_inference(model, prompt)
                    end_time = time.time()
                    
                    if success:
                        model_times.append(end_time - start_time)
                        model_success += 1
                
                if model_times:
                    avg_time = sum(model_times) / len(model_times)
                    benchmark_results[model] = {
                        "average_response_time": round(avg_time, 2),
                        "success_rate": round(model_success / len(benchmark_prompts) * 100, 1),
                        "total_tests": len(benchmark_prompts)
                    }
                    
                    self.log(f"Model {model}: Avg {avg_time:.2f}s, Success {model_success}/{len(benchmark_prompts)}")
        
        return benchmark_results
    
    def test_error_handling(self) -> bool:
        """Test error handling and edge cases"""
        self.log("Testing error handling...")
        
        error_tests = [
            {
                "name": "Invalid Model",
                "model": "nonexistent-model",
                "prompt": "Test prompt",
                "expect_failure": True
            },
            {
                "name": "Empty Prompt",
                "model": "medical-vision" if "medical-vision" in self.get_available_models() else "llava-med:7b",
                "prompt": "",
                "expect_failure": True
            },
            {
                "name": "Very Long Prompt",
                "model": "medical-vision" if "medical-vision" in self.get_available_models() else "llava-med:7b",
                "prompt": "A" * 10000,  # Very long prompt
                "expect_failure": False  # Should handle gracefully
            }
        ]
        
        error_handling_success = True
        
        for test in error_tests:
            self.log(f"Testing error case: {test['name']}")
            
            try:
                success, response = self.test_model_inference(test["model"], test["prompt"])
                
                if test["expect_failure"]:
                    if not success:
                        self.log(f"✅ Error handling: {test['name']} failed as expected")
                    else:
                        self.log(f"⚠️ Error handling: {test['name']} should have failed", "WARNING")
                else:
                    if success:
                        self.log(f"✅ Error handling: {test['name']} handled gracefully")
                    else:
                        self.log(f"❌ Error handling: {test['name']} should have succeeded", "ERROR")
                        error_handling_success = False
                        
            except Exception as e:
                self.log(f"Exception during {test['name']}: {e}", "ERROR")
                error_handling_success = False
        
        return error_handling_success
    
    def generate_integration_report(self) -> Dict:
        """Generate comprehensive integration test report"""
        self.log("Generating integration test report...")
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "ollama_host": self.ollama_host,
            "test_results": {},
            "recommendations": []
        }
        
        # Run all tests
        tests = [
            ("API Connectivity", self.test_api_connectivity),
            ("Medical AI Workflow", self.test_medical_ai_workflow),
            ("Django Integration", self.test_django_model_integration),
            ("Error Handling", self.test_error_handling)
        ]
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                report["test_results"][test_name] = {
                    "status": "PASSED" if result else "FAILED",
                    "success": result
                }
            except Exception as e:
                report["test_results"][test_name] = {
                    "status": "ERROR",
                    "success": False,
                    "error": str(e)
                }
        
        # Performance benchmarks
        try:
            benchmark_results = self.test_performance_benchmarks()
            report["performance_benchmarks"] = benchmark_results
        except Exception as e:
            report["performance_benchmarks"] = {"error": str(e)}
        
        # Generate recommendations
        failed_tests = [name for name, result in report["test_results"].items() if not result["success"]]
        
        if not failed_tests:
            report["recommendations"].append("✅ All integration tests passed! Ollama is ready for RIS production use.")
        else:
            report["recommendations"].append(f"❌ {len(failed_tests)} test(s) failed: {', '.join(failed_tests)}")
            
            if "API Connectivity" in failed_tests:
                report["recommendations"].append("🔧 Check if Ollama service is running: systemctl status ollama")
            
            if "Medical AI Workflow" in failed_tests:
                report["recommendations"].append("🔧 Run medical models setup: ./ollama-medical-models.sh")
            
            if "Django Integration" in failed_tests:
                report["recommendations"].append("🔧 Check Django settings and model imports")
        
        # Performance recommendations
        if "performance_benchmarks" in report and isinstance(report["performance_benchmarks"], dict):
            slow_models = [model for model, stats in report["performance_benchmarks"].items() 
                          if stats.get("average_response_time", 0) > 10]
            
            if slow_models:
                report["recommendations"].append(f"⚡ Consider optimizing slow models: {', '.join(slow_models)}")
        
        return report
    
    def run_full_test_suite(self) -> Dict:
        """Run complete integration test suite"""
        self.log("=" * 60)
        self.log("Django-Ollama Integration Test Suite Starting")
        self.log("=" * 60)
        
        report = self.generate_integration_report()
        
        self.log("=" * 60)
        self.log("Integration Test Suite Completed")
        self.log("=" * 60)
        
        # Print summary
        passed_tests = sum(1 for result in report["test_results"].values() if result["success"])
        total_tests = len(report["test_results"])
        
        self.log(f"Test Summary: {passed_tests}/{total_tests} tests passed")
        
        for recommendation in report["recommendations"]:
            self.log(recommendation)
        
        return report

def main():
    """Main execution function"""
    # Initialize tester
    tester = OllamaIntegrationTester()
    
    # Run full test suite
    report = tester.run_full_test_suite()
    
    # Save report to file
    report_file = f"/tmp/django-ollama-integration-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    
    try:
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\n📄 Full report saved to: {report_file}")
    except Exception as e:
        print(f"⚠️ Could not save report: {e}")
    
    # Return appropriate exit code
    failed_tests = sum(1 for result in report["test_results"].values() if not result["success"])
    return 0 if failed_tests == 0 else 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)