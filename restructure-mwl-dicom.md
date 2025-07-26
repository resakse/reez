# RIS MWL/DICOM Restructuring Plan

## Overview

This document outlines the comprehensive plan to restructure the Radiology Information System (RIS) to support grouped examinations with parent-child relationships following DICOM MWL (Modality Worklist) standards. The goal is to enable multiple X-ray examinations under a single worklist entry while preserving individual Accession Numbers for tracking.

## Current System Analysis

### Current Models Structure
- **Daftar** (Study): Contains study-level information with basic MWL fields
- **Pemeriksaan** (Examination/Procedure): Individual procedures with auto-generated X-ray numbers (format: KKP2025XXXX)
- **Current X-ray numbering**: 4-digit format (KKP20250001)

### Current Limitations
1. No parent-child study hierarchy
2. Limited X-ray number format (only 4 digits)
3. Missing positioning information for examinations
4. No grouping mechanism for multi-part studies
5. Single procedure per worklist entry limitation

## DICOM MWL Standards Integration

### DICOM Hierarchy Structure
Based on DICOM standards, the workflow follows:
- **Requested Procedure** (Parent) → Study level
- **Scheduled Procedure Step** (Child) → Individual examination level
- **Accession Number**: Links parent to children (1-to-1 with Requested Procedure ID)
- **Study Instance UID**: Shared across all child procedures in same study

### Key DICOM Identifiers
- **Accession Number**: Hospital's unique identifier for the study
- **Requested Procedure ID**: Maps 1-to-1 with Accession Number
- **Scheduled Procedure Step ID**: Individual examination identifier
- **Study Instance UID**: DICOM study identifier (shared across grouped exams)

## Proposed New Model Structure

### 1. Study (Enhanced Daftar Model)
```python
class Study(models.Model):
    # Existing fields (renamed from Daftar)
    tarikh = models.DateTimeField(default=timezone.now)
    pesakit = auto_prefetch.ForeignKey(Pesakit, on_delete=models.CASCADE)
    rujukan = auto_prefetch.ForeignKey(Ward, on_delete=models.SET_NULL, null=True)
    
    # Enhanced MWL fields
    parent_accession_number = models.CharField(max_length=20, unique=True)  # KKP2025XR0000001
    study_instance_uid = models.CharField(max_length=64, unique=True)
    requested_procedure_id = models.CharField(max_length=20)  # Same as parent_accession_number
    study_description = models.CharField(max_length=200)  # e.g., "XR Series"
    modality = models.CharField(max_length=10)  # e.g., "CR", "DR"
    
    # Study-level metadata
    study_priority = models.CharField(max_length=10, choices=priority_choices, default='MEDIUM')
    scheduled_datetime = models.DateTimeField()
    requested_procedure_description = models.CharField(max_length=200)
    study_comments = models.TextField(blank=True, null=True)
    
    # Status tracking
    study_status = models.CharField(max_length=15, choices=[
        ('SCHEDULED', 'Scheduled'),
        ('IN_PROGRESS', 'In Progress'), 
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled')
    ], default='SCHEDULED')
```

### 2. Examination (Enhanced Pemeriksaan Model)
```python
class Examination(models.Model):
    # Parent study relationship
    study = auto_prefetch.ForeignKey(Study, on_delete=models.CASCADE, related_name='examinations')
    
    # Individual examination identifiers
    accession_number = models.CharField(max_length=20, unique=True)  # KKP202500000001
    scheduled_step_id = models.CharField(max_length=20)  # Maps to accession_number
    
    # Examination details
    exam = auto_prefetch.ForeignKey(Exam, on_delete=models.CASCADE)
    laterality = models.CharField(choices=lateral_choices, blank=True, null=True, max_length=10)
    
    # NEW: Position information
    patient_position = models.CharField(max_length=20, choices=[
        ('AP', 'Anterior-Posterior'),
        ('PA', 'Posterior-Anterior'), 
        ('LAT', 'Lateral'),
        ('LATERAL_LEFT', 'Left Lateral'),
        ('LATERAL_RIGHT', 'Right Lateral'),
        ('OBLIQUE', 'Oblique'),
    ], blank=True, null=True)
    
    body_position = models.CharField(max_length=20, choices=[
        ('ERECT', 'Erect/Standing'),
        ('SUPINE', 'Supine'),
        ('PRONE', 'Prone'),
        ('DECUBITUS_LEFT', 'Left Decubitus'),
        ('DECUBITUS_RIGHT', 'Right Decubitus'),
    ], blank=True, null=True)
    
    # Technical parameters
    kv = models.PositiveSmallIntegerField(verbose_name='kVp', blank=True, null=True)
    mas = models.PositiveSmallIntegerField(verbose_name='mAs', blank=True, null=True)
    mgy = models.PositiveSmallIntegerField(verbose_name='mGy', blank=True, null=True)
    
    # Status and metadata
    exam_status = models.CharField(max_length=15, choices=[
        ('SCHEDULED', 'Scheduled'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled')
    ], default='SCHEDULED')
    
    sequence_number = models.PositiveSmallIntegerField(default=1)  # Order within study
    
    jxr = auto_prefetch.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
```

## Phase-by-Phase Implementation Plan

### Phase 1: Database Schema Updates (Week 1-2)

#### 1.1 Update X-ray Number Format
- **Current**: KKP2025XXXX (4 digits)
- **New**: KKP202500000XXX (7 digits total)
- **Study Format**: KKP2025XR0000001 (Parent Accession)
- **Exam Format**: KKP202500000001 (Child Accession)

```python
def generate_study_accession():
    """Generate parent accession number for study"""
    year = timezone.now().year
    prefix = f"{settings.KLINIKSHORT}{year}"
    
    # Get modality shortcode (XR, CT, MR, etc.)
    modality_code = "XR"  # Will be dynamic based on study
    
    latest = Study.objects.filter(
        parent_accession_number__startswith=f"{prefix}{modality_code}"
    ).order_by('-parent_accession_number').first()
    
    if latest:
        last_number = int(latest.parent_accession_number[-7:])
        new_number = last_number + 1
    else:
        new_number = 1
    
    return f"{prefix}{modality_code}{str(new_number).zfill(7)}"

def generate_exam_accession():
    """Generate child accession number for individual examination"""
    year = timezone.now().year
    prefix = f"{settings.KLINIKSHORT}{year}"
    
    latest = Examination.objects.filter(
        accession_number__startswith=prefix,
        accession_number__regex=r'^\w+\d{4}00000\d{3}$'  # Match new format
    ).order_by('-accession_number').first()
    
    if latest:
        last_number = int(latest.accession_number[-10:])  # Last 10 digits
        new_number = last_number + 1
    else:
        new_number = 1
    
    return f"{prefix}{str(new_number).zfill(10)}"
```

#### 1.2 Database Migration Strategy
```python
# Migration 001: Rename Daftar to Study
class Migration(migrations.Migration):
    operations = [
        migrations.RenameModel(
            old_name='Daftar',
            new_name='Study',
        ),
        migrations.RenameModel(
            old_name='Pemeriksaan', 
            new_name='Examination',
        ),
    ]

# Migration 002: Add new fields to Study
class Migration(migrations.Migration):
    operations = [
        migrations.AddField(
            model_name='study',
            name='parent_accession_number',
            field=models.CharField(max_length=20, unique=True, null=True),
        ),
        migrations.AddField(
            model_name='study',
            name='requested_procedure_id',
            field=models.CharField(max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='study',
            name='study_description',
            field=models.CharField(max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='study',
            name='study_status',
            field=models.CharField(max_length=15, default='SCHEDULED'),
        ),
    ]

# Migration 003: Add new fields to Examination  
class Migration(migrations.Migration):
    operations = [
        migrations.RenameField(
            model_name='examination',
            old_name='no_xray',
            new_name='accession_number',
        ),
        migrations.AddField(
            model_name='examination',
            name='scheduled_step_id',
            field=models.CharField(max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='examination',
            name='patient_position',
            field=models.CharField(max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='examination',
            name='body_position', 
            field=models.CharField(max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='examination',
            name='exam_status',
            field=models.CharField(max_length=15, default='SCHEDULED'),
        ),
        migrations.AddField(
            model_name='examination',
            name='sequence_number',
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]

# Migration 004: Data migration to populate new accession numbers
def populate_new_accession_numbers(apps, schema_editor):
    Study = apps.get_model('exam', 'Study')
    Examination = apps.get_model('exam', 'Examination')
    
    for study in Study.objects.all():
        # Generate parent accession if not exists
        if not study.parent_accession_number:
            study.parent_accession_number = generate_study_accession()
            study.requested_procedure_id = study.parent_accession_number
            study.save()
        
        # Update child examinations
        for i, exam in enumerate(study.examinations.all(), 1):
            if not exam.accession_number or len(exam.accession_number) < 10:
                exam.accession_number = generate_exam_accession()
                exam.scheduled_step_id = exam.accession_number
                exam.sequence_number = i
                exam.save()
```

### Phase 2: Model Updates and Business Logic (Week 2-3)

#### 2.1 Update Model Relationships
- Rename `Daftar` → `Study`
- Rename `Pemeriksaan` → `Examination`
- Update foreign key relationships
- Add position fields for examinations

#### 2.2 Update Number Generation Logic
```python
# exam/models.py updates
class Study(auto_prefetch.Model):
    def save(self, *args, **kwargs):
        if not self.parent_accession_number:
            self.parent_accession_number = generate_study_accession()
            self.requested_procedure_id = self.parent_accession_number
            
        if not self.study_instance_uid:
            import uuid
            self.study_instance_uid = str(uuid.uuid4())
            
        super().save(*args, **kwargs)

class Examination(auto_prefetch.Model):
    def save(self, *args, **kwargs):
        if not self.accession_number:
            self.accession_number = generate_exam_accession()
            self.scheduled_step_id = self.accession_number
            
        super().save(*args, **kwargs)
```

### Phase 3: API Updates (Week 3-4)

#### 3.1 Update Serializers
```python
# exam/serializers.py updates
class StudySerializer(serializers.ModelSerializer):
    examinations = ExaminationSerializer(many=True, read_only=True)
    
    class Meta:
        model = Study
        fields = [
            'id', 'parent_accession_number', 'study_instance_uid',
            'study_description', 'modality', 'study_priority',
            'scheduled_datetime', 'study_status', 'examinations'
        ]

class ExaminationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Examination  
        fields = [
            'id', 'accession_number', 'scheduled_step_id',
            'patient_position', 'body_position', 'sequence_number',
            'exam_status'
        ]

class GroupedExaminationWorkflowSerializer(serializers.Serializer):
    """Serializer for creating grouped examinations under single study"""
    study_data = StudySerializer()
    examinations_data = serializers.ListField(
        child=ExaminationSerializer(),
        min_length=1
    )
    
    def create(self, validated_data):
        study_data = validated_data.pop('study_data')
        examinations_data = validated_data.pop('examinations_data')
        
        # Create parent study
        study = Study.objects.create(**study_data)
        
        # Create child examinations
        examinations = []
        for i, exam_data in enumerate(examinations_data, 1):
            exam_data['study'] = study
            exam_data['sequence_number'] = i
            examination = Examination.objects.create(**exam_data)
            examinations.append(examination)
            
        return {
            'study': study,
            'examinations': examinations
        }
```

#### 3.2 New API Endpoints
```python
# exam/views.py additions
@api_view(['POST'])
def create_grouped_examination(request):
    """Create study with multiple examinations"""
    serializer = GroupedExaminationWorkflowSerializer(data=request.data)
    if serializer.is_valid():
        result = serializer.save()
        return Response({
            'study': StudySerializer(result['study']).data,
            'examinations': ExaminationSerializer(result['examinations'], many=True).data
        })
    return Response(serializer.errors, status=400)

@api_view(['GET'])
def mwl_worklist_grouped(request):
    """MWL endpoint with grouped examination support"""
    studies = Study.objects.filter(study_status='SCHEDULED').prefetch_related('examinations')
    
    worklist = []
    for study in studies:
        # Create parent MWL entry
        parent_entry = {
            'accession_number': study.parent_accession_number,
            'study_instance_uid': study.study_instance_uid,
            'study_description': study.study_description,
            'modality': study.modality,
            'scheduled_datetime': study.scheduled_datetime,
            'patient': study.pesakit,
            'examinations': []
        }
        
        # Add child examinations
        for exam in study.examinations.all():
            child_entry = {
                'accession_number': exam.accession_number,
                'scheduled_step_id': exam.scheduled_step_id,
                'exam_description': exam.exam.exam,
                'patient_position': exam.patient_position,
                'body_position': exam.body_position,
                'sequence_number': exam.sequence_number
            }
            parent_entry['examinations'].append(child_entry)
            
        worklist.append(parent_entry)
    
    return Response(worklist)
```

### Phase 4: Frontend Updates (Week 4-5)

#### 4.1 Update Registration Workflow
- Modify examination registration to support grouped examinations
- Add position selection UI components
- Update MWL display to show parent-child relationships

#### 4.2 MWL Interface Updates
```typescript
// ris-frontend/src/types/mwl.ts
interface GroupedMWLEntry {
  study: {
    id: number;
    parent_accession_number: string;
    study_instance_uid: string;
    study_description: string;
    modality: string;
    scheduled_datetime: string;
    study_status: string;
  };
  patient: {
    nama: string;
    nric: string;
    jantina: string;
  };
  examinations: {
    accession_number: string;
    exam_description: string;
    patient_position?: string;
    body_position?: string;
    sequence_number: number;
    exam_status: string;
  }[];
}
```

### Phase 5: MWL Integration Testing (Week 5-6)

#### 5.1 CR Machine Integration
- Test parent accession number display on CR machine
- Verify child accession number application per image
- Validate DICOM study linking

#### 5.2 DICOM Output Validation
```python
# Expected DICOM output structure:
# Study Level:
# - StudyInstanceUID: shared across all images
# - StudyDescription: "XR Series"
# - AccessionNumber: KKP2025XR0000001 (parent)

# Series/Image Level:
# - AccessionNumber: KKP202500000001 (child - for chest)
# - AccessionNumber: KKP202500000002 (child - for wrist)  
# - AccessionNumber: KKP202500000003 (child - for shoulder)
```

## Implementation Considerations

### Data Migration Safety
1. **Backup Strategy**: Full database backup before migration
2. **Gradual Migration**: Phase rollout with rollback capability
3. **Data Validation**: Verify accession number uniqueness and format
4. **Testing Environment**: Complete testing on staging before production

### Performance Optimizations
1. **Database Indexing**: Add indexes on new accession number fields
2. **Query Optimization**: Use select_related/prefetch_related for grouped queries
3. **Caching**: Implement caching for frequently accessed MWL data

### Backwards Compatibility
1. **API Versioning**: Maintain old API endpoints during transition
2. **Legacy Support**: Support old X-ray number format during migration period
3. **Gradual Deprecation**: Phase out old endpoints after successful migration

## Testing Strategy

### Unit Tests
- Test accession number generation logic
- Validate parent-child relationship creation
- Test position field constraints

### Integration Tests  
- Test complete grouped examination workflow
- Validate MWL API responses
- Test CR machine integration

### Performance Tests
- Test database performance with new schema
- Validate API response times with grouped data
- Test concurrent accession number generation

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1-2 | Database schema updates, migrations |
| Phase 2 | Week 2-3 | Model updates, business logic |
| Phase 3 | Week 3-4 | API updates, serializers |
| Phase 4 | Week 4-5 | Frontend updates |
| Phase 5 | Week 5-6 | Integration testing |

**Total Estimated Timeline: 6 weeks**

## Success Criteria

1. ✅ Single worklist entry displays multiple examinations
2. ✅ Individual accession numbers preserved for tracking
3. ✅ CR machine shows grouped studies correctly
4. ✅ DICOM output maintains proper hierarchy
5. ✅ All existing functionality remains intact
6. ✅ Performance maintained or improved
7. ✅ Position information properly captured and stored

## Risk Mitigation

### High Risk Areas
1. **Data Migration**: Potential data loss during schema changes
2. **CR Integration**: Hardware compatibility issues
3. **Performance**: Slow queries with new relationships

### Mitigation Strategies
1. **Comprehensive Testing**: Extensive testing in staging environment
2. **Rollback Plans**: Ability to revert to previous schema
3. **Monitoring**: Real-time monitoring during migration
4. **Training**: Staff training on new workflows

This restructuring plan provides a comprehensive approach to implementing parent-child study relationships while maintaining DICOM compliance and system performance.