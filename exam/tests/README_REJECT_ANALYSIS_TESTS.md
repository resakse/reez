# Reject Analysis System - Test Suite

Comprehensive unit tests for the Reject Analysis System covering models, APIs, utilities, admin configurations, and integration scenarios.

## Test Coverage Overview

### 1. Model Tests (`test_reject_analysis_models.py`)
Tests for all reject analysis models including validation, auto-calculations, and relationships.

**Test Classes:**
- `RejectCategoryModelTest` - Category creation, validation, ordering, uniqueness
- `RejectReasonModelTest` - Reason creation, category relationships, QAP fields
- `RejectAnalysisModelTest` - Analysis calculations, DRL compliance, approval workflow
- `RejectIncidentModelTest` - Incident logging, examination linking, Malaysian QAP
- `PacsServerRejectAnalysisTest` - PACS server inclusion/exclusion in reject analysis

**Key Features Tested:**
- ✅ Auto-calculation of reject rates
- ✅ DRL compliance determination
- ✅ Title case conversion for names
- ✅ Unique constraints validation
- ✅ Ordered model functionality
- ✅ Malaysian QAP compliance fields
- ✅ PACS server filtering for reject analysis

### 2. API Tests (`test_reject_analysis_api.py`)
Tests for all ViewSet endpoints including CRUD operations, permissions, and filtering.

**Test Classes:**
- `RejectCategoryAPITest` - Category CRUD, permissions, drag-and-drop ordering
- `RejectReasonAPITest` - Reason CRUD, category filtering, severity levels
- `RejectAnalysisAPITest` - Analysis CRUD, PACS calculation, approval workflow
- `RejectIncidentAPITest` - Incident CRUD, filtering by analysis/reason/technologist
- `RejectAnalysisStatisticsAPITest` - Statistics endpoints, trend analysis
- `DragAndDropOrderingTest` - Drag-and-drop reordering functionality

**Key Features Tested:**
- ✅ JWT authentication and authorization
- ✅ Staff-only access controls
- ✅ CRUD operations with validation
- ✅ Advanced filtering and search
- ✅ Statistics and trend analysis
- ✅ Bulk operations and actions
- ✅ PACS integration endpoints

### 3. Utility Tests (`test_reject_analysis_utils.py`)
Tests for PACS integration utilities with comprehensive mocking.

**Test Classes:**
- `GetOrthancMonthlyImagesTest` - Orthanc API integration, error handling
- `CalculateRejectAnalysisFromPacsTest` - PACS data calculation, RIS integration

**Key Features Tested:**
- ✅ Orthanc PACS API calls with mocked responses
- ✅ Date filtering and modality filtering
- ✅ Multiple PACS server support
- ✅ Error handling (connection errors, timeouts, HTTP errors)
- ✅ RIS and PACS data reconciliation
- ✅ Auto-calculation from PACS data
- ✅ Server inclusion/exclusion logic

### 4. Admin Tests (`test_reject_analysis_admin.py`)
Tests for Django admin configurations and permissions.

**Test Classes:**
- `RejectCategoryAdminTest` - Category admin interface, inline configurations
- `RejectReasonAdminTest` - Reason admin interface, QAP field organization
- `RejectAnalysisAdminTest` - Analysis admin interface, bulk actions, approval
- `RejectIncidentAdminTest` - Incident admin interface, comprehensive search
- `AdminInlineTest` - Inline configurations and relationships
- `AdminPermissionTest` - Permission handling for different user types

**Key Features Tested:**
- ✅ List display and filtering configurations
- ✅ Fieldset organization and Malaysian QAP sections
- ✅ Bulk actions (approval, export)
- ✅ Visual indicators for compliance status
- ✅ Queryset optimizations
- ✅ Permission-based access control
- ✅ Auto-assignment of created_by fields

### 5. Integration Tests (`test_reject_analysis_integration.py`)
Tests for complete workflows and real-world scenarios.

**Test Classes:**
- `CompleteWorkflowIntegrationTest` - End-to-end workflow from incident to approval
- `MalaysianQAPComplianceTest` - Malaysian QAP specific features and bilingual support
- `MultiPacsServerIntegrationTest` - Multi-PACS server scenarios
- `RejectAnalysisTrendsIntegrationTest` - Trend analysis and statistical summaries
- `PerformanceIntegrationTest` - Performance testing with large datasets

**Key Features Tested:**
- ✅ Complete workflow: incident → analysis → approval → statistics
- ✅ Malaysian QAP compliance and bilingual support
- ✅ Multi-PACS server configurations
- ✅ Monthly trend analysis and statistics
- ✅ Performance with bulk operations
- ✅ Integration between all system components

## Test Execution

### Run All Tests
```bash
# Using Django test runner
python manage.py test exam.tests.test_reject_analysis_models
python manage.py test exam.tests.test_reject_analysis_api
python manage.py test exam.tests.test_reject_analysis_utils
python manage.py test exam.tests.test_reject_analysis_admin
python manage.py test exam.tests.test_reject_analysis_integration

# Using custom test runner
python exam/tests/test_reject_analysis_runner.py
```

### Run Specific Test Categories
```bash
# Run only model tests
python exam/tests/test_reject_analysis_runner.py models

# Run only API tests
python exam/tests/test_reject_analysis_runner.py api

# Run only integration tests
python exam/tests/test_reject_analysis_runner.py integration
```

### Run Individual Test Classes
```bash
# Run specific test class
python manage.py test exam.tests.test_reject_analysis_models.RejectAnalysisModelTest

# Run specific test method
python manage.py test exam.tests.test_reject_analysis_models.RejectAnalysisModelTest.test_auto_calculate_reject_rate
```

## Coverage Goals

The test suite aims for >90% code coverage across all reject analysis components:

- **Models**: 95%+ coverage (high complexity calculations and validations)
- **Views/APIs**: 90%+ coverage (complex business logic and permissions)
- **Utilities**: 95%+ coverage (critical PACS integration functions)
- **Admin**: 85%+ coverage (configuration and display methods)

## Test Data and Fixtures

### Test Data Creation
Tests use factory methods and setUp() to create consistent test data:
- Users with different permission levels
- PACS servers with various configurations
- Sample examinations and patients
- Reject categories and reasons with QAP codes

### Mock External Dependencies
- **Orthanc PACS API**: Mocked HTTP responses for reliability
- **File System Operations**: Mocked for consistency
- **Email Notifications**: Mocked to prevent actual sends
- **Third-party APIs**: Comprehensive mocking strategy

## Malaysian QAP Compliance Testing

Special focus on Malaysian Quality Assurance Programme requirements:

### QAP-Specific Features Tested
- ✅ QAP codes for reject reasons
- ✅ Severity level classifications
- ✅ Target reject rates by modality
- ✅ Bilingual support (English/Malay)
- ✅ Compliance reporting and statistics
- ✅ Corrective action documentation

### Modality-Specific Targets
- **X-Ray/CR**: 8% target reject rate
- **Mammography**: 3% target reject rate
- **CT Scan**: 5% target reject rate
- **MRI**: 4% target reject rate

## Error Scenarios Tested

### PACS Integration Errors
- ✅ Connection timeouts
- ✅ HTTP errors (404, 500, etc.)
- ✅ Invalid DICOM data
- ✅ Partial server failures
- ✅ Authentication failures

### Data Validation Errors
- ✅ Invalid date ranges
- ✅ Missing required fields
- ✅ Constraint violations
- ✅ Permission denied scenarios
- ✅ Concurrent modification handling

### Business Logic Errors
- ✅ Invalid reject rate calculations
- ✅ Duplicate analysis prevention
- ✅ Workflow state violations
- ✅ Approval process errors

## Performance Testing

### Load Testing Scenarios
- **Bulk incident creation**: 100+ incidents
- **Large dataset queries**: 1000+ analyses
- **Multi-server PACS queries**: 3+ PACS servers
- **Statistics calculations**: 12+ months of data

### Performance Targets
- **Database queries**: <500ms for complex queries
- **Bulk operations**: <1 second for 100 records
- **API responses**: <200ms for typical requests
- **PACS integration**: <30 seconds for monthly data

## Continuous Integration

### Pre-commit Checks
```bash
# Run linting
flake8 exam/tests/test_reject_analysis_*.py

# Run type checking
mypy exam/tests/test_reject_analysis_*.py

# Run security checks
bandit exam/tests/test_reject_analysis_*.py

# Run tests
python exam/tests/test_reject_analysis_runner.py
```

### CI Pipeline Integration
- Run on every pull request
- Generate coverage reports
- Performance regression detection
- Security vulnerability scanning

## Maintenance and Updates

### Adding New Tests
1. Follow existing naming conventions
2. Use appropriate test class inheritance
3. Mock external dependencies properly
4. Include both positive and negative test cases
5. Add performance considerations for large datasets

### Test Data Management
- Use factory methods for consistent data creation
- Clean up test data in tearDown() methods
- Avoid hard-coded IDs or timestamps
- Use relative dates for time-sensitive tests

### Documentation Updates
- Update this README when adding new test categories
- Document any new mock strategies
- Update performance targets as system evolves
- Maintain coverage goals and metrics

## Troubleshooting

### Common Issues

**Database Conflicts**
```bash
# Reset test database
python manage.py flush --settings=reez.test_settings
```

**Mock Not Working**
- Ensure patch decorators are applied correctly
- Check import paths for mocked functions
- Verify mock return values match expected types

**Permission Errors**
- Ensure test users have correct permissions
- Check JWT token generation and application
- Verify request.user assignment in tests

**Performance Issues**
- Use select_related() and prefetch_related() in querysets
- Consider database indexing for test queries
- Monitor test execution times and optimize accordingly