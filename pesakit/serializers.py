from rest_framework import serializers
from .models import Pesakit

class PesakitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pesakit
        fields = ['id', 'mrn', 'nric', 'nama', 'bangsa', 'jantina', 'umur', 't_lahir'] 