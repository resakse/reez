from rest_framework import serializers
from .models import Modaliti, Part, Exam, Daftar, Pemeriksaan
from pesakit.models import Pesakit
from wad.models import Ward
from pesakit.serializers import PesakitSerializer
from wad.serializers import WardSerializer

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
            'id', 'exam', 'exam_code', 'part', 'part_id', 'modaliti', 'modaliti_id',
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

    class Meta:
        model = Pemeriksaan
        fields = [
            'id', 'no_xray', 'exam', 'exam_id', 'laterality', 'kv', 'mas', 'mgy',
            'created', 'modified', 'daftar_id'
        ]
        read_only_fields = ['no_xray', 'created', 'modified']

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
    jxr = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Daftar
        fields = [
            'id', 'tarikh', 'pesakit', 'pesakit_id', 'no_resit', 'lmp', 'rujukan',
            'rujukan_id', 'ambulatori', 'pemohon', 'status', 'hamil', 'dcatatan',
            'jxr', 'created', 'modified', 'performed', 'pemeriksaan',
            # MWL Integration fields
            'study_instance_uid', 'accession_number', 'scheduled_datetime',
            'study_priority', 'requested_procedure_description', 'study_comments',
            'patient_position', 'modality'
        ]
        read_only_fields = ['tarikh', 'created', 'modified', 'jxr', 'study_instance_uid']

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
        # Create patient
        patient_data = validated_data.pop('patient_data')
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

class MWLWorklistSerializer(serializers.ModelSerializer):
    """
    Serializer for MWL (Modality Worklist) data for CR machine integration
    """
    patient_name = serializers.CharField(source='pesakit.nama', read_only=True)
    patient_id = serializers.CharField(source='pesakit.nric', read_only=True)
    patient_birth_date = serializers.CharField(source='pesakit.t_lahir', read_only=True)
    patient_gender = serializers.CharField(source='pesakit.jantina', read_only=True)
    study_description = serializers.CharField(source='pemeriksaan.exam.exam', read_only=True)
    accession_number = serializers.CharField(source='no_resit', read_only=True)
    study_date = serializers.DateTimeField(source='tarikh', read_only=True)
    referring_physician = serializers.CharField(source='pemohon', read_only=True)
    study_instance_uid = serializers.SerializerMethodField()

    class Meta:
        model = Daftar
        fields = [
            'id', 'patient_name', 'patient_id', 'patient_birth_date', 'patient_gender',
            'study_description', 'accession_number', 'study_date', 'referring_physician',
            'study_instance_uid', 'status'
        ]

    def get_study_instance_uid(self, obj):
        # Generate unique study instance UID for DICOM
        import uuid
        return str(uuid.uuid4())