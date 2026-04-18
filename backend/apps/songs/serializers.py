from rest_framework import serializers
from .models import Song, Genre, SongVideo


class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ('id', 'name', 'slug')


class SongVideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = SongVideo
        fields = ('id', 'url', 'title', 'song')
        extra_kwargs = {'song': {'write_only': True}}


class SongListSerializer(serializers.ModelSerializer):
    genre = GenreSerializer(read_only=True)
    uploaded_by = serializers.StringRelatedField(read_only=True)
    file_extension = serializers.SerializerMethodField()
    videos_count = serializers.IntegerField(source='videos.count', read_only=True)

    class Meta:
        model = Song
        fields = (
            'id', 'title', 'artist', 'album', 'year',
            'genre', 'difficulty', 'uploaded_by',
            'play_count', 'videos_count', 'created_at', 'file_extension',
        )

    def get_file_extension(self, obj):
        import os
        return os.path.splitext(obj.tab_file.name)[1].lower() if obj.tab_file else ''


class SongDetailSerializer(serializers.ModelSerializer):
    genre = GenreSerializer(read_only=True)
    genre_id = serializers.PrimaryKeyRelatedField(
        queryset=Genre.objects.all(), source='genre', write_only=True, required=False, allow_null=True
    )
    uploaded_by = serializers.StringRelatedField(read_only=True)
    tab_file_url = serializers.SerializerMethodField()
    videos = SongVideoSerializer(many=True, read_only=True)

    class Meta:
        model = Song
        fields = (
            'id', 'title', 'artist', 'album', 'year',
            'genre', 'genre_id', 'difficulty', 'description',
            'tab_file', 'tab_file_url', 'uploaded_by',
            'play_count', 'videos', 'created_at', 'updated_at',
        )
        extra_kwargs = {
            'tab_file': {'write_only': True},
        }

    def get_tab_file_url(self, obj):
        request = self.context.get('request')
        if obj.tab_file and request:
            return request.build_absolute_uri(obj.tab_file.url)
        return None

    def create(self, validated_data):
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)
