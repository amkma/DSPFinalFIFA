/**
 * FIFA World Cup 2022 Event Visualizer - Main Application
 * OOP Implementation with 4 Principles:
 * - Encapsulation: Classes bundle data and methods
 * - Abstraction: Public API hides complex logic
 * - Inheritance: EventVisualizer uses PitchRenderer
 * - Polymorphism: Different event types rendered differently
 */

// =============================================================================
// CONSTANTS: Event type icons and labels
// =============================================================================
const EVENT_ICONS = {
    'Pass': '🎯',
    'Shot': '💥',
    'Cross': '↗️',
    'Clearance': '🛡️',
    'Challenge': '⚔️',
    'Touch': '👆',
    'Ball Carry': '🏃',
    'Initial Touch': '▶️',
    'Rebound': '🔄',
    'Unknown': '⚡'
};

const SETPIECE_ICONS = {
    'Open Play': '⚽',
    'Throw-in': '🤾',
    'Corner': '🚩',
    'Kickoff': '🎬',
    'Penalty': '⚠️',
    'Goal Kick': '🥅',
    'Free Kick': '🎯'
};

// =============================================================================
// INHERITANCE: EventVisualizer uses composition with PitchRenderer
// =============================================================================
class EventVisualizer {
    constructor(canvasId, tooltipId) {
        this._canvas = document.getElementById(canvasId);
        this._tooltip = document.getElementById(tooltipId);
        this._renderer = null;
        this._infoCard = null;
        this._currentEventData = null;
        
        if (this._canvas) {
            this._setupCanvas();
            this._renderer = new PitchRenderer(this._canvas);
            this._infoCard = new InfoCard(this._tooltip);
            this._bindEvents();

            // AUTOMATIC RESIZE: Observer ensures canvas resizes when modal expands
            this._resizeObserver = new ResizeObserver(() => this.resize());
            this._resizeObserver.observe(this._canvas.parentElement);
        }
    }

    _setupCanvas() {
        // Set canvas size
        const container = this._canvas.parentElement;

        // [FIX] Ensure we get the actual computed width
        // If container is hidden, clientWidth is 0, so we default to 800
        const width = container.clientWidth || 800;

        this._canvas.width = width;
        // Maintain standard pitch aspect ratio (105x68 ≈ 0.647)
        this._canvas.height = width * 0.647;
    }

    _bindEvents() {
        // Mouse move for tooltips
        this._canvas.addEventListener('mousemove', (e) => {
            const rect = this._canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const player = this._renderer.getPlayerAt(x, y);

            if (player) {
                this._canvas.style.cursor = 'pointer';
                this._infoCard.show(e.clientX - rect.left, e.clientY - rect.top, player.getTooltipData());
            } else {
                this._canvas.style.cursor = 'default';
                this._infoCard.hide();
            }
        });

        this._canvas.addEventListener('mouseleave', () => {
            this._infoCard.hide();
        });
    }

    visualize(eventData) {
        this._currentEventData = eventData;

        if (!this._renderer) return;

        const snapshot = eventData.snapshot || {};
        const event = eventData.event || eventData.goal || {};

        // Build team colors map
        const teamColors = {};
        if (eventData.homeTeam) {
            teamColors[String(eventData.homeTeam.id)] = eventData.homeTeam.primaryColor || '#3b82f6';
        }
        if (eventData.awayTeam) {
            teamColors[String(eventData.awayTeam.id)] = eventData.awayTeam.primaryColor || '#ef4444';
        }

        // Set players
        this._renderer.setPlayers(
            snapshot.homePlayers || [],
            snapshot.awayPlayers || [],
            eventData.homeTeam,
            eventData.awayTeam
        );

        // Set ball position
        this._renderer.setBall(snapshot.ball);

        // Build event sequence from preceding events
        const passEvents = (eventData.precedingEvents || [])
            .filter(e => e.ballPosition)
            .map(e => ({
                ballPosition: e.ballPosition,
                teamId: String(e.teamId)
            }));

        // Add current event position
        if (event.ballPosition) {
            passEvents.push({
                ballPosition: event.ballPosition,
                teamId: String(event.teamId)
            });
        }

        this._renderer.setPassSequence(passEvents, teamColors);

        // Set event marker type for visual indicator
        const markerType = eventData.eventMarker || eventData.event?.eventLabel || null;
        this._renderer.setEventMarker(markerType, eventData.event?.ballPosition);

        // Render
        this._renderer.render();
    }

    resize() {
        if (this._canvas) {
            this._setupCanvas();
            // Re-instantiate renderer to handle new canvas dimensions context
            this._renderer = new PitchRenderer(this._canvas);

            if (this._currentEventData) {
                this.visualize(this._currentEventData);
            }
        }
    }
}

// =============================================================================
// ENCAPSULATION: App class handles all application state
// =============================================================================
class App {
    constructor(matchesData) {
        this._matches = matchesData || [];
        this._selectedMatchId = null;
        this._plays = [];
        this._visualizer = null;
        this._currentMatch = null;
        this._activeFilter = 'all';
        this._searchDebounceTimer = null;
        this._allMatches = [...this._matches];
        this._searchMode = false;
        this._currentEvent = null;
        this._comparisonVisualizer = null;
        this._searchType = null;
        this._searchResults = null;
        this._currentSequence = null;
        this._currentComparisonResult = null;
        this._currentComparisonEvent = null;

        this._initElements();
        this._bindEvents();
        this._renderMatches();
        this._calculateTotalGoals();
        this._loadTheme();
    }

    _initElements() {
        // Main grid
        this.matchesGrid = document.getElementById('matchesGrid');
        this.matchCount = document.getElementById('matchCount');
        this.totalGoals = document.getElementById('totalGoals');

        // Plays modal (formerly goals modal)
        this.goalsModal = document.getElementById('goalsModal');
        this.goalsCloseBtn = document.getElementById('goalsCloseBtn');
        this.matchTitle = document.getElementById('matchTitle');
        this.matchGoalCount = document.getElementById('matchGoalCount');
        this.goalsGrid = document.getElementById('goalsGrid');

        // Pitch modal
        this.pitchModal = document.getElementById('pitchModal');
        this.pitchCloseBtn = document.getElementById('pitchCloseBtn');
        this.pitchMatchTitle = document.getElementById('pitchMatchTitle');
        this.goalScorerName = document.getElementById('goalScorerName');
        this.goalMinute = document.getElementById('goalMinute');
        this.passSequenceList = document.getElementById('passSequenceList');

        // Search elements (header)
        this.searchInput = document.getElementById('searchInput');
        this.searchResultsDropdown = document.getElementById('searchResultsDropdown');
        this.searchResultsList = document.getElementById('searchResultsList');
        this.searchResultCount = document.getElementById('searchResultCount');
        this.themeToggle = document.getElementById('themeToggle');

        // Pitch search elements
        this.searchMethodSelect = document.getElementById('searchMethodSelect');
        this.searchSequenceBtn = document.getElementById('searchSequenceBtn');
        this.searchResults = document.getElementById('searchResults');
        this.searchBackBtn = document.getElementById('searchBackBtn');
        this.panelTitle = document.getElementById('panelTitle');
        this.searchButtons = document.getElementById('searchButtons');
        this.pitchLegend = document.getElementById('pitchLegend');

        // Dual pitch elements
        this.dualPitchContainer = document.getElementById('dualPitchContainer');
        this.queryPitchSection = document.getElementById('queryPitchSection');
        this.comparisonPitchSection = document.getElementById('comparisonPitchSection');
        this.queryEventsList = document.getElementById('queryEventsList');
        this.comparisonEventsList = document.getElementById('comparisonEventsList');
    }

    _bindEvents() {
        // Modal events
        if (this.goalsCloseBtn) {
            this.goalsCloseBtn.addEventListener('click', () => this._closeGoalsModal());
        }
        if (this.goalsModal) {
            this.goalsModal.querySelector('.modal-overlay')?.addEventListener('click', () => this._closeGoalsModal());
        }
        if (this.pitchCloseBtn) {
            this.pitchCloseBtn.addEventListener('click', () => this._closePitchModal());
        }
        if (this.pitchModal) {
            this.pitchModal.querySelector('.modal-overlay')?.addEventListener('click', () => this._closePitchModal());
        }

        // Search events (header)
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this._handleSearch(e));
            this.searchInput.addEventListener('focus', () => this._showSearchResults());
            document.addEventListener('click', (e) => {
                if (!this.searchInput.contains(e.target) && 
                    !this.searchResultsDropdown.contains(e.target)) {
                    this._hideSearchResults();
                }
            });
        }

        // Theme toggle
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this._toggleTheme());
        }

        // Pitch search events
        if (this.searchSequenceBtn) {
            this.searchSequenceBtn.addEventListener('click', () => this._searchSimilarSequence());
        }
        if (this.searchBackBtn) {
            this.searchBackBtn.addEventListener('click', () => this._exitSearchMode());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this._searchMode) {
                    this._exitSearchMode();
                } else {
                    this._closePitchModal();
                    this._closeGoalsModal();
                }
            }
            
            // Ctrl/Cmd + K for search focus
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (this.searchInput) {
                    this.searchInput.focus();
                    this._showSearchResults();
                }
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            if (this._visualizer) {
                this._visualizer.resize();
            }
            if (this._comparisonVisualizer) {
                this._comparisonVisualizer.resize();
            }
        });
    }

    _calculateTotalGoals() {
        // This is a placeholder - you should calculate actual goals from your data
        // For demonstration, we'll set a World Cup 2022 total
        if (this.totalGoals) {
            // World Cup 2022 had 172 goals
            this.totalGoals.textContent = '172';
        }
    }

    _loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            this._updateThemeIcon('light');
        } else {
            this._updateThemeIcon('dark');
        }
    }

    _updateThemeIcon(theme) {
        if (!this.themeToggle) return;
        
        const icon = this.themeToggle.querySelector('svg');
        if (!icon) return;
        
        if (theme === 'light') {
            icon.innerHTML = `
                <path d="M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            `;
        } else {
            icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
        }
    }

    _toggleTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        this._updateThemeIcon(isLight ? 'light' : 'dark');
    }

    _handleSearch(event) {
        clearTimeout(this._searchDebounceTimer);
        
        this._searchDebounceTimer = setTimeout(() => {
            const query = event.target.value.trim().toLowerCase();
            
            if (query.length < 2) {
                this._showRecentMatches();
                return;
            }
            
            this._performSearch(query);
        }, 300);
    }

    _performSearch(query) {
        const results = this._allMatches.filter(match => {
            const searchText = [
                match.homeTeam?.name || '',
                match.awayTeam?.name || '',
                match.homeTeam?.shortName || '',
                match.awayTeam?.shortName || '',
                match.stadium || '',
                this._formatDate(match.date) || '',
                match.competition || '',
                match.stage || ''
            ].join(' ').toLowerCase();
            
            return searchText.includes(query);
        });
        
        this._displaySearchResults(results, query);
    }

    _showRecentMatches() {
        const recentMatches = this._allMatches.slice(0, 5);
        this._displaySearchResults(recentMatches, null);
    }

    _displaySearchResults(results, query) {
        if (!this.searchResultsList || !this.searchResultCount) return;
        
        this.searchResultsList.innerHTML = '';
        
        if (results.length === 0 && query) {
            this.searchResultsList.innerHTML = `
                <div class="no-search-results">
                    <div class="no-search-results-icon">🔍</div>
                    <p>No matches found for "${query}"</p>
                    <p class="loading-sub">Try different search terms</p>
                </div>
            `;
            this.searchResultCount.textContent = '0 results';
            return;
        }
        
        if (results.length === 0) {
            this.searchResultsList.innerHTML = `
                <div class="no-search-results">
                    <div class="no-search-results-icon">⚽</div>
                    <p>No matches available</p>
                </div>
            `;
            this.searchResultCount.textContent = '0 matches';
            return;
        }
        
        this.searchResultCount.textContent = `${results.length} match${results.length !== 1 ? 'es' : ''}`;
        
        const fragment = document.createDocumentFragment();
        
        results.forEach(match => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.matchId = match.id;
            
            const homeTeam = match.homeTeam || {};
            const awayTeam = match.awayTeam || {};
            
            item.innerHTML = `
                <div class="search-result-match">
                    <div class="search-result-teams">
                        <span class="search-result-team home">${homeTeam.shortName || 'HOM'}</span>
                        <span>vs</span>
                        <span class="search-result-team away">${awayTeam.shortName || 'AWY'}</span>
                    </div>
                    <div class="search-result-details">
                        <span class="search-result-date">${this._formatDate(match.date)}</span>
                        <span class="search-result-stadium">${match.stadium || 'World Cup Stadium'}</span>
                        <span class="search-result-stage">${match.stage || 'Group Stage'}</span>
                    </div>
                </div>
            `;
            
            item.addEventListener('click', () => {
                this._selectMatch(match.id);
                this.searchInput.value = '';
                this._hideSearchResults();
                // Update UI to show we're viewing this match
                this._highlightSelectedMatch(match.id);
            });
            
            fragment.appendChild(item);
        });
        
        this.searchResultsList.appendChild(fragment);
        this._showSearchResults();
    }

    _showSearchResults() {
        if (this.searchResultsDropdown && this.searchResultsList.children.length > 0) {
            this.searchResultsDropdown.classList.add('active');
        }
    }

    _hideSearchResults() {
        if (this.searchResultsDropdown) {
            this.searchResultsDropdown.classList.remove('active');
        }
    }

    _highlightSelectedMatch(matchId) {
        // Highlight match in search results
        this.searchResultsList.querySelectorAll('.search-result-item').forEach(item => {
            if (item.dataset.matchId === String(matchId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Also highlight in matches grid
        this.matchesGrid.querySelectorAll('.match-card').forEach(card => {
            if (card.dataset.matchId === String(matchId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    _renderMatches() {
        if (this.matchCount) {
            this.matchCount.textContent = this._matches.length;
        }

        if (!this.matchesGrid) return;

        this.matchesGrid.innerHTML = '';

        if (this._matches.length === 0) {
            this.matchesGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No matches found</p>
                </div>
            `;
            return;
        }

        for (const match of this._matches) {
            const card = this._createMatchCard(match);
            this.matchesGrid.appendChild(card);
        }
    }

    _createMatchCard(match) {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.dataset.matchId = match.id;

        const homeShort = match.homeTeam?.shortName || 'HOM';
        const awayShort = match.awayTeam?.shortName || 'AWY';
        const stage = match.stage || 'Group Stage';
        const stadium = match.stadium || 'World Cup Stadium';

        card.innerHTML = `
            <div class="card-header">
                <span class="team-short home">${homeShort}</span>
                <span class="vs-badge">VS</span>
                <span class="team-short away">${awayShort}</span>
            </div>
            <div class="card-body">
                <div class="match-info">
                    <span class="match-date">${this._formatDate(match.date)}</span>
                    <span class="match-stage">${stage}</span>
                </div>
                <div class="match-stadium">
                    <span>🏟️ ${stadium}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => this._selectMatch(match.id));

        return card;
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    async _selectMatch(matchId) {
        this._selectedMatchId = matchId;
        this._highlightSelectedMatch(matchId);

        if (this.goalsGrid) {
            this.goalsGrid.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Loading plays...</p>
                </div>
            `;
        }

        this._openGoalsModal();

        try {
            const response = await fetch(`/api/matches/${matchId}/plays/`);
            const data = await response.json();

            this._plays = data.plays || [];
            this._currentMatch = data.match;

            const homeName = this._currentMatch?.homeTeam?.name || 'Home';
            const awayName = this._currentMatch?.awayTeam?.name || 'Away';

            if (this.matchTitle) {
                this.matchTitle.textContent = `${homeName} vs ${awayName}`;
            }
            if (this.matchGoalCount) {
                const totalEvents = this._plays.reduce((sum, seq) => sum + seq.events.length, 0);
                this.matchGoalCount.textContent = `${this._plays.length} Sequences • ${totalEvents} Events`;
            }

            this._renderPlays();

        } catch (error) {
            console.error('Error loading plays:', error);
            if (this.goalsGrid) {
                this.goalsGrid.innerHTML = `
                    <div class="empty-state error">
                        <div class="empty-icon">⚠️</div>
                        <p>Error loading plays</p>
                        <p class="loading-sub">${error.message}</p>
                    </div>
                `;
            }
        }
    }

    _openGoalsModal() {
        if (this.goalsModal) {
            this.goalsModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    _closeGoalsModal() {
        if (this.goalsModal) {
            this.goalsModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    _renderPlays() {
        if (!this.goalsGrid) return;

        if (this._plays.length === 0) {
            this.goalsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No plays in this match</p>
                    <p class="loading-sub">Try another match</p>
                </div>
            `;
            return;
        }

        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar';
        filterBar.innerHTML = `
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="Shot">Shots 💥</button>
            <button class="filter-btn" data-filter="Pass">Passes 🎯</button>
            <button class="filter-btn" data-filter="goal">Goals ⚽</button>
            <button class="filter-btn" data-filter="Cross">Crosses ↗️</button>
        `;

        const list = document.createElement('div');
        list.className = 'plays-list';
        list.id = 'playsList';

        const fragment = document.createDocumentFragment();
        this._plays.forEach((sequence, seqIndex) => {
            const seqElement = this._createSequenceElement(sequence, seqIndex);
            fragment.appendChild(seqElement);
        });
        list.appendChild(fragment);

        this.goalsGrid.innerHTML = '';
        this.goalsGrid.appendChild(filterBar);
        this.goalsGrid.appendChild(list);

        filterBar.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this._filterPlays(e.target.dataset.filter);
            });
        });
    }

    _createSequenceElement(sequence, seqIndex) {
        const container = document.createElement('div');
        container.className = 'sequence-container';
        container.dataset.sequenceId = sequence.sequenceId;

        const header = document.createElement('div');
        header.className = 'sequence-header';

        const homeTeamId = String(this._currentMatch?.homeTeam?.id || '');
        const seqTeamId = String(sequence.teamId || '');
        const isHomeTeam = seqTeamId === homeTeamId;
        const teamShort = isHomeTeam
            ? (this._currentMatch?.homeTeam?.shortName || 'HOM')
            : (this._currentMatch?.awayTeam?.shortName || 'AWY');

        const hasGoal = sequence.events.some(e => e.isGoal);
        const setpieceIcon = SETPIECE_ICONS[sequence.setpieceType] || '⚽';

        header.innerHTML = `
            <span class="seq-number">#${seqIndex + 1}</span>
            <span class="seq-icon">${setpieceIcon}</span>
            <span class="seq-type">${sequence.setpieceType || 'Open Play'}</span>
            <span class="seq-team">${teamShort}</span>
            <span class="seq-time">${sequence.time || ''}</span>
            ${hasGoal ? '<span class="goal-indicator">⚽ GOAL</span>' : ''}
            <span class="seq-count">${sequence.events.length} events</span>
            <button class="view-seq-btn">View →</button>
        `;

        container._sequence = sequence;
        container.appendChild(header);

        header.addEventListener('click', () => {
            if (sequence.events && sequence.events.length > 0) {
                this._openPitchModal(sequence.events[0], sequence);
            }
        });

        const viewBtn = header.querySelector('.view-seq-btn');
        if (viewBtn) {
            viewBtn.style.pointerEvents = 'none';
        }

        return container;
    }

    _filterPlays(filter) {
        this._activeFilter = filter;
        const playsList = document.getElementById('playsList');
        if (!playsList) return;

        playsList.querySelectorAll('.sequence-container').forEach(seq => {
            const sequence = seq._sequence;
            if (!sequence) {
                seq.style.display = 'block';
                return;
            }

            let hasMatch = false;
            if (filter === 'all') {
                hasMatch = true;
            } else if (filter === 'goal') {
                hasMatch = sequence.events.some(e => e.isGoal);
            } else {
                hasMatch = sequence.events.some(e => (e.eventLabel || e.eventType) === filter);
            }

            seq.style.display = hasMatch ? 'block' : 'none';
        });
    }

    _openPitchModal(event, sequence) {
        if (this._searchMode) {
            this._exitSearchMode();
        }
        if (this.comparisonPitchSection) {
            this.comparisonPitchSection.style.display = 'none';
        }
        if (this.dualPitchContainer) {
            this.dualPitchContainer.classList.remove('comparison-active');
        }
        this._comparisonVisualizer = null;

        if (this.searchButtons) this.searchButtons.style.display = 'flex';
        if (this.pitchLegend) this.pitchLegend.style.display = 'flex';

        this._currentEvent = event;
        this._currentSequence = sequence;

        if (this.pitchMatchTitle) {
            const homeName = this._currentMatch?.homeTeam?.name || 'Home';
            const awayName = this._currentMatch?.awayTeam?.name || 'Away';
            this.pitchMatchTitle.textContent = `${homeName} vs ${awayName}`;
        }

        if (this.goalScorerName) {
            this.goalScorerName.textContent = event.playerName || 'Unknown';
        }

        if (this.goalMinute) {
            this.goalMinute.textContent = event.time || sequence.time || '';
        }

        this._renderEventSequence(event, sequence);
        this._renderQueryEventsList(sequence.events || [], event);

        if (this.pitchModal) {
            this.pitchModal.classList.add('active');
        }

        setTimeout(() => {
            if (!this._visualizer) {
                this._visualizer = new EventVisualizer('pitchCanvas', 'playerTooltip');
            }

            const eventData = this._buildEventData(
                event,
                sequence.events || [],
                this._currentMatch?.homeTeam,
                this._currentMatch?.awayTeam,
                null,
                false
            );

            this._visualizer.visualize(eventData);
        }, 100);
    }

    _closePitchModal() {
        if (this.pitchModal) {
            this.pitchModal.classList.remove('active');
        }
    }

    _renderEventSequence(currentEvent, sequence) {
        if (!this.passSequenceList) return;

        this.passSequenceList.innerHTML = '';
        this._currentSequence = sequence;

        const events = sequence.events || [];

        events.forEach((event, i) => {
            const isCurrent = event === currentEvent;
            const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);

            const item = document.createElement('div');
            item.className = 'pass-item' + (isCurrent ? ' active' : '') + (event.isGoal ? ' goal-item' : '');
            item.dataset.eventIndex = i;

            item.innerHTML = `
                <span class="pass-num">${i + 1}</span>
                <span class="pass-icon">${icon}</span>
                <span class="pass-player">${event.playerName || 'Unknown'}</span>
                <span class="pass-type">${event.isGoal ? 'GOAL!' : (event.eventLabel || event.eventType)}</span>
            `;

            item.addEventListener('click', () => {
                this.passSequenceList.querySelectorAll('.pass-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this._updatePitchForEvent(event);
            });

            this.passSequenceList.appendChild(item);
        });

        const activeItem = this.passSequenceList.querySelector('.pass-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    _updatePitchForEvent(event) {
        if (!this._visualizer || !this._currentSequence) return;
        this._currentEvent = event;

        const eventData = this._buildEventData(
            event,
            this._currentSequence.events || [],
            this._currentMatch?.homeTeam,
            this._currentMatch?.awayTeam,
            event.eventLabel,
            false
        );

        this._visualizer.visualize(eventData);
    }

    _filterPlayersByKeyIds(event, allowEmptyKeyIds) {
        const keyIds = event.keyPlayerIds || [];
        const useAllPlayers = allowEmptyKeyIds && keyIds.length === 0;

        if (useAllPlayers) {
            return {
                homePlayers: event.homePlayers || [],
                awayPlayers: event.awayPlayers || []
            };
        }

        return {
            homePlayers: (event.homePlayers || []).filter(p => keyIds.includes(p.playerId)),
            awayPlayers: (event.awayPlayers || []).filter(p => keyIds.includes(p.playerId))
        };
    }

    _buildPrecedingEvents(events, event) {
        const eventIndex = events.indexOf(event);
        return events.slice(Math.max(0, eventIndex - 5), eventIndex + 1).map(e => ({
            eventType: e.eventLabel || e.eventType,
            playerName: e.playerName,
            ballPosition: e.ballPosition,
            teamId: String(e.teamId)
        }));
    }

    _buildEventData(event, events, homeTeam, awayTeam, marker, allowEmptyKeyIds) {
        const filteredPlayers = this._filterPlayersByKeyIds(event, allowEmptyKeyIds);
        const snapshot = {
            homePlayers: filteredPlayers.homePlayers,
            awayPlayers: filteredPlayers.awayPlayers,
            ball: event.ballPosition
        };

        const precedingEvents = this._buildPrecedingEvents(events, event);

        return {
            event: { ...event, ballPosition: event.ballPosition },
            snapshot: snapshot,
            precedingEvents: precedingEvents,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            eventMarker: marker || undefined
        };
    }

    _showSearchLoading() {
        if (this.comparisonPitchSection) {
            this.comparisonPitchSection.style.display = 'none';
        }
        this._comparisonVisualizer = null;

        this.passSequenceList.style.display = 'none';
        this.searchResults.style.display = 'flex';
        this.searchResults.innerHTML = `
            <div class="search-loading">
                <span>Searching for similar plays...</span>
                <span class="loading-sub">(First search may take a few seconds)</span>
            </div>
        `;
    }

    async _searchSimilarSequence() {
        if (!this._currentSequence || !this._currentMatch) return;
        const method = this.searchMethodSelect?.value || 'hybrid';

        this.searchSequenceBtn.classList.add('loading');
        this.searchSequenceBtn.disabled = true;
        if (this.searchMethodSelect) this.searchMethodSelect.disabled = true;
        this._showSearchLoading();

        try {
            const response = await fetch('/api/search/sequence/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: this._currentSequence.events,
                    matchId: this._currentMatch.id,
                    sequenceId: this._currentSequence.sequenceId,
                    method: method,
                    topN: 10
                })
            });

            const data = await response.json();
            this._enterSearchMode('sequence', data.results);

        } catch (error) {
            console.error('Search error:', error);
            this._showSearchError();
        } finally {
            this.searchSequenceBtn.classList.remove('loading');
            this.searchSequenceBtn.disabled = false;
            if (this.searchMethodSelect) this.searchMethodSelect.disabled = false;
        }
    }

    _showSearchError() {
        this.searchResults.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">❌</div>
                <p>Search failed</p>
                <p class="loading-sub">Please try again</p>
            </div>
        `;
    }

    _enterSearchMode(searchType, results) {
        this._searchMode = true;
        this._searchType = searchType;
        this._searchResults = results;

        this.passSequenceList.style.display = 'none';
        this.searchResults.style.display = 'flex';
        this.searchBackBtn.style.display = 'block';
        this.panelTitle.textContent = searchType === 'event' ? 'Similar Events' : 'Similar Sequences';

        this._renderSearchResults(results);
    }

    _exitSearchMode() {
        this._searchMode = false;
        this._searchType = null;
        this._searchResults = null;

        if (this.comparisonPitchSection) {
            this.comparisonPitchSection.style.display = 'none';
        }

        if (this.dualPitchContainer) {
            this.dualPitchContainer.classList.remove('comparison-active');
        }

        const modalContainer = document.querySelector('.pitch-modal');
        if (modalContainer) {
            modalContainer.classList.remove('expanded');
        }

        if (this.searchButtons) this.searchButtons.style.display = 'flex';
        if (this.pitchLegend) this.pitchLegend.style.display = 'flex';

        setTimeout(() => {
            if (this._visualizer) {
                this._visualizer.resize();
            }
        }, 50);

        this._comparisonVisualizer = null;

        this.passSequenceList.style.display = 'flex';
        this.searchResults.style.display = 'none';
        this.searchBackBtn.style.display = 'none';
        this.panelTitle.textContent = 'Pass Sequence';
        this.searchResults.innerHTML = '';

        const pitchWrapper = document.querySelector('.pitch-wrapper');
        if (pitchWrapper) {
            pitchWrapper.scrollTop = 0;
        }
    }

    _renderSearchResults(results) {
        if (!this.searchResults) return;

        this.searchResults.innerHTML = '';

        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <p>No similar plays found</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.resultIndex = index;

            const homeTeam = result.homeTeam?.shortName || 'HOM';
            const awayTeam = result.awayTeam?.shortName || 'AWY';
            const matchLabel = `${homeTeam} vs ${awayTeam}`;

            let details = '';
            if (this._searchType === 'event') {
                const e = result.event;
                details = `${e?.eventLabel || e?.eventType || 'Event'} • ${e?.time || ''}`;
            } else {
                details = `${result.setpieceType || 'Open Play'} • ${result.eventCount || 0} events • ${result.time || ''}`;
            }

            const sim = result.similarity;
            const simClass = sim >= 0.7 ? '' : sim >= 0.4 ? 'medium' : 'low';

            item.innerHTML = `
                <span class="result-rank">${index + 1}</span>
                <div class="result-info">
                    <span class="result-match">${matchLabel}</span>
                    <span class="result-details">${details}</span>
                </div>
                <span class="result-similarity ${simClass}">${sim.toFixed(2)}</span>
            `;

            item.addEventListener('click', () => {
                this.searchResults.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this._showComparison(result);
            });

            fragment.appendChild(item);
        });
        this.searchResults.appendChild(fragment);
    }

    _showComparison(result) {
        if (!this.comparisonPitchSection) return;

        this._currentComparisonResult = result;

        const modalContainer = document.querySelector('.pitch-modal');
        if (modalContainer) {
            modalContainer.classList.add('expanded');
        }

        // [FIX] Explicitly reset display block before calculation
        this.comparisonPitchSection.style.display = 'block';

        if (this.dualPitchContainer) {
            this.dualPitchContainer.classList.add('comparison-active');
        }

        if (this.searchButtons) this.searchButtons.style.display = 'none';
        if (this.pitchLegend) this.pitchLegend.style.display = 'none';

        let comparisonEvent, comparisonSequence;

        if (this._searchType === 'event') {
            comparisonEvent = result.event;
            comparisonSequence = { events: [result.event] };
        } else {
            const events = result.events || [];
            comparisonEvent = events[0] || events[events.length - 1];
            comparisonSequence = result;
        }

        if (!comparisonEvent) return;

        this._currentComparisonEvent = comparisonEvent;
        this._renderComparisonEventsList(comparisonSequence.events || [], comparisonEvent);

        const eventData = this._buildEventData(
            comparisonEvent,
            comparisonSequence.events || [],
            result.homeTeam,
            result.awayTeam,
            comparisonEvent.eventLabel,
            true
        );

        // [FIX] Robust resizing logic
        // Use double requestAnimationFrame to wait for layout repaint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Resize the main visualizer (left side) as it might have shrunk
                if (this._visualizer) {
                    this._visualizer.resize();
                }

                // Initialize comparison visualizer (right side)
                if (!this._comparisonVisualizer) {
                    this._comparisonVisualizer = new EventVisualizer('comparisonCanvas', 'comparisonTooltip');
                }

                // Force resize BEFORE visualize to prevent squashing
                this._comparisonVisualizer.resize();
                this._comparisonVisualizer.visualize(eventData);
            });
        });
    }

    _renderQueryEventsList(events, activeEvent) {
        if (!this.queryEventsList) return;

        this.queryEventsList.innerHTML = '';
        if (!events || events.length === 0) return;

        events.forEach((event, index) => {
            const isActive = event === activeEvent;
            const item = document.createElement('div');
            item.className = `query-event-item${isActive ? ' active' : ''}`;

            const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);
            const time = event.time || '';
            const player = event.playerName || 'Unknown';

            item.innerHTML = `
                <span class="query-event-icon">${icon}</span>
                <span class="query-event-player">${player}</span>
                <span class="query-event-time">${time}</span>
            `;

            item.addEventListener('click', () => {
                this.queryEventsList.querySelectorAll('.query-event-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this._updateQueryPitch(event);
            });

            this.queryEventsList.appendChild(item);
        });
    }

    _updateQueryPitch(event) {
        if (!this._visualizer || !this._currentSequence) return;
        this._currentEvent = event;

        const eventData = this._buildEventData(
            event,
            this._currentSequence.events || [],
            this._currentMatch?.homeTeam,
            this._currentMatch?.awayTeam,
            event.eventLabel,
            false
        );

        this._visualizer.visualize(eventData);
    }

    _renderComparisonEventsList(events, activeEvent) {
        if (!this.comparisonEventsList) return;

        this.comparisonEventsList.innerHTML = '';

        if (!events || events.length === 0) {
            this.comparisonEventsList.innerHTML = '<div class="no-events">No events</div>';
            return;
        }

        events.forEach((event, index) => {
            const isActive = event === activeEvent;
            const item = document.createElement('div');
            item.className = `comparison-event-item${isActive ? ' active' : ''}`;

            const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);
            const time = event.time || '';
            const player = event.playerName || 'Unknown';

            item.innerHTML = `
                <span class="comparison-event-icon">${icon}</span>
                <span class="comparison-event-player">${player}</span>
                <span class="comparison-event-time">${time}</span>
            `;

            item.addEventListener('click', () => {
                this.comparisonEventsList.querySelectorAll('.comparison-event-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this._updateComparisonPitch(event, events);
            });

            this.comparisonEventsList.appendChild(item);
        });
    }

    _updateComparisonPitch(event, allEvents) {
        if (!this._comparisonVisualizer) return;

        const eventData = this._buildEventData(
            event,
            allEvents || [],
            this._currentComparisonResult?.homeTeam,
            this._currentComparisonResult?.awayTeam,
            event.eventLabel,
            true
        );

        this._comparisonVisualizer.visualize(eventData);
    }

    // Public method to refresh matches data
    refreshMatches(newMatches) {
        this._matches = newMatches || [];
        this._allMatches = [...this._matches];
        this._renderMatches();
        if (this.matchCount) {
            this.matchCount.textContent = this._matches.length;
        }
    }

    // Public method to clear search
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this._hideSearchResults();
        }
    }

    // Public method to get current match
    getCurrentMatch() {
        return this._currentMatch;
    }

    // Public method to get current sequence
    getCurrentSequence() {
        return this._currentSequence;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof matchesData !== 'undefined') {
        window.app = new App(matchesData);
        
        // Add keyboard shortcut hint
        console.log('💡 Quick Tip: Press Ctrl+K (Cmd+K on Mac) to focus search');
    } else {
        console.error('matchesData not found. Make sure Django is passing the data.');
        
        // Show error in UI
        const main = document.querySelector('.main');
        if (main) {
            main.innerHTML = `
                <div class="empty-state error">
                    <div class="empty-icon">⚠️</div>
                    <p>Failed to load matches data</p>
                    <p class="loading-sub">Please check your internet connection and refresh</p>
                </div>
            `;
        }
    }
});