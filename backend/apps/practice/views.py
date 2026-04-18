from datetime import date, timedelta

from django.db.models import Count, Max, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LoopEvent, PracticeSession, SavedLoop
from .serializers import EndSessionSerializer, SavedLoopSerializer, StartSessionSerializer


class StartSessionView(CreateAPIView):
    """POST /api/practice/sessions/ — rozpoczyna sesję ćwiczeń."""
    serializer_class = StartSessionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class EndSessionView(APIView):
    """PATCH /api/practice/sessions/{pk}/ — kończy sesję i zapisuje zdarzenia pętli."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            session = PracticeSession.objects.get(pk=pk, user=request.user)
        except PracticeSession.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.ended_at is not None:
            return Response({'detail': 'Session already ended.'}, status=status.HTTP_400_BAD_REQUEST)

        ser = EndSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        ended_at = d['ended_at']
        session.ended_at = ended_at
        session.bpm_percent = d.get('bpm_percent')
        session.total_bars = d.get('total_bars')
        session.duration_seconds = max(0, int((ended_at - session.started_at).total_seconds()))
        session.save()

        LoopEvent.objects.bulk_create([
            LoopEvent(session=session, **le)
            for le in d.get('loop_events', [])
            if le['loop_count'] > 0
        ])

        return Response({'duration_seconds': session.duration_seconds})


class SongStatsView(APIView):
    """GET /api/practice/songs/{song_id}/stats/ — statystyki piosenki dla zalogowanego użytkownika."""
    permission_classes = [IsAuthenticated]

    def get(self, request, song_id):
        sessions = PracticeSession.objects.filter(
            user=request.user,
            song_id=song_id,
            ended_at__isnull=False,
        )

        agg = sessions.aggregate(
            total_sessions=Count('id'),
            total_seconds=Sum('duration_seconds'),
            best_bpm=Max('bpm_percent'),
        )
        total_sessions = agg['total_sessions'] or 0
        total_seconds = agg['total_seconds'] or 0
        best_bpm = agg['best_bpm']

        # Liczba taktów z ostatniej sesji, która ją podała
        total_bars = (
            sessions.filter(total_bars__isnull=False)
            .order_by('-started_at')
            .values_list('total_bars', flat=True)
            .first()
        )

        # Heatmapa: measure → suma loop_count
        loop_events = LoopEvent.objects.filter(session__in=sessions)
        measure_heat: dict[int, int] = {}
        for le in loop_events.values('measure_start', 'measure_end', 'loop_count'):
            for m in range(le['measure_start'], le['measure_end'] + 1):
                measure_heat[m] = measure_heat.get(m, 0) + le['loop_count']

        # Pokrycie: unikalne takty ćwiczone pętlą / wszystkie takty
        if total_bars:
            coverage = round(len(measure_heat) / total_bars * 100, 1) if measure_heat else 0.0
        else:
            coverage = None

        # Ostatnie sesje
        recent = [
            {
                'id': s.id,
                'started_at': s.started_at,
                'duration_seconds': s.duration_seconds,
                'bpm_percent': s.bpm_percent,
            }
            for s in sessions.order_by('-started_at')[:5]
        ]

        return Response({
            'total_sessions': total_sessions,
            'total_seconds': total_seconds,
            'best_bpm_percent': best_bpm,
            'coverage_percent': coverage,
            'total_bars': total_bars,
            'measure_heat': {str(k): v for k, v in measure_heat.items()},
            'recent_sessions': recent,
        })


class SavedLoopListView(APIView):
    """GET/POST /api/practice/songs/{song_id}/saved-loops/ — lista i zapis pętli."""
    permission_classes = [IsAuthenticated]

    def get(self, request, song_id):
        loops = SavedLoop.objects.filter(user=request.user, song_id=song_id)
        return Response(SavedLoopSerializer(loops, many=True).data)

    def post(self, request, song_id):
        ser = SavedLoopSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(user=request.user, song_id=song_id)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class SavedLoopDetailView(APIView):
    """DELETE /api/practice/saved-loops/{pk}/ — usuwa zapisaną pętlę."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            loop = SavedLoop.objects.get(pk=pk, user=request.user)
        except SavedLoop.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        loop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardView(APIView):
    """GET /api/practice/dashboard/ — ogólny dashboard progresji."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = PracticeSession.objects.filter(
            user=request.user,
            ended_at__isnull=False,
        )

        agg = sessions.aggregate(
            total_sessions=Count('id'),
            total_seconds=Sum('duration_seconds'),
        )
        total_sessions = agg['total_sessions'] or 0
        total_seconds = agg['total_seconds'] or 0

        # Streak: ile kolejnych dni wstecz od dziś
        practiced_dates = set(sessions.values_list('started_at__date', flat=True))
        streak = 0
        check = date.today()
        while check in practiced_dates:
            streak += 1
            check -= timedelta(days=1)

        # Aktywność z ostatnich 84 dni (12 tygodni)
        cutoff = timezone.now() - timedelta(days=84)
        daily_seconds: dict[str, int] = {}
        for s in sessions.filter(started_at__gte=cutoff).values('started_at__date', 'duration_seconds'):
            d = s['started_at__date'].isoformat()
            daily_seconds[d] = daily_seconds.get(d, 0) + (s['duration_seconds'] or 0)

        # Ćwiczone piosenki
        songs = list(
            sessions.values('song_id', 'song__title', 'song__artist')
            .annotate(
                session_count=Count('id'),
                last_practiced=Max('started_at'),
                best_bpm=Max('bpm_percent'),
                total_song_seconds=Sum('duration_seconds'),
            )
            .order_by('-last_practiced')[:15]
        )

        return Response({
            'total_sessions': total_sessions,
            'total_seconds': total_seconds,
            'streak_days': streak,
            'daily_seconds': daily_seconds,
            'songs': songs,
        })
