from rest_framework import serializers

from .models import LoopEvent, PracticeSession, SavedLoop


class LoopEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoopEvent
        fields = ['measure_start', 'measure_end', 'loop_count']


class StartSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PracticeSession
        fields = ['id', 'song', 'started_at']
        read_only_fields = ['id', 'started_at']


class EndSessionSerializer(serializers.Serializer):
    ended_at = serializers.DateTimeField()
    bpm_percent = serializers.FloatField(required=False, allow_null=True)
    total_bars = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    loop_events = LoopEventSerializer(many=True, required=False, default=list)


class SavedLoopSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedLoop
        fields = ['id', 'name', 'measure_start', 'measure_end', 'created_at']
        read_only_fields = ['id', 'created_at']
