from rest_framework import serializers
from .models import (
    Modaliti, Part, Exam, Daftar, Pemeriksaan, PacsConfig, PacsServer, MediaDistribution,
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident, RejectAnalysisTargetSettings,
    AIGeneratedReport, RadiologistReport, ReportCollaboration, AIModelPerformance, AIConfiguration
)
from pesakit.models import Pesakit
from wad.models import Ward
from pesakit.serializers import PesakitSerializer
from wad.serializers import WardSerializer
from staff.serializers import UserSerializer
from django.contrib.auth import get_user_model
from decimal import Decimal

User = get_user_model()

class ModalitiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Modaliti
        fields = ['id', 'nama', 'singkatan', 'detail']

class PartSerializer(serializers.ModelSerializer):
    class Meta:
        model = Part
        fields = ['id', 'part']

class ExamSerializer(serializers.ModelSerializer):
    modaliti = ModalitiSerializer(read_only=True)
    modaliti_id = serializers.PrimaryKeyRelatedField(
        queryset=Modaliti.objects.all(),
        source='modaliti',
        write_only=True
    )
    part = PartSerializer(read_only=True)
    part_id = serializers.PrimaryKeyRelatedField(
        queryset=Part.objects.all(),
        source='part',
        write_only=True,
        allow_null=True
    )

    class Meta:
        model = Exam
        fields = [
            'id', 'exam', 'part', 'part_id', 'modaliti', 'modaliti_id',
            'catatan', 'short_desc', 'contrast', 'status_ca'
        ]

class PemeriksaanSerializer(serializers.ModelSerializer):
    exam = ExamSerializer(read_only=True)
    exam_id = serializers.PrimaryKeyRelatedField(
        queryset=Exam.objects.all(),
        source='exam',
        write_only=True
    )
    daftar_id = serializers.IntegerField(write_only=True)
    daftar_info = serializers.SerializerMethodField()
    jxr = UserSerializer(read_only=True)
    jxr_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='jxr',
        write_only=True,
        allow_null=True,
        required=False
    )
    jxr_info = serializers.SerializerMethodField()

    class Meta:
        model = Pemeriksaan
        fields = [
            'id', 'accession_number', 'no_xray', 'scheduled_step_id', 'exam', 'exam_id', 
            'laterality', 'patient_position', 'body_position', 'kv', 'mas', 'mgy',
            'catatan', 'exam_status', 'sequence_number', 'jxr', 'jxr_id', 'jxr_info', 
            'created', 'modified', 'daftar_id', 'daftar_info',
            # DICOM Content Date/Time fields
            'content_date', 'content_time', 'content_datetime', 'content_datetime_source'
        ]
        read_only_fields = ['accession_number', 'no_xray', 'scheduled_step_id', 'created', 'modified', 'jxr_info', 'content_date', 'content_time', 'content_datetime', 'content_datetime_source']

    def get_daftar_info(self, obj):
        from staff.serializers import UserSerializer
        jxr_data = None
        if obj.daftar.jxr:
            jxr_data = {
                'id': obj.daftar.jxr.id,
                'username': obj.daftar.jxr.username,
                'first_name': obj.daftar.jxr.first_name,
                'last_name': obj.daftar.jxr.last_name
            }
        
        rujukan_data = None
        if obj.daftar.rujukan:
            rujukan_data = {
                'id': obj.daftar.rujukan.id,
                'wad': obj.daftar.rujukan.wad
            }
        
        return {
            'id': obj.daftar.id,
            'tarikh': obj.daftar.tarikh,
            'no_resit': obj.daftar.no_resit,
            'accession_number': obj.daftar.accession_number,
            'study_instance_uid': obj.daftar.study_instance_uid,
            'pemohon': obj.daftar.pemohon,
            'ambulatori': obj.daftar.ambulatori,
            'lmp': obj.daftar.lmp,
            'rujukan': rujukan_data,
            'jxr': jxr_data,
            'pesakit': {
                'id': obj.daftar.pesakit.id,
                'nama': obj.daftar.pesakit.nama,
                'nric': obj.daftar.pesakit.nric,
                'jantina': obj.daftar.pesakit.jantina
            }
        }

    def get_jxr_info(self, obj):
        if obj.jxr:
            return {
                'id': obj.jxr.id,
                'username': obj.jxr.username,
                'first_name': obj.jxr.first_name,
                'last_name': obj.jxr.last_name
            }
        return None

    def create(self, validated_data):
        daftar_id = validated_data.pop('daftar_id')
        daftar = Daftar.objects.get(id=daftar_id)
        pemeriksaan = Pemeriksaan.objects.create(daftar=daftar, **validated_data)
        return pemeriksaan

class DaftarSerializer(serializers.ModelSerializer):
    pesakit = PesakitSerializer(read_only=True)
    pesakit_id = serializers.PrimaryKeyRelatedField(
        queryset=Pesakit.objects.all(),
        source='pesakit',
        write_only=True
    )
    rujukan = WardSerializer(read_only=True)
    rujukan_id = serializers.PrimaryKeyRelatedField(
        queryset=Ward.objects.all(),
        source='rujukan',
        write_only=True,
        allow_null=True
    )
    pemeriksaan = PemeriksaanSerializer(many=True, read_only=True)
    jxr = UserSerializer(read_only=True)

    class Meta:
        model = Daftar
        fields = [
            'id', 'tarikh', 'pesakit', 'pesakit_id', 'no_resit', 'lmp', 'rujukan',
            'rujukan_id', 'ambulatori', 'pemohon', 'status', 'hamil',
            'jxr', 'created', 'modified', 'pemeriksaan',
            # Parent-Child Study Hierarchy
            'parent_accession_number', 'requested_procedure_id', 'study_description', 'study_status',
            # MWL Integration fields
            'study_instance_uid', 'accession_number', 'scheduled_datetime',
            'study_priority', 'requested_procedure_description', 'study_comments',
            'patient_position', 'modality'
        ]
        read_only_fields = ['tarikh', 'created', 'modified', 'jxr', 'study_instance_uid', 'parent_accession_number', 'requested_procedure_id']

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['jxr'] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance

class GroupedExaminationSerializer(serializers.Serializer):
    """
    Serializer for creating grouped examinations under a single study
    """
    # Study data
    study_description = serializers.CharField(max_length=200, required=False)
    modality = serializers.CharField(max_length=10)
    study_priority = serializers.ChoiceField(
        choices=[
            ('STAT', 'STAT'),
            ('HIGH', 'High'),
            ('MEDIUM', 'Medium'),
            ('LOW', 'Low'),
        ], default='MEDIUM'
    )
    scheduled_datetime = serializers.DateTimeField(required=False)
    study_comments = serializers.CharField(required=False, allow_blank=True)
    
    # Patient and study metadata
    pesakit_id = serializers.IntegerField()
    rujukan_id = serializers.IntegerField(required=False, allow_null=True)
    pemohon = serializers.CharField(max_length=30, required=False, allow_blank=True)
    no_resit = serializers.CharField(max_length=50, required=False, allow_blank=True)
    lmp = serializers.DateField(required=False, allow_null=True)
    ambulatori = serializers.CharField(max_length=15, required=False)
    hamil = serializers.BooleanField(default=False)
    
    # Multiple examinations
    examinations = serializers.ListField(
        child=serializers.JSONField(),
        min_length=1,
        help_text="List of examination data objects"
    )
    
    def validate_examinations(self, value):
        """Validate examination data structure"""
        required_fields = ['exam_id']
        for i, exam in enumerate(value):
            for field in required_fields:
                if field not in exam:
                    raise serializers.ValidationError(
                        f"Examination {i+1} missing required field: {field}"
                    )
        return value
    
    def create(self, validated_data):
        examinations_data = validated_data.pop('examinations')
        
        # Create the study
        study = Daftar.objects.create(**validated_data)
        
        # Create examinations
        examinations = []
        for i, exam_data in enumerate(examinations_data, 1):
            exam_data['daftar'] = study
            exam_data['sequence_number'] = i
            
            # Set jxr from request context if available
            request = self.context.get('request')
            if request and hasattr(request, 'user') and not exam_data.get('jxr'):
                exam_data['jxr'] = request.user
            
            examination = Pemeriksaan.objects.create(**exam_data)
            examinations.append(examination)
        
        return {
            'study': study,
            'examinations': examinations
        }


class RegistrationWorkflowSerializer(serializers.Serializer):
    """
    Serializer for complete registration workflow combining patient, registration, and examination data
    """
    # Patient data
    patient_data = PesakitSerializer()
    
    # Registration data
    registration_data = serializers.JSONField()
    
    # Examination data (multiple exams)
    examinations_data = serializers.ListField(
        child=serializers.JSONField(),
        required=False,
        allow_empty=True
    )

    def create(self, validated_data):
        # Check for existing patient or create new one
        patient_data = validated_data.pop('patient_data')
        
        # Try to find existing patient by NRIC or MRN
        existing_patient = None
        if patient_data.get('nric'):
            existing_patient = Pesakit.objects.filter(nric=patient_data['nric']).first()
        elif patient_data.get('mrn'):
            existing_patient = Pesakit.objects.filter(mrn=patient_data['mrn']).first()
        
        if existing_patient:
            # Update existing patient with new data
            for key, value in patient_data.items():
                setattr(existing_patient, key, value)
            existing_patient.save()
            patient = existing_patient
        else:
            # Create new patient
            patient_serializer = PesakitSerializer(data=patient_data)
            patient_serializer.is_valid(raise_exception=True)
            patient = patient_serializer.save()

        # Create registration
        registration_data = validated_data.pop('registration_data')
        registration_data['pesakit'] = patient.id
        registration_serializer = DaftarSerializer(data=registration_data, context=self.context)
        registration_serializer.is_valid(raise_exception=True)
        registration = registration_serializer.save()

        # Create examinations if provided
        examinations = []
        if 'examinations_data' in validated_data:
            for exam_data in validated_data['examinations_data']:
                exam_data['daftar_id'] = registration.id
                exam_serializer = PemeriksaanSerializer(data=exam_data)
                exam_serializer.is_valid(raise_exception=True)
                examination = exam_serializer.save()
                examinations.append(examination)

        return {
            'patient': patient,
            'registration': registration,
            'examinations': examinations
        }

class GroupedMWLWorklistSerializer(serializers.ModelSerializer):
    """
    Enhanced MWL serializer for grouped examinations with parent-child structure
    """
    patient_name = serializers.CharField(source='pesakit.nama', read_only=True)
    patient_id = serializers.CharField(source='pesakit.nric', read_only=True)
    patient_birth_date = serializers.CharField(source='pesakit.t_lahir', read_only=True)
    patient_gender = serializers.CharField(source='pesakit.jantina', read_only=True)
    referring_physician = serializers.CharField(source='pemohon', read_only=True)
    
    # Parent study information
    parent_accession_number = serializers.CharField(read_only=True)
    study_description = serializers.CharField(read_only=True)
    study_instance_uid = serializers.CharField(read_only=True)
    study_status = serializers.CharField(read_only=True)
    study_priority = serializers.CharField(read_only=True)
    
    # Child examinations
    examinations = serializers.SerializerMethodField()
    
    class Meta:
        model = Daftar
        fields = [
            'id', 'patient_name', 'patient_id', 'patient_birth_date', 'patient_gender',
            'parent_accession_number', 'study_description', 'study_instance_uid', 
            'study_status', 'study_priority', 'tarikh', 'referring_physician',
            'scheduled_datetime', 'modality', 'examinations'
        ]
    
    def get_examinations(self, obj):
        """Get all child examinations for this study"""
        examinations = obj.pemeriksaan.all().order_by('sequence_number')
        return [{
            'accession_number': exam.accession_number,
            'scheduled_step_id': exam.scheduled_step_id,
            'exam_description': exam.exam.exam,
            'exam_short_desc': exam.exam.short_desc,
            'body_part': exam.exam.part.part if exam.exam.part else None,
            'patient_position': exam.patient_position,
            'body_position': exam.body_position,
            'laterality': exam.laterality,
            'sequence_number': exam.sequence_number,
            'exam_status': exam.exam_status,
            'catatan': exam.catatan
        } for exam in examinations]


class MWLWorklistSerializer(serializers.ModelSerializer):
    """
    Legacy MWL serializer for backward compatibility
    """
    patient_name = serializers.CharField(source='pesakit.nama', read_only=True)
    patient_id = serializers.CharField(source='pesakit.nric', read_only=True)
    patient_birth_date = serializers.CharField(source='pesakit.t_lahir', read_only=True)
    patient_gender = serializers.CharField(source='pesakit.jantina', read_only=True)
    study_description = serializers.CharField(source='study_description', read_only=True)
    accession_number = serializers.CharField(source='parent_accession_number', read_only=True)
    study_date = serializers.DateTimeField(source='tarikh', read_only=True)
    referring_physician = serializers.CharField(source='pemohon', read_only=True)
    study_instance_uid = serializers.CharField(read_only=True)

    class Meta:
        model = Daftar
        fields = [
            'id', 'patient_name', 'patient_id', 'patient_birth_date', 'patient_gender',
            'study_description', 'accession_number', 'study_date', 'referring_physician',
            'study_instance_uid', 'study_status'
        ]

class PositionChoicesSerializer(serializers.Serializer):
    """
    Serializer for position choices used in examinations
    """
    patient_positions = serializers.SerializerMethodField()
    body_positions = serializers.SerializerMethodField()
    laterality_choices = serializers.SerializerMethodField()
    
    def get_patient_positions(self, obj):
        return [
            {'value': 'AP', 'label': 'Anterior-Posterior'},
            {'value': 'PA', 'label': 'Posterior-Anterior'},
            {'value': 'LAT', 'label': 'Lateral'},
            {'value': 'LATERAL_LEFT', 'label': 'Left Lateral'},
            {'value': 'LATERAL_RIGHT', 'label': 'Right Lateral'},
            {'value': 'OBLIQUE', 'label': 'Oblique'},
        ]
    
    def get_body_positions(self, obj):
        return [
            {'value': 'ERECT', 'label': 'Erect/Standing'},
            {'value': 'SUPINE', 'label': 'Supine'},
            {'value': 'PRONE', 'label': 'Prone'},
            {'value': 'DECUBITUS_LEFT', 'label': 'Left Decubitus'},
            {'value': 'DECUBITUS_RIGHT', 'label': 'Right Decubitus'},
        ]
    
    def get_laterality_choices(self, obj):
        return [
            {'value': 'Kiri', 'label': 'Kiri'},
            {'value': 'Kanan', 'label': 'Kanan'},
        ]


class PacsConfigSerializer(serializers.ModelSerializer):
    endpoint_style_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = PacsConfig
        fields = ['id', 'orthancurl', 'viewrurl', 'endpoint_style', 'endpoint_style_choices', 'created', 'modified']
        read_only_fields = ['created', 'modified', 'endpoint_style_choices']
    
    def get_endpoint_style_choices(self, obj):
        """Return the available endpoint style choices for the frontend"""
        return [
            {'value': choice[0], 'label': choice[1]} 
            for choice in PacsConfig.ENDPOINT_STYLE_CHOICES
        ]


class PacsServerSerializer(serializers.ModelSerializer):
    endpoint_style_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = PacsServer
        fields = ['id', 'name', 'orthancurl', 'viewrurl', 'endpoint_style', 
                 'is_active', 'is_primary', 'include_in_reject_analysis', 'comments', 
                 'endpoint_style_choices', 'created', 'modified']
        read_only_fields = ['created', 'modified', 'endpoint_style_choices']
    
    def get_endpoint_style_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} 
                for choice in PacsServer.ENDPOINT_STYLE_CHOICES]
    
    def validate(self, data):
        """Ensure at least one PACS server remains active"""
        if not data.get('is_active', True):
            active_count = PacsServer.objects.filter(
                is_active=True, 
                is_deleted=False
            ).exclude(pk=self.instance.pk if self.instance else None).count()
            
            if active_count == 0:
                raise serializers.ValidationError("At least one PACS server must remain active.")
        return data


class PacsServerListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing PACS servers"""
    class Meta:
        model = PacsServer
        fields = ['id', 'name', 'orthancurl', 'is_active', 'is_primary', 'include_in_reject_analysis', 'comments']


class MediaDistributionSerializer(serializers.ModelSerializer):
    # Support both legacy single study and new multiple studies
    daftar = DaftarSerializer(read_only=True)
    daftar_id = serializers.PrimaryKeyRelatedField(
        queryset=Daftar.objects.all(),
        source='daftar',
        write_only=True,
        required=False,
        allow_null=True
    )
    
    # New multiple studies support
    studies = DaftarSerializer(many=True, read_only=True)
    study_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="List of study IDs to include in this distribution"
    )
    
    # Legacy support for old API format
    daftar_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="DEPRECATED: Use study_ids instead"
    )
    
    prepared_by = UserSerializer(read_only=True)
    prepared_by_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='prepared_by',
        write_only=True,
        allow_null=True,
        required=False
    )
    handed_over_by = UserSerializer(read_only=True)
    handed_over_by_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='handed_over_by',
        write_only=True,
        allow_null=True,
        required=False
    )
    
    # Choice fields for frontend
    media_type_choices = serializers.SerializerMethodField()
    status_choices = serializers.SerializerMethodField()
    urgency_choices = serializers.SerializerMethodField()
    
    # Patient info (from primary patient or legacy daftar)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    patient_nric = serializers.SerializerMethodField()
    study_count = serializers.ReadOnlyField()
    
    class Meta:
        model = MediaDistribution
        fields = [
            'id', 'request_date', 'daftar', 'daftar_id', 'studies', 'study_ids', 'daftar_ids',
            'media_type', 'quantity', 'status', 'urgency',
            'collected_by', 'collected_by_ic', 'relationship_to_patient', 'collection_datetime',
            'prepared_by', 'prepared_by_id', 'handed_over_by', 'handed_over_by_id',
            'comments', 'cancellation_reason', 'created', 'modified',
            # Choice fields
            'media_type_choices', 'status_choices', 'urgency_choices',
            # Patient info
            'patient_name', 'patient_mrn', 'patient_nric', 'study_count'
        ]
        read_only_fields = ['created', 'modified', 'patient_name', 'patient_mrn', 'patient_nric', 'study_count']
    
    def get_patient_name(self, obj):
        if obj.primary_patient:
            return obj.primary_patient.nama
        elif obj.daftar:
            return obj.daftar.pesakit.nama
        return "Unknown Patient"
    
    def get_patient_mrn(self, obj):
        if obj.primary_patient:
            return obj.primary_patient.mrn
        elif obj.daftar:
            return obj.daftar.pesakit.mrn
        return None
    
    def get_patient_nric(self, obj):
        if obj.primary_patient:
            return obj.primary_patient.nric
        elif obj.daftar:
            return obj.daftar.pesakit.nric
        return None
    
    def create(self, validated_data):
        # Handle multiple study IDs
        study_ids = validated_data.pop('study_ids', None)
        daftar_ids = validated_data.pop('daftar_ids', None)  # Legacy support
        
        # Use daftar_ids if study_ids not provided (backward compatibility)
        if not study_ids and daftar_ids:
            study_ids = daftar_ids
        
        # Handle single daftar_id (legacy)
        single_daftar = validated_data.pop('daftar', None)
        
        # Create the distribution
        distribution = MediaDistribution.objects.create(**validated_data)
        
        # Handle studies
        if study_ids:
            studies = Daftar.objects.filter(id__in=study_ids)
            if not studies.exists():
                raise serializers.ValidationError("No valid studies found with provided IDs")
            
            # Set primary patient from first study
            first_study = studies.first()
            distribution.primary_patient = first_study.pesakit
            distribution.save()
            
            # Add all studies
            distribution.studies.set(studies)
            
        elif single_daftar:
            # Legacy single study support
            distribution.daftar = single_daftar
            distribution.primary_patient = single_daftar.pesakit
            distribution.save()
            distribution.studies.add(single_daftar)
        else:
            raise serializers.ValidationError("Either study_ids or daftar_id must be provided")
        
        return distribution
    
    def get_media_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in MediaDistribution.MEDIA_TYPE_CHOICES]
    
    def get_status_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in MediaDistribution.STATUS_CHOICES]
    
    def get_urgency_choices(self, obj):
        return [
            {'value': 'NORMAL', 'label': 'Normal'},
            {'value': 'URGENT', 'label': 'Urgent'},
            {'value': 'STAT', 'label': 'STAT'},
        ]


class MediaDistributionListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing media distributions"""
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    study_count = serializers.ReadOnlyField()
    study_summary = serializers.SerializerMethodField()  # Summary of studies
    prepared_by_name = serializers.SerializerMethodField()
    handed_over_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = MediaDistribution
        fields = [
            'id', 'request_date', 'media_type', 'quantity', 'status', 'urgency',
            'collected_by', 'collected_by_ic', 'relationship_to_patient', 'collection_datetime', 
            'patient_name', 'patient_mrn', 'study_count', 'study_summary', 
            'prepared_by_name', 'handed_over_by_name', 'cancellation_reason', 'comments'
        ]
    
    def get_patient_name(self, obj):
        if obj.primary_patient:
            return obj.primary_patient.nama
        elif obj.daftar:
            return obj.daftar.pesakit.nama
        return "Unknown Patient"
    
    def get_patient_mrn(self, obj):
        if obj.primary_patient:
            return obj.primary_patient.mrn
        elif obj.daftar:
            return obj.daftar.pesakit.mrn
        return None
    
    def get_study_summary(self, obj):
        """Get a summary of all studies in this distribution"""
        studies = obj.studies.all()
        
        if studies.exists():
            # Get the date range of studies
            study_dates = [study.tarikh for study in studies]
            earliest_date = min(study_dates)
            latest_date = max(study_dates)
            
            # Format date range
            if earliest_date == latest_date:
                date_text = earliest_date.strftime('%Y-%m-%d')
            else:
                date_text = f"{earliest_date.strftime('%Y-%m-%d')} to {latest_date.strftime('%Y-%m-%d')}"
            
            # Get unique accession numbers
            accession_numbers = [study.parent_accession_number for study in studies if study.parent_accession_number]
            
            return {
                'date_range': date_text,
                'accession_numbers': accession_numbers[:3],  # Show max 3 accession numbers
                'total_studies': studies.count(),
                'study_descriptions': [study.study_description for study in studies if study.study_description][:2]  # Show max 2 descriptions
            }
        elif obj.daftar:  # Fallback for legacy single study
            return {
                'date_range': obj.daftar.tarikh.strftime('%Y-%m-%d'),
                'accession_numbers': [obj.daftar.parent_accession_number] if obj.daftar.parent_accession_number else [],
                'total_studies': 1,
                'study_descriptions': [obj.daftar.study_description] if obj.daftar.study_description else []
            }
        
        return {
            'date_range': 'No studies',
            'accession_numbers': [],
            'total_studies': 0,
            'study_descriptions': []
        }
    
    def get_prepared_by_name(self, obj):
        return f"{obj.prepared_by.first_name} {obj.prepared_by.last_name}".strip() if obj.prepared_by else None
    
    def get_handed_over_by_name(self, obj):
        return f"{obj.handed_over_by.first_name} {obj.handed_over_by.last_name}".strip() if obj.handed_over_by else None


class MediaDistributionCollectionSerializer(serializers.ModelSerializer):
    """Serializer for recording collection details"""
    class Meta:
        model = MediaDistribution
        fields = [
            'collected_by', 'collected_by_ic', 'relationship_to_patient', 
            'collection_datetime', 'handed_over_by_id'
        ]
    
    def validate(self, data):
        # Validate required fields for collection
        required_fields = ['collected_by', 'collected_by_ic', 'collection_datetime']
        for field in required_fields:
            if not data.get(field):
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} is required when recording collection.")
        return data


# ===============================================
# REJECT ANALYSIS SERIALIZERS
# ===============================================

class RejectReasonSerializer(serializers.ModelSerializer):
    """Serializer for reject reasons with validation"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    severity_level_display = serializers.CharField(source='get_severity_level_display', read_only=True)
    
    class Meta:
        model = RejectReason
        fields = [
            'id', 'reason', 'description', 'is_active', 'qap_code', 'severity_level',
            'severity_level_display', 'category', 'category_name', 'order', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified']
    
    def validate_reason(self, value):
        """Validate reason uniqueness within category"""
        category = self.initial_data.get('category')
        if category:
            existing = RejectReason.objects.filter(
                category_id=category, 
                reason__iexact=value
            ).exclude(pk=self.instance.pk if self.instance else None)
            
            if existing.exists():
                raise serializers.ValidationError(
                    "A reason with this name already exists in this category."
                )
        return value


class RejectCategorySerializer(serializers.ModelSerializer):
    """Serializer for reject categories with nested reasons"""
    reasons = RejectReasonSerializer(many=True, read_only=True)
    reasons_count = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectCategory
        fields = [
            'id', 'name', 'description', 'is_active', 'order', 
            'reasons', 'reasons_count', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified']
    
    def get_reasons_count(self, obj):
        """Get count of active reasons in this category"""
        return obj.reasons.filter(is_active=True).count()
    
    def validate_name(self, value):
        """Validate category name uniqueness"""
        existing = RejectCategory.objects.filter(
            name__iexact=value
        ).exclude(pk=self.instance.pk if self.instance else None)
        
        if existing.exists():
            raise serializers.ValidationError(
                "A category with this name already exists."
            )
        return value


class RejectIncidentSerializer(serializers.ModelSerializer):
    """Serializer for reject incidents with related field names"""
    # Related field displays (all optional for daily tracking)
    examination_number = serializers.CharField(source='examination.no_xray', read_only=True, allow_null=True)
    examination_accession = serializers.CharField(source='examination.accession_number', read_only=True, allow_null=True)
    patient_name = serializers.CharField(source='examination.daftar.pesakit.nama', read_only=True, allow_null=True)
    patient_mrn = serializers.CharField(source='examination.daftar.pesakit.mrn', read_only=True, allow_null=True)
    modality_name = serializers.CharField(source='examination.exam.modaliti.nama', read_only=True, allow_null=True)
    exam_name = serializers.CharField(source='examination.exam.exam', read_only=True, allow_null=True)
    
    # Reject reason details
    reject_reason_name = serializers.CharField(source='reject_reason.reason', read_only=True)
    reject_category_name = serializers.CharField(source='reject_reason.category.name', read_only=True)
    reject_category_type = serializers.CharField(source='reject_reason.category.category_type', read_only=True)
    severity_level = serializers.CharField(source='reject_reason.severity_level', read_only=True)
    
    # Staff details
    technologist_name = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    
    # Analysis details
    analysis_month_year = serializers.CharField(source='analysis.month_year_display', read_only=True)
    
    # Daily tracking support - count field for batch creation
    count = serializers.IntegerField(write_only=True, required=False, min_value=1, max_value=100)
    
    class Meta:
        model = RejectIncident
        fields = [
            'id', 'examination', 'analysis', 'reject_reason', 'reject_date',
            'retake_count', 'original_technique', 'corrected_technique',
            'technologist', 'reported_by', 'patient_factors', 'equipment_factors',
            'notes', 'immediate_action_taken', 'follow_up_required', 'count',
            # Related field displays
            'examination_number', 'examination_accession', 'patient_name', 'patient_mrn',
            'modality_name', 'exam_name', 'reject_reason_name', 'reject_category_name',
            'reject_category_type', 'severity_level', 'technologist_name', 'reported_by_name',
            'analysis_month_year', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified']
    
    def get_technologist_name(self, obj):
        if obj.technologist:
            return f"{obj.technologist.first_name} {obj.technologist.last_name}".strip()
        return None
    
    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return f"{obj.reported_by.first_name} {obj.reported_by.last_name}".strip()
        return None
    
    def validate(self, data):
        """Validate incident data"""
        # Ensure examination and analysis modalities match
        examination = data.get('examination')
        analysis = data.get('analysis')
        
        if examination and analysis:
            if examination.exam.modaliti != analysis.modality:
                raise serializers.ValidationError(
                    "Examination modality must match the analysis modality."
                )
        
        # Validate retake count
        retake_count = data.get('retake_count', 1)
        if retake_count < 1:
            raise serializers.ValidationError("Retake count must be at least 1.")
        
        return data
    
    def create(self, validated_data):
        """Create incidents with batch support for daily tracking"""
        count = validated_data.pop('count', 1)
        
        # Set reported_by from request user if not provided
        request = self.context.get('request')
        if request and hasattr(request, 'user') and not validated_data.get('reported_by'):
            validated_data['reported_by'] = request.user
        
        # For daily tracking, ensure reject_date is set
        if not validated_data.get('reject_date'):
            from django.utils import timezone
            validated_data['reject_date'] = timezone.now()
        
        # Create multiple incidents if count > 1
        incidents = []
        for i in range(count):
            incident = RejectIncident.objects.create(**validated_data)
            incidents.append(incident)
        
        # Return the first incident for API response, but all are created
        return incidents[0] if incidents else None


class RejectAnalysisSerializer(serializers.ModelSerializer):
    """Serializer for reject analysis with calculated fields and incidents"""
    modality_name = serializers.CharField(source='modality.nama', read_only=True)
    modality_singkatan = serializers.CharField(source='modality.singkatan', read_only=True)
    
    # Calculated fields
    status_indicator = serializers.CharField(read_only=True)
    month_year_display = serializers.CharField(read_only=True)
    
    # Staff details
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    
    # Related incidents
    incidents = RejectIncidentSerializer(many=True, read_only=True)
    incidents_count = serializers.SerializerMethodField()
    
    # Choice fields for frontend
    qap_target_rate_display = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysis
        fields = [
            'id', 'analysis_date', 'modality', 'modality_name', 'modality_singkatan',
            'total_examinations', 'total_images', 'total_retakes', 'reject_rate',
            'drl_compliance', 'qap_target_rate', 'qap_target_rate_display',
            'comments', 'corrective_actions', 'root_cause_analysis',
            'created_by', 'created_by_name', 'approved_by', 'approved_by_name',
            'approval_date', 'status_indicator', 'month_year_display',
            'incidents', 'incidents_count', 'created', 'modified'
        ]
        read_only_fields = ['reject_rate', 'drl_compliance', 'created', 'modified']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
        return None
    
    def get_incidents_count(self, obj):
        return obj.incidents.count()


class RejectAnalysisTargetSettingsSerializer(serializers.ModelSerializer):
    """Serializer for reject analysis target settings with validation"""
    # Add display fields for created/modified by users
    created_by_name = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()
    
    # Display fields for calculated thresholds
    calculated_thresholds = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysisTargetSettings
        fields = [
            'id', 'xray_target', 'ct_target', 'mri_target', 'ultrasound_target',
            'mammography_target', 'overall_target', 'drl_compliance_enabled',
            'warning_threshold_multiplier', 'critical_threshold_multiplier',
            'enable_notifications', 'notification_emails', 'created', 'modified',
            'created_by', 'modified_by', 'created_by_name', 'modified_by_name',
            'calculated_thresholds'
        ]
        read_only_fields = ['created', 'modified', 'created_by_name', 'modified_by_name', 'calculated_thresholds']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def get_calculated_thresholds(self, obj):
        """Get calculated warning and critical thresholds for all modalities"""
        modalities = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'overall']
        thresholds = {}
        
        for modality in modalities:
            modality_name = modality.replace('_', ' ').title()
            if modality == 'xray':
                modality_name = 'X-Ray'
            elif modality == 'overall':
                modality_name = 'Overall'
            
            target = obj.get_target_for_modality(modality_name)
            warning = obj.get_warning_threshold(modality_name)
            critical = obj.get_critical_threshold(modality_name)
            
            thresholds[modality] = {
                'target': float(target),
                'warning': float(warning),
                'critical': float(critical)
            }
        
        return thresholds
    
    def validate(self, data):
        """Validate target settings data"""
        # Validate that all target rates are positive
        target_fields = ['xray_target', 'ct_target', 'mri_target', 'ultrasound_target', 
                        'mammography_target', 'overall_target']
        
        for field in target_fields:
            value = data.get(field)
            if value is not None and value <= 0:
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} must be greater than 0")
            if value is not None and value > 100:
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} cannot exceed 100%")
        
        # Validate threshold multipliers
        warning_multiplier = data.get('warning_threshold_multiplier')
        critical_multiplier = data.get('critical_threshold_multiplier')
        
        if warning_multiplier is not None and warning_multiplier <= 0:
            raise serializers.ValidationError("Warning threshold multiplier must be greater than 0")
        
        if critical_multiplier is not None and critical_multiplier <= 0:
            raise serializers.ValidationError("Critical threshold multiplier must be greater than 0")
        
        if (warning_multiplier is not None and critical_multiplier is not None 
            and warning_multiplier >= critical_multiplier):
            raise serializers.ValidationError(
                "Warning threshold multiplier must be less than critical threshold multiplier"
            )
        
        # Validate notification emails format
        notification_emails = data.get('notification_emails', [])
        if notification_emails:
            from django.core.validators import validate_email
            from django.core.exceptions import ValidationError as DjangoValidationError
            
            for email in notification_emails:
                if email:  # Skip empty strings
                    try:
                        validate_email(email)
                    except DjangoValidationError:
                        raise serializers.ValidationError(f"Invalid email address: {email}")
        
        return data
    
    def create(self, validated_data):
        """Create target settings with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
            validated_data['modified_by'] = request.user
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update target settings with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['modified_by'] = request.user
        
        return super().update(instance, validated_data)


class RejectAnalysisTargetSettingsDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for target settings with all calculated values"""
    created_by_name = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()
    modality_targets = serializers.SerializerMethodField()
    threshold_matrix = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysisTargetSettings
        fields = [
            'id', 'xray_target', 'ct_target', 'mri_target', 'ultrasound_target',
            'mammography_target', 'overall_target', 'drl_compliance_enabled',
            'warning_threshold_multiplier', 'critical_threshold_multiplier',
            'enable_notifications', 'notification_emails', 'created', 'modified',
            'created_by_name', 'modified_by_name', 'modality_targets', 'threshold_matrix'
        ]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def get_modality_targets(self, obj):
        """Get target rates mapped by modality names"""
        return {
            'xray': float(obj.xray_target),
            'ct': float(obj.ct_target),
            'mri': float(obj.mri_target),
            'ultrasound': float(obj.ultrasound_target),
            'mammography': float(obj.mammography_target),
            'overall': float(obj.overall_target)
        }
    
    def get_threshold_matrix(self, obj):
        """Get complete threshold matrix for frontend calendar component"""
        modalities = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'overall']
        matrix = {}
        
        for modality in modalities:
            # Map to proper modality names for get_target_for_modality method
            modality_name_map = {
                'xray': 'X-RAY',
                'ct': 'CT',
                'mri': 'MRI',
                'ultrasound': 'ULTRASOUND',
                'mammography': 'MAMMOGRAPHY',
                'overall': 'OVERALL'
            }
            
            modality_name = modality_name_map.get(modality, modality.upper())
            target = obj.get_target_for_modality(modality_name)
            warning = obj.get_warning_threshold(modality_name)
            critical = obj.get_critical_threshold(modality_name)
            
            matrix[modality] = {
                'target': float(target),
                'warning': float(warning),
                'critical': float(critical),
                'display_name': modality.replace('_', ' ').title()
            }
            
            # Fix display names
            if modality == 'xray':
                matrix[modality]['display_name'] = 'X-Ray'
            elif modality == 'overall':
                matrix[modality]['display_name'] = 'Overall'
        
        return matrix


# ===============================================
# AI REPORTING SERIALIZERS
# ===============================================

class AIGeneratedReportSerializer(serializers.ModelSerializer):
    """Serializer for AI-generated reports with related field information"""
    # Related field displays
    examination_number = serializers.CharField(source='pemeriksaan.no_xray', read_only=True)
    examination_accession = serializers.CharField(source='pemeriksaan.accession_number', read_only=True)
    patient_name = serializers.CharField(source='pemeriksaan.daftar.pesakit.nama', read_only=True)
    patient_mrn = serializers.CharField(source='pemeriksaan.daftar.pesakit.mrn', read_only=True)
    modality_name = serializers.CharField(source='pemeriksaan.exam.modaliti.nama', read_only=True)
    exam_name = serializers.CharField(source='pemeriksaan.exam.exam', read_only=True)
    
    # Staff details
    reviewed_by_name = serializers.SerializerMethodField()
    
    # Computed properties
    is_completed = serializers.ReadOnlyField()
    patient_name_prop = serializers.ReadOnlyField(source='patient_name')
    examination_type_prop = serializers.ReadOnlyField(source='examination_type')
    
    # Choice fields for frontend
    ai_model_type_choices = serializers.SerializerMethodField()
    review_status_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = AIGeneratedReport
        fields = [
            'id', 'pemeriksaan', 'ai_model_version', 'ai_model_type', 'ai_model_type_choices',
            'generated_report', 'report_sections', 'confidence_score', 'section_confidence',
            'quality_metrics', 'critical_findings', 'critical_findings_confidence',
            'requires_urgent_review', 'review_status', 'review_status_choices',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'final_report',
            'orthanc_study_id', 'orthanc_series_ids', 'dicom_metadata',
            'processing_time_seconds', 'processing_errors', 'processing_warnings',
            # Related field displays
            'examination_number', 'examination_accession', 'patient_name', 'patient_mrn',
            'modality_name', 'exam_name', 'is_completed', 'patient_name_prop', 'examination_type_prop',
            'created', 'modified'
        ]
        read_only_fields = ['created', 'modified', 'is_completed', 'patient_name_prop', 'examination_type_prop']
    
    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None
    
    def get_ai_model_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIGeneratedReport._meta.get_field('ai_model_type').choices]
    
    def get_review_status_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIGeneratedReport._meta.get_field('review_status').choices]
    
    def validate(self, data):
        """Custom validation for AI reports"""
        # Validate confidence scores
        confidence_score = data.get('confidence_score')
        if confidence_score is not None and (confidence_score < 0.0 or confidence_score > 1.0):
            raise serializers.ValidationError("Confidence score must be between 0.0 and 1.0")
        
        critical_findings_confidence = data.get('critical_findings_confidence')
        if critical_findings_confidence is not None and (critical_findings_confidence < 0.0 or critical_findings_confidence > 1.0):
            raise serializers.ValidationError("Critical findings confidence must be between 0.0 and 1.0")
        
        # Validate critical findings consistency
        critical_findings = data.get('critical_findings', [])
        if critical_findings and not critical_findings_confidence:
            raise serializers.ValidationError("Critical findings confidence is required when critical findings are present")
        
        return data


class RadiologistReportSerializer(serializers.ModelSerializer):
    """Serializer for radiologist reports with collaboration tracking"""
    # AI report details
    ai_report_details = AIGeneratedReportSerializer(source='ai_report', read_only=True)
    ai_report_id = serializers.PrimaryKeyRelatedField(
        queryset=AIGeneratedReport.objects.all(),
        source='ai_report',
        write_only=True
    )
    
    # Staff details
    radiologist_name = serializers.SerializerMethodField()
    peer_reviewer_name = serializers.SerializerMethodField()
    
    # Computed properties
    total_reporting_time = serializers.ReadOnlyField()
    ai_adoption_rate = serializers.ReadOnlyField()
    
    # Related collaborations
    collaborations = serializers.SerializerMethodField()
    collaborations_count = serializers.SerializerMethodField()
    
    # Choice fields for frontend
    complexity_level_choices = serializers.SerializerMethodField()
    report_status_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = RadiologistReport
        fields = [
            'id', 'ai_report', 'ai_report_id', 'ai_report_details', 'radiologist', 'radiologist_name',
            'clinical_history', 'technique', 'findings', 'impression', 'recommendations',
            'ai_suggestions_used', 'ai_suggestions_modified', 'ai_suggestions_rejected',
            'radiologist_additions', 'report_start_time', 'report_completion_time', 
            'time_saved_estimate', 'complexity_level', 'complexity_level_choices',
            'radiologist_confidence', 'report_status', 'report_status_choices',
            'peer_review_required', 'peer_reviewer', 'peer_reviewer_name', 'peer_review_date',
            'peer_review_comments', 'total_reporting_time', 'ai_adoption_rate',
            'collaborations', 'collaborations_count', 'created', 'modified'
        ]
        read_only_fields = ['report_start_time', 'created', 'modified', 'total_reporting_time', 'ai_adoption_rate']
    
    def get_radiologist_name(self, obj):
        return f"{obj.radiologist.first_name} {obj.radiologist.last_name}".strip()
    
    def get_peer_reviewer_name(self, obj):
        if obj.peer_reviewer:
            return f"{obj.peer_reviewer.first_name} {obj.peer_reviewer.last_name}".strip()
        return None
    
    def get_collaborations(self, obj):
        collaborations = obj.collaborations.all().order_by('-timestamp')[:10]  # Latest 10
        return ReportCollaborationSerializer(collaborations, many=True).data
    
    def get_collaborations_count(self, obj):
        return obj.collaborations.count()
    
    def get_complexity_level_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in RadiologistReport._meta.get_field('complexity_level').choices]
    
    def get_report_status_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in RadiologistReport._meta.get_field('report_status').choices]
    
    def validate(self, data):
        """Custom validation for radiologist reports"""
        # Validate confidence score
        radiologist_confidence = data.get('radiologist_confidence')
        if radiologist_confidence is not None and (radiologist_confidence < 0.0 or radiologist_confidence > 1.0):
            raise serializers.ValidationError("Radiologist confidence must be between 0.0 and 1.0")
        
        # Ensure required fields for completion
        report_status = data.get('report_status')
        if report_status == 'completed':
            required_fields = ['findings', 'impression']
            for field in required_fields:
                if not data.get(field):
                    raise serializers.ValidationError(f"{field.replace('_', ' ').title()} is required for completed reports")
        
        return data
    
    def create(self, validated_data):
        """Create radiologist report with auto-assignment"""
        # Set radiologist from request user if not provided
        request = self.context.get('request')
        if request and hasattr(request, 'user') and not validated_data.get('radiologist'):
            validated_data['radiologist'] = request.user
        
        return super().create(validated_data)


class ReportCollaborationSerializer(serializers.ModelSerializer):
    """Serializer for report collaboration tracking"""
    # Related report details
    radiologist_report_details = serializers.SerializerMethodField()
    
    # Choice fields for frontend
    interaction_type_choices = serializers.SerializerMethodField()
    report_section_choices = serializers.SerializerMethodField()
    feedback_category_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = ReportCollaboration
        fields = [
            'id', 'radiologist_report', 'radiologist_report_details', 'interaction_type',
            'interaction_type_choices', 'ai_suggestion', 'radiologist_action', 'report_section',
            'report_section_choices', 'confidence_before', 'confidence_after', 'feedback_category',
            'feedback_category_choices', 'improvement_suggestion', 'ai_reasoning', 'image_regions',
            'timestamp'
        ]
        read_only_fields = ['timestamp']
    
    def get_radiologist_report_details(self, obj):
        return {
            'id': obj.radiologist_report.id,
            'examination_number': obj.radiologist_report.ai_report.pemeriksaan.no_xray,
            'patient_name': obj.radiologist_report.ai_report.pemeriksaan.daftar.pesakit.nama,
            'radiologist_name': f"{obj.radiologist_report.radiologist.first_name} {obj.radiologist_report.radiologist.last_name}".strip()
        }
    
    def get_interaction_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('interaction_type').choices]
    
    def get_report_section_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('report_section').choices]
    
    def get_feedback_category_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('feedback_category').choices]
    
    def validate(self, data):
        """Custom validation for collaborations"""
        # Validate confidence scores
        confidence_before = data.get('confidence_before')
        if confidence_before is not None and (confidence_before < 0.0 or confidence_before > 1.0):
            raise serializers.ValidationError("Confidence before must be between 0.0 and 1.0")
        
        confidence_after = data.get('confidence_after')
        if confidence_after is not None and (confidence_after < 0.0 or confidence_after > 1.0):
            raise serializers.ValidationError("Confidence after must be between 0.0 and 1.0")
        
        return data


class AIModelPerformanceSerializer(serializers.ModelSerializer):
    """Serializer for AI model performance tracking"""
    # Related field displays
    modality_name = serializers.CharField(source='modality.nama', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    # Computed properties
    approval_rate = serializers.ReadOnlyField()
    modification_rate = serializers.ReadOnlyField()
    
    # Choice fields for frontend
    model_type_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = AIModelPerformance
        fields = [
            'id', 'model_version', 'model_type', 'model_type_choices', 'analysis_date',
            'modality', 'modality_name', 'total_reports_generated', 'reports_approved_unchanged',
            'reports_modified', 'reports_rejected', 'accuracy_rate', 'critical_findings_sensitivity',
            'false_positive_rate', 'average_processing_time', 'average_time_saved',
            'user_satisfaction_score', 'system_uptime_percentage', 'error_rate',
            'performance_notes', 'improvement_actions', 'approval_rate', 'modification_rate',
            'created_by', 'created_by_name', 'created', 'modified'
        ]
        read_only_fields = ['accuracy_rate', 'approval_rate', 'modification_rate', 'created', 'modified']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_model_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIModelPerformance._meta.get_field('model_type').choices]
    
    def validate(self, data):
        """Custom validation for performance metrics"""
        # Validate that totals add up correctly
        total_reports = data.get('total_reports_generated', 0)
        approved_unchanged = data.get('reports_approved_unchanged', 0)
        modified = data.get('reports_modified', 0)
        rejected = data.get('reports_rejected', 0)
        
        if approved_unchanged + modified + rejected > total_reports:
            raise serializers.ValidationError(
                "Sum of approved, modified, and rejected reports cannot exceed total reports generated"
            )
        
        # Validate percentage fields
        percentage_fields = [
            'accuracy_rate', 'critical_findings_sensitivity', 'false_positive_rate',
            'system_uptime_percentage', 'error_rate'
        ]
        for field in percentage_fields:
            value = data.get(field)
            if value is not None and (value < 0 or value > 100):
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} must be between 0 and 100")
        
        # Validate satisfaction score
        satisfaction_score = data.get('user_satisfaction_score')
        if satisfaction_score is not None and (satisfaction_score < 1.0 or satisfaction_score > 5.0):
            raise serializers.ValidationError("User satisfaction score must be between 1.0 and 5.0")
        
        return data
    
    def create(self, validated_data):
        """Create performance record with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        
        return super().create(validated_data)


class AIConfigurationSerializer(serializers.ModelSerializer):
    """Serializer for AI system configuration"""
    # Staff details
    modified_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AIConfiguration
        fields = [
            'id', 'ollama_server_url', 'vision_language_model', 'medical_llm_model', 'qa_model',
            'max_processing_time_seconds', 'confidence_threshold', 'critical_findings_threshold',
            'enable_qa_validation', 'require_peer_review_critical', 'auto_approve_routine_reports',
            'notify_on_critical_findings', 'notification_emails', 'enable_ai_reporting',
            'maintenance_mode', 'modified_by', 'modified_by_name', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified', 'modified_by_name']
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def validate(self, data):
        """Custom validation for AI configuration"""
        # Validate thresholds
        confidence_threshold = data.get('confidence_threshold')
        if confidence_threshold is not None and (confidence_threshold < 0.0 or confidence_threshold > 1.0):
            raise serializers.ValidationError("Confidence threshold must be between 0.0 and 1.0")
        
        critical_findings_threshold = data.get('critical_findings_threshold')
        if critical_findings_threshold is not None and (critical_findings_threshold < 0.0 or critical_findings_threshold > 1.0):
            raise serializers.ValidationError("Critical findings threshold must be between 0.0 and 1.0")
        
        # Validate processing time
        max_processing_time = data.get('max_processing_time_seconds')
        if max_processing_time is not None and max_processing_time <= 0:
            raise serializers.ValidationError("Maximum processing time must be greater than 0")
        
        # Validate notification emails
        notification_emails = data.get('notification_emails', [])
        if notification_emails:
            from django.core.validators import validate_email
            from django.core.exceptions import ValidationError as DjangoValidationError
            
            for email in notification_emails:
                if email:  # Skip empty strings
                    try:
                        validate_email(email)
                    except DjangoValidationError:
                        raise serializers.ValidationError(f"Invalid email address: {email}")
        
        return data
    
    def update(self, instance, validated_data):
        """Update configuration with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['modified_by'] = request.user
        
        return super().update(instance, validated_data)


# Simplified serializers for list views
class AIGeneratedReportListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing AI reports"""
    examination_number = serializers.CharField(source='pemeriksaan.no_xray', read_only=True)
    patient_name = serializers.CharField(source='pemeriksaan.daftar.pesakit.nama', read_only=True)
    exam_name = serializers.CharField(source='pemeriksaan.exam.exam', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AIGeneratedReport
        fields = [
            'id', 'examination_number', 'patient_name', 'exam_name', 'ai_model_version',
            'confidence_score', 'requires_urgent_review', 'review_status', 'reviewed_by_name',
            'reviewed_at', 'created'
        ]
    
    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None


class RadiologistReportListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing radiologist reports"""
    examination_number = serializers.CharField(source='ai_report.pemeriksaan.no_xray', read_only=True)
    patient_name = serializers.CharField(source='ai_report.pemeriksaan.daftar.pesakit.nama', read_only=True)
    radiologist_name = serializers.SerializerMethodField()
    ai_adoption_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = RadiologistReport
        fields = [
            'id', 'examination_number', 'patient_name', 'radiologist_name', 'complexity_level',
            'report_status', 'report_completion_time', 'time_saved_estimate', 'ai_adoption_rate',
            'created'
        ]
    
    def get_radiologist_name(self, obj):
        return f"{obj.radiologist.first_name} {obj.radiologist.last_name}".strip()
    
    def get_qap_target_rate_display(self, obj):
        return f"{obj.qap_target_rate}%"
    
    def validate(self, data):
        """Validate analysis data"""
        total_images = data.get('total_images', 0)
        total_retakes = data.get('total_retakes', 0)
        total_examinations = data.get('total_examinations', 0)
        
        # Validate totals
        if total_retakes > total_images:
            raise serializers.ValidationError(
                "Total retakes cannot exceed total images."
            )
        
        if total_images < total_examinations:
            raise serializers.ValidationError(
                "Total images should be at least equal to total examinations."
            )
        
        # Validate analysis date uniqueness for modality
        analysis_date = data.get('analysis_date')
        modality = data.get('modality')
        
        if analysis_date and modality:
            existing = RejectAnalysis.objects.filter(
                analysis_date=analysis_date,
                modality=modality
            ).exclude(pk=self.instance.pk if self.instance else None)
            
            if existing.exists():
                raise serializers.ValidationError(
                    "An analysis for this modality and month already exists."
                )
        
        return data
    
    def create(self, validated_data):
        """Create analysis with auto-calculation logic"""
        # Set created_by from request user
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        
        return super().create(validated_data)


class RejectAnalysisListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing reject analyses"""
    modality_name = serializers.CharField(source='modality.nama', read_only=True)
    status_indicator = serializers.CharField(read_only=True)
    month_year_display = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    incidents_count = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysis
        fields = [
            'id', 'analysis_date', 'modality', 'modality_name', 'reject_rate',
            'qap_target_rate', 'drl_compliance', 'status_indicator',
            'month_year_display', 'created_by_name', 'incidents_count',
            'approval_date', 'created', 'modified'
        ]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_incidents_count(self, obj):
        return obj.incidents.count()


class RejectAnalysisTargetSettingsSerializer(serializers.ModelSerializer):
    """Serializer for reject analysis target settings with validation"""
    # Add display fields for created/modified by users
    created_by_name = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()
    
    # Display fields for calculated thresholds
    calculated_thresholds = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysisTargetSettings
        fields = [
            'id', 'xray_target', 'ct_target', 'mri_target', 'ultrasound_target',
            'mammography_target', 'overall_target', 'drl_compliance_enabled',
            'warning_threshold_multiplier', 'critical_threshold_multiplier',
            'enable_notifications', 'notification_emails', 'created', 'modified',
            'created_by', 'modified_by', 'created_by_name', 'modified_by_name',
            'calculated_thresholds'
        ]
        read_only_fields = ['created', 'modified', 'created_by_name', 'modified_by_name', 'calculated_thresholds']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def get_calculated_thresholds(self, obj):
        """Get calculated warning and critical thresholds for all modalities"""
        modalities = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'overall']
        thresholds = {}
        
        for modality in modalities:
            modality_name = modality.replace('_', ' ').title()
            if modality == 'xray':
                modality_name = 'X-Ray'
            elif modality == 'overall':
                modality_name = 'Overall'
            
            target = obj.get_target_for_modality(modality_name)
            warning = obj.get_warning_threshold(modality_name)
            critical = obj.get_critical_threshold(modality_name)
            
            thresholds[modality] = {
                'target': float(target),
                'warning': float(warning),
                'critical': float(critical)
            }
        
        return thresholds
    
    def validate(self, data):
        """Validate target settings data"""
        # Validate that all target rates are positive
        target_fields = ['xray_target', 'ct_target', 'mri_target', 'ultrasound_target', 
                        'mammography_target', 'overall_target']
        
        for field in target_fields:
            value = data.get(field)
            if value is not None and value <= 0:
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} must be greater than 0")
            if value is not None and value > 100:
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} cannot exceed 100%")
        
        # Validate threshold multipliers
        warning_multiplier = data.get('warning_threshold_multiplier')
        critical_multiplier = data.get('critical_threshold_multiplier')
        
        if warning_multiplier is not None and warning_multiplier <= 0:
            raise serializers.ValidationError("Warning threshold multiplier must be greater than 0")
        
        if critical_multiplier is not None and critical_multiplier <= 0:
            raise serializers.ValidationError("Critical threshold multiplier must be greater than 0")
        
        if (warning_multiplier is not None and critical_multiplier is not None 
            and warning_multiplier >= critical_multiplier):
            raise serializers.ValidationError(
                "Warning threshold multiplier must be less than critical threshold multiplier"
            )
        
        # Validate notification emails format
        notification_emails = data.get('notification_emails', [])
        if notification_emails:
            from django.core.validators import validate_email
            from django.core.exceptions import ValidationError as DjangoValidationError
            
            for email in notification_emails:
                if email:  # Skip empty strings
                    try:
                        validate_email(email)
                    except DjangoValidationError:
                        raise serializers.ValidationError(f"Invalid email address: {email}")
        
        return data
    
    def create(self, validated_data):
        """Create target settings with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
            validated_data['modified_by'] = request.user
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update target settings with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['modified_by'] = request.user
        
        return super().update(instance, validated_data)


class RejectAnalysisTargetSettingsDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for target settings with all calculated values"""
    created_by_name = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()
    modality_targets = serializers.SerializerMethodField()
    threshold_matrix = serializers.SerializerMethodField()
    
    class Meta:
        model = RejectAnalysisTargetSettings
        fields = [
            'id', 'xray_target', 'ct_target', 'mri_target', 'ultrasound_target',
            'mammography_target', 'overall_target', 'drl_compliance_enabled',
            'warning_threshold_multiplier', 'critical_threshold_multiplier',
            'enable_notifications', 'notification_emails', 'created', 'modified',
            'created_by_name', 'modified_by_name', 'modality_targets', 'threshold_matrix'
        ]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def get_modality_targets(self, obj):
        """Get target rates mapped by modality names"""
        return {
            'xray': float(obj.xray_target),
            'ct': float(obj.ct_target),
            'mri': float(obj.mri_target),
            'ultrasound': float(obj.ultrasound_target),
            'mammography': float(obj.mammography_target),
            'overall': float(obj.overall_target)
        }
    
    def get_threshold_matrix(self, obj):
        """Get complete threshold matrix for frontend calendar component"""
        modalities = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'overall']
        matrix = {}
        
        for modality in modalities:
            # Map to proper modality names for get_target_for_modality method
            modality_name_map = {
                'xray': 'X-RAY',
                'ct': 'CT',
                'mri': 'MRI',
                'ultrasound': 'ULTRASOUND',
                'mammography': 'MAMMOGRAPHY',
                'overall': 'OVERALL'
            }
            
            modality_name = modality_name_map.get(modality, modality.upper())
            target = obj.get_target_for_modality(modality_name)
            warning = obj.get_warning_threshold(modality_name)
            critical = obj.get_critical_threshold(modality_name)
            
            matrix[modality] = {
                'target': float(target),
                'warning': float(warning),
                'critical': float(critical),
                'display_name': modality.replace('_', ' ').title()
            }
            
            # Fix display names
            if modality == 'xray':
                matrix[modality]['display_name'] = 'X-Ray'
            elif modality == 'overall':
                matrix[modality]['display_name'] = 'Overall'
        
        return matrix


# ===============================================
# AI REPORTING SERIALIZERS
# ===============================================

class AIGeneratedReportSerializer(serializers.ModelSerializer):
    """Serializer for AI-generated reports with related field information"""
    # Related field displays
    examination_number = serializers.CharField(source='pemeriksaan.no_xray', read_only=True)
    examination_accession = serializers.CharField(source='pemeriksaan.accession_number', read_only=True)
    patient_name = serializers.CharField(source='pemeriksaan.daftar.pesakit.nama', read_only=True)
    patient_mrn = serializers.CharField(source='pemeriksaan.daftar.pesakit.mrn', read_only=True)
    modality_name = serializers.CharField(source='pemeriksaan.exam.modaliti.nama', read_only=True)
    exam_name = serializers.CharField(source='pemeriksaan.exam.exam', read_only=True)
    
    # Staff details
    reviewed_by_name = serializers.SerializerMethodField()
    
    # Computed properties
    is_completed = serializers.ReadOnlyField()
    patient_name_prop = serializers.ReadOnlyField(source='patient_name')
    examination_type_prop = serializers.ReadOnlyField(source='examination_type')
    
    # Choice fields for frontend
    ai_model_type_choices = serializers.SerializerMethodField()
    review_status_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = AIGeneratedReport
        fields = [
            'id', 'pemeriksaan', 'ai_model_version', 'ai_model_type', 'ai_model_type_choices',
            'generated_report', 'report_sections', 'confidence_score', 'section_confidence',
            'quality_metrics', 'critical_findings', 'critical_findings_confidence',
            'requires_urgent_review', 'review_status', 'review_status_choices',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'final_report',
            'orthanc_study_id', 'orthanc_series_ids', 'dicom_metadata',
            'processing_time_seconds', 'processing_errors', 'processing_warnings',
            # Related field displays
            'examination_number', 'examination_accession', 'patient_name', 'patient_mrn',
            'modality_name', 'exam_name', 'is_completed', 'patient_name_prop', 'examination_type_prop',
            'created', 'modified'
        ]
        read_only_fields = ['created', 'modified', 'is_completed', 'patient_name_prop', 'examination_type_prop']
    
    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None
    
    def get_ai_model_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIGeneratedReport._meta.get_field('ai_model_type').choices]
    
    def get_review_status_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIGeneratedReport._meta.get_field('review_status').choices]
    
    def validate(self, data):
        """Custom validation for AI reports"""
        # Validate confidence scores
        confidence_score = data.get('confidence_score')
        if confidence_score is not None and (confidence_score < 0.0 or confidence_score > 1.0):
            raise serializers.ValidationError("Confidence score must be between 0.0 and 1.0")
        
        critical_findings_confidence = data.get('critical_findings_confidence')
        if critical_findings_confidence is not None and (critical_findings_confidence < 0.0 or critical_findings_confidence > 1.0):
            raise serializers.ValidationError("Critical findings confidence must be between 0.0 and 1.0")
        
        # Validate critical findings consistency
        critical_findings = data.get('critical_findings', [])
        if critical_findings and not critical_findings_confidence:
            raise serializers.ValidationError("Critical findings confidence is required when critical findings are present")
        
        return data


class RadiologistReportSerializer(serializers.ModelSerializer):
    """Serializer for radiologist reports with collaboration tracking"""
    # AI report details
    ai_report_details = AIGeneratedReportSerializer(source='ai_report', read_only=True)
    ai_report_id = serializers.PrimaryKeyRelatedField(
        queryset=AIGeneratedReport.objects.all(),
        source='ai_report',
        write_only=True
    )
    
    # Staff details
    radiologist_name = serializers.SerializerMethodField()
    peer_reviewer_name = serializers.SerializerMethodField()
    
    # Computed properties
    total_reporting_time = serializers.ReadOnlyField()
    ai_adoption_rate = serializers.ReadOnlyField()
    
    # Related collaborations
    collaborations = serializers.SerializerMethodField()
    collaborations_count = serializers.SerializerMethodField()
    
    # Choice fields for frontend
    complexity_level_choices = serializers.SerializerMethodField()
    report_status_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = RadiologistReport
        fields = [
            'id', 'ai_report', 'ai_report_id', 'ai_report_details', 'radiologist', 'radiologist_name',
            'clinical_history', 'technique', 'findings', 'impression', 'recommendations',
            'ai_suggestions_used', 'ai_suggestions_modified', 'ai_suggestions_rejected',
            'radiologist_additions', 'report_start_time', 'report_completion_time', 
            'time_saved_estimate', 'complexity_level', 'complexity_level_choices',
            'radiologist_confidence', 'report_status', 'report_status_choices',
            'peer_review_required', 'peer_reviewer', 'peer_reviewer_name', 'peer_review_date',
            'peer_review_comments', 'total_reporting_time', 'ai_adoption_rate',
            'collaborations', 'collaborations_count', 'created', 'modified'
        ]
        read_only_fields = ['report_start_time', 'created', 'modified', 'total_reporting_time', 'ai_adoption_rate']
    
    def get_radiologist_name(self, obj):
        return f"{obj.radiologist.first_name} {obj.radiologist.last_name}".strip()
    
    def get_peer_reviewer_name(self, obj):
        if obj.peer_reviewer:
            return f"{obj.peer_reviewer.first_name} {obj.peer_reviewer.last_name}".strip()
        return None
    
    def get_collaborations(self, obj):
        collaborations = obj.collaborations.all().order_by('-timestamp')[:10]  # Latest 10
        return ReportCollaborationSerializer(collaborations, many=True).data
    
    def get_collaborations_count(self, obj):
        return obj.collaborations.count()
    
    def get_complexity_level_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in RadiologistReport._meta.get_field('complexity_level').choices]
    
    def get_report_status_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in RadiologistReport._meta.get_field('report_status').choices]
    
    def validate(self, data):
        """Custom validation for radiologist reports"""
        # Validate confidence score
        radiologist_confidence = data.get('radiologist_confidence')
        if radiologist_confidence is not None and (radiologist_confidence < 0.0 or radiologist_confidence > 1.0):
            raise serializers.ValidationError("Radiologist confidence must be between 0.0 and 1.0")
        
        # Ensure required fields for completion
        report_status = data.get('report_status')
        if report_status == 'completed':
            required_fields = ['findings', 'impression']
            for field in required_fields:
                if not data.get(field):
                    raise serializers.ValidationError(f"{field.replace('_', ' ').title()} is required for completed reports")
        
        return data
    
    def create(self, validated_data):
        """Create radiologist report with auto-assignment"""
        # Set radiologist from request user if not provided
        request = self.context.get('request')
        if request and hasattr(request, 'user') and not validated_data.get('radiologist'):
            validated_data['radiologist'] = request.user
        
        return super().create(validated_data)


class ReportCollaborationSerializer(serializers.ModelSerializer):
    """Serializer for report collaboration tracking"""
    # Related report details
    radiologist_report_details = serializers.SerializerMethodField()
    
    # Choice fields for frontend
    interaction_type_choices = serializers.SerializerMethodField()
    report_section_choices = serializers.SerializerMethodField()
    feedback_category_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = ReportCollaboration
        fields = [
            'id', 'radiologist_report', 'radiologist_report_details', 'interaction_type',
            'interaction_type_choices', 'ai_suggestion', 'radiologist_action', 'report_section',
            'report_section_choices', 'confidence_before', 'confidence_after', 'feedback_category',
            'feedback_category_choices', 'improvement_suggestion', 'ai_reasoning', 'image_regions',
            'timestamp'
        ]
        read_only_fields = ['timestamp']
    
    def get_radiologist_report_details(self, obj):
        return {
            'id': obj.radiologist_report.id,
            'examination_number': obj.radiologist_report.ai_report.pemeriksaan.no_xray,
            'patient_name': obj.radiologist_report.ai_report.pemeriksaan.daftar.pesakit.nama,
            'radiologist_name': f"{obj.radiologist_report.radiologist.first_name} {obj.radiologist_report.radiologist.last_name}".strip()
        }
    
    def get_interaction_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('interaction_type').choices]
    
    def get_report_section_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('report_section').choices]
    
    def get_feedback_category_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in ReportCollaboration._meta.get_field('feedback_category').choices]
    
    def validate(self, data):
        """Custom validation for collaborations"""
        # Validate confidence scores
        confidence_before = data.get('confidence_before')
        if confidence_before is not None and (confidence_before < 0.0 or confidence_before > 1.0):
            raise serializers.ValidationError("Confidence before must be between 0.0 and 1.0")
        
        confidence_after = data.get('confidence_after')
        if confidence_after is not None and (confidence_after < 0.0 or confidence_after > 1.0):
            raise serializers.ValidationError("Confidence after must be between 0.0 and 1.0")
        
        return data


class AIModelPerformanceSerializer(serializers.ModelSerializer):
    """Serializer for AI model performance tracking"""
    # Related field displays
    modality_name = serializers.CharField(source='modality.nama', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    # Computed properties
    approval_rate = serializers.ReadOnlyField()
    modification_rate = serializers.ReadOnlyField()
    
    # Choice fields for frontend
    model_type_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = AIModelPerformance
        fields = [
            'id', 'model_version', 'model_type', 'model_type_choices', 'analysis_date',
            'modality', 'modality_name', 'total_reports_generated', 'reports_approved_unchanged',
            'reports_modified', 'reports_rejected', 'accuracy_rate', 'critical_findings_sensitivity',
            'false_positive_rate', 'average_processing_time', 'average_time_saved',
            'user_satisfaction_score', 'system_uptime_percentage', 'error_rate',
            'performance_notes', 'improvement_actions', 'approval_rate', 'modification_rate',
            'created_by', 'created_by_name', 'created', 'modified'
        ]
        read_only_fields = ['accuracy_rate', 'approval_rate', 'modification_rate', 'created', 'modified']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_model_type_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} for choice in AIModelPerformance._meta.get_field('model_type').choices]
    
    def validate(self, data):
        """Custom validation for performance metrics"""
        # Validate that totals add up correctly
        total_reports = data.get('total_reports_generated', 0)
        approved_unchanged = data.get('reports_approved_unchanged', 0)
        modified = data.get('reports_modified', 0)
        rejected = data.get('reports_rejected', 0)
        
        if approved_unchanged + modified + rejected > total_reports:
            raise serializers.ValidationError(
                "Sum of approved, modified, and rejected reports cannot exceed total reports generated"
            )
        
        # Validate percentage fields
        percentage_fields = [
            'accuracy_rate', 'critical_findings_sensitivity', 'false_positive_rate',
            'system_uptime_percentage', 'error_rate'
        ]
        for field in percentage_fields:
            value = data.get(field)
            if value is not None and (value < 0 or value > 100):
                raise serializers.ValidationError(f"{field.replace('_', ' ').title()} must be between 0 and 100")
        
        # Validate satisfaction score
        satisfaction_score = data.get('user_satisfaction_score')
        if satisfaction_score is not None and (satisfaction_score < 1.0 or satisfaction_score > 5.0):
            raise serializers.ValidationError("User satisfaction score must be between 1.0 and 5.0")
        
        return data
    
    def create(self, validated_data):
        """Create performance record with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        
        return super().create(validated_data)


class AIConfigurationSerializer(serializers.ModelSerializer):
    """Serializer for AI system configuration"""
    # Staff details
    modified_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AIConfiguration
        fields = [
            'id', 'ollama_server_url', 'vision_language_model', 'medical_llm_model', 'qa_model',
            'max_processing_time_seconds', 'confidence_threshold', 'critical_findings_threshold',
            'enable_qa_validation', 'require_peer_review_critical', 'auto_approve_routine_reports',
            'notify_on_critical_findings', 'notification_emails', 'enable_ai_reporting',
            'maintenance_mode', 'modified_by', 'modified_by_name', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified', 'modified_by_name']
    
    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip()
        return None
    
    def validate(self, data):
        """Custom validation for AI configuration"""
        # Validate thresholds
        confidence_threshold = data.get('confidence_threshold')
        if confidence_threshold is not None and (confidence_threshold < 0.0 or confidence_threshold > 1.0):
            raise serializers.ValidationError("Confidence threshold must be between 0.0 and 1.0")
        
        critical_findings_threshold = data.get('critical_findings_threshold')
        if critical_findings_threshold is not None and (critical_findings_threshold < 0.0 or critical_findings_threshold > 1.0):
            raise serializers.ValidationError("Critical findings threshold must be between 0.0 and 1.0")
        
        # Validate processing time
        max_processing_time = data.get('max_processing_time_seconds')
        if max_processing_time is not None and max_processing_time <= 0:
            raise serializers.ValidationError("Maximum processing time must be greater than 0")
        
        # Validate notification emails
        notification_emails = data.get('notification_emails', [])
        if notification_emails:
            from django.core.validators import validate_email
            from django.core.exceptions import ValidationError as DjangoValidationError
            
            for email in notification_emails:
                if email:  # Skip empty strings
                    try:
                        validate_email(email)
                    except DjangoValidationError:
                        raise serializers.ValidationError(f"Invalid email address: {email}")
        
        return data
    
    def update(self, instance, validated_data):
        """Update configuration with audit information"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['modified_by'] = request.user
        
        return super().update(instance, validated_data)


# Simplified serializers for list views
class AIGeneratedReportListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing AI reports"""
    examination_number = serializers.CharField(source='pemeriksaan.no_xray', read_only=True)
    patient_name = serializers.CharField(source='pemeriksaan.daftar.pesakit.nama', read_only=True)
    exam_name = serializers.CharField(source='pemeriksaan.exam.exam', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AIGeneratedReport
        fields = [
            'id', 'examination_number', 'patient_name', 'exam_name', 'ai_model_version',
            'confidence_score', 'requires_urgent_review', 'review_status', 'reviewed_by_name',
            'reviewed_at', 'created'
        ]
    
    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip()
        return None


class RadiologistReportListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing radiologist reports"""
    examination_number = serializers.CharField(source='ai_report.pemeriksaan.no_xray', read_only=True)
    patient_name = serializers.CharField(source='ai_report.pemeriksaan.daftar.pesakit.nama', read_only=True)
    radiologist_name = serializers.SerializerMethodField()
    ai_adoption_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = RadiologistReport
        fields = [
            'id', 'examination_number', 'patient_name', 'radiologist_name', 'complexity_level',
            'report_status', 'report_completion_time', 'time_saved_estimate', 'ai_adoption_rate',
            'created'
        ]
    
    def get_radiologist_name(self, obj):
        return f"{obj.radiologist.first_name} {obj.radiologist.last_name}".strip()