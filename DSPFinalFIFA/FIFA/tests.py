import json

from django.test import TestCase


class DTWIntegrationTests(TestCase):
    """Integration tests using real match data from repository."""

    @classmethod
    def setUpTestData(cls):
        from DSPFinalFIFA.FIFA.fifa import MatchRepository

        cls.matches = MatchRepository.get_all_matches()
        cls.match = cls.matches[0]

        plays = cls.match.get_all_plays()
        sequences = {}
        for play in plays:
            seq_id = play.get('sequence')
            if seq_id is None:
                continue
            sequences.setdefault(seq_id, []).append(play)

        cls.sequence_id = None
        cls.query_sequence = {'events': []}
        for seq_id, events in sequences.items():
            if events:
                cls.sequence_id = seq_id
                cls.query_sequence = {'events': events}
                break

        cls.exclude_match_id = str(cls.match.match_id)
        cls.exclude_seq_id = cls.sequence_id

    def test_dtw_search_returns_results(self):
        from DSPFinalFIFA.FIFA import DTW

        results = DTW.search_similar_sequences_dtw(
            self.query_sequence,
            top_n=3,
            exclude_match_id=self.exclude_match_id,
            exclude_seq_id=self.exclude_seq_id
        )

        self.assertIsInstance(results, list)
        if not results:
            # It's acceptable to have no results for some datasets, but the call should still succeed.
            return

        sample = results[0]
        for key in [
            'matchId', 'sequenceId', 'distance', 'similarity', 'events', 'eventCount',
            'homeTeam', 'awayTeam', 'time', 'setpieceType', 'alignmentPath'
        ]:
            self.assertIn(key, sample)

        self.assertEqual(sample['eventCount'], len(sample['events']))
        self.assertGreaterEqual(sample['similarity'], 0)
        self.assertLessEqual(sample['similarity'], 1)

    def test_lightweight_events_shape(self):
        from DSPFinalFIFA.FIFA import DTW

        events = self.query_sequence.get('events', [])[:2]
        lw_events = DTW._lightweight_events(events)

        self.assertEqual(len(lw_events), len(events))
        for event in lw_events:
            for key in [
                'eventType', 'eventLabel', 'playerName', 'playerId', 'teamId', 'teamName',
                'time', 'ballPosition', 'isGoal', 'keyPlayerIds', 'homePlayers', 'awayPlayers'
            ]:
                self.assertIn(key, event)

    def test_compare_sequences_shape(self):
        from DSPFinalFIFA.FIFA import DTW

        comparison = DTW.compare_sequences(self.query_sequence, self.query_sequence)
        for key in ['distance', 'similarity', 'path', 'event_distances', 'seq1_length', 'seq2_length']:
            self.assertIn(key, comparison)
        self.assertGreaterEqual(comparison['similarity'], 0)
        self.assertLessEqual(comparison['similarity'], 1)


class TFIDFIntegrationTests(TestCase):
    """Integration tests using real match data for TF-IDF search."""

    @classmethod
    def setUpTestData(cls):
        from DSPFinalFIFA.FIFA.fifa import MatchRepository

        cls.matches = MatchRepository.get_all_matches()
        cls.match = cls.matches[0]

        plays = cls.match.get_all_plays()
        cls.query_event = plays[0]

        sequences = {}
        for play in plays:
            seq_id = play.get('sequence')
            if seq_id is None:
                continue
            sequences.setdefault(seq_id, []).append(play)

        cls.sequence_id = None
        cls.query_sequence_events = []
        for seq_id, events in sequences.items():
            if events:
                cls.sequence_id = seq_id
                cls.query_sequence_events = events
                break

    def test_tfidf_event_search_shape(self):
        from DSPFinalFIFA.FIFA import TF_IDF

        results = TF_IDF.search_similar_events(
            self.query_event,
            exclude_match_id=str(self.match.match_id),
            exclude_seq_id=self.sequence_id,
            exclude_event_idx=0,
            top_n=3
        )

        self.assertIsInstance(results, list)
        if not results:
            return

        sample = results[0]
        for key in ['matchId', 'sequenceId', 'eventIndex', 'event', 'homeTeam', 'awayTeam', 'similarity']:
            self.assertIn(key, sample)

    def test_tfidf_sequence_search_shape(self):
        from DSPFinalFIFA.FIFA import TF_IDF

        results = TF_IDF.search_similar_sequences(
            self.query_sequence_events,
            exclude_match_id=str(self.match.match_id),
            exclude_seq_id=self.sequence_id,
            top_n=3
        )

        self.assertIsInstance(results, list)
        if not results:
            return

        sample = results[0]
        for key in ['matchId', 'sequenceId', 'setpieceType', 'teamId', 'time', 'events', 'homeTeam', 'awayTeam', 'eventCount', 'similarity']:
            self.assertIn(key, sample)


class FIFAIntegrationTests(TestCase):
    """Integration tests for core FIFA data layer and API endpoints."""

    @classmethod
    def setUpTestData(cls):
        from DSPFinalFIFA.FIFA.fifa import MatchRepository

        cls.match = MatchRepository.get_all_matches()[0]

    def test_get_all_plays_shape(self):
        plays = self.match.get_all_plays()
        self.assertIsInstance(plays, list)
        if not plays:
            return

        sample = plays[0]
        for key in [
            'index', 'eventId', 'sequence', 'time', 'period', 'eventType', 'eventLabel',
            'setpieceType', 'setpieceLabel', 'teamId', 'teamName', 'playerName',
            'playerId', 'secondaryPlayer', 'secondaryPlayerId', 'assisterName',
            'assisterId', 'keeperName', 'keyPlayerIds', 'outcome', 'isGoal',
            'ballPosition', 'homePlayers', 'awayPlayers', 'passType', 'shotType', 'pressureType'
        ]:
            self.assertIn(key, sample)

    def test_api_match_plays(self):
        response = self.client.get(f"/api/matches/{self.match.match_id}/plays/")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        for key in ['matchId', 'match', 'plays', 'totalEvents', 'totalSequences']:
            self.assertIn(key, data)

    def test_api_match_goals(self):
        response = self.client.get(f"/api/matches/{self.match.match_id}/goals/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ['matchId', 'match', 'goals']:
            self.assertIn(key, data)


class ViewsServiceIntegrationTests(TestCase):
    """Integration tests for MatchService in views.py."""

    def test_match_service_get_all_matches(self):
        from DSPFinalFIFA.FIFA.views import MatchService

        service = MatchService()
        matches = service.get_all_matches()

        self.assertIsInstance(matches, list)
        if not matches:
            return

        match = matches[0]
        # Ensure core fields exist
        self.assertTrue(match.id)
        self.assertIsNotNone(match.home_team)
        self.assertIsNotNone(match.away_team)


class ModelsIntegrationTests(TestCase):
    """Integration tests for models and EventFactory using real data."""

    def test_event_factory_with_real_event(self):
        from DSPFinalFIFA.FIFA.views import DataLoader
        from DSPFinalFIFA.FIFA.models import EventFactory, Event

        loader = DataLoader()
        match_ids = loader.get_all_match_ids()
        self.assertTrue(match_ids)

        events = loader.load_events(match_ids[0])
        self.assertTrue(events)

        event = EventFactory.create_event(events[0])
        # Event can be None for unsupported types, but must not error
        if event is not None:
            self.assertIsInstance(event, Event)


class SearchApiIntegrationTests(TestCase):
    """Integration tests for search API endpoints using real data."""

    @classmethod
    def setUpTestData(cls):
        from DSPFinalFIFA.FIFA.fifa import MatchRepository

        cls.match = MatchRepository.get_all_matches()[0]
        plays = cls.match.get_all_plays()

        cls.query_event = plays[0]

        sequences = {}
        for play in plays:
            seq_id = play.get('sequence')
            if seq_id is None:
                continue
            sequences.setdefault(seq_id, []).append(play)

        cls.sequence_id = None
        cls.query_events = []
        for seq_id, events in sequences.items():
            if events:
                cls.sequence_id = seq_id
                cls.query_events = events
                break

    def test_api_search_event(self):
        payload = {
            'event': self.query_event,
            'matchId': str(self.match.match_id),
            'sequenceId': self.sequence_id,
            'eventIndex': self.query_event.get('index', 0),
            'topN': 3
        }
        response = self.client.post(
            '/api/search/event/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ['query', 'results', 'count']:
            self.assertIn(key, data)

    def test_api_search_sequence_tfidf(self):
        payload = {
            'events': self.query_events,
            'matchId': str(self.match.match_id),
            'sequenceId': self.sequence_id,
            'method': 'tfidf',
            'topN': 3
        }
        response = self.client.post(
            '/api/search/sequence/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ['query', 'results', 'count']:
            self.assertIn(key, data)
