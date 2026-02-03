"""
DTW (Dynamic Time Warping) Similarity Search for FIFA World Cup 2022 Sequences
Finds similar sequences based on temporal/spatial patterns using FastDTW algorithm
"""
import math
import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from pathlib import Path
import json

# FastDTW for efficient DTW computation (REQUIRED)
try:
    from fastdtw import fastdtw
except ImportError:
    raise ImportError(
        "[DTW] ERROR: fastdtw is required but not installed.\n"
        "Install it with: pip install fastdtw"
    )


# =============================================================================
# CONFIGURATION
# =============================================================================
TOP_N = 10                      # Default number of results to return
NEAR_BALL_RADIUS = 15           # meters - players within this distance of ball
MAX_DISTANCE = 150              # Maximum possible distance for normalization

# Feature weights (equal by default, tune as needed)
WEIGHTS = {
    'ball_position': 1.0,
    'event_type': 1.0,
    'player_formation': 1.0,
    'pass_type': 0.5,
    'shot_type': 0.5,
    'pressure_type': 0.3
}

# Optional features toggle
OPTIONAL_FEATURES = {
    'pass_type': False,
    'shot_type': False,
    'pressure_type': False
}


# =============================================================================
# EVENT TYPE SIMILARITY MATRIX
# =============================================================================
# Event types from data: PA (Pass), SH (Shot), IT (Initial Touch), RE (Recovery),
# CR (Cross), CA (Carry), DR (Dribble), CL (Clearance), TO (Touch), etc.

EVENT_TYPES = ['PA', 'SH', 'IT', 'RE', 'CR', 'CA', 'DR', 'CL', 'TO', 'FK', 'CK', 'TI', 'GK', 'PK', 'OG']

# Similarity groups (types within same group are similar)
EVENT_GROUPS = {
    'passing': ['PA', 'CR', 'FK', 'CK', 'TI', 'GK'],  # Pass-like events
    'shooting': ['SH', 'PK'],                          # Shot events
    'control': ['IT', 'RE', 'TO', 'CA'],               # Ball control events
    'dribbling': ['DR', 'CA'],                         # Dribble/carry events
    'defensive': ['CL', 'RE'],                         # Defensive events
}

def _get_event_group(event_type: str) -> List[str]:
    """Get the group(s) an event type belongs to."""
    groups = [group_name for group_name, types in EVENT_GROUPS.items() if event_type in types]
    return groups if groups else ['other']


def event_type_penalty(type1: str, type2: str) -> float:
    """
    Calculate penalty between two event types.
    Same type = 0, same group = 2, different groups = 5-10
    """
    if type1 == type2:
        return 0.0
    
    if not type1 or not type2:
        return 5.0  # Unknown type
    
    groups1 = set(_get_event_group(type1))
    groups2 = set(_get_event_group(type2))
    
    # Check for overlap in groups
    if groups1 & groups2:
        return 2.0  # Same group, small penalty
    
    # Special cases for very different events
    if ('shooting' in groups1 and 'defensive' in groups2) or \
       ('defensive' in groups1 and 'shooting' in groups2):
        return 10.0  # Very different
    
    return 5.0  # Moderately different


# =============================================================================
# PASS TYPE SIMILARITY
# =============================================================================
PASS_TYPES = ['S', 'L', 'T', 'C', 'F']  # Short, Long, Through, Cross, Flick

def pass_type_penalty(type1: str, type2: str) -> float:
    """Penalty between pass types"""
    if type1 == type2:
        return 0.0
    if not type1 or not type2:
        return 2.0
    # Short vs Long = bigger difference
    if (type1 == 'S' and type2 == 'L') or (type1 == 'L' and type2 == 'S'):
        return 3.0
    return 1.5


# =============================================================================
# SHOT TYPE SIMILARITY  
# =============================================================================
def shot_type_penalty(type1: str, type2: str) -> float:
    """Penalty between shot types"""
    if type1 == type2:
        return 0.0
    if not type1 or not type2:
        return 2.0
    return 2.0


# =============================================================================
# PRESSURE TYPE SIMILARITY
# =============================================================================
PRESSURE_TYPES = ['N', 'P', 'A']  # None, Passive, Active

def pressure_type_penalty(type1: str, type2: str) -> float:
    """Penalty between pressure types"""
    if type1 == type2:
        return 0.0
    if not type1 or not type2:
        return 1.0
    # None vs Active = big difference
    if (type1 == 'N' and type2 == 'A') or (type1 == 'A' and type2 == 'N'):
        return 3.0
    return 1.5


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================
def euclidean_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    """Calculate 2D Euclidean distance"""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def get_ball_position(event: Dict) -> Tuple[float, float]:
    """Extract ball position from event in a normalized (x, y) tuple."""
    # 1. Processed format (dict)
    ball_pos = event.get('ballPosition')
    if ball_pos:
        return (ball_pos.get('x', 0), ball_pos.get('y', 0))

    # 2. Raw format (list)
    ball = event.get('ball', [])
    if ball:
        return (ball[0].get('x', 0), ball[0].get('y', 0))

    return (0, 0)


def _get_ball_position_dict(event: Dict) -> Optional[Dict[str, float]]:
    """Extract ball position as a dict when present, otherwise return None."""
    ball_pos = event.get('ballPosition')
    if ball_pos:
        return {'x': ball_pos.get('x', 0), 'y': ball_pos.get('y', 0)}

    ball = event.get('ball', [])
    if ball:
        return {'x': ball[0].get('x', 0), 'y': ball[0].get('y', 0)}

    return None


def _get_event_field(event: Dict, field: str, possession_field: Optional[str] = None) -> str:
    """Extract event field from processed or raw possessionEvents format."""
    if field in event:
        return event[field] or ''

    poss_events = event.get('possessionEvents') or {}
    if possession_field:
        return poss_events.get(possession_field, '') or ''
    return poss_events.get(field, '') or ''


def get_event_type(event: Dict) -> str:
    """Extract event type from processed or raw event format."""
    return _get_event_field(event, 'eventType', possession_field='possessionEventType')


def get_pass_type(event: Dict) -> str:
    """Extract pass type from event."""
    return _get_event_field(event, 'passType')


def get_shot_type(event: Dict) -> str:
    """Extract shot type from event."""
    return _get_event_field(event, 'shotType')


def get_pressure_type(event: Dict) -> str:
    """Extract pressure type from event."""
    return _get_event_field(event, 'pressureType')


def get_near_ball_players(event: Dict, ball_x: float, ball_y: float,
                          radius: float = NEAR_BALL_RADIUS) -> List[Tuple[float, float]]:
    """Get positions of players near the ball"""
    near_players = []

    # Handles both raw and processed formats as long as 'homePlayers' is a list of dicts
    for player in event.get('homePlayers', []):
        px, py = player.get('x', 0), player.get('y', 0)
        if euclidean_distance(px, py, ball_x, ball_y) <= radius:
            near_players.append((px, py))

    for player in event.get('awayPlayers', []):
        px, py = player.get('x', 0), player.get('y', 0)
        if euclidean_distance(px, py, ball_x, ball_y) <= radius:
            near_players.append((px, py))

    return near_players


# =============================================================================
# FEATURE EXTRACTION
# =============================================================================
def extract_event_features(event: Dict) -> Dict[str, Any]:
    """
    Extract all features from an event for DTW comparison.
    Returns a feature dictionary.
    """
    ball_x, ball_y = get_ball_position(event)

    features = {
        'ball_position': (ball_x, ball_y),
        'event_type': get_event_type(event),
        'near_players': get_near_ball_players(event, ball_x, ball_y),
        # Optional features
        'pass_type': get_pass_type(event),
        'shot_type': get_shot_type(event),
        'pressure_type': get_pressure_type(event)
    }

    return features


def extract_sequence_features(sequence: Dict) -> List[Dict[str, Any]]:
    """Extract features from all events in a sequence"""
    events = sequence.get('events', [])
    return [extract_event_features(event) for event in events]


# =============================================================================
# DISTANCE FUNCTIONS
# =============================================================================
def _avg_nearest_distance(source: List[Tuple[float, float]],
                          target: List[Tuple[float, float]]) -> float:
    """Average nearest-neighbor distance from each source to target."""
    total_dist = 0.0
    for src in source:
        min_dist = float('inf')
        for tgt in target:
            min_dist = min(min_dist, euclidean_distance(src[0], src[1], tgt[0], tgt[1]))
        total_dist += min_dist
    return total_dist / len(source)


def player_formation_distance(players1: List[Tuple[float, float]],
                               players2: List[Tuple[float, float]]) -> float:
    """
    Calculate distance between two player formations.
    Uses average nearest-neighbor distance in both directions.
    """
    if not players1 or not players2:
        # If one has no near players, moderate penalty
        if not players1 and not players2:
            return 0.0
        return 10.0

    avg_dist = _avg_nearest_distance(players1, players2)
    avg_dist_rev = _avg_nearest_distance(players2, players1)

    # Return average of both directions
    return (avg_dist + avg_dist_rev) / 2


def event_distance(features1: Dict[str, Any], features2: Dict[str, Any],
                   config: Optional[Dict] = None) -> float:
    """
    Calculate total distance between two events based on their features.
    """
    if config is None:
        config = OPTIONAL_FEATURES

    total_distance = 0.0

    # 1. Ball position distance (Euclidean)
    ball1 = features1['ball_position']
    ball2 = features2['ball_position']
    ball_dist = euclidean_distance(ball1[0], ball1[1], ball2[0], ball2[1])
    total_distance += WEIGHTS['ball_position'] * ball_dist

    # 2. Event type penalty (scaled)
    type_penalty = event_type_penalty(features1['event_type'], features2['event_type'])
    total_distance += WEIGHTS['event_type'] * type_penalty

    # 3. Player formation distance
    formation_dist = player_formation_distance(
        features1['near_players'],
        features2['near_players']
    )
    total_distance += WEIGHTS['player_formation'] * formation_dist

    # 4. Optional: Pass type
    if config.get('pass_type', False):
        pass_penalty = pass_type_penalty(features1['pass_type'], features2['pass_type'])
        total_distance += WEIGHTS['pass_type'] * pass_penalty

    # 5. Optional: Shot type
    if config.get('shot_type', False):
        shot_penalty = shot_type_penalty(features1['shot_type'], features2['shot_type'])
        total_distance += WEIGHTS['shot_type'] * shot_penalty

    # 6. Optional: Pressure type
    if config.get('pressure_type', False):
        pressure_penalty = pressure_type_penalty(
            features1['pressure_type'],
            features2['pressure_type']
        )
        total_distance += WEIGHTS['pressure_type'] * pressure_penalty

    return total_distance


# =============================================================================
# DTW CORE
# =============================================================================
def dtw_distance(seq1_features: List[Dict], seq2_features: List[Dict],
                 config: Optional[Dict] = None) -> Tuple[float, List]:
    """
    Calculate DTW distance between two sequences of event features using FastDTW.

    Returns: (total_distance, alignment_path)
    """
    if not seq1_features or not seq2_features:
        return (float('inf'), [])

    n, m = len(seq1_features), len(seq2_features)

    # Create distance function for fastdtw
    def dist_func(idx1, idx2):
        # Indices come as numpy arrays, extract scalar
        i = int(idx1[0]) if hasattr(idx1, '__len__') else int(idx1)
        j = int(idx2[0]) if hasattr(idx2, '__len__') else int(idx2)
        return event_distance(seq1_features[i], seq2_features[j], config)

    # Use fastdtw with index arrays
    seq1_indices = np.arange(n).reshape(-1, 1)
    seq2_indices = np.arange(m).reshape(-1, 1)

    distance, path = fastdtw(seq1_indices, seq2_indices, dist=dist_func)
    return (distance, path)


# =============================================================================
# SEQUENCE INDEX CACHE
# =============================================================================
_sequence_index: List[Dict] = []
_cache_initialized = False


def _build_matches_data_from_repository() -> List[Dict]:
    """Load matches and shape them into the DTW indexing format."""
    from DSPFinalFIFA.FIFA.fifa import MatchRepository

    matches = MatchRepository.get_all_matches()
    matches_data = []

    for match in matches:
        plays = match.get_all_plays()

        # Group plays by sequence
        sequences_dict = {}
        for play in plays:
            seq_id = play.get('sequence')
            if seq_id is None:
                continue
            if seq_id not in sequences_dict:
                sequences_dict[seq_id] = {
                    'sequenceId': seq_id,
                    'events': [],
                    'time': play.get('time', ''),
                    'setpieceType': play.get('setpieceLabel', 'Open Play')
                }
            sequences_dict[seq_id]['events'].append(play)

        matches_data.append({
            'matchId': match.match_id,
            'homeTeam': match.home_team.to_dict() if match.home_team else {},
            'awayTeam': match.away_team.to_dict() if match.away_team else {},
            'sequences': list(sequences_dict.values())
        })

    return matches_data


def build_sequence_index(matches_data: List[Dict]) -> None:
    """
    Build and cache index of all sequences from all matches.
    Each entry contains sequence features pre-computed for fast comparison.
    """
    global _sequence_index, _cache_initialized

    print("[DTW] Building sequence index...")
    _sequence_index = []

    for match in matches_data:
        match_id = match.get('matchId', match.get('id', ''))
        home_team = match.get('homeTeam', {})
        away_team = match.get('awayTeam', {})

        sequences = match.get('sequences', match.get('plays', []))

        for seq in sequences:
            seq_id = seq.get('sequenceId', seq.get('sequence', 0))
            events = seq.get('events', [])

            if not events:
                continue

            # Pre-compute features for all events
            features = extract_sequence_features({'events': events})

            _sequence_index.append({
                'matchId': str(match_id),
                'sequenceId': seq_id,
                'features': features,
                'events': events,  # Keep original events for result
                'homeTeam': home_team,
                'awayTeam': away_team,
                'time': seq.get('time', ''),
                'setpieceType': seq.get('setpieceType', 'Open Play')
            })

    _cache_initialized = True
    print(f"[DTW] Index built with {len(_sequence_index)} sequences")


def ensure_index_initialized() -> None:
    """Ensure the sequence index is initialized"""
    global _cache_initialized, _sequence_index

    # Check both flag and actual data (in case module was reloaded but data persists)
    if _cache_initialized and len(_sequence_index) > 0:
        return  # Already initialized
    
    if len(_sequence_index) > 0:
        # Data exists but flag was reset (module reload)
        _cache_initialized = True
        print(f"[DTW] Using existing index ({len(_sequence_index)} sequences)")
        return

    # Need to build the index
    try:
        matches_data = _build_matches_data_from_repository()
        build_sequence_index(matches_data)
    except Exception as e:
        print(f"[DTW] Error initializing index: {e}")
        _sequence_index = []
        _cache_initialized = True


# =============================================================================
# SEARCH FUNCTION
# =============================================================================
def search_similar_sequences_dtw(query_sequence: Dict,
                                  top_n: int = TOP_N,
                                  config: Optional[Dict] = None,
                                  exclude_match_id: str = None,
                                  exclude_seq_id: int = None) -> List[Dict]:
    """
    Search for sequences similar to the query using DTW.

    Args:
        query_sequence: Dict with 'events' list
        top_n: Number of results to return
        config: Optional feature configuration
        exclude_match_id: Match ID to exclude from results
        exclude_seq_id: Sequence ID to exclude (used with exclude_match_id)

    Returns:
        List of similar sequences with distance and similarity scores
    """
    ensure_index_initialized()

    if config is None:
        config = OPTIONAL_FEATURES

    # Extract features from query
    query_events = query_sequence.get('events', [])
    if not query_events:
        return []

    query_features = [extract_event_features(e) for e in query_events]

    # Compare with all indexed sequences
    results = []

    for entry in _sequence_index:
        # Skip excluded sequence
        if exclude_match_id and exclude_seq_id is not None:
            if entry['matchId'] == exclude_match_id and entry['sequenceId'] == exclude_seq_id:
                continue

        # Calculate DTW distance
        distance, path = dtw_distance(query_features, entry['features'], config)

        # Normalize distance to similarity score (0-1)
        # Use sequence length for normalization
        path_length = max(len(query_features), len(entry['features']))
        normalized_distance = distance / path_length if path_length > 0 else distance

        # Convert to similarity (higher = more similar)
        similarity = max(0, 1 - (normalized_distance / MAX_DISTANCE))

        results.append({
            'matchId': entry['matchId'],
            'sequenceId': entry['sequenceId'],
            'distance': distance,
            'similarity': similarity,
            'events': _lightweight_events(entry['events']),
            'eventCount': len(entry['events']),
            'homeTeam': entry['homeTeam'],
            'awayTeam': entry['awayTeam'],
            'time': entry['time'],
            'setpieceType': entry['setpieceType'],
            'alignmentPath': path
        })

    # Sort by distance (ascending) and take top N
    results.sort(key=lambda x: x['distance'])

    return results[:top_n]


def _ensure_key_player_ids(event: Dict) -> List[int]:
    """Ensure keyPlayerIds contains at least the primary player."""
    key_ids = list(event.get('keyPlayerIds', []))  # Copy to avoid mutation
    
    # Always include primary player if present
    player_id = event.get('playerId')
    if player_id and player_id not in key_ids:
        key_ids.append(player_id)
    
    # Include secondary player if present
    secondary = event.get('secondaryPlayerId') or event.get('secondaryPlayer')
    if isinstance(secondary, int) and secondary not in key_ids:
        key_ids.append(secondary)
    
    return key_ids


def _lightweight_events(events: List[Dict]) -> List[Dict]:
    """Return lightweight version of events WITH filtered key players for pitch rendering"""
    lightweight = []
    for event in events:
        # Extract ball position with fallback
        ball_pos = _get_ball_position_dict(event)

        # Ensure we always have key player IDs (at minimum the primary player)
        key_ids = _ensure_key_player_ids(event)
        
        # Filter players to only key players
        home_players = event.get('homePlayers', [])
        away_players = event.get('awayPlayers', [])
        
        home_players = [p for p in home_players if p.get('playerId') in key_ids]
        away_players = [p for p in away_players if p.get('playerId') in key_ids]

        lw = {
            'eventType': event.get('eventType', ''),
            'eventLabel': event.get('eventLabel', ''),
            'playerName': event.get('playerName', ''),
            'playerId': event.get('playerId', ''),
            'teamId': event.get('teamId', ''),
            'teamName': event.get('teamName', ''),
            'time': event.get('time', ''),
            'ballPosition': ball_pos,
            'isGoal': event.get('isGoal', False),
            'keyPlayerIds': key_ids,
            'homePlayers': home_players,
            'awayPlayers': away_players,
            'passType': event.get('passType', ''),
            'shotType': event.get('shotType', '')
        }

        lightweight.append(lw)

    return lightweight


# =============================================================================
# UTILITY: Compare two specific sequences
# =============================================================================
def compare_sequences(seq1: Dict, seq2: Dict, config: Optional[Dict] = None) -> Dict:
    """
    Compare two specific sequences and return detailed comparison.
    Useful for debugging or detailed analysis.
    """
    if config is None:
        config = OPTIONAL_FEATURES

    features1 = [extract_event_features(e) for e in seq1.get('events', [])]
    features2 = [extract_event_features(e) for e in seq2.get('events', [])]

    distance, path = dtw_distance(features1, features2, config)

    # Calculate per-event distances along the path
    event_distances = []
    for i, j in path:
        if i < len(features1) and j < len(features2):
            d = event_distance(features1[i], features2[j], config)
            event_distances.append({
                'seq1_index': i,
                'seq2_index': j,
                'distance': d
            })

    path_length = max(len(features1), len(features2))
    normalized_distance = distance / path_length if path_length > 0 else distance
    similarity = max(0, 1 - (normalized_distance / MAX_DISTANCE))

    return {
        'distance': distance,
        'similarity': similarity,
        'path': path,
        'event_distances': event_distances,
        'seq1_length': len(features1),
        'seq2_length': len(features2)
    }


# =============================================================================
# CONFIGURATION HELPERS
# =============================================================================
def set_optional_feature(feature: str, enabled: bool) -> None:
    """Enable or disable an optional feature"""
    if feature in OPTIONAL_FEATURES:
        OPTIONAL_FEATURES[feature] = enabled
        print(f"[DTW] Feature '{feature}' set to {enabled}")


def set_weight(feature: str, weight: float) -> None:
    """Set the weight for a feature"""
    if feature in WEIGHTS:
        WEIGHTS[feature] = weight
        print(f"[DTW] Weight for '{feature}' set to {weight}")


def get_config() -> Dict:
    """Get current configuration"""
    return {
        'weights': WEIGHTS.copy(),
        'optional_features': OPTIONAL_FEATURES.copy(),
        'top_n': TOP_N,
        'near_ball_radius': NEAR_BALL_RADIUS
    }


def reset_cache() -> None:
    """Reset the sequence index cache"""
    global _sequence_index, _cache_initialized
    _sequence_index = []
    _cache_initialized = False
    print("[DTW] Cache reset")