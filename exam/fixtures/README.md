# Reject Analysis Fixtures and Commands

This directory contains fixtures and management commands for the Malaysian QAP-compliant reject analysis system.

## Files Overview

### Fixtures
- `reject_categories.json` - 12 main reject categories (4 types: Human Faults, Equipment, Processing, Others)
- `reject_reasons.json` - 36 specific reject reasons with Malaysian QAP codes and severity levels

### Management Commands
- `create_reject_categories.py` - Populate initial categories and reasons
- `migrate_reject_data.py` - Migrate historical reject data from various sources

## Quick Setup

### 1. Load Initial Data
```bash
# Load categories and reasons from fixtures
python manage.py loaddata reject_categories reject_reasons

# OR use the management command for more control
python manage.py create_reject_categories
```

### 2. Access Django Admin
After loading data, you can access the reject analysis admin at:
- **Categories**: `/admin/exam/rejectcategory/`
- **Reasons**: `/admin/exam/rejectreason/`
- **Monthly Analysis**: `/admin/exam/rejectanalysis/`
- **Individual Incidents**: `/admin/exam/rejectincident/`
- **PACS Servers**: `/admin/exam/pacsserver/`

## Admin Features

### RejectCategory Admin
- Drag-and-drop ordering within category types
- Inline editing of reject reasons
- Bulk activate/deactivate categories
- Active/inactive reason counts

### RejectReason Admin
- Drag-and-drop ordering within categories
- Malaysian QAP code assignment
- Severity level classification (Low/Medium/High/Critical)
- Bulk operations for updating QAP codes

### RejectAnalysis Admin
- Monthly analysis tracking by modality
- Automatic reject rate calculation
- Color-coded status indicators (Good/Warning/Critical)
- DRL compliance tracking
- Approval workflow
- Inline incident management

### RejectIncident Admin
- Individual reject tracking linked to examinations
- Technical details (original/corrected technique)
- Staff involvement tracking
- Follow-up requirement management
- Bulk follow-up completion

### PacsServer Admin
- Superuser-restricted connection settings
- Primary server designation
- Reject analysis inclusion flags
- Connection testing actions

## Malaysian QAP Code Structure

Reject reasons include standardized QAP codes following this pattern:
- **HF-XXX-XX**: Human Faults (Exposure, Positioning, Motion, Collimation, ID)
- **EQ-XXX-XX**: Equipment (Tube, Generator, Detector, Cassette, Calibration, Grid)
- **PR-XXX-XX**: Processing (Software, Network, Storage)
- **OT-XXX-XX**: Others (Patient, Environment, Urgent)

## Severity Levels

Each reject reason has an assigned severity level:
- **LOW**: Minor impact, normal quality improvement process
- **MEDIUM**: Moderate impact, requires attention and corrective action
- **HIGH**: Significant impact, immediate corrective action needed
- **CRITICAL**: Severe impact, immediate action and investigation required

## Target Reject Rates

Default target reject rates per Malaysian guidelines:
- **General Radiography**: 8%
- **Computed Radiography**: 10%
- **Digital Radiography**: 6%
- **Fluoroscopy**: 15%

These can be customized per modality in the RejectAnalysis admin.

## Usage Examples

### Loading Data
```bash
# Load all fixtures
python manage.py loaddata reject_categories reject_reasons

# Create categories only (no reasons)
python manage.py create_reject_categories --categories-only

# Force overwrite existing data
python manage.py create_reject_categories --force

# Dry run to see what would be created
python manage.py create_reject_categories --dry-run
```

### Data Migration
```bash
# Backup existing data before migration
python manage.py migrate_reject_data --backup --output backup.json

# Update existing reasons with QAP codes
python manage.py migrate_reject_data --update-qap-codes

# Migrate from CSV file
python manage.py migrate_reject_data --source csv --file data.csv

# Dry run migration
python manage.py migrate_reject_data --source csv --file data.csv --dry-run
```

## Integration with Frontend

The reject analysis system provides REST APIs for the Next.js frontend:
- `GET /api/reject-categories/` - List categories with reasons
- `GET /api/reject-reasons/` - List all reasons (filterable)
- `GET /api/reject-analysis/` - Monthly analysis data
- `GET /api/reject-incidents/` - Individual incidents
- `GET /api/reject-statistics/` - Summary statistics

## Customization

### Adding New Categories
1. Use Django admin or create programmatically
2. Assign appropriate category_type (HUMAN_FAULTS, EQUIPMENT, PROCESSING, OTHERS)
3. Set proper ordering within category type

### Adding New Reasons
1. Select parent category
2. Assign Malaysian QAP code following convention
3. Set appropriate severity level
4. Provide detailed description for staff guidance

### Modifying QAP Codes
Use the management command to bulk update QAP codes:
```python
python manage.py migrate_reject_data --update-qap-codes
```

This ensures consistency across all reject reasons with standardized Malaysian QAP compliance codes.