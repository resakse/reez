from rest_framework import serializers
from .models import Staff

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Staff
        fields = ['id', 'username', 'first_name', 'last_name', 'email']