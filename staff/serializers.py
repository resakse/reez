from rest_framework import serializers
from .models import Staff

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Staff
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class StaffSerializer(serializers.ModelSerializer):
    nama = serializers.SerializerMethodField()
    
    class Meta:
        model = Staff
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'jawatan', 'klinik', 'is_active', 'is_staff', 'is_superuser', 'komen', 'kemaskini', 'nama']
        read_only_fields = ['kemaskini']
    
    def get_nama(self, obj):
        return obj.nama()

class StaffCreateUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = Staff
        fields = ['username', 'first_name', 'last_name', 'email', 'jawatan', 'klinik', 'is_active', 'is_staff', 'is_superuser', 'komen', 'password']
    
    def validate(self, attrs):
        request = self.context.get('request')
        
        # Only superusers can create/update other superusers
        if attrs.get('is_superuser', False):
            if not (request and request.user and request.user.is_superuser):
                raise serializers.ValidationError(
                    "Only superusers can grant superuser privileges."
                )
        
        # Auto-set is_staff=True for Juru X-Ray position
        if attrs.get('jawatan') == 'Juru X-Ray':
            attrs['is_staff'] = True
            
        return attrs
    
    def create(self, validated_data):
        password = validated_data.pop('password', None)
        staff = Staff.objects.create(**validated_data)
        if password:
            staff.set_password(password)
            staff.save()
        return staff
    
    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance