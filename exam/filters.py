import django_filters
from django_filters import DateRangeFilter, DateFromToRangeFilter
from django.db.models import Q

from exam.models import Daftar


class DaftarFilter(django_filters.FilterSet):
    bcs__tarikh = DateFromToRangeFilter()
    carian = django_filters.CharFilter(method="carian_filter", label="Carian")

    class Meta:
        model = Daftar
        fields = ["merged", "exam__modaliti", "bcs__tarikh", "carian"]

    def carian_filter(self, queryset, name, value):
        return queryset.filter(
            Q(bcs__mrn__icontains=value)
            | Q(bcs__nric__icontains=value)
            | Q(bcs__nama__icontains=value)
            | Q(nobcs__icontains=value)
        )
