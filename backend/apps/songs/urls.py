from django.urls import path
from .views import SongListCreateView, SongDetailView, SongPlayView, GenreListView

urlpatterns = [
    path('songs/', SongListCreateView.as_view(), name='song-list-create'),
    path('songs/<int:pk>/', SongDetailView.as_view(), name='song-detail'),
    path('songs/<int:pk>/play/', SongPlayView.as_view(), name='song-play'),
    path('genres/', GenreListView.as_view(), name='genre-list'),
]
