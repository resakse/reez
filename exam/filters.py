import django_filters
from django_filters import DateRangeFilter, DateFromToRangeFilter
from django.db.models import Q

from exam.models import Daftar


class DaftarFilter(django_filters.FilterSet):
    tarikh = DateFromToRangeFilter()
    carian = django_filters.CharFilter(method="carian_filter", label="Carian")

    class Meta:
        model = Daftar
        fields = ['status','rujukan', "tarikh", "carian"]


    def carian_filter(self, queryset, name, value):
        return queryset.filter(
            Q(pesakit__mrn__icontains=value)
            | Q(pesakit__nric__icontains=value)
            | Q(pesakit__nama__icontains=value)
            # | Q(pemohon__icontains=value)
        )

    
