from rest_framework import generics, permissions, status, filters
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Song, Genre
from .serializers import SongListSerializer, SongDetailSerializer, GenreSerializer
from .filters import SongFilter


class SongListCreateView(generics.ListCreateAPIView):
    queryset = Song.objects.select_related('genre', 'uploaded_by').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SongFilter
    search_fields = ['title', 'artist', 'album']
    ordering_fields = ['title', 'artist', 'play_count', 'created_at', 'year']
    ordering = ['-created_at']
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return SongDetailSerializer
        return SongListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]


class SongDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Song.objects.select_related('genre', 'uploaded_by').all()
    serializer_class = SongDetailSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_object(self):
        obj = super().get_object()
        # Only the uploader or staff can edit/delete
        if self.request.method not in permissions.SAFE_METHODS:
            if obj.uploaded_by != self.request.user and not self.request.user.is_staff:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('You do not have permission to modify this song.')
        return obj


class SongPlayView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        try:
            song = Song.objects.get(pk=pk)
        except Song.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        song.increment_play_count()
        return Response({'play_count': song.play_count + 1})


class GenreListView(generics.ListCreateAPIView):
    queryset = Genre.objects.all()
    serializer_class = GenreSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]
