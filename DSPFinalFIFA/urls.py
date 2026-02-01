"""
URL configuration for DSPFinalFIFA project.
"""
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from DSPFinalFIFA.FIFA.fifa import index, api_matches, api_match_goals, api_match_plays

urlpatterns = [
    path('', index, name='index'),
    path('api/matches/', api_matches, name='api_matches'),
    path('api/matches/<str:match_id>/goals/', api_match_goals, name='api_match_goals'),
    path('api/matches/<str:match_id>/plays/', api_match_plays, name='api_match_plays'),
] + static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else None)
