from rest_framework import serializers
from .models import Modaliti, Part, Exam, Daftar, Pemeriksaan, PacsConfig, PacsServer
from pesakit.models import Pesakit
from wad.models import Ward
from pesakit.serializers import PesakitSerializer
from wad.serializers import WardSerializer
from staff.serializers import UserSerializer
from django.contrib.auth import get_user_model

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
                 'is_active', 'is_primary', 'comments', 'endpoint_style_choices',
                 'created', 'modified']
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
        fields = ['id', 'name', 'orthancurl', 'is_active', 'is_primary', 'comments']