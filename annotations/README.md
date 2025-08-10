# DICOM Annotations Backend Implementation

## Overview

This is a complete Django backend implementation for DICOM annotations with auto-save functionality, user ownership validation, and comprehensive audit logging. The system supports Cornerstone.js integration for medical imaging applications.

## Features

✅ **Complete CRUD Operations**
- Create, Read, Update, Delete annotations via REST API
- Auto-save functionality for real-time annotation persistence
- User ownership validation (users can only edit/delete their own annotations)

✅ **Comprehensive Security**
- JWT-based authentication
- User ownership validation at model and API level
- Permission-based access control
- IP address tracking for audit logs

✅ **Audit Trail Integration**
- Full integration with existing `audit.models.AuditLog`
- Automatic logging of all CREATE/UPDATE/DELETE operations
- Data masking for sensitive information
- Comprehensive tracking of annotation lifecycle

✅ **Advanced Filtering & Search**
- Filter by study UID, image ID, annotation type
- Search across labels and descriptions
- Custom endpoints for specific use cases
- Pagination support

✅ **DICOM Integration Ready**
- Support for Study/Series/SOP Instance UIDs
- Cornerstone.js annotation data storage
- Multi-frame image support
- Flexible measurement value storage

## API Endpoints

### Authentication Required
All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/annotations/` | List annotations with pagination and filtering |
| `POST` | `/api/annotations/` | Create new annotation (auto-assigns to current user) |
| `GET` | `/api/annotations/{id}/` | Get specific annotation |
| `PUT` | `/api/annotations/{id}/` | Update annotation (owner only) |
| `PATCH` | `/api/annotations/{id}/` | Partial update annotation (owner only) |
| `DELETE` | `/api/annotations/{id}/` | Delete annotation (owner only) |

### Custom Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/annotations/by_study/?study_uid=<uid>` | Get annotations by study UID |
| `GET` | `/api/annotations/by_image/?image_id=<id>` | Get annotations by image ID |
| `GET` | `/api/annotations/my_annotations/` | Get current user's annotations |
| `DELETE` | `/api/annotations/bulk_delete/` | Bulk delete user's annotations |

### Filtering Parameters

- `study_uid` - Filter by DICOM Study Instance UID
- `image_id` - Filter by Cornerstone image ID
- `annotation_type` - Filter by annotation type
- `search` - Search in labels and descriptions
- `ordering` - Sort results (default: `-created_at`)

## Model Structure

### DicomAnnotation Model

```python
class DicomAnnotation(models.Model):
    # Core fields
    user = models.ForeignKey(settings.AUTH_USER_MODEL)
    
    # DICOM identifiers
    study_instance_uid = models.CharField(max_length=255)
    series_instance_uid = models.CharField(max_length=255)
    sop_instance_uid = models.CharField(max_length=255)
    image_id = models.TextField()  # Cornerstone image ID
    frame_number = models.IntegerField(default=1)
    
    # Annotation data
    annotation_type = models.CharField(choices=ANNOTATION_TYPES)
    annotation_data = models.JSONField()  # Cornerstone data
    label = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    
    # Measurements
    measurement_value = models.FloatField(null=True, blank=True)
    measurement_unit = models.CharField(max_length=20, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
```

### Supported Annotation Types

- `measurement` - General measurements
- `length` - Linear measurements
- `bidirectional` - Bidirectional measurements
- `angle` - Angle measurements
- `rectangle` - Rectangular regions
- `ellipse` - Elliptical regions
- `circle` - Circular regions
- `arrow` - Arrows and pointers
- `freehand` - Freehand drawings
- `polyline` - Multi-point lines
- `spline` - Spline curves
- `probe` - Point measurements

## Usage Examples

### Creating an Annotation

```python
# Example annotation data for auto-save
annotation_data = {
    'study_instance_uid': '1.2.826.0.1.3680043.8.498.12345',
    'series_instance_uid': '1.2.826.0.1.3680043.8.498.12346', 
    'sop_instance_uid': '1.2.826.0.1.3680043.8.498.12347',
    'image_id': 'wadouri:http://localhost:8042/wado?requestType=WADO&studyUID=...',
    'annotation_type': 'length',
    'annotation_data': {
        'handles': {
            'points': [[100, 100], [200, 200]],
            'activeHandleIndex': 0
        },
        'length': 141.42,
        'unit': 'mm'
    },
    'label': 'Femur Length',
    'measurement_value': 141.42,
    'measurement_unit': 'mm'
}

# POST to /api/annotations/
response = requests.post(
    'http://localhost:8000/api/annotations/',
    headers={'Authorization': f'Bearer {jwt_token}'},
    json=annotation_data
)
```

### Frontend Integration

```javascript
// Auto-save hook example
const useAnnotationAutoSave = (studyUid) => {
    const saveAnnotation = useCallback(async (annotationData) => {
        const response = await fetch('/api/annotations/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(annotationData)
        });
        return response.json();
    }, []);
    
    return { saveAnnotation };
};
```

## Database Schema

The annotations use the following indexes for optimal performance:

- `study_instance_uid` (for filtering by study)
- `user, created_at` (for user's recent annotations)
- `annotation_type` (for filtering by type)
- `study_instance_uid, image_id` (for study-image combinations)

## Security Features

### User Ownership Validation

```python
def can_delete(self, user):
    """Check if user can delete this annotation"""
    return self.user == user

def can_edit(self, user):
    """Check if user can edit this annotation"""
    return self.user == user
```

### Audit Trail Integration

All operations are automatically logged to `audit.models.AuditLog`:

- **CREATE**: When annotations are created
- **UPDATE**: When annotations are modified
- **DELETE**: When annotations are removed
- **API_POST/PUT/PATCH/DELETE**: API-level operations

Example audit log entry:
```python
AuditLog.log_action(
    user=request.user,
    action='CREATE',
    resource_type='DicomAnnotation',
    resource_id=str(annotation.pk),
    resource_name='length - Femur Measurement',
    new_data={...},
    ip_address='127.0.0.1',
    success=True
)
```

## Testing

Comprehensive test suite included:

- **Model Tests**: Test annotation creation, ownership, audit logging
- **API Tests**: Test all endpoints, permissions, serialization
- **Audit Tests**: Verify comprehensive logging

Run tests:
```bash
python manage.py test annotations -v 2
```

Test script for API validation:
```bash
python test_annotation_api.py
```

## Installation & Setup

1. **Add to INSTALLED_APPS**:
   ```python
   INSTALLED_APPS = [
       ...
       'annotations',  # DICOM annotations with auto-save
       ...
   ]
   ```

2. **Include URLs**:
   ```python
   urlpatterns = [
       ...
       path('api/', include('annotations.urls')),
       ...
   ]
   ```

3. **Run Migrations**:
   ```bash
   python manage.py migrate annotations
   ```

## Dependencies

- Django 4.2+
- Django REST Framework
- djangorestframework-simplejwt
- Existing audit system (`audit.models.AuditLog`)
- Existing user model (`staff.Staff`)

## Future Enhancements

- DICOM Structured Report (SR) export
- Annotation templates and presets
- Collaborative annotation workflows
- AI-powered annotation suggestions
- Voice-to-text annotation entry
- Mobile annotation support

## Performance Considerations

- Database indexes for efficient querying
- Pagination for large datasets
- Query optimization with `select_related`
- Debounced auto-save to reduce API calls
- JSON field validation for annotation data

## Integration with Frontend

This backend is designed to work seamlessly with the React/Next.js frontend in `/ris-frontend/`. The API provides:

- Consistent serialization formats
- Proper error handling
- User-friendly field names
- Permission flags for UI controls
- Optimized list vs detail serializers

The implementation follows the technical specifications from `@docs/annotation.md` and integrates smoothly with the existing codebase architecture.