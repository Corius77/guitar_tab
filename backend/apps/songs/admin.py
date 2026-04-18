from django.contrib import admin
from .models import Song, Genre


@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ('title', 'artist', 'genre', 'difficulty', 'play_count', 'uploaded_by', 'created_at')
    list_filter = ('genre', 'difficulty', 'year')
    search_fields = ('title', 'artist', 'album')
    readonly_fields = ('play_count', 'created_at', 'updated_at')
    raw_id_fields = ('uploaded_by',)
