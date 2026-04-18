from django.urls import path

from .views import DashboardView, EndSessionView, SongStatsView, StartSessionView

urlpatterns = [
    path('sessions/', StartSessionView.as_view()),
    path('sessions/<int:pk>/', EndSessionView.as_view()),
    path('songs/<int:song_id>/stats/', SongStatsView.as_view()),
    path('dashboard/', DashboardView.as_view()),
]
