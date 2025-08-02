# CD/Film Distribution Tracking System

## Overview

This document outlines the comprehensive plan for implementing a CD/Film distribution tracking system for the Radiology Information System (RIS). The system tracks when patients or referral hospitals request copies of their radiological studies on physical media (CD, DVD, X-ray films) or digital formats.

## Business Requirements

Sometimes doctors will send patients to refer to specialists in other hospitals, or patients themselves want copies of their examination results. The system needs to track:

1. **Request Details**: Date, time, and study information
2. **Media Information**: Type and quantity of CD/X-ray films used
3. **Status Tracking**: Preparation and collection status
4. **Collection Details**: Who collected the media and when
5. **Audit Trail**: Complete tracking from request to handover

## Database Model Design

### MediaDistribution Model

```python
class MediaDistribution(models.Model):
    MEDIA_TYPE_CHOICES = [
        ('CD', 'CD'),
        ('DVD', 'DVD'),
        ('XRAY_FILM', 'X-Ray Film'),
        ('USB', 'USB Drive'),
        ('DIGITAL_COPY', 'Digital Copy'),
    ]
    
    STATUS_CHOICES = [
        ('REQUESTED', 'Requested'),
        ('PREPARING', 'Preparing'),
        ('READY', 'Ready for Collection'),
        ('COLLECTED', 'Collected'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    # Core fields
    request_date = models.DateTimeField(default=timezone.now)
    daftar = models.ForeignKey(Daftar, on_delete=models.CASCADE, related_name='media_distributions')
    
    # Media details
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPE_CHOICES)
    quantity = models.PositiveIntegerField(default=1, help_text="Number of CDs/films")
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='REQUESTED')
    
    # Collection details
    collected_by = models.CharField(max_length=100, blank=True, null=True, help_text="Name of person collecting")
    collected_by_ic = models.CharField(max_length=25, blank=True, null=True, help_text="IC of collector")
    relationship_to_patient = models.CharField(max_length=50, blank=True, null=True, help_text="Relationship to patient")
    collection_datetime = models.DateTimeField(blank=True, null=True)
    
    # Staff handling
    prepared_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='prepared_media')
    handed_over_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='handed_media')
    
    # Additional details
    comments = models.TextField(blank=True, null=True, help_text="Special instructions or notes")
    urgency = models.CharField(max_length=20, choices=[
        ('NORMAL', 'Normal'),
        ('URGENT', 'Urgent'),
        ('STAT', 'STAT'),
    ], default='NORMAL')
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Media Distribution"
        verbose_name_plural = "Media Distributions"
        ordering = ['-request_date']
    
    def __str__(self):
        return f"{self.daftar.pesakit.nama} - {self.media_type} ({self.status})"
```

## Database Relationships

### Primary Relationships
- **MediaDistribution → Daftar (ForeignKey)**: Links to the radiology study
- **MediaDistribution → User (prepared_by, handed_over_by)**: Staff tracking
- **Through Daftar → Pesakit**: Patient information access
- **Through Daftar → Pemeriksaan**: Individual exam details

### Key Benefits
- One distribution record can cover multiple examinations within a study
- Flexible media types (CD, DVD, films, USB, digital)
- Complete audit trail of who prepared and handed over media
- Status tracking from request to collection

## Implementation Plan

### Phase 1: Backend Implementation ✅ COMPLETED
1. **Model Creation**: ✅ Added `MediaDistribution` to `exam/models.py`
2. **Database Migration**: ✅ Created and applied migration `0024_mediadistribution.py`
3. **Django Admin**: ✅ Configured admin interface with fieldsets, search, and filters
4. **DRF Serializers**: ✅ Created comprehensive API serializers for frontend integration

### Phase 2: API Development ✅ COMPLETED
1. **ViewSets**: ✅ Full CRUD operations via `MediaDistributionViewSet`
2. **Filtering**: ✅ By patient, date range, status, media type, urgency
3. **Search**: ✅ By patient name, MRN, collector details, comments
4. **Custom Actions**: ✅ Mark ready, collect, cancel, pending/ready lists, statistics

### Phase 3: Frontend Development ⏳ PENDING
1. **Media Request Page**: Create new distribution requests
2. **Distribution List**: View and manage all distributions
3. **Collection Interface**: Record collection details
4. **Status Dashboard**: Overview of pending/ready items

## Implementation Status

### ✅ Completed Features

#### Backend Model
- **MediaDistribution Model**: Complete with all required fields
- **Relationships**: Properly linked to Daftar (study) and User (staff)
- **Choices**: Media types, status workflow, urgency levels
- **Validation**: Collection requirements, status transitions

#### Database
- **Migration Applied**: `exam.0024_mediadistribution`
- **Indexes**: Optimized for common queries (status, date, patient)
- **Constraints**: Data integrity enforced at database level

#### Admin Interface
- **List View**: Shows key information with filtering and search
- **Detail View**: Organized fieldsets for easy data entry
- **Search**: By patient name, MRN, collector information
- **Filters**: Status, media type, urgency, request date

#### API Implementation
- **REST Endpoints**: Full MediaDistribution CRUD via `/api/media-distributions/`
- **Custom Actions**: 
  - `POST /api/media-distributions/{id}/collect/` - Record collection
  - `PATCH /api/media-distributions/{id}/mark-ready/` - Mark as ready
  - `PATCH /api/media-distributions/{id}/cancel/` - Cancel request
  - `GET /api/media-distributions/pending/` - Get pending items
  - `GET /api/media-distributions/ready/` - Get ready items
  - `GET /api/media-distributions/stats/` - Get statistics
- **Serializers**: 
  - `MediaDistributionSerializer` - Full details
  - `MediaDistributionListSerializer` - List view optimization
  - `MediaDistributionCollectionSerializer` - Collection workflow
- **Filtering**: By status, media type, urgency, patient, date ranges
- **Search**: Patient names, MRN, collector details
- **Permissions**: Authenticated users only

## Key Features

### Request Management
- Link to existing studies (Daftar records)
- Select media type and quantity
- Set urgency level
- Add special instructions

### Status Tracking
- **REQUESTED**: Initial request logged
- **PREPARING**: Staff preparing the media
- **READY**: Media ready for collection
- **COLLECTED**: Media collected with full details
- **CANCELLED**: Request cancelled

### Collection Process
- Record collector's name and IC
- Verify relationship to patient
- Staff signature (digital record)
- Timestamp of collection

### Reporting & Analytics
- Daily collection reports
- Media usage statistics
- Turnaround time analysis
- Pending items dashboard

## Workflow Integration

### From Examination to Distribution
1. Patient completes radiology examination
2. Request for CD/film can be made:
   - During registration (proactive)
   - After examination (reactive)
   - By referral request from external hospitals

### Staff Workflow
1. **Radiographer**: Prepares media from PACS
2. **Reception**: Handles collection and verification
3. **Admin**: Monitors pending requests and statistics

## Technical Considerations

### Database Indexing
- Index on `daftar_id`, `status`, `request_date`
- Composite index on `status` + `request_date` for dashboards

### Data Validation
- Ensure collector IC matches format
- Validate relationship types
- Prevent duplicate active requests

### Security & Audit
- Full audit trail of all status changes
- User permissions for different operations
- Patient data privacy compliance

## User Interface Design

### Request Form
- Patient search and selection
- Study/examination picker
- Media type and quantity
- Urgency and comments

### Management Dashboard
- Status-based tabs (Requested, Preparing, Ready, Collected)
- Quick actions (Mark Ready, Record Collection)
- Filters by date, patient, media type

### Collection Interface
- Barcode/QR scanning for quick lookup
- Collector information capture
- Digital signature capability
- Print receipt option

## Migration Strategy

Since this is a new feature:
1. **No data migration needed**
2. **Gradual rollout**: Start with CD requests only
3. **Training**: Staff training on new workflow
4. **Feedback loop**: Iterative improvements based on usage

## API Endpoints

### ✅ Implemented REST Endpoints
```
GET    /api/media-distributions/           # List all distributions
POST   /api/media-distributions/           # Create new request
GET    /api/media-distributions/{id}/      # Get specific distribution
PUT    /api/media-distributions/{id}/      # Update distribution
DELETE /api/media-distributions/{id}/      # Delete distribution

# Custom Actions
GET    /api/media-distributions/pending/   # Get pending collections
GET    /api/media-distributions/ready/     # Get ready for collection
GET    /api/media-distributions/stats/     # Get statistics
POST   /api/media-distributions/{id}/collect/     # Record collection
PATCH  /api/media-distributions/{id}/mark-ready/  # Mark as ready
PATCH  /api/media-distributions/{id}/cancel/      # Cancel request

# Query Parameters
?status=REQUESTED,PREPARING,READY,COLLECTED,CANCELLED  # Filter by status
?media_type=CD,DVD,XRAY_FILM,USB,DIGITAL_COPY         # Filter by media type
?urgency=NORMAL,URGENT,STAT                           # Filter by urgency
?patient_id={id}                                      # Filter by patient
?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD              # Date range filter
?search={query}                                       # Search patients/collectors
```

### Frontend Routes
```
/media-distributions/                      # Main dashboard
/media-distributions/request/              # New request form
/media-distributions/collect/{id}/         # Collection interface
/media-distributions/reports/              # Reports and analytics
```

## Success Metrics

- **Operational**: Reduce media preparation time by 30%
- **Accuracy**: 100% audit trail for all distributed media
- **User Satisfaction**: Staff feedback on workflow efficiency
- **Compliance**: Full patient data access tracking

This system provides a complete solution for tracking CD/film distribution from request to collection, with full audit trails and integration into the existing RIS workflow.

## Next Steps

### Phase 3: Frontend Development (Ready to Start)
The backend implementation is complete and ready for frontend development. The Next.js frontend should implement:

1. **Media Request Form** (`/media-distributions/request/`)
   - Patient search and selection (reuse existing patient components)
   - Study/examination picker with related data
   - Media type and quantity selection
   - Urgency and comments fields

2. **Distribution Management Dashboard** (`/media-distributions/`)
   - Status-based tabs (Requested, Preparing, Ready, Collected)
   - List view with search and filtering
   - Quick actions (Mark Ready, Record Collection, Cancel)
   - Bulk operations for multiple items

3. **Collection Interface** (`/media-distributions/collect/{id}/`)
   - Collector information form
   - IC validation and relationship capture
   - Digital signature/confirmation
   - Print receipt capability

4. **Statistics Dashboard** (`/media-distributions/reports/`)
   - Charts showing distribution trends
   - Media usage statistics
   - Turnaround time analysis
   - Staff productivity metrics

### Testing the API
The API is ready for testing. You can:
1. Create distributions via Django admin or API
2. Test workflow transitions (Request → Preparing → Ready → Collected)
3. Validate filtering and search functionality
4. Verify statistics endpoints

### Database Ready
The database schema supports:
- Complete audit trail from request to collection
- Flexible media types and status workflows
- Staff tracking for accountability
- Patient privacy and relationship verification