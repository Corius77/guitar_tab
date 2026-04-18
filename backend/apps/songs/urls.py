from django.urls import path
from .views import (
    SongListCreateView, SongDetailView, SongPlayView, GenreListView,
    SongVideoCreateView, SongVideoDeleteView, SongVideoUpdateView
)

urlpatterns = [
    path('songs/', SongListCreateView.as_view(), name='song-list-create'),
    path('songs/<int:pk>/', SongDetailView.as_view(), name='song-detail'),
    path('songs/<int:pk>/play/', SongPlayView.as_view(), name='song-play'),
    path('songs/videos/', SongVideoCreateView.as_view(), name='song-video-create'),
    path('songs/videos/<int:pk>/', SongVideoDeleteView.as_view(), name='song-video-delete'),
    path('songs/videos/<int:pk>/update/', SongVideoUpdateView.as_view(), name='song-video-update'),
    path('genres/', GenreListView.as_view(), name='genre-list'),
]
