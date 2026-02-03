"""
FIFA App Configuration
Initializes search caches at server startup for faster first searches
"""
import threading
from django.apps import AppConfig


class FIFAConfig(AppConfig):
    """Django app configuration for FIFA module"""
    name = 'DSPFinalFIFA.FIFA'
    verbose_name = 'FIFA World Cup 2022 Data'

    def ready(self):
        """
        Called when Django app is ready.
        Spawns background thread to warm DTW and TF-IDF caches.
        """
        # Avoid running twice in development (autoreload)
        import os
        if os.environ.get('RUN_MAIN') != 'true':
            return

        # Warm caches in background thread (non-blocking)
        thread = threading.Thread(target=self._warm_caches, daemon=True)
        thread.start()

    def _warm_caches(self):
        """Initialize both search caches in background"""
        try:
            # Import here to avoid circular imports
            from . import TF_IDF, DTW

            print("[FIFA] Warming search caches in background...")

            # Initialize TF-IDF cache
            TF_IDF.initialize_cache()

            # Initialize DTW cache
            DTW.ensure_index_initialized()

            print("[FIFA] Search caches ready!")

        except Exception as e:
            print(f"[FIFA] Cache warm-up error (non-fatal): {e}")
