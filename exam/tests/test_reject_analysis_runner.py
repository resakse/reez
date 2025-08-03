#!/usr/bin/env python
"""
Test Runner for Reject Analysis System

Runs all reject analysis tests and provides coverage summary.
Usage: python exam/tests/test_reject_analysis_runner.py
"""

import os
import sys
import unittest
import django
from django.conf import settings
from django.test.utils import get_runner

# Add the project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

# Configure Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'reez.settings')
django.setup()


def run_reject_analysis_tests():
    """Run all reject analysis tests"""
    
    # Test modules to run
    test_modules = [
        'exam.tests.test_reject_analysis_models',
        'exam.tests.test_reject_analysis_api',
        'exam.tests.test_reject_analysis_utils',
        'exam.tests.test_reject_analysis_admin',
        'exam.tests.test_reject_analysis_integration',
    ]
    
    print("=" * 70)
    print("REJECT ANALYSIS SYSTEM - COMPREHENSIVE TEST SUITE")
    print("=" * 70)
    
    # Run tests for each module
    overall_result = True
    
    for module in test_modules:
        print(f"\n{'='*20} {module} {'='*20}")
        
        try:
            # Load the test module
            suite = unittest.TestLoader().loadTestsFromName(module)
            runner = unittest.TextTestRunner(verbosity=2)
            result = runner.run(suite)
            
            if not result.wasSuccessful():
                overall_result = False
                
            print(f"\nTests run: {result.testsRun}")
            print(f"Failures: {len(result.failures)}")
            print(f"Errors: {len(result.errors)}")
            print(f"Skipped: {len(result.skipped) if hasattr(result, 'skipped') else 0}")
            
        except Exception as e:
            print(f"Error running tests for {module}: {e}")
            overall_result = False
    
    print("\n" + "=" * 70)
    if overall_result:
        print("✅ ALL REJECT ANALYSIS TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED - CHECK OUTPUT ABOVE")
    print("=" * 70)
    
    return overall_result


def run_specific_test_class(test_class_name):
    """Run a specific test class"""
    
    test_mapping = {
        'models': 'exam.tests.test_reject_analysis_models',
        'api': 'exam.tests.test_reject_analysis_api',
        'utils': 'exam.tests.test_reject_analysis_utils',
        'admin': 'exam.tests.test_reject_analysis_admin',
        'integration': 'exam.tests.test_reject_analysis_integration',
    }
    
    if test_class_name.lower() in test_mapping:
        module = test_mapping[test_class_name.lower()]
        print(f"Running {module}...")
        
        suite = unittest.TestLoader().loadTestsFromName(module)
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        return result.wasSuccessful()
    else:
        print(f"Unknown test class: {test_class_name}")
        print(f"Available classes: {', '.join(test_mapping.keys())}")
        return False


def main():
    """Main test runner function"""
    
    if len(sys.argv) > 1:
        # Run specific test class
        test_class = sys.argv[1]
        success = run_specific_test_class(test_class)
    else:
        # Run all tests
        success = run_reject_analysis_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()