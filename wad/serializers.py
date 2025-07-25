from rest_framework import serializers
from .models import Ward, Disiplin

class DisiplinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Disiplin
        fields = ['id', 'disiplin']

class WardSerializer(serializers.ModelSerializer):
    disiplin = DisiplinSerializer(read_only=True)
    disiplin_id = serializers.PrimaryKeyRelatedField(
        queryset=Disiplin.objects.all(),
        source='disiplin',
        write_only=True,
        allow_null=True
    )

    class Meta:
        model = Ward
        fields = ['id', 'wad', 'disiplin', 'disiplin_id']