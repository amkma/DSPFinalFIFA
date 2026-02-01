"""
TF-IDF Similarity Search for FIFA World Cup 2022 Plays
Finds similar events and sequences across all matches using text-based similarity
"""
import math
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Tuple, Optional
from pathlib import Path
import json


# =============================================================================
# CONFIGURATION
# =============================================================================
NEAR_BALL_RADIUS = 15  # meters - players within this distance of ball are considered


# =============================================================================
# MODULE-LEVEL CACHE - persists in memory until server restart
# =============================================================================
_event_vectorizer: Optional[TfidfVectorizer] = None
_sequence_vectorizer: Optional[TfidfVectorizer] = None
_event_vectors = None  # sparse matrix
_sequence_vectors = None  # sparse matrix
_event_index: List[Dict] = []  # maps row index to (match_id, sequence_id, event_index, event_data)
_sequence_index: List[Dict] = []  # maps row index to (match_id, sequence_id, sequence_data)
_cache_initialized = False


# =============================================================================
# PITCH ZONE CALCULATION - More granular zones
# =============================================================================
def get_pitch_zone_detailed(x: float, y: float) -> str:
    """
    Convert x,y coordinates to detailed pitch zone.
    Pitch: x from -52.5 to 52.5 (length 105m), y from -34 to 34 (width 68m)
    More granular zones for better differentiation.
    """
    # X-axis zones (more granular)
    if x < -40:
        x_zone = 'own_box'      # Own penalty box area
    elif x < -25:
        x_zone = 'def_deep'     # Deep defensive
    elif x < -10:
        x_zone = 'def'          # Defensive third
    elif x < 10:
        x_zone = 'mid'          # Midfield
    elif x < 25:
        x_zone = 'att'          # Attacking third
    elif x < 40:
        x_zone = 'att_deep'     # Deep attacking
    else:
        x_zone = 'opp_box'      # Opponent's penalty box
    
    # Y-axis zones
    if y < -20:
        y_zone = 'left_wide'
    elif y < -7:
        y_zone = 'left'
    elif y < 7:
        y_zone = 'center'
    elif y < 20:
        y_zone = 'right'
    else:
        y_zone = 'right_wide'
    
    return f"{x_zone}_{y_zone}"


def get_pitch_zone(x: float, y: float) -> str:
    """Wrapper for backward compatibility"""
    return get_pitch_zone_detailed(x, y)


def distance_2d(x1: float, y1: float, x2: float, y2: float) -> float:
    """Calculate 2D Euclidean distance"""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def get_players_near_ball(players: List[Dict], ball_x: float, ball_y: float, 
                           radius: float = NEAR_BALL_RADIUS) -> List[Dict]:
    """Filter players to only those within radius of ball position"""
    near_players = []
    for p in players:
        px = p.get('x', 0)
        py = p.get('y', 0)
        if distance_2d(px, py, ball_x, ball_y) <= radius:
            near_players.append(p)
    return near_players


def get_player_zones(players: List[Dict]) -> str:
    """Convert list of player positions to zone string"""
    zones = set()
    for p in players:
        x = p.get('x', 0)
        y = p.get('y', 0)
        zones.add(get_pitch_zone(x, y))
    return ' '.join(sorted(zones))


def get_length_category(length: int) -> str:
    """Categorize sequence length"""
    if length <= 3:
        return 'short'
    elif length <= 8:
        return 'medium'
    else:
        return 'long'


# =============================================================================
# FEATURE EXTRACTION - Convert events/sequences to text
# =============================================================================
def event_to_text(event: Dict) -> str:
    """
    Convert an event to text representation for TF-IDF.
    Features: eventType, setpieceType, outcome, pitchZone, passType, 
              shotType, shotOutcome, near-ball player zones
    """
    parts = []
    
    # Event type (weighted by repeating)
    event_type = event.get('eventLabel', event.get('eventType', ''))
    if event_type:
        parts.append(f"type_{event_type}")
        parts.append(f"type_{event_type}")  # Double weight
    
    # Setpiece type
    setpiece = event.get('setpieceLabel', event.get('setpieceType', ''))
    if setpiece:
        parts.append(f"setpiece_{setpiece.replace(' ', '_')}")
    
    # Outcome (general)
    outcome = event.get('outcome', '')
    if outcome:
        parts.append(f"outcome_{outcome}")
    
    # Ball position zone (detailed)
    ball_pos = event.get('ballPosition')
    ball_x, ball_y = 0, 0
    if ball_pos:
        ball_x = ball_pos.get('x', 0)
        ball_y = ball_pos.get('y', 0)
        zone = get_pitch_zone_detailed(ball_x, ball_y)
        parts.append(f"ballzone_{zone}")
        parts.append(f"ballzone_{zone}")  # Double weight for location
    
    # =========================================================================
    # SHOT-SPECIFIC FEATURES
    # =========================================================================
    if event_type in ('Shot', 'SH'):
        # Shot outcome (Goal, Saved, Blocked, Off Target, etc.)
        shot_outcome = event.get('outcome', '')
        if shot_outcome:
            parts.append(f"shot_outcome_{shot_outcome}")
            parts.append(f"shot_outcome_{shot_outcome}")  # Double weight
            parts.append(f"shot_outcome_{shot_outcome}")  # Triple weight for goals
        
        # Is goal - extra weight
        if event.get('isGoal'):
            parts.append("is_goal")
            parts.append("is_goal")
            parts.append("is_goal")
    
    # =========================================================================
    # PASS-SPECIFIC FEATURES
    # =========================================================================
    if event_type in ('Pass', 'PA'):
        # Pass type (Long, Short, Through, Cross, etc.)
        pass_type = event.get('passType', '')
        if pass_type:
            parts.append(f"passtype_{pass_type}")
        
        # Pass direction - where ball goes (receiver position)
        # Use secondary player position or target position
        secondary_player = event.get('secondaryPlayer', '')
        if secondary_player and ball_pos:
            # Try to find receiver in players list
            all_players = event.get('homePlayers', []) + event.get('awayPlayers', [])
            for p in all_players:
                if p.get('playerId') == event.get('secondaryPlayerId'):
                    recv_x = p.get('x', 0)
                    recv_y = p.get('y', 0)
                    recv_zone = get_pitch_zone_detailed(recv_x, recv_y)
                    parts.append(f"pass_to_{recv_zone}")
                    
                    # Pass direction vector (forward/backward, left/right)
                    if recv_x > ball_x + 10:
                        parts.append("pass_forward")
                    elif recv_x < ball_x - 10:
                        parts.append("pass_backward")
                    break
    
    # =========================================================================
    # NEAR-BALL PLAYER ZONES (instead of all players)
    # =========================================================================
    if ball_pos:
        # Filter to only players near the ball
        home_players = event.get('homePlayers', [])
        away_players = event.get('awayPlayers', [])
        
        near_home = get_players_near_ball(home_players, ball_x, ball_y, NEAR_BALL_RADIUS)
        near_away = get_players_near_ball(away_players, ball_x, ball_y, NEAR_BALL_RADIUS)
        
        # Add near-ball player zones
        if near_home:
            home_zones = get_player_zones(near_home)
            for z in home_zones.split():
                parts.append(f"near_home_{z}")
        
        if near_away:
            away_zones = get_player_zones(near_away)
            for z in away_zones.split():
                parts.append(f"near_away_{z}")
        
        # Player count near ball (pressure indicator)
        total_near = len(near_home) + len(near_away)
        if total_near <= 2:
            parts.append("pressure_low")
        elif total_near <= 4:
            parts.append("pressure_medium")
        else:
            parts.append("pressure_high")
    
    return ' '.join(parts)


def sequence_to_text(events: List[Dict]) -> str:
    """
    Convert a sequence of events to text representation.
    Features: all event types, setpiece, sequence length, start/end zones, progression
    """
    parts = []
    
    if not events:
        return ''
    
    # All event types in sequence
    for e in events:
        event_type = e.get('eventLabel', e.get('eventType', ''))
        if event_type:
            parts.append(f"type_{event_type}")
    
    # Setpiece type (from first event)
    setpiece = events[0].get('setpieceLabel', events[0].get('setpieceType', ''))
    if setpiece:
        parts.append(f"setpiece_{setpiece.replace(' ', '_')}")
        parts.append(f"setpiece_{setpiece.replace(' ', '_')}")  # Double weight
    
    # Sequence length category
    length_cat = get_length_category(len(events))
    parts.append(f"length_{length_cat}")
    
    # Start zone (first event ball position) - detailed
    first_ball = events[0].get('ballPosition')
    start_x, start_y = 0, 0
    if first_ball:
        start_x = first_ball.get('x', 0)
        start_y = first_ball.get('y', 0)
        start_zone = get_pitch_zone_detailed(start_x, start_y)
        parts.append(f"start_{start_zone}")
    
    # End zone (last event ball position) - detailed
    last_ball = events[-1].get('ballPosition')
    end_x, end_y = 0, 0
    if last_ball:
        end_x = last_ball.get('x', 0)
        end_y = last_ball.get('y', 0)
        end_zone = get_pitch_zone_detailed(end_x, end_y)
        parts.append(f"end_{end_zone}")
    
    # Progression direction (did sequence move forward?)
    if first_ball and last_ball:
        x_diff = end_x - start_x
        if x_diff > 20:
            parts.append("progression_forward_strong")
        elif x_diff > 5:
            parts.append("progression_forward")
        elif x_diff < -20:
            parts.append("progression_backward_strong")
        elif x_diff < -5:
            parts.append("progression_backward")
        else:
            parts.append("progression_lateral")
    
    # Number of passes
    pass_count = sum(1 for e in events if e.get('eventType') == 'PA' or e.get('eventLabel') == 'Pass')
    if pass_count > 0:
        parts.append(f"passes_{min(pass_count, 10)}")
    
    # Contains shot?
    has_shot = any(e.get('eventType') == 'SH' or e.get('eventLabel') == 'Shot' for e in events)
    if has_shot:
        parts.append("has_shot")
        parts.append("has_shot")  # Double weight
    
    # Contains goal?
    has_goal = any(e.get('isGoal') for e in events)
    if has_goal:
        parts.append("has_goal")
        parts.append("has_goal")
        parts.append("has_goal")  # Triple weight
    
    return ' '.join(parts)


# =============================================================================
# CACHE INITIALIZATION
# =============================================================================
def _get_data_dir() -> Path:
    """Get the data directory path"""
    return Path(__file__).resolve().parent.parent.parent / 'FIFA_datan'


def _load_all_plays() -> Tuple[List[Dict], List[Dict]]:
    """
    Load all plays from all matches.
    Returns: (all_events, all_sequences)
    """
    from .fifa import MatchRepository
    
    all_events = []
    all_sequences = []
    
    match_ids = MatchRepository.get_all_match_ids()
    
    for match_id in match_ids:
        match = MatchRepository.get_match(match_id)
        if not match:
            continue
        
        plays = match.get_all_plays()
        
        # Group plays by sequence
        sequences_map = {}
        for play in plays:
            seq_id = play.get('sequence')
            if seq_id is None:
                seq_id = -1
            
            if seq_id not in sequences_map:
                sequences_map[seq_id] = {
                    'matchId': match_id,
                    'sequenceId': seq_id,
                    'events': [],
                    'setpieceType': play.get('setpieceLabel', ''),
                    'teamId': play.get('teamId', ''),
                    'time': play.get('time', ''),
                    'homeTeam': match.home_team.to_dict() if match.home_team else None,
                    'awayTeam': match.away_team.to_dict() if match.away_team else None
                }
            
            sequences_map[seq_id]['events'].append(play)
            
            # Add event with metadata
            event_entry = {
                'matchId': match_id,
                'sequenceId': seq_id,
                'eventIndex': len(sequences_map[seq_id]['events']) - 1,
                'event': play,
                'homeTeam': match.home_team.to_dict() if match.home_team else None,
                'awayTeam': match.away_team.to_dict() if match.away_team else None
            }
            all_events.append(event_entry)
        
        # Add sequences
        for seq_data in sequences_map.values():
            all_sequences.append(seq_data)
    
    return all_events, all_sequences


def initialize_cache():
    """
    Initialize TF-IDF cache. Called on first search request.
    Builds vectorizers and transforms all events/sequences.
    """
    global _event_vectorizer, _sequence_vectorizer
    global _event_vectors, _sequence_vectors
    global _event_index, _sequence_index
    global _cache_initialized
    
    if _cache_initialized:
        return
    
    print("[Search] Initializing TF-IDF cache...")
    
    # Load all plays
    all_events, all_sequences = _load_all_plays()
    
    print(f"[Search] Loaded {len(all_events)} events from {len(all_sequences)} sequences")
    
    # Build event texts
    event_texts = []
    _event_index = []
    for entry in all_events:
        text = event_to_text(entry['event'])
        event_texts.append(text)
        _event_index.append(entry)
    
    # Build sequence texts
    sequence_texts = []
    _sequence_index = []
    for seq in all_sequences:
        text = sequence_to_text(seq['events'])
        sequence_texts.append(text)
        _sequence_index.append(seq)
    
    # Fit and transform event vectorizer
    _event_vectorizer = TfidfVectorizer(
        lowercase=False,
        token_pattern=r'\S+',  # Split on whitespace
        min_df=2,  # Ignore terms that appear in less than 2 docs
        max_df=0.95  # Ignore terms that appear in more than 95% of docs
    )
    _event_vectors = _event_vectorizer.fit_transform(event_texts)
    
    # Fit and transform sequence vectorizer
    _sequence_vectorizer = TfidfVectorizer(
        lowercase=False,
        token_pattern=r'\S+',
        min_df=2,
        max_df=0.95
    )
    _sequence_vectors = _sequence_vectorizer.fit_transform(sequence_texts)
    
    _cache_initialized = True
    print(f"[Search] Cache initialized. Event vocab size: {len(_event_vectorizer.vocabulary_)}, "
          f"Sequence vocab size: {len(_sequence_vectorizer.vocabulary_)}")


# =============================================================================
# SEARCH FUNCTIONS
# =============================================================================
def _lightweight_event(event: Dict) -> Dict:
    """Return a lightweight version of event without heavy player arrays"""
    return {
        'index': event.get('index'),
        'eventId': event.get('eventId'),
        'sequence': event.get('sequence'),
        'time': event.get('time'),
        'period': event.get('period'),
        'eventType': event.get('eventType'),
        'eventLabel': event.get('eventLabel'),
        'setpieceType': event.get('setpieceType'),
        'setpieceLabel': event.get('setpieceLabel'),
        'teamId': event.get('teamId'),
        'teamName': event.get('teamName'),
        'playerName': event.get('playerName'),
        'playerId': event.get('playerId'),
        'secondaryPlayer': event.get('secondaryPlayer'),
        'outcome': event.get('outcome'),
        'isGoal': event.get('isGoal'),
        'ballPosition': event.get('ballPosition'),
        'keyPlayerIds': event.get('keyPlayerIds', []),
        # Include only key players, not all 22
        'homePlayers': [p for p in event.get('homePlayers', []) if p.get('playerId') in event.get('keyPlayerIds', [])],
        'awayPlayers': [p for p in event.get('awayPlayers', []) if p.get('playerId') in event.get('keyPlayerIds', [])]
    }


def search_similar_events(query_event: Dict, exclude_match_id: str = None, 
                          exclude_seq_id: int = None, exclude_event_idx: int = None,
                          top_n: int = 10) -> List[Dict]:
    """
    Search for events similar to the query event.
    
    Args:
        query_event: The event to search for (dict with event data)
        exclude_match_id: Match ID to exclude exact match from
        exclude_seq_id: Sequence ID to exclude
        exclude_event_idx: Event index to exclude
        top_n: Number of results to return
    
    Returns:
        List of dicts with match info, event data, and similarity score
    """
    initialize_cache()
    
    # Convert query to text and vectorize
    query_text = event_to_text(query_event)
    query_vector = _event_vectorizer.transform([query_text])
    
    # Compute similarities
    similarities = cosine_similarity(query_vector, _event_vectors).flatten()
    
    # Get top indices (excluding query itself)
    results = []
    sorted_indices = np.argsort(similarities)[::-1]  # Descending
    
    for idx in sorted_indices:
        if len(results) >= top_n:
            break
        
        entry = _event_index[idx]
        
        # Exclude exact query event
        if (entry['matchId'] == exclude_match_id and 
            entry['sequenceId'] == exclude_seq_id and 
            entry['eventIndex'] == exclude_event_idx):
            continue
        
        score = float(similarities[idx])
        if score < 0.01:  # Skip very low similarity
            continue
        
        results.append({
            'matchId': entry['matchId'],
            'sequenceId': entry['sequenceId'],
            'eventIndex': entry['eventIndex'],
            'event': _lightweight_event(entry['event']),
            'homeTeam': entry['homeTeam'],
            'awayTeam': entry['awayTeam'],
            'similarity': round(score, 3)
        })
    
    return results


def search_similar_sequences(query_events: List[Dict], exclude_match_id: str = None,
                              exclude_seq_id: int = None, top_n: int = 10) -> List[Dict]:
    """
    Search for sequences similar to the query sequence.
    
    Args:
        query_events: List of events in the query sequence
        exclude_match_id: Match ID to exclude
        exclude_seq_id: Sequence ID to exclude
        top_n: Number of results to return
    
    Returns:
        List of dicts with match info, sequence data, and similarity score
    """
    initialize_cache()
    
    # Convert query to text and vectorize
    query_text = sequence_to_text(query_events)
    query_vector = _sequence_vectorizer.transform([query_text])
    
    # Compute similarities
    similarities = cosine_similarity(query_vector, _sequence_vectors).flatten()
    
    # Get top indices
    results = []
    sorted_indices = np.argsort(similarities)[::-1]
    
    for idx in sorted_indices:
        if len(results) >= top_n:
            break
        
        entry = _sequence_index[idx]
        
        # Exclude exact query sequence
        if entry['matchId'] == exclude_match_id and entry['sequenceId'] == exclude_seq_id:
            continue
        
        score = float(similarities[idx])
        if score < 0.01:
            continue
        
        results.append({
            'matchId': entry['matchId'],
            'sequenceId': entry['sequenceId'],
            'setpieceType': entry['setpieceType'],
            'teamId': entry['teamId'],
            'time': entry['time'],
            'events': [_lightweight_event(e) for e in entry['events']],
            'homeTeam': entry['homeTeam'],
            'awayTeam': entry['awayTeam'],
            'eventCount': len(entry['events']),
            'similarity': round(score, 3)
        })
    
    return results


def is_cache_ready() -> bool:
    """Check if cache is initialized"""
    return _cache_initialized
