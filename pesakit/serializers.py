from rest_framework import serializers
from .models import Pesakit
from .utils import parse_identification_number, calculate_age

class PesakitSerializer(serializers.ModelSerializer):
    t_lahir = serializers.SerializerMethodField()
    calculated_age = serializers.SerializerMethodField()
    parsed_gender = serializers.SerializerMethodField()
    identification_type = serializers.SerializerMethodField()
    formatted_nric = serializers.SerializerMethodField()
    is_nric_valid = serializers.SerializerMethodField()
    
    class Meta:
        model = Pesakit
        fields = [
            'id', 'mrn', 'nric', 'formatted_nric', 'nama', 'bangsa', 'jantina', 'umur',
            't_lahir', 'calculated_age', 'parsed_gender', 'identification_type',
            'is_nric_valid', 'catatan', 'telefon', 'email', 'alamat', 'created', 'modified', 'ic', 'kira_umur', 'cek_jantina'
        ]
    
    def get_t_lahir(self, obj):
        """Return parsed date of birth from NRIC if available"""
        parsed = parse_identification_number(obj.nric)
        if parsed and parsed['type'] == 'nric' and parsed['is_valid']:
            return parsed['dob']
        return obj.t_lahir
    
    def get_calculated_age(self, obj):
        """Return calculated age based on parsed DOB"""
        parsed = parse_identification_number(obj.nric)
        if parsed and parsed['type'] == 'nric' and parsed['is_valid']:
            return parsed['age']
        
        # Fallback to manual age if available
        if obj.umur:
            try:
                return int(obj.umur)
            except (ValueError, TypeError):
                pass
        return None
    
    def get_parsed_gender(self, obj):
        """Return gender parsed from NRIC"""
        parsed = parse_identification_number(obj.nric)
        if parsed and parsed['type'] == 'nric' and parsed['is_valid']:
            return parsed['gender']
        return obj.jantina
    
    def get_identification_type(self, obj):
        """Return identification type (nric or passport)"""
        parsed = parse_identification_number(obj.nric)
        return parsed['type'] if parsed else 'unknown'
    
    def get_formatted_nric(self, obj):
        """Return formatted NRIC with dashes"""
        from .utils import format_nric
        return format_nric(obj.nric)
    
    def get_is_nric_valid(self, obj):
        """Return validation status for NRIC"""
        parsed = parse_identification_number(obj.nric)
        return parsed['is_valid'] if parsed else False
    
    def validate(self, data):
        """Custom validation for the serializer"""
        nric = data.get('nric')
        if nric:
            parsed = parse_identification_number(nric)
            if parsed['type'] == 'nric' and not parsed['is_valid']:
                raise serializers.ValidationError({
                    'nric': 'Invalid NRIC format. Please use YYMMDD-XX-XXXX format'
                })
        
        # Auto-populate fields based on NRIC
        if nric:
            parsed = parse_identification_number(nric)
            if parsed['type'] == 'nric' and parsed['is_valid']:
                # Auto-calculate age if not provided
                if not data.get('umur'):
                    data['umur'] = str(parsed['age'])
                # Auto-set gender if not provided
                if not data.get('jantina'):
                    data['jantina'] = parsed['gender']
        
        return data 