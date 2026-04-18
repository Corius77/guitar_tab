from django.contrib import admin

from .models import LoopEvent, PracticeSession


class LoopEventInline(admin.TabularInline):
    model = LoopEvent
    extra = 0
    readonly_fields = ['measure_start', 'measure_end', 'loop_count']


@admin.register(PracticeSession)
class PracticeSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'song', 'started_at', 'duration_seconds', 'bpm_percent', 'total_bars']
    list_filter = ['user', 'song']
    inlines = [LoopEventInline]
    readonly_fields = ['started_at']
