import os
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

User = get_user_model()


def validate_guitar_pro_file(value):
    ext = os.path.splitext(value.name)[1].lower()
    if ext not in settings.ALLOWED_SONG_EXTENSIONS:
        raise ValidationError(
            f'Unsupported file type "{ext}". '
            f'Allowed: {", ".join(settings.ALLOWED_SONG_EXTENSIONS)}'
        )


def song_file_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    safe_name = slugify(instance.title) or 'song'
    return f'songs/{safe_name}{ext}'


class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Song(models.Model):
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    album = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    genre = models.ForeignKey(Genre, on_delete=models.SET_NULL, null=True, blank=True, related_name='songs')
    difficulty = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='1 (beginner) – 5 (expert)'
    )
    description = models.TextField(blank=True)
    tab_file = models.FileField(
        upload_to=song_file_upload_path,
        validators=[validate_guitar_pro_file],
    )
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='songs'
    )
    play_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.artist} – {self.title}'

    def increment_play_count(self):
        Song.objects.filter(pk=self.pk).update(play_count=models.F('play_count') + 1)


class SongVideo(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='videos')
    url = models.URLField(max_length=500)
    title = models.CharField(max_length=255, blank=True, help_text="Optional title for this video")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Video for {self.song.title}: {self.url}'
