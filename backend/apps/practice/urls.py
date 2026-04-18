from django.urls import path

from .views import (
    DashboardView,
    EndSessionView,
    SavedLoopDetailView,
    SavedLoopListView,
    SongStatsView,
    StartSessionView,
)

urlpatterns = [
    path('sessions/', StartSessionView.as_view()),
    path('sessions/<int:pk>/', EndSessionView.as_view()),
    path('songs/<int:song_id>/stats/', SongStatsView.as_view()),
    path('songs/<int:song_id>/saved-loops/', SavedLoopListView.as_view()),
    path('saved-loops/<int:pk>/', SavedLoopDetailView.as_view()),
    path('dashboard/', DashboardView.as_view()),
]
