"""
FIFA World Cup 2022 Data Visualization
OOP-based implementation with 4 principles: Encapsulation, Abstraction, Inheritance, Polymorphism
"""
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Optional, Any
from pathlib import Path
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


# =============================================================================
# DATA PATH CONFIGURATION
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / 'FIFA_datan'

# Event type mapping for display
EVENT_LABELS = {
    'PA': 'Pass',
    'SH': 'Shot',
    'CR': 'Cross',
    'CL': 'Clearance',
    'CH': 'Challenge',
    'TC': 'Touch',
    'BC': 'Ball Carry',
    'IT': 'Initial Touch',
    'RE': 'Rebound'
}

# Setpiece type mapping
SETPIECE_LABELS = {
    'O': 'Open Play',
    'T': 'Throw-in',
    'C': 'Corner',
    'K': 'Kickoff',
    'P': 'Penalty',
    'G': 'Goal Kick',
    'F': 'Free Kick'
}


# =============================================================================
# ENCAPSULATION: Data classes encapsulate related data and behavior
# =============================================================================
@dataclass
class Position:
    """Encapsulates x, y coordinates on the pitch"""
    x: float
    y: float
    z: float = 0.0
    
    def to_dict(self) -> Dict:
        return {'x': self.x, 'y': self.y, 'z': self.z}
    
    def normalize(self, pitch_length: float = 105.0, pitch_width: float = 68.0) -> 'Position':
        """Normalize coordinates to 0-100 range for rendering"""
        norm_x = ((self.x + pitch_length / 2) / pitch_length) * 100
        norm_y = ((self.y + pitch_width / 2) / pitch_width) * 100
        return Position(norm_x, norm_y, self.z)


@dataclass
class Player:
    """Encapsulates player information"""
    player_id: int
    name: str
    jersey_number: int
    position_type: str
    position: Optional[Position] = None
    team_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            'id': self.player_id,
            'name': self.name,
            'jerseyNumber': self.jersey_number,
            'positionType': self.position_type,
            'position': self.position.to_dict() if self.position else None,
            'teamId': self.team_id
        }


@dataclass 
class Team:
    """Encapsulates team information"""
    team_id: str
    name: str
    short_name: str
    primary_color: str = "#ffffff"
    secondary_color: str = "#000000"
    text_color: str = "#000000"
    
    def to_dict(self) -> Dict:
        return {
            'id': self.team_id,
            'name': self.name,
            'shortName': self.short_name,
            'primaryColor': self.primary_color,
            'secondaryColor': self.secondary_color,
            'textColor': self.text_color
        }


# =============================================================================
# ABSTRACTION & INHERITANCE: Abstract base class for events
# =============================================================================
class Event(ABC):
    """Abstract base class for all match events - demonstrates Abstraction"""
    
    def __init__(self, event_data: Dict):
        self._raw_data = event_data
        self.event_id = event_data.get('gameEventId')
        self.event_time = event_data.get('eventTime', 0)
        self.game_clock = event_data.get('gameEvents', {}).get('startGameClock', 0)
        self.formatted_time = event_data.get('gameEvents', {}).get('startFormattedGameClock', '')
        self.period = event_data.get('gameEvents', {}).get('period', 1)
        self.team_id = str(event_data.get('gameEvents', {}).get('teamId', ''))
        self.team_name = event_data.get('gameEvents', {}).get('teamName', '')
        self.player_id = event_data.get('gameEvents', {}).get('playerId')
        self.player_name = event_data.get('gameEvents', {}).get('playerName', '')
        self.sequence = event_data.get('sequence')
        
        # Ball position
        ball_data = event_data.get('ball', [{}])
        if ball_data and len(ball_data) > 0:
            b = ball_data[0]
            self.ball_position = Position(
                b.get('x', 0), 
                b.get('y', 0), 
                b.get('z', 0)
            )
        else:
            self.ball_position = None
        
        # Player positions
        self.home_players = self._parse_players(event_data.get('homePlayers', []), is_home=True)
        self.away_players = self._parse_players(event_data.get('awayPlayers', []), is_home=False)
    
    def _parse_players(self, players_data: List[Dict], is_home: bool) -> List[Player]:
        """Parse player position data"""
        players = []
        for p in players_data:
            player = Player(
                player_id=p.get('playerId', 0),
                name='',  # Will be enriched later
                jersey_number=p.get('jerseyNum', 0),
                position_type=p.get('positionGroupType', ''),
                position=Position(p.get('x', 0), p.get('y', 0)),
                team_id='home' if is_home else 'away'
            )
            players.append(player)
        return players
    
    @abstractmethod
    def get_event_type(self) -> str:
        """Returns the type of event - abstract method"""
        pass
    
    @abstractmethod
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON response"""
        pass


class PassEvent(Event):
    """Pass event - inherits from Event"""
    
    def __init__(self, event_data: Dict):
        super().__init__(event_data)
        poss = event_data.get('possessionEvents', {})
        self.passer_id = poss.get('passerPlayerId')
        self.passer_name = poss.get('passerPlayerName', '')
        self.receiver_id = poss.get('receiverPlayerId')
        self.receiver_name = poss.get('receiverPlayerName', '')
        self.target_id = poss.get('targetPlayerId')
        self.target_name = poss.get('targetPlayerName', '')
        self.pass_type = poss.get('passType', '')
        self.pass_outcome = poss.get('passOutcomeType', '')
    
    def get_event_type(self) -> str:
        return 'pass'
    
    def to_dict(self) -> Dict:
        return {
            'type': self.get_event_type(),
            'eventId': self.event_id,
            'time': self.formatted_time,
            'period': self.period,
            'teamId': self.team_id,
            'teamName': self.team_name,
            'passerId': self.passer_id,
            'passerName': self.passer_name,
            'receiverId': self.receiver_id,
            'receiverName': self.receiver_name,
            'targetName': self.target_name,
            'passType': self.pass_type,
            'outcome': self.pass_outcome,
            'ballPosition': self.ball_position.to_dict() if self.ball_position else None
        }


class ShotEvent(Event):
    """Shot event - inherits from Event"""
    
    def __init__(self, event_data: Dict):
        super().__init__(event_data)
        poss = event_data.get('possessionEvents', {})
        self.shooter_id = poss.get('shooterPlayerId')
        self.shooter_name = poss.get('shooterPlayerName', '')
        self.shot_type = poss.get('shotType', '')
        self.shot_outcome = poss.get('shotOutcomeType', '')
        self.keeper_id = poss.get('keeperPlayerId')
        self.keeper_name = poss.get('keeperPlayerName', '')
    
    def get_event_type(self) -> str:
        return 'shot'
    
    def is_goal(self) -> bool:
        return self.shot_outcome == 'G'
    
    def to_dict(self) -> Dict:
        return {
            'type': self.get_event_type(),
            'eventId': self.event_id,
            'time': self.formatted_time,
            'period': self.period,
            'teamId': self.team_id,
            'teamName': self.team_name,
            'shooterId': self.shooter_id,
            'shooterName': self.shooter_name,
            'shotType': self.shot_type,
            'outcome': self.shot_outcome,
            'isGoal': self.is_goal(),
            'ballPosition': self.ball_position.to_dict() if self.ball_position else None
        }


class GoalEvent(Event):
    """Goal event - inherits from Event"""
    
    def __init__(self, event_data: Dict, preceding_events: List[Dict] = None):
        super().__init__(event_data)
        self.preceding_events = preceding_events or []
        game_events = event_data.get('gameEvents', {})
        self.end_type = game_events.get('endType', '')
    
    def get_event_type(self) -> str:
        return 'goal'
    
    def to_dict(self) -> Dict:
        return {
            'type': self.get_event_type(),
            'eventId': self.event_id,
            'time': self.formatted_time,
            'period': self.period,
            'teamId': self.team_id,
            'teamName': self.team_name,
            'scorerName': self.player_name,
            'ballPosition': self.ball_position.to_dict() if self.ball_position else None,
            'homePlayers': [p.to_dict() for p in self.home_players],
            'awayPlayers': [p.to_dict() for p in self.away_players]
        }


# =============================================================================
# POLYMORPHISM: EventFactory creates different event types
# =============================================================================
class EventFactory:
    """Factory class demonstrating Polymorphism - creates appropriate event type"""
    
    @staticmethod
    def create_event(event_data: Dict) -> Optional[Event]:
        """Create appropriate event object based on data"""
        poss_type = event_data.get('possessionEvents', {}).get('possessionEventType', '')
        game_type = event_data.get('gameEvents', {}).get('gameEventType', '')
        end_type = event_data.get('gameEvents', {}).get('endType', '')
        shot_outcome = event_data.get('possessionEvents', {}).get('shotOutcomeType', '')
        
        # Check for goal
        if end_type == 'G' or shot_outcome == 'G':
            return GoalEvent(event_data)
        
        # Check for shot
        if poss_type == 'SH' or event_data.get('possessionEvents', {}).get('shooterPlayerId'):
            return ShotEvent(event_data)
        
        # Check for pass
        if poss_type == 'PA':
            return PassEvent(event_data)
        
        return None


# =============================================================================
# ENCAPSULATION: Match class encapsulates all match data
# =============================================================================
class Match:
    """Encapsulates all data for a single match"""
    
    def __init__(self, match_id: str):
        self.match_id = match_id
        self._metadata = None
        self._events = None
        self._roster = None
        self._roster_map = None
        self.home_team: Optional[Team] = None
        self.away_team: Optional[Team] = None
        self._load_metadata()
    
    def _load_metadata(self):
        """Load match metadata"""
        metadata_path = DATA_DIR / 'Metadata' / f'{self.match_id}.json'
        if metadata_path.exists():
            with open(metadata_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    self._metadata = data[0]
                else:
                    self._metadata = data
            
            # Parse teams
            home_data = self._metadata.get('homeTeam', {})
            away_data = self._metadata.get('awayTeam', {})
            home_kit = self._metadata.get('homeTeamKit', {})
            away_kit = self._metadata.get('awayTeamKit', {})
            
            self.home_team = Team(
                team_id=str(home_data.get('id', '')),
                name=home_data.get('name', ''),
                short_name=home_data.get('shortName', ''),
                primary_color=home_kit.get('primaryColor', '#ffffff'),
                secondary_color=home_kit.get('secondaryColor', '#000000'),
                text_color=home_kit.get('primaryTextColor', '#000000')
            )
            
            self.away_team = Team(
                team_id=str(away_data.get('id', '')),
                name=away_data.get('name', ''),
                short_name=away_data.get('shortName', ''),
                primary_color=away_kit.get('primaryColor', '#ffffff'),
                secondary_color=away_kit.get('secondaryColor', '#000000'),
                text_color=away_kit.get('primaryTextColor', '#000000')
            )
    
    def _load_events(self):
        """Lazy load events data"""
        if self._events is not None:
            return
        
        events_path = DATA_DIR / 'Event Data' / f'{self.match_id}.json'
        if events_path.exists():
            with open(events_path, 'r', encoding='utf-8') as f:
                self._events = json.load(f)
        else:
            self._events = []
    
    def _load_roster(self):
        """Load roster data"""
        if self._roster is not None:
            return
            
        roster_path = DATA_DIR / 'Rosters' / f'{self.match_id}.json'
        if roster_path.exists():
            with open(roster_path, 'r', encoding='utf-8') as f:
                self._roster = json.load(f)
        else:
            self._roster = []

        # Build a fast lookup map for player names
        self._roster_map = {
            p.get('player', {}).get('id'): p.get('player', {}).get('nickname', '')
            for p in self._roster
            if p.get('player', {}).get('id')
        }
    
    def get_player_name(self, player_id: int) -> str:
        """Get player name from roster"""
        if not player_id:
            return ''
        self._load_roster()
        str_id = str(player_id)
        if self._roster_map is None:
            return ''
        return self._roster_map.get(str_id, '')

    @staticmethod
    def _extract_ball_position(event: Dict) -> Optional[Dict]:
        """Extract ball position dict from event if present."""
        ball_data = event.get('ball', [{}])
        if ball_data and len(ball_data) > 0:
            return {
                'x': ball_data[0].get('x', 0),
                'y': ball_data[0].get('y', 0),
                'z': ball_data[0].get('z', 0)
            }
        return None

    @staticmethod
    def _find_goalkeeper(players: List[Dict], keeper_id: Optional[int], keeper_name: str) -> Optional[Dict]:
        """Find goalkeeper data for a given team list."""
        for p in players:
            if p.get('positionGroupType') == 'GK' or p.get('playerId') == keeper_id:
                return {
                    'x': p.get('x', 0),
                    'y': p.get('y', 0),
                    'jerseyNum': p.get('jerseyNum', 0),
                    'playerId': p.get('playerId'),
                    'playerName': keeper_name or '',
                    'positionGroupType': 'GK'
                }
        return None

    @staticmethod
    def _get_primary_player(event_type: str, poss_events: Dict, game_events: Dict) -> tuple[str, Optional[int]]:
        """Get primary player name/id for a given event type."""
        if event_type == 'PA':
            return poss_events.get('passerPlayerName', ''), poss_events.get('passerPlayerId')
        if event_type == 'SH':
            return poss_events.get('shooterPlayerName', ''), poss_events.get('shooterPlayerId')
        if event_type == 'CR':
            return poss_events.get('crosserPlayerName', ''), poss_events.get('crosserPlayerId')
        if event_type == 'CL':
            return poss_events.get('clearerPlayerName', ''), poss_events.get('clearerPlayerId')
        if event_type == 'CH':
            # For challenges, show both players
            home_player = poss_events.get('homeDuelPlayerName', '')
            away_player = poss_events.get('awayDuelPlayerName', '')
            player_name = f"{home_player} vs {away_player}" if home_player and away_player else home_player or away_player
            player_id = poss_events.get('homeDuelPlayerId') or poss_events.get('awayDuelPlayerId')
            return player_name, player_id
        if event_type == 'TC':
            return poss_events.get('touchPlayerName', ''), poss_events.get('touchPlayerId')
        if event_type == 'BC':
            return poss_events.get('ballCarrierPlayerName', ''), poss_events.get('ballCarrierPlayerId')
        if event_type == 'RE':
            return poss_events.get('rebounderPlayerName', ''), poss_events.get('rebounderPlayerId')
        return game_events.get('playerName', ''), game_events.get('playerId')

    @staticmethod
    def _get_secondary_player(event_type: str, poss_events: Dict) -> tuple[str, Optional[int]]:
        """Get secondary player name/id for a given event type."""
        if event_type == 'PA':
            name = poss_events.get('receiverPlayerName', '') or poss_events.get('targetPlayerName', '')
            player_id = poss_events.get('receiverPlayerId') or poss_events.get('targetPlayerId')
            return name, player_id
        if event_type == 'CR':
            return poss_events.get('targetPlayerName', ''), poss_events.get('targetPlayerId')
        if event_type == 'SH':
            # Goalkeeper and assister for shots
            return '', poss_events.get('keeperPlayerId')
        return '', None

    @staticmethod
    def _get_key_player_ids(event_type: str, player_id: Optional[int],
                             secondary_player_id: Optional[int], poss_events: Dict) -> List[int]:
        """Build list of key player IDs for an event."""
        key_player_ids = []
        if player_id:
            key_player_ids.append(player_id)
        if secondary_player_id:
            key_player_ids.append(secondary_player_id)
        if event_type == 'SH':
            assister = poss_events.get('passerPlayerId')
            if assister:
                key_player_ids.append(assister)
        if event_type == 'CH':
            home_duel_id = poss_events.get('homeDuelPlayerId')
            away_duel_id = poss_events.get('awayDuelPlayerId')
            if home_duel_id:
                key_player_ids.append(home_duel_id)
            if away_duel_id:
                key_player_ids.append(away_duel_id)
        return key_player_ids

    def find_goals(self) -> List[Dict]:
        """Find all goals in the match with preceding pass sequence"""
        self._load_events()
        goals = []
        seen_goal_times = set()  # Track goals by time to avoid duplicates

        for i, event in enumerate(self._events):
            game_events = event.get('gameEvents', {})
            poss_events = event.get('possessionEvents', {})

            # Check for goal: ONLY use shotOutcomeType == 'G' (shot resulting in goal)
            # AND filter out nonEvent=True (disallowed goals: VAR/offside)
            is_shot_goal = poss_events.get('shotOutcomeType') == 'G'
            is_valid = not poss_events.get('nonEvent', False)  # nonEvent=True means disallowed

            if is_shot_goal and is_valid:
                # Deduplication: skip if we already recorded a goal at this time
                goal_time = game_events.get('startFormattedGameClock', '')
                goal_key = f"{goal_time}_{poss_events.get('shooterPlayerId', '')}"
                if goal_key in seen_goal_times:
                    continue
                seen_goal_times.add(goal_key)

                # Detect if penalty kick using setpieceType field
                setpiece_type = game_events.get('setpieceType', '')
                is_penalty = setpiece_type == 'P' or poss_events.get('shotType') == 'PK'
                # Get sequence number to find related events
                sequence = event.get('sequence')

                # Find preceding events in same sequence (passes leading to goal)
                pass_sequence = []
                involved_player_ids = set()  # Track player IDs involved in buildup
                involved_player_positions = {}  # player_id -> {x, y, jerseyNum, name}

                # For penalties, skip pass sequence entirely
                if not is_penalty and sequence is not None:
                    # Look back for passes in same or recent sequences
                    lookback_start = max(0, i - 20)
                    for j in range(lookback_start, i):
                        prev_event = self._events[j]
                        prev_poss = prev_event.get('possessionEvents', {})
                        prev_game = prev_event.get('gameEvents', {})
                        prev_seq = prev_event.get('sequence')

                        # Include passes from same sequence or 1-2 sequences before
                        if prev_seq is not None and sequence is not None:
                            if sequence - 3 <= prev_seq <= sequence:
                                if prev_poss.get('possessionEventType') == 'PA':
                                    passer_id = prev_poss.get('passerPlayerId')
                                    passer_name = prev_poss.get('passerPlayerName', '')
                                    receiver_id = prev_poss.get('receiverPlayerId') or prev_poss.get('targetPlayerId')
                                    receiver_name = prev_poss.get('receiverPlayerName', '') or prev_poss.get('targetPlayerName', '')

                                    # Get ball position for pass
                                    ball_pos = self._extract_ball_position(prev_event)

                                    if passer_name:
                                        pass_sequence.append({
                                            'passerName': passer_name,
                                            'receiverName': receiver_name,
                                            'time': prev_game.get('startFormattedGameClock', ''),
                                            'teamId': str(prev_game.get('teamId', '')),
                                            'ballPosition': ball_pos
                                        })

                                    # Track involved players and their positions at this moment
                                    if passer_id:
                                        involved_player_ids.add(passer_id)
                                        # Find passer position in this event
                                        for p in prev_event.get('homePlayers', []) + prev_event.get('awayPlayers', []):
                                            if p.get('playerId') == passer_id:
                                                involved_player_positions[passer_id] = {
                                                    'x': p.get('x', 0),
                                                    'y': p.get('y', 0),
                                                    'jerseyNum': p.get('jerseyNum', 0),
                                                    'playerId': passer_id,
                                                    'playerName': passer_name,
                                                    'positionGroupType': p.get('positionGroupType', '')
                                                }
                                    if receiver_id:
                                        involved_player_ids.add(receiver_id)
                                        for p in prev_event.get('homePlayers', []) + prev_event.get('awayPlayers', []):
                                            if p.get('playerId') == receiver_id:
                                                involved_player_positions[receiver_id] = {
                                                    'x': p.get('x', 0),
                                                    'y': p.get('y', 0),
                                                    'jerseyNum': p.get('jerseyNum', 0),
                                                    'playerId': receiver_id,
                                                    'playerName': receiver_name,
                                                    'positionGroupType': p.get('positionGroupType', '')
                                                }

                # Limit to last 5 passes
                pass_sequence = pass_sequence[-5:]

                # Get scorer info directly from this shot event
                scorer_id = poss_events.get('shooterPlayerId')
                scorer_name = poss_events.get('shooterPlayerName', '')
                scoring_team_id = str(game_events.get('teamId', ''))
                keeper_id = poss_events.get('keeperPlayerId')
                keeper_name = poss_events.get('keeperPlayerName', '')

                # If shooter name is empty, try to get from roster
                if not scorer_name and scorer_id:
                    scorer_name = self.get_player_name(scorer_id) or 'Unknown'

                # Add scorer to involved players
                if scorer_id:
                    involved_player_ids.add(scorer_id)

                # Get ball position from the shot event
                ball_pos = self._extract_ball_position(event)

                # Build key player lists
                key_home_players = []
                key_away_players = []

                if is_penalty:
                    # For penalties: ONLY shooter and opposing goalkeeper
                    # Find shooter position
                    for p in event.get('homePlayers', []) + event.get('awayPlayers', []):
                        if p.get('playerId') == scorer_id:
                            player_data = {
                                'x': p.get('x', 0),
                                'y': p.get('y', 0),
                                'jerseyNum': p.get('jerseyNum', 0),
                                'playerId': scorer_id,
                                'playerName': scorer_name,
                                'positionGroupType': 'CF'
                            }
                            # Determine which team
                            if p in event.get('homePlayers', []):
                                key_home_players.append(player_data)
                            else:
                                key_away_players.append(player_data)

                    # Find goalkeeper (opposing team's GK)
                    home_gk = self._find_goalkeeper(event.get('homePlayers', []), keeper_id, keeper_name)
                    away_gk = self._find_goalkeeper(event.get('awayPlayers', []), keeper_id, keeper_name)
                    if home_gk:
                        key_home_players.append(home_gk)
                    if away_gk:
                        key_away_players.append(away_gk)
                else:
                    # For regular goals: use involved players from pass sequence
                    # Plus the scorer and opposing goalkeeper

                    # First, add goalkeeper from defending team
                    home_gk = self._find_goalkeeper(event.get('homePlayers', []), keeper_id, keeper_name)
                    away_gk = self._find_goalkeeper(event.get('awayPlayers', []), keeper_id, keeper_name)
                    if home_gk:
                        key_home_players.append(home_gk)
                    if away_gk:
                        key_away_players.append(away_gk)

                    # Add involved players using their positions from the pass sequence
                    for pid, pdata in involved_player_positions.items():
                        # Determine if home or away based on the event data
                        is_home_player = any(p.get('playerId') == pid for p in event.get('homePlayers', []))
                        if is_home_player:
                            if len(key_home_players) < 6:
                                key_home_players.append(pdata)
                        else:
                            if len(key_away_players) < 6:
                                key_away_players.append(pdata)

                    # Add scorer if not already included
                    scorer_included = any(p.get('playerId') == scorer_id for p in key_home_players + key_away_players)
                    if not scorer_included and scorer_id:
                        for p in event.get('homePlayers', []) + event.get('awayPlayers', []):
                            if p.get('playerId') == scorer_id:
                                player_data = {
                                    'x': p.get('x', 0),
                                    'y': p.get('y', 0),
                                    'jerseyNum': p.get('jerseyNum', 0),
                                    'playerId': scorer_id,
                                    'playerName': scorer_name,
                                    'positionGroupType': p.get('positionGroupType', '')
                                }
                                if p in event.get('homePlayers', []):
                                    key_home_players.append(player_data)
                                else:
                                    key_away_players.append(player_data)
                                break

                goal_data = {
                    'eventIndex': i,
                    'time': game_events.get('startFormattedGameClock', ''),
                    'period': game_events.get('period', 1),
                    'scorerName': scorer_name,
                    'scoringTeamId': scoring_team_id,
                    'passSequence': pass_sequence,
                    'ballPosition': ball_pos,
                    'homePlayers': key_home_players,
                    'awayPlayers': key_away_players,
                    'isPenalty': is_penalty
                }

                goals.append(goal_data)

        return goals

    def count_goals(self) -> int:
        """Count goals in the match - uses shotOutcomeType and filters out nonEvent (disallowed goals)"""
        self._load_events()
        seen_goal_times = set()  # Deduplication
        count = 0
        for event in self._events:
            game_events = event.get('gameEvents', {})
            poss_events = event.get('possessionEvents', {})
            # Only count shots with outcome 'G' (Goal) that are NOT marked as nonEvent
            # nonEvent=True means the goal was disallowed (VAR/offside)
            is_shot_goal = poss_events.get('shotOutcomeType') == 'G'
            is_valid = not poss_events.get('nonEvent', False)
            if is_shot_goal and is_valid:
                goal_time = game_events.get('startFormattedGameClock', '')
                shooter_id = poss_events.get('shooterPlayerId', '')
                goal_key = f"{goal_time}_{shooter_id}"
                if goal_key not in seen_goal_times:
                    seen_goal_times.add(goal_key)
                    count += 1
        return count

    def get_all_plays(self) -> List[Dict]:
        """Get all plays/events in the match grouped by sequence"""
        self._load_events()

        plays = []

        for i, event in enumerate(self._events):
            game_events = event.get('gameEvents', {})
            poss_events = event.get('possessionEvents', {})

            # Get event type
            event_type = poss_events.get('possessionEventType')
            if not event_type:
                continue  # Skip events without possession type

            # Skip if nonEvent (disallowed)
            if poss_events.get('nonEvent', False):
                continue

            # Get primary player for this event
            player_name, player_id = self._get_primary_player(event_type, poss_events, game_events)

            # [FIX] Lookup player name in roster if missing
            if not player_name and player_id:
                player_name = self.get_player_name(player_id) or 'Unknown'

            # Get secondary player (receiver, target, etc.)
            secondary_player, secondary_player_id = self._get_secondary_player(event_type, poss_events)
            if event_type == 'SH':
                # Assister is the passer for the shot
                assister_id = poss_events.get('passerPlayerId')

            # [FIX] Lookup secondary player name in roster if missing
            if not secondary_player and secondary_player_id:
                secondary_player = self.get_player_name(secondary_player_id)

            # Build list of key player IDs for this event
            key_player_ids = self._get_key_player_ids(event_type, player_id, secondary_player_id, poss_events)

            # Get outcome
            outcome = ''
            is_goal = False
            if event_type == 'PA':
                outcome = poss_events.get('passOutcomeType', '')
            elif event_type == 'SH':
                outcome = poss_events.get('shotOutcomeType', '')
                is_goal = outcome == 'G'
            elif event_type == 'CR':
                outcome = poss_events.get('crossOutcomeType', '')
            elif event_type == 'CL':
                outcome = poss_events.get('clearanceOutcomeType', '')
            elif event_type == 'CH':
                outcome = poss_events.get('challengeOutcomeType', '')

            # Get ball position
            ball_pos = self._extract_ball_position(event)

            # Get player positions
            home_players = event.get('homePlayers', [])
            away_players = event.get('awayPlayers', [])

            play_data = {
                'index': i,
                'eventId': event.get('gameEventId'),
                'sequence': event.get('sequence'),
                'time': game_events.get('startFormattedGameClock', ''),
                'period': game_events.get('period', 1),
                'eventType': event_type,
                'eventLabel': EVENT_LABELS.get(event_type, event_type),
                'setpieceType': game_events.get('setpieceType', ''),
                'setpieceLabel': SETPIECE_LABELS.get(game_events.get('setpieceType', ''), ''),
                'teamId': str(game_events.get('teamId', '')),
                'teamName': game_events.get('teamName', ''),
                'playerName': player_name,
                'playerId': player_id,
                'secondaryPlayer': secondary_player,
                'secondaryPlayerId': secondary_player_id,
                'assisterName': poss_events.get('passerPlayerName', '') if event_type == 'SH' else '',
                'assisterId': poss_events.get('passerPlayerId') if event_type == 'SH' else None,
                'keeperName': poss_events.get('keeperPlayerName', '') if event_type == 'SH' else '',
                'keyPlayerIds': key_player_ids,
                'outcome': outcome,
                'isGoal': is_goal,
                'ballPosition': ball_pos,
                'homePlayers': home_players,
                'awayPlayers': away_players,
                # [FIX] Added detailed types for DTW feature extraction
                'passType': poss_events.get('passType', ''),
                'shotType': poss_events.get('shotType', ''),
                'pressureType': poss_events.get('pressureType', '')
            }

            plays.append(play_data)

        return plays

    def to_dict(self) -> Dict:
        """Convert match to dictionary (lightweight, no event loading)"""
        return {
            'id': self.match_id,
            'homeTeam': self.home_team.to_dict() if self.home_team else None,
            'awayTeam': self.away_team.to_dict() if self.away_team else None,
            'date': self._metadata.get('date', '') if self._metadata else '',
            'stadium': self._metadata.get('stadium', {}).get('name', '') if self._metadata else ''
        }


# =============================================================================
# ENCAPSULATION: MatchRepository manages data access
# =============================================================================
class MatchRepository:
    """Repository pattern - encapsulates data access logic"""

    _cache: Dict[str, Match] = {}

    @classmethod
    def get_all_match_ids(cls) -> List[str]:
        """Get all available match IDs"""
        metadata_dir = DATA_DIR / 'Metadata'
        if not metadata_dir.exists():
            return []

        match_ids = []
        for f in metadata_dir.glob('*.json'):
            match_ids.append(f.stem)

        return sorted(match_ids)

    @classmethod
    def get_match(cls, match_id: str) -> Optional[Match]:
        """Get match by ID with caching"""
        if match_id not in cls._cache:
            cls._cache[match_id] = Match(match_id)
        return cls._cache[match_id]

    @classmethod
    def get_all_matches(cls) -> List[Match]:
        """Get all matches sorted by date ascending"""
        matches = [cls.get_match(mid) for mid in cls.get_all_match_ids()]
        # Sort by date ascending (earliest first)
        matches.sort(key=lambda m: m._metadata.get('date', '') if m._metadata else '')
        return matches


# =============================================================================
# DJANGO VIEWS
# =============================================================================
def index(request):
    """Home page view"""
    matches = MatchRepository.get_all_matches()
    matches_data = []

    for m in matches:
        match_dict = m.to_dict()
        # Count goals for each match (lazy, only load if needed later)
        # For now, just add the match data
        matches_data.append(match_dict)

    # Convert to JSON string for template
    matches_json = json.dumps(matches_data)

    return render(request, 'index.html', {'matches': matches_json})


def api_matches(request):
    """API: Get all matches"""
    matches = MatchRepository.get_all_matches()
    matches_data = [m.to_dict() for m in matches]
    return JsonResponse({'matches': matches_data})


def api_match_goals(request, match_id: str):
    """API: Get goals for a specific match"""
    match = MatchRepository.get_match(match_id)
    if not match:
        return JsonResponse({'error': 'Match not found'}, status=404)

    goals_raw = match.find_goals()

    # Transform goals to expected format for frontend
    goals = []
    for g in goals_raw:
        goal_data = {
            'goal': {
                'eventId': g.get('eventIndex'),
                'formattedTime': g.get('time', ''),
                'period': g.get('period', 1),
                'teamId': g.get('scoringTeamId', ''),
                'teamName': '',
                'playerName': g.get('scorerName', 'Unknown'),
                'ballPosition': g.get('ballPosition')
            },
            'snapshot': {
                'homePlayers': g.get('homePlayers', []),
                'awayPlayers': g.get('awayPlayers', []),
                'ball': g.get('ballPosition')
            },
            'precedingEvents': [
                {
                    'eventType': 'pass',
                    'label': 'Pass',
                    'playerName': p.get('passerName', ''),
                    'formattedTime': p.get('time', ''),
                    'teamId': p.get('teamId', ''),
                    'ballPosition': p.get('ballPosition')
                }
                for p in g.get('passSequence', [])
            ]
        }

        # Set team name
        if g.get('scoringTeamId') == (match.home_team.team_id if match.home_team else ''):
            goal_data['goal']['teamName'] = match.home_team.name if match.home_team else 'Home'
        else:
            goal_data['goal']['teamName'] = match.away_team.name if match.away_team else 'Away'

        goals.append(goal_data)

    return JsonResponse({
        'matchId': match_id,
        'match': {
            'homeTeam': match.home_team.to_dict() if match.home_team else None,
            'awayTeam': match.away_team.to_dict() if match.away_team else None
        },
        'goals': goals
    })


def api_match_plays(request, match_id: str):
    """API: Get all plays for a specific match, grouped by sequence"""
    match = MatchRepository.get_match(match_id)
    if not match:
        return JsonResponse({'error': 'Match not found'}, status=404)

    plays = match.get_all_plays()

    # Group plays by sequence for better organization
    # Skip events without valid sequence
    sequences_dict = {}
    for play in plays:
        seq_id = play.get('sequence')
        if seq_id is None:
            continue  # Skip events without sequence
        if seq_id not in sequences_dict:
            sequences_dict[seq_id] = {
                'sequenceId': int(seq_id) if seq_id else 0,
                'teamId': play.get('teamId'),
                'setpieceType': play.get('setpieceLabel') or play.get('setpieceType') or 'Open Play',
                'time': play.get('time') or '',
                'events': []
            }
        sequences_dict[seq_id]['events'].append(play)
        # Update time to first event's time if not set
        if not sequences_dict[seq_id]['time'] and play.get('time'):
            sequences_dict[seq_id]['time'] = play.get('time')

    # Convert to sorted list (handle None sequenceIds)
    sequences_list = sorted(sequences_dict.values(), key=lambda s: s['sequenceId'] if s['sequenceId'] is not None else -1)

    return JsonResponse({
        'matchId': match_id,
        'match': {
            'homeTeam': match.home_team.to_dict() if match.home_team else None,
            'awayTeam': match.away_team.to_dict() if match.away_team else None
        },
        'plays': sequences_list,
        'totalEvents': len(plays),
        'totalSequences': len(sequences_list)
    })


# =============================================================================
# SEARCH API ENDPOINTS
# =============================================================================
def _parse_json_body(request) -> Optional[Dict[str, Any]]:
    """Parse JSON body or return None if invalid."""
    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        return None


@csrf_exempt
def api_search_event(request):
    """API: Search for similar events using TF-IDF"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    from .TF_IDF import search_similar_events

    data = _parse_json_body(request)
    if data is None:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    query_event = data.get('event')
    if not query_event:
        return JsonResponse({'error': 'event required'}, status=400)

    exclude_match_id = data.get('matchId')
    exclude_seq_id = data.get('sequenceId')
    exclude_event_idx = data.get('eventIndex')
    top_n = data.get('topN', 10)

    results = search_similar_events(
        query_event=query_event,
        exclude_match_id=exclude_match_id,
        exclude_seq_id=exclude_seq_id,
        exclude_event_idx=exclude_event_idx,
        top_n=top_n
    )

    return JsonResponse({
        'query': {
            'eventType': query_event.get('eventLabel', query_event.get('eventType', '')),
            'playerName': query_event.get('playerName', ''),
            'time': query_event.get('time', '')
        },
        'results': results,
        'count': len(results)
    })


@csrf_exempt
def api_search_sequence(request):
    """API: Search for similar sequences using DTW, TF-IDF, or Hybrid"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    data = _parse_json_body(request)
    if data is None:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    query_events = data.get('events')
    if not query_events:
        return JsonResponse({'error': 'events required'}, status=400)

    exclude_match_id = data.get('matchId')
    exclude_seq_id = data.get('sequenceId')
    top_n = data.get('topN', 10)
    method = data.get('method', 'hybrid')  # Default to hybrid

    if method == 'hybrid':
        # Use hybrid search (combines DTW + TF-IDF)
        from .TF_IDF import search_similar_sequences_hybrid

        results = search_similar_sequences_hybrid(
            query_events=query_events,
            exclude_match_id=exclude_match_id,
            exclude_seq_id=exclude_seq_id,
            top_n=top_n
        )
    elif method == 'dtw':
        # Use DTW search only
        from .DTW import search_similar_sequences_dtw

        query_sequence = {'events': query_events}
        results = search_similar_sequences_dtw(
            query_sequence=query_sequence,
            top_n=top_n,
            exclude_match_id=str(exclude_match_id) if exclude_match_id else None,
            exclude_seq_id=exclude_seq_id
        )
    else:
        # Use TF-IDF search only
        from .TF_IDF import search_similar_sequences

        results = search_similar_sequences(
            query_events=query_events,
            exclude_match_id=exclude_match_id,
            exclude_seq_id=exclude_seq_id,
            top_n=top_n
        )

    return JsonResponse({
        'query': {
            'setpieceType': query_events[0].get('setpieceLabel', '') if query_events else '',
            'eventCount': len(query_events),
            'time': query_events[0].get('time', '') if query_events else '',
            'method': method
        },
        'results': results,
        'count': len(results)
    })