"""
OOP Models for FIFA World Cup Data Visualization
Implements: Encapsulation, Abstraction, Inheritance, Polymorphism
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod


@dataclass
class Position:
    """Encapsulates x, y coordinates on the pitch"""
    x: float
    y: float
    z: float = 0.0
    
    def to_dict(self) -> Dict[str, float]:
        return {'x': self.x, 'y': self.y, 'z': self.z}
    
    def to_pitch_coords(self, pitch_length: float = 105.0, pitch_width: float = 68.0) -> Dict[str, float]:
        """Convert to percentage-based pitch coordinates for rendering"""
        # Data uses center as origin, convert to top-left origin percentage
        x_pct = ((self.x + pitch_length / 2) / pitch_length) * 100
        y_pct = ((self.y + pitch_width / 2) / pitch_width) * 100
        return {'x': x_pct, 'y': y_pct}


@dataclass
class Player:
    """Encapsulates player data"""
    id: int
    name: str
    jersey_number: int
    position_type: str
    team_id: Optional[int] = None
    
    # Position at a specific moment (optional)
    position: Optional[Position] = None
    speed: float = 0.0
    confidence: str = "MEDIUM"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'jerseyNumber': self.jersey_number,
            'positionType': self.position_type,
            'teamId': self.team_id,
            'position': self.position.to_dict() if self.position else None,
            'speed': self.speed
        }


@dataclass
class Team:
    """Encapsulates team data with kit colors"""
    id: int
    name: str
    short_name: str
    primary_color: str = "#ffffff"
    primary_text_color: str = "#000000"
    secondary_color: str = "#000000"
    players: List[Player] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'shortName': self.short_name,
            'primaryColor': self.primary_color,
            'primaryTextColor': self.primary_text_color,
            'secondaryColor': self.secondary_color
        }


@dataclass
class Stadium:
    """Encapsulates stadium/pitch data"""
    id: int
    name: str
    pitch_length: float = 105.0
    pitch_width: float = 68.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'pitchLength': self.pitch_length,
            'pitchWidth': self.pitch_width
        }


class Event(ABC):
    """
    Abstract base class for all events (Abstraction)
    Subclasses implement specific event behavior (Polymorphism)
    """
    def __init__(self, event_data: Dict[str, Any]):
        self._data = event_data  # Encapsulation - private data
        self.game_id = event_data.get('gameId')
        self.event_id = event_data.get('gameEventId')
        self.start_time = event_data.get('startTime', 0)
        self.event_time = event_data.get('eventTime', 0)
        self.sequence = event_data.get('sequence')
        
        # Extract game events
        game_events = event_data.get('gameEvents', {})
        self.event_type = game_events.get('gameEventType')
        self.period = game_events.get('period')
        self.game_clock = game_events.get('startGameClock', 0)
        self.formatted_time = game_events.get('startFormattedGameClock', '')
        self.team_id = game_events.get('teamId')
        self.team_name = game_events.get('teamName')
        self.player_id = game_events.get('playerId')
        self.player_name = game_events.get('playerName')
        self.video_url = game_events.get('videoUrl')
        
        # Extract ball position
        self.ball_position = self._extract_ball_position(event_data)
        
        # Extract player positions
        self.home_players = self._extract_players(event_data.get('homePlayers', []))
        self.away_players = self._extract_players(event_data.get('awayPlayers', []))
        
        # Stadium metadata
        stadium_data = event_data.get('stadiumMetadata', {})
        self.stadium = Stadium(
            id=stadium_data.get('stadiumId', 0),
            name=stadium_data.get('stadiumName', ''),
            pitch_length=stadium_data.get('pitchLength', 105.0),
            pitch_width=stadium_data.get('pitchWidth', 68.0)
        )
    
    def _extract_players(self, players_data: List[Dict]) -> List[Player]:
        """Extract player data from event"""
        players = []
        for p in players_data:
            player = Player(
                id=p.get('playerId', 0),
                name='',  # Name not in position data
                jersey_number=p.get('jerseyNum', 0),
                position_type=p.get('positionGroupType', ''),
                position=Position(
                    x=p.get('x', 0),
                    y=p.get('y', 0)
                ),
                speed=p.get('speed', 0),
                confidence=p.get('confidence', 'MEDIUM')
            )
            players.append(player)
        return players

    @staticmethod
    def _extract_ball_position(event_data: Dict[str, Any]) -> Optional[Position]:
        """Extract ball position from raw event data if present."""
        ball_data = event_data.get('ball', [{}])
        if ball_data and len(ball_data) > 0:
            b = ball_data[0]
            return Position(
                x=b.get('x', 0),
                y=b.get('y', 0),
                z=b.get('z', 0)
            )
        return None
    
    @abstractmethod
    def get_event_label(self) -> str:
        """Return human-readable label for this event type"""
        pass
    
    @abstractmethod
    def to_dict(self) -> Dict[str, Any]:
        """Serialize event to dictionary"""
        pass
    
    def get_base_dict(self) -> Dict[str, Any]:
        """Common dict properties for all events"""
        return {
            'gameId': self.game_id,
            'eventId': self.event_id,
            'eventType': self.event_type,
            'period': self.period,
            'formattedTime': self.formatted_time,
            'teamId': self.team_id,
            'teamName': self.team_name,
            'playerId': self.player_id,
            'playerName': self.player_name,
            'ballPosition': self.ball_position.to_dict() if self.ball_position else None,
            'homePlayers': [p.to_dict() for p in self.home_players],
            'awayPlayers': [p.to_dict() for p in self.away_players],
            'stadium': self.stadium.to_dict()
        }


class PassEvent(Event):
    """Pass event - Inheritance from Event"""
    
    def __init__(self, event_data: Dict[str, Any]):
        super().__init__(event_data)
        
        poss = event_data.get('possessionEvents', {})
        self.possession_type = poss.get('possessionEventType')
        self.passer_id = poss.get('passerPlayerId')
        self.passer_name = poss.get('passerPlayerName')
        self.target_id = poss.get('targetPlayerId')
        self.target_name = poss.get('targetPlayerName')
        self.receiver_id = poss.get('receiverPlayerId')
        self.receiver_name = poss.get('receiverPlayerName')
        self.pass_type = poss.get('passType')
        self.pass_outcome = poss.get('passOutcomeType')
        self.accuracy = poss.get('accuracyType')
    
    def get_event_label(self) -> str:
        outcome = "Complete" if self.pass_outcome == 'C' else "Incomplete"
        return f"Pass ({outcome})"
    
    def to_dict(self) -> Dict[str, Any]:
        d = self.get_base_dict()
        d.update({
            'label': self.get_event_label(),
            'passerId': self.passer_id,
            'passerName': self.passer_name,
            'targetId': self.target_id,
            'targetName': self.target_name,
            'receiverId': self.receiver_id,
            'receiverName': self.receiver_name,
            'passType': self.pass_type,
            'passOutcome': self.pass_outcome
        })
        return d


class ShotEvent(Event):
    """Shot event - Inheritance from Event"""
    
    def __init__(self, event_data: Dict[str, Any]):
        super().__init__(event_data)
        
        poss = event_data.get('possessionEvents', {})
        self.shooter_id = poss.get('shooterPlayerId')
        self.shooter_name = poss.get('shooterPlayerName')
        self.shot_type = poss.get('shotType')
        self.shot_outcome = poss.get('shotOutcomeType')
        self.body_type = poss.get('bodyType')
        self.keeper_id = poss.get('keeperPlayerId')
        self.keeper_name = poss.get('keeperPlayerName')
    
    def get_event_label(self) -> str:
        return f"Shot"
    
    def to_dict(self) -> Dict[str, Any]:
        d = self.get_base_dict()
        d.update({
            'label': self.get_event_label(),
            'shooterId': self.shooter_id,
            'shooterName': self.shooter_name,
            'shotType': self.shot_type,
            'shotOutcome': self.shot_outcome
        })
        return d


class GoalEvent(Event):
    """Goal event - Inheritance from Event"""
    
    def __init__(self, event_data: Dict[str, Any]):
        super().__init__(event_data)
        
        game_events = event_data.get('gameEvents', {})
        self.end_type = game_events.get('endType')  # 'G' = Goal
    
    def get_event_label(self) -> str:
        return "⚽ GOAL"
    
    def to_dict(self) -> Dict[str, Any]:
        d = self.get_base_dict()
        d.update({
            'label': self.get_event_label(),
            'isGoal': True
        })
        return d


class EventFactory:
    """Factory pattern to create appropriate event objects (Polymorphism)"""
    
    @staticmethod
    def create_event(event_data: Dict[str, Any]) -> Optional[Event]:
        game_events = event_data.get('gameEvents', {})
        event_type = game_events.get('gameEventType')
        end_type = game_events.get('endType')
        
        poss = event_data.get('possessionEvents', {})
        poss_type = poss.get('possessionEventType')
        
        # Goal event
        if event_type == 'END' and end_type == 'G':
            return GoalEvent(event_data)
        
        # Shot event
        if poss_type == 'SH' or poss.get('shooterPlayerId'):
            return ShotEvent(event_data)
        
        # Pass event
        if poss_type == 'PA':
            return PassEvent(event_data)
        
        # Default - return as PassEvent for now
        if event_type == 'OTB':
            return PassEvent(event_data)
        
        return None


@dataclass
class GoalSequence:
    """Aggregates events leading up to a goal"""
    goal_event: GoalEvent
    preceding_events: List[Event] = field(default_factory=list)
    home_team: Optional[Team] = None
    away_team: Optional[Team] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'goal': self.goal_event.to_dict(),
            'precedingEvents': [e.to_dict() for e in self.preceding_events],
            'homeTeam': self.home_team.to_dict() if self.home_team else None,
            'awayTeam': self.away_team.to_dict() if self.away_team else None
        }


@dataclass
class Match:
    """Encapsulates all match data"""
    id: str
    date: str
    competition: str
    season: str
    home_team: Team
    away_team: Team
    stadium: Stadium
    goals: List[GoalSequence] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'date': self.date,
            'competition': self.competition,
            'season': self.season,
            'homeTeam': self.home_team.to_dict(),
            'awayTeam': self.away_team.to_dict(),
            'stadium': self.stadium.to_dict(),
            'goals': [g.to_dict() for g in self.goals],
            'goalCount': len(self.goals)
        }
