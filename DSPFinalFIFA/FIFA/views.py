"""
Views for FIFA World Cup Data Visualization
This module provides three key components:
1. DataLoader: Singleton for loading/caching FIFA World Cup JSON files
2. MatchService: Business logic layer for match operations
3. Django Views: HTTP endpoints for web UI and REST API

Architecture:
- DataLoader handles file I/O and caching
- MatchService transforms raw JSON into domain models
- Views orchestrate requests and return HTTP responses"""
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render

from .models import (
    Match, Team, Stadium,
    GoalEvent, GoalSequence, EventFactory
)


class DataLoader:
    """Singleton data loader for FIFA World Cup JSON files.
    
    Responsibilities:
    - Load metadata, events, and roster JSON files from disk
    - Cache loaded data in memory to avoid repeated file I/O
    - Provide unified interface for accessing match data
    
    Design Pattern: Singleton
    Only one instance exists per server process, ensuring a single
    shared cache across all requests.
    """
    
    _instance = None  # Singleton instance
    _cache: Dict[str, Any] = {}  # In-memory cache: {cache_key: data}
    
    def __new__(cls):
        """Singleton constructor - always returns the same instance.
        
        This ensures the cache is shared across all DataLoader usages,
        preventing memory bloat from multiple caches.
        """
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @property
    def data_dir(self) -> Path:
        """Root directory containing all FIFA World Cup data files."""
        return Path(settings.BASE_DIR) / 'FIFA_datan'
    
    def load_metadata(self, match_id: str) -> Optional[Dict]:
        """Load match metadata (teams, stadium, competition info).
        
        Args:
            match_id: Unique match identifier (e.g., '3812', '10502')
        
        Returns:
            Dict with match metadata or None if file not found
        
        Cache Strategy:
            Uses cache key 'metadata_{match_id}' to avoid reloading
        """
        cache_key = f"metadata_{match_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        filepath = self.data_dir / 'Metadata' / f'{match_id}.json'
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Metadata format: single object wrapped in array
                result = data[0] if isinstance(data, list) and len(data) > 0 else data
                self._cache[cache_key] = result
                return result
        return None
    
    def load_events(self, match_id: str) -> List[Dict]:
        """Load match events"""
        cache_key = f"events_{match_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        filepath = self.data_dir / 'Event Data' / f'{match_id}.json'
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self._cache[cache_key] = data
                return data
        return []
    
    def load_roster(self, match_id: str) -> List[Dict]:
        """Load match roster"""
        cache_key = f"roster_{match_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        filepath = self.data_dir / 'Rosters' / f'{match_id}.json'
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self._cache[cache_key] = data
                return data
        return []
    
    def get_all_match_ids(self) -> List[str]:
        """Get all available match IDs"""
        metadata_dir = self.data_dir / 'Metadata'
        if metadata_dir.exists():
            return [f.stem for f in metadata_dir.glob('*.json')]
        return []
    
    def clear_cache(self):
        """Clear the data cache"""
        self._cache.clear()


class MatchService:
    """Business logic layer for match operations.
    
    Responsibilities:
    - Transform raw JSON into domain models (Match, Team, Stadium)
    - Extract goals and build goal sequences with context
    - Enrich events with player names from roster
    
    Separation of Concerns:
    - DataLoader handles file I/O
    - MatchService handles business logic
    - Views orchestrate HTTP requests
    """
    
    def __init__(self):
        """Initialize with singleton DataLoader instance."""
        self.loader = DataLoader()

    @staticmethod
    def _build_team(team_data: Dict, kit_data: Dict) -> Team:
        """Construct Team model from raw metadata.
        
        Args:
            team_data: Team info (id, name, shortName)
            kit_data: Jersey colors (primaryColor, etc.)
        
        Returns:
            Team model with all attributes populated
        
        Why Static:
            Pure transformation - no instance state needed
        """
        return Team(
            id=int(team_data.get('id', 0)),
            name=team_data.get('name', ''),
            short_name=team_data.get('shortName', ''),
            primary_color=kit_data.get('primaryColor', '#ffffff'),
            primary_text_color=kit_data.get('primaryTextColor', '#000000'),
            secondary_color=kit_data.get('secondaryColor', '#000000')
        )
    
    def get_all_matches(self) -> List[Match]:
        """Get all matches with basic info"""
        matches = []
        match_ids = self.loader.get_all_match_ids()
        
        for match_id in match_ids:
            match = self.get_match(match_id)
            if match:
                matches.append(match)
        
        # Sort by date
        matches.sort(key=lambda m: m.date)
        return matches
    
    def get_match(self, match_id: str) -> Optional[Match]:
        """Get match with metadata and goals"""
        metadata = self.loader.load_metadata(match_id)
        if not metadata:
            return None
        
        # Build teams
        home_team_data = metadata.get('homeTeam', {})
        home_kit = metadata.get('homeTeamKit', {})
        home_team = self._build_team(home_team_data, home_kit)
        
        away_team_data = metadata.get('awayTeam', {})
        away_kit = metadata.get('awayTeamKit', {})
        away_team = self._build_team(away_team_data, away_kit)
        
        # Stadium
        stadium_data = metadata.get('stadium', {})
        pitches = stadium_data.get('pitches', [{}])
        pitch = pitches[0] if pitches else {}
        stadium = Stadium(
            id=int(stadium_data.get('id', 0)),
            name=stadium_data.get('name', ''),
            pitch_length=pitch.get('length', 105.0),
            pitch_width=pitch.get('width', 68.0)
        )
        
        # Create match
        match = Match(
            id=match_id,
            date=metadata.get('date', ''),
            competition=metadata.get('competition', {}).get('name', ''),
            season=metadata.get('season', ''),
            home_team=home_team,
            away_team=away_team,
            stadium=stadium
        )
        
        return match
    
    def get_match_goals(self, match_id: str, num_preceding: int = 5) -> List[GoalSequence]:
        """Extract all goals with context (preceding buildup events).
        
        Args:
            match_id: Unique match identifier
            num_preceding: Number of events before goal to include (default: 5)
        
        Returns:
            List of GoalSequence models with goal + context events
        
        Algorithm:
            1. Load events and roster
            2. Build player ID to name lookup map
            3. Iterate through events chronologically
            4. When goal found, capture preceding N events
            5. Enrich all events with player names from roster
        """
        match = self.get_match(match_id)
        if not match:
            return []
        
        events_data = self.loader.load_events(match_id)
        roster_data = self.loader.load_roster(match_id)
        
        # Build player name lookup from roster
        player_names = {}
        for p in roster_data:
            player_info = p.get('player', {})
            player_id = player_info.get('id')
            if player_id:
                player_names[int(player_id)] = player_info.get('nickname', '')
        
        # Find goal events
        goals = []
        all_events = []
        
        for i, event_data in enumerate(events_data):
            event = EventFactory.create_event(event_data)
            if event:
                # Add player names from roster
                for player in event.home_players + event.away_players:
                    if player.id in player_names:
                        player.name = player_names[player.id]
                
                all_events.append((i, event))
                
                if isinstance(event, GoalEvent):
                    # Get preceding events
                    start_idx = max(0, len(all_events) - num_preceding - 1)
                    preceding = [e for _, e in all_events[start_idx:-1]]
                    
                    goal_seq = GoalSequence(
                        goal_event=event,
                        preceding_events=preceding,
                        home_team=match.home_team,
                        away_team=match.away_team
                    )
                    goals.append(goal_seq)
        
        return goals


# Django Views

def index(request):
    """Main page view"""
    service = MatchService()
    matches = service.get_all_matches()
    
    context = {
        'matches': [m.to_dict() for m in matches]
    }
    return render(request, 'index.html', context)


def api_matches(request):
    """API: Get all matches"""
    service = MatchService()
    matches = service.get_all_matches()
    return JsonResponse({
        'matches': [m.to_dict() for m in matches]
    })


def api_match_goals(request, match_id):
    """API: Get goals for a specific match"""
    service = MatchService()
    match = service.get_match(match_id)
    goals = service.get_match_goals(match_id)
    
    if not match:
        return JsonResponse({'error': 'Match not found'}, status=404)
    
    return JsonResponse({
        'match': match.to_dict(),
        'goals': [g.to_dict() for g in goals]
    })


def api_goal_detail(request, match_id, goal_index):
    """API: Get specific goal details"""
    service = MatchService()
    goals = service.get_match_goals(match_id)
    
    if goal_index >= len(goals):
        return JsonResponse({'error': 'Goal not found'}, status=404)
    
    return JsonResponse(goals[goal_index].to_dict())
