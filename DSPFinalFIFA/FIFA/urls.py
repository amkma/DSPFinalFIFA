"""
URL patterns for FIFA app
"""
from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/matches/', views.api_matches, name='api_matches'),
    path('api/matches/<str:match_id>/goals/', views.api_match_goals, name='api_match_goals'),
    path('api/matches/<str:match_id>/goals/<int:goal_index>/', views.api_goal_detail, name='api_goal_detail'),
]
