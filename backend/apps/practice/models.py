from django.contrib.auth import get_user_model
from django.db import models

from apps.songs.models import Song

User = get_user_model()


class PracticeSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='practice_sessions')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='practice_sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    bpm_percent = models.FloatField(null=True, blank=True)
    total_bars = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.user} – {self.song} @ {self.started_at:%Y-%m-%d}'


class LoopEvent(models.Model):
    session = models.ForeignKey(
        PracticeSession, on_delete=models.CASCADE, related_name='loop_events'
    )
    measure_start = models.PositiveIntegerField()
    measure_end = models.PositiveIntegerField()
    loop_count = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['measure_start']


class SavedLoop(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='saved_loops')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='saved_loops')
    name = models.CharField(max_length=100)
    measure_start = models.PositiveIntegerField()
    measure_end = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['measure_start', 'name']

    def __str__(self):
        return f'{self.name} ({self.measure_start}–{self.measure_end})'


def recording_upload_path(instance, filename):
    return f'recordings/{instance.user_id}/{instance.song_id}/{filename}'


class Recording(models.Model):
    FORMAT_WEBM = 'webm'
    FORMAT_WAV = 'wav'
    FORMAT_CHOICES = [
        (FORMAT_WEBM, 'WebM/Opus'),
        (FORMAT_WAV, 'WAV'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recordings')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='recordings')
    file = models.FileField(upload_to=recording_upload_path)
    format = models.CharField(max_length=8, choices=FORMAT_CHOICES, default=FORMAT_WEBM)
    mime_type = models.CharField(max_length=64, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    size_bytes = models.PositiveIntegerField(null=True, blank=True)
    bpm_percent = models.FloatField(null=True, blank=True)
    name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} – {self.song} ({self.created_at:%Y-%m-%d %H:%M})'
