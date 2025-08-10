from rest_framework import serializers
from .models import DicomAnnotation


class DicomAnnotationSerializer(serializers.ModelSerializer):
    """
    Serializer for DicomAnnotation model with user ownership validation.
    """
    user_full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    can_delete = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    display_name = serializers.CharField(source='get_display_name', read_only=True)
    measurement_display = serializers.CharField(source='get_measurement_display', read_only=True)
    
    class Meta:
        model = DicomAnnotation
        fields = [
            'id', 'study_instance_uid', 'series_instance_uid', 
            'sop_instance_uid', 'image_id', 'frame_number',
            'annotation_type', 'annotation_data', 'cornerstone_annotation_uid', 
            'label', 'description', 'measurement_value', 'measurement_unit', 
            'created_at', 'modified_at', 'user', 'user_full_name', 'user_username', 
            'can_delete', 'can_edit', 'display_name', 'measurement_display'
        ]
        read_only_fields = [
            'id', 'created_at', 'modified_at', 'user', 'user_full_name', 
            'user_username', 'can_delete', 'can_edit', 'display_name', 
            'measurement_display'
        ]
        
    def get_can_delete(self, obj):
        """Check if current user can delete this annotation"""
        request = self.context.get('request')
        return obj.can_delete(request.user) if request and request.user else False

    def get_can_edit(self, obj):
        """Check if current user can edit this annotation"""
        request = self.context.get('request')
        return obj.can_edit(request.user) if request and request.user else False

    def validate_annotation_data(self, value):
        """Validate annotation_data is proper JSON"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Annotation data must be a valid JSON object")
        
        # Basic validation for required fields
        if not value:
            raise serializers.ValidationError("Annotation data cannot be empty")
            
        return value
        
    def validate_measurement_value(self, value):
        """Validate measurement value is positive"""
        if value is not None and value < 0:
            raise serializers.ValidationError("Measurement value must be positive")
        return value

    def validate(self, data):
        """Custom validation for the entire annotation"""
        # Ensure measurement fields are consistent
        measurement_value = data.get('measurement_value')
        measurement_unit = data.get('measurement_unit', '')
        
        if measurement_value is not None and not measurement_unit:
            # Auto-assign unit based on annotation type if not provided
            annotation_type = data.get('annotation_type', '')
            if annotation_type in ['length', 'bidirectional']:
                data['measurement_unit'] = 'mm'
            elif annotation_type in ['ellipse', 'rectangle', 'circle']:
                data['measurement_unit'] = 'mm²'
            elif annotation_type in ['angle']:
                data['measurement_unit'] = '°'
        
        return data


class DicomAnnotationListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing annotations.
    """
    user_full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    can_delete = serializers.SerializerMethodField()
    display_name = serializers.CharField(source='get_display_name', read_only=True)
    measurement_display = serializers.CharField(source='get_measurement_display', read_only=True)
    
    class Meta:
        model = DicomAnnotation
        fields = [
            'id', 'study_instance_uid', 'series_instance_uid', 'sop_instance_uid',
            'annotation_type', 'label', 'display_name', 'measurement_display', 
            'created_at', 'user', 'user_full_name', 'can_delete',
            'cornerstone_annotation_uid', 'annotation_data', 'image_id'  # Include data for restoration
        ]
        read_only_fields = [
            'id', 'created_at', 'user', 'user_full_name', 'can_delete', 
            'display_name', 'measurement_display'
        ]
        
    def get_can_delete(self, obj):
        """Check if current user can delete this annotation"""
        request = self.context.get('request')
        return obj.can_delete(request.user) if request and request.user else False


class DicomAnnotationCreateSerializer(serializers.ModelSerializer):
    """
    Serializer optimized for creating annotations (auto-save).
    """
    
    class Meta:
        model = DicomAnnotation
        fields = [
            'study_instance_uid', 'series_instance_uid', 
            'sop_instance_uid', 'image_id', 'frame_number',
            'annotation_type', 'annotation_data', 'cornerstone_annotation_uid',
            'label', 'description', 'measurement_value', 'measurement_unit'
        ]
        
    def validate_annotation_data(self, value):
        """Validate annotation_data is proper JSON"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Annotation data must be a valid JSON object")
        return value