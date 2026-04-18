import django_filters
from .models import Song


class SongFilter(django_filters.FilterSet):
    artist = django_filters.CharFilter(lookup_expr='icontains')
    title = django_filters.CharFilter(lookup_expr='icontains')
    genre = django_filters.CharFilter(field_name='genre__slug', lookup_expr='exact')
    difficulty_min = django_filters.NumberFilter(field_name='difficulty', lookup_expr='gte')
    difficulty_max = django_filters.NumberFilter(field_name='difficulty', lookup_expr='lte')
    year_min = django_filters.NumberFilter(field_name='year', lookup_expr='gte')
    year_max = django_filters.NumberFilter(field_name='year', lookup_expr='lte')

    class Meta:
        model = Song
        fields = ['artist', 'title', 'genre', 'difficulty_min', 'difficulty_max', 'year_min', 'year_max']
