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
        }
    }

    _setupCanvas() {
        // Set canvas size
        const container = this._canvas.parentElement;
        this._canvas.width = container.offsetWidth || 800;
        this._canvas.height = Math.min(container.offsetWidth * 0.6, 500);
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
        
        // Build team colors map (use string keys for consistency)
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
        
        this._initElements();
        this._bindEvents();
        this._renderMatches();
    }

    _initElements() {
        // Main grid
        this.matchesGrid = document.getElementById('matchesGrid');
        this.matchCount = document.getElementById('matchCount');
        
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
        
        // Search elements
        this.searchEventBtn = document.getElementById('searchEventBtn');
        this.searchSequenceBtn = document.getElementById('searchSequenceBtn');
        this.searchResults = document.getElementById('searchResults');
        this.searchBackBtn = document.getElementById('searchBackBtn');
        this.panelTitle = document.getElementById('panelTitle');
        this.comparisonSection = document.getElementById('comparisonSection');
        this.similarityScore = document.getElementById('similarityScore');
        this.comparisonMatchInfo = document.getElementById('comparisonMatchInfo');
        this.comparisonEvents = document.getElementById('comparisonEvents');
        this.searchButtons = document.getElementById('searchButtons');
        this.pitchLegend = document.getElementById('pitchLegend');
        
        // Search state
        this._searchMode = false;
        this._currentEvent = null;
        this._comparisonVisualizer = null;
    }

    _bindEvents() {
        // Plays modal close
        if (this.goalsCloseBtn) {
            this.goalsCloseBtn.addEventListener('click', () => this._closeGoalsModal());
        }
        if (this.goalsModal) {
            this.goalsModal.querySelector('.modal-overlay')?.addEventListener('click', () => this._closeGoalsModal());
        }
        
        // Pitch modal close
        if (this.pitchCloseBtn) {
            this.pitchCloseBtn.addEventListener('click', () => this._closePitchModal());
        }
        if (this.pitchModal) {
            this.pitchModal.querySelector('.modal-overlay')?.addEventListener('click', () => this._closePitchModal());
        }
        
        // Search buttons
        if (this.searchEventBtn) {
            this.searchEventBtn.addEventListener('click', () => this._searchSimilarEvent());
        }
        if (this.searchSequenceBtn) {
            this.searchSequenceBtn.addEventListener('click', () => this._searchSimilarSequence());
        }
        if (this.searchBackBtn) {
            this.searchBackBtn.addEventListener('click', () => this._exitSearchMode());
        }
        
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this._searchMode) {
                    this._exitSearchMode();
                } else {
                    this._closePitchModal();
                    this._closeGoalsModal();
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
        
        card.innerHTML = `
            <div class="card-header">
                <span class="team-short home">${homeShort}</span>
                <span class="vs-badge">VS</span>
                <span class="team-short away">${awayShort}</span>
            </div>
            <div class="card-body">
                <div class="match-info">
                    <span class="match-date">${this._formatDate(match.date)}</span>
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
        
        // Show loading
        if (this.goalsGrid) {
            this.goalsGrid.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Loading plays...</p>
                </div>
            `;
        }
        
        // Open modal immediately
        this._openGoalsModal();
        
        // Load plays
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
        
        console.log('Rendering plays:', this._plays.length, 'sequences');
        
        if (this._plays.length === 0) {
            this.goalsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No plays in this match</p>
                </div>
            `;
            return;
        }
        
        // Create filter bar
        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar';
        filterBar.innerHTML = `
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="Shot">Shots 💥</button>
            <button class="filter-btn" data-filter="Pass">Passes 🎯</button>
            <button class="filter-btn" data-filter="goal">Goals ⚽</button>
        `;
        
        // Create list container
        const list = document.createElement('div');
        list.className = 'plays-list';
        list.id = 'playsList';
        
        this._plays.forEach((sequence, seqIndex) => {
            if (seqIndex < 3) {
                console.log('Sequence', seqIndex, ':', sequence.setpieceType, sequence.time, 'events:', sequence.events?.length);
            }
            const seqElement = this._createSequenceElement(sequence, seqIndex);
            list.appendChild(seqElement);
        });
        
        this.goalsGrid.innerHTML = '';
        this.goalsGrid.appendChild(filterBar);
        this.goalsGrid.appendChild(list);
        
        // Bind filter events
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
        
        // Sequence header
        const header = document.createElement('div');
        header.className = 'sequence-header';
        
        // Compare as strings
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
            <button class="expand-btn">${hasGoal ? '▲' : '▼'}</button>
        `;
        
        // Events list - LAZY: only populate when expanded
        const eventsList = document.createElement('div');
        eventsList.className = 'events-list' + (hasGoal ? ' expanded' : '');
        eventsList.dataset.loaded = 'false';
        
        // Store sequence data for lazy loading
        container._sequence = sequence;
        
        // Only populate events if has goal (auto-expanded)
        if (hasGoal) {
            this._populateEventsList(eventsList, sequence);
        }
        
        container.appendChild(header);
        container.appendChild(eventsList);
        
        // Toggle expansion with lazy loading
        header.querySelector('.expand-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = eventsList.classList.toggle('expanded');
            e.target.textContent = isExpanded ? '▲' : '▼';
            
            // Lazy load events on first expansion
            if (isExpanded && eventsList.dataset.loaded === 'false') {
                this._populateEventsList(eventsList, sequence);
            }
        });
        
        return container;
    }
    
    _populateEventsList(eventsList, sequence) {
        eventsList.dataset.loaded = 'true';
        sequence.events.forEach((event, eventIndex) => {
            const eventItem = this._createEventItem(event, eventIndex, sequence);
            eventsList.appendChild(eventItem);
        });
    }

    _createEventItem(event, eventIndex, sequence) {
        const item = document.createElement('div');
        item.className = 'event-item' + (event.isGoal ? ' goal-event' : '');
        item.dataset.eventType = event.eventLabel || event.eventType;
        
        const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);
        
        item.innerHTML = `
            <span class="event-num">${eventIndex + 1}</span>
            <span class="event-icon">${icon}</span>
            <span class="event-player">${event.playerName || 'Unknown'}</span>
            <span class="event-type">${event.isGoal ? 'GOAL!' : (event.eventLabel || event.eventType)}</span>
            ${event.outcome ? `<span class="event-outcome">${event.outcome}</span>` : ''}
            <button class="view-pitch-btn">View →</button>
        `;
        
        // Click to view on pitch
        item.querySelector('.view-pitch-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this._openPitchModal(event, sequence);
        });
        
        item.addEventListener('click', () => this._openPitchModal(event, sequence));
        
        return item;
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
            
            // Filter based on sequence events data (not DOM)
            let hasMatch = false;
            if (filter === 'all') {
                hasMatch = true;
            } else if (filter === 'goal') {
                hasMatch = sequence.events.some(e => e.isGoal);
            } else {
                hasMatch = sequence.events.some(e => (e.eventLabel || e.eventType) === filter);
            }
            
            seq.style.display = hasMatch ? 'block' : 'none';
            
            // Also filter visible event items if loaded
            const eventsList = seq.querySelector('.events-list');
            if (eventsList && eventsList.dataset.loaded === 'true') {
                eventsList.querySelectorAll('.event-item').forEach(item => {
                    const eventType = item.dataset.eventType;
                    const isGoal = item.classList.contains('goal-event');
                    
                    let show = false;
                    if (filter === 'all') {
                        show = true;
                    } else if (filter === 'goal') {
                        show = isGoal;
                    } else {
                        show = eventType === filter;
                    }
                    item.style.display = show ? 'flex' : 'none';
                });
            }
        });
    }

    _openPitchModal(event, sequence) {
        // Reset any previous search state when opening a new event
        if (this._searchMode) {
            this._exitSearchMode();
        }
        // Also hide comparison section even if not in search mode
        if (this.comparisonSection) {
            this.comparisonSection.style.display = 'none';
        }
        this._comparisonVisualizer = null;
        
        // Restore search buttons and legend
        if (this.searchButtons) this.searchButtons.style.display = 'flex';
        if (this.pitchLegend) this.pitchLegend.style.display = 'flex';
        
        // Store current event and sequence for search
        this._currentEvent = event;
        this._currentSequence = sequence;
        
        // Update header
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
        
        // Render event sequence
        this._renderEventSequence(event, sequence);
        
        // Show modal
        if (this.pitchModal) {
            this.pitchModal.classList.add('active');
        }
        
        // Initialize and render pitch
        setTimeout(() => {
            if (!this._visualizer) {
                this._visualizer = new EventVisualizer('pitchCanvas', 'playerTooltip');
            }
            
            // Filter to key players only
            const keyIds = event.keyPlayerIds || [];
            const filteredHome = (event.homePlayers || []).filter(p => keyIds.includes(p.playerId));
            const filteredAway = (event.awayPlayers || []).filter(p => keyIds.includes(p.playerId));
            
            // Build snapshot with filtered players
            const snapshot = {
                homePlayers: filteredHome,
                awayPlayers: filteredAway,
                ball: event.ballPosition
            };
            
            // Build preceding events for pass line
            const eventIndex = sequence.events.indexOf(event);
            const precedingEvents = sequence.events.slice(Math.max(0, eventIndex - 5), eventIndex + 1).map(e => ({
                eventType: e.eventLabel || e.eventType,
                playerName: e.playerName,
                ballPosition: e.ballPosition,
                teamId: e.teamId
            }));
            
            // Build event data for visualizer
            const eventData = {
                event: {
                    ...event,
                    ballPosition: event.ballPosition
                },
                snapshot: snapshot,
                precedingEvents: precedingEvents,
                homeTeam: this._currentMatch?.homeTeam,
                awayTeam: this._currentMatch?.awayTeam
            };
            
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
        
        // Store sequence reference for click handlers
        this._currentSequence = sequence;
        
        // Show all events in sequence
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
            
            // Click handler to update pitch
            item.addEventListener('click', () => {
                // Remove active from all items
                this.passSequenceList.querySelectorAll('.pass-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                // Update pitch with this event
                this._updatePitchForEvent(event);
            });
            
            this.passSequenceList.appendChild(item);
        });
        
        // Scroll to active item
        const activeItem = this.passSequenceList.querySelector('.pass-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    _updatePitchForEvent(event) {
        if (!this._visualizer || !this._currentSequence) return;
        
        // Store current event for search
        this._currentEvent = event;
        
        // Filter to key players for this event
        const keyIds = event.keyPlayerIds || [];
        const filteredHome = (event.homePlayers || []).filter(p => keyIds.includes(p.playerId));
        const filteredAway = (event.awayPlayers || []).filter(p => keyIds.includes(p.playerId));
        
        // Build snapshot
        const snapshot = {
            homePlayers: filteredHome,
            awayPlayers: filteredAway,
            ball: event.ballPosition
        };
        
        // Build preceding events for pass lines
        const eventIndex = this._currentSequence.events.indexOf(event);
        const precedingEvents = this._currentSequence.events.slice(Math.max(0, eventIndex - 5), eventIndex + 1).map(e => ({
            eventType: e.eventLabel || e.eventType,
            playerName: e.playerName,
            ballPosition: e.ballPosition,
            teamId: String(e.teamId)
        }));
        
        // Build event data
        const eventData = {
            event: { ...event, ballPosition: event.ballPosition },
            snapshot: snapshot,
            precedingEvents: precedingEvents,
            homeTeam: this._currentMatch?.homeTeam,
            awayTeam: this._currentMatch?.awayTeam,
            eventMarker: event.eventLabel  // For drawing event-specific marker
        };
        
        this._visualizer.visualize(eventData);
    }

    // =========================================================================
    // SEARCH FUNCTIONALITY
    // =========================================================================
    
    _showSearchLoading() {
        // Reset any previous comparison
        if (this.comparisonSection) {
            this.comparisonSection.style.display = 'none';
        }
        this._comparisonVisualizer = null;
        
        // Show loading in results panel
        this.passSequenceList.style.display = 'none';
        this.searchResults.style.display = 'flex';
        this.searchResults.innerHTML = `
            <div class="search-loading">
                <span>Searching for similar plays...</span>
                <span class="loading-sub">(First search may take a few seconds)</span>
            </div>
        `;
    }
    
    async _searchSimilarEvent() {
        if (!this._currentEvent || !this._currentMatch) return;
        
        // Show loading
        this.searchEventBtn.classList.add('loading');
        this.searchEventBtn.disabled = true;
        this.searchSequenceBtn.disabled = true;
        this._showSearchLoading();
        
        try {
            const response = await fetch('/api/search/event/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: this._currentEvent,
                    matchId: this._currentMatch.id,
                    sequenceId: this._currentSequence?.sequenceId,
                    eventIndex: this._currentSequence?.events.indexOf(this._currentEvent),
                    topN: 10
                })
            });
            
            const data = await response.json();
            this._enterSearchMode('event', data.results);
            
        } catch (error) {
            console.error('Search error:', error);
            this._showSearchError();
        } finally {
            this.searchEventBtn.classList.remove('loading');
            this.searchEventBtn.disabled = false;
            this.searchSequenceBtn.disabled = false;
        }
    }
    
    async _searchSimilarSequence() {
        if (!this._currentSequence || !this._currentMatch) return;
        
        // Show loading
        this.searchSequenceBtn.classList.add('loading');
        this.searchEventBtn.disabled = true;
        this.searchSequenceBtn.disabled = true;
        this._showSearchLoading();
        
        try {
            const response = await fetch('/api/search/sequence/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: this._currentSequence.events,
                    matchId: this._currentMatch.id,
                    sequenceId: this._currentSequence.sequenceId,
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
            this.searchEventBtn.disabled = false;
            this.searchSequenceBtn.disabled = false;
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
        
        // Update UI
        this.passSequenceList.style.display = 'none';
        this.searchResults.style.display = 'flex';
        this.searchBackBtn.style.display = 'block';
        this.panelTitle.textContent = searchType === 'event' ? 'Similar Events' : 'Similar Sequences';
        
        // Render results
        this._renderSearchResults(results);
    }
    
    _exitSearchMode() {
        this._searchMode = false;
        this._searchType = null;
        this._searchResults = null;
        
        // Hide and reset comparison section
        if (this.comparisonSection) {
            this.comparisonSection.style.display = 'none';
        }
        
        // Restore search buttons and legend
        if (this.searchButtons) this.searchButtons.style.display = 'flex';
        if (this.pitchLegend) this.pitchLegend.style.display = 'flex';
        
        // Destroy comparison visualizer to force fresh canvas
        this._comparisonVisualizer = null;
        
        // Reset UI
        this.passSequenceList.style.display = 'flex';
        this.searchResults.style.display = 'none';
        this.searchBackBtn.style.display = 'none';
        this.panelTitle.textContent = 'Pass Sequence';
        this.searchResults.innerHTML = '';
        
        // Reset scroll position
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
        
        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.resultIndex = index;
            
            const homeTeam = result.homeTeam?.shortName || 'HOM';
            const awayTeam = result.awayTeam?.shortName || 'AWY';
            const matchLabel = `${homeTeam} vs ${awayTeam}`;
            
            // Details based on search type
            let details = '';
            if (this._searchType === 'event') {
                const e = result.event;
                details = `${e?.eventLabel || e?.eventType || 'Event'} • ${e?.time || ''}`;
            } else {
                details = `${result.setpieceType || 'Open Play'} • ${result.eventCount || 0} events • ${result.time || ''}`;
            }
            
            // Similarity badge color
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
            
            // Click to show comparison
            item.addEventListener('click', () => {
                // Remove active from all
                this.searchResults.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                this._showComparison(result);
            });
            
            this.searchResults.appendChild(item);
        });
    }
    
    _showComparison(result) {
        if (!this.comparisonSection) return;
        
        // Store for later use when clicking events
        this._currentComparisonResult = result;
        
        // Show comparison section
        this.comparisonSection.style.display = 'block';
        this.similarityScore.textContent = result.similarity.toFixed(2);
        
        // Hide search buttons and legend when showing comparison
        if (this.searchButtons) this.searchButtons.style.display = 'none';
        if (this.pitchLegend) this.pitchLegend.style.display = 'none';
        
        // Show match info
        if (this.comparisonMatchInfo) {
            const homeName = result.homeTeam?.name || 'Home';
            const awayName = result.awayTeam?.name || 'Away';
            this.comparisonMatchInfo.textContent = `${homeName} vs ${awayName}`;
        }
        
        // Scroll to comparison section
        setTimeout(() => {
            this.comparisonSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Build event data for comparison
        let comparisonEvent, comparisonSequence;
        
        if (this._searchType === 'event') {
            comparisonEvent = result.event;
            comparisonSequence = { events: [result.event] };
        } else {
            // For sequence, use first event or last (most significant)
            const events = result.events || [];
            comparisonEvent = events[events.length - 1] || events[0];
            comparisonSequence = result;
        }
        
        if (!comparisonEvent) return;
        
        // Render events list
        this._renderComparisonEvents(comparisonSequence.events || [], comparisonEvent);
        
        // Players are already filtered to key players by server
        const snapshot = {
            homePlayers: comparisonEvent.homePlayers || [],
            awayPlayers: comparisonEvent.awayPlayers || [],
            ball: comparisonEvent.ballPosition
        };
        
        // Build preceding events
        const events = comparisonSequence.events || [];
        const eventIndex = events.indexOf(comparisonEvent);
        const precedingEvents = events.slice(Math.max(0, eventIndex - 5), eventIndex + 1).map(e => ({
            eventType: e.eventLabel || e.eventType,
            playerName: e.playerName,
            ballPosition: e.ballPosition,
            teamId: String(e.teamId)
        }));
        
        const eventData = {
            event: { ...comparisonEvent, ballPosition: comparisonEvent.ballPosition },
            snapshot: snapshot,
            precedingEvents: precedingEvents,
            homeTeam: result.homeTeam,
            awayTeam: result.awayTeam,
            eventMarker: comparisonEvent.eventLabel
        };
        
        console.log('Comparison eventData:', eventData);
        console.log('Comparison event:', comparisonEvent);
        console.log('Result:', result);
        
        // Initialize comparison visualizer after DOM is ready
        setTimeout(() => {
            if (!this._comparisonVisualizer) {
                this._comparisonVisualizer = new EventVisualizer('comparisonCanvas', 'comparisonTooltip');
            }
            this._comparisonVisualizer.visualize(eventData);
        }, 150);
    }
    
    _renderComparisonEvents(events, activeEvent) {
        if (!this.comparisonEvents) return;
        
        this.comparisonEvents.innerHTML = '';
        
        if (!events || events.length === 0) {
            this.comparisonEvents.innerHTML = '<div class="no-events">No events</div>';
            return;
        }
        
        events.forEach((event, index) => {
            const isActive = event === activeEvent;
            const item = document.createElement('div');
            item.className = `comparison-event-item${isActive ? ' active' : ''}`;
            item.style.cursor = 'pointer';
            
            const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);
            const time = event.time || '';
            const player = event.playerName || 'Unknown';
            
            item.innerHTML = `
                <span class="comparison-event-icon">${icon}</span>
                <span class="comparison-event-player">${player}</span>
                <span class="comparison-event-time">${time}</span>
            `;
            
            // Click to update comparison pitch
            item.addEventListener('click', () => {
                // Update active state
                this.comparisonEvents.querySelectorAll('.comparison-event-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                // Update the comparison pitch with this event
                this._updateComparisonPitch(event, events);
            });
            
            this.comparisonEvents.appendChild(item);
        });
    }
    
    _updateComparisonPitch(event, allEvents) {
        if (!this._comparisonVisualizer) return;
        
        // Build snapshot from event (already filtered to key players by server)
        const snapshot = {
            homePlayers: event.homePlayers || [],
            awayPlayers: event.awayPlayers || [],
            ball: event.ballPosition
        };
        
        // Build preceding events
        const eventIndex = allEvents.indexOf(event);
        const precedingEvents = allEvents.slice(Math.max(0, eventIndex - 5), eventIndex + 1).map(e => ({
            eventType: e.eventLabel || e.eventType,
            playerName: e.playerName,
            ballPosition: e.ballPosition,
            teamId: String(e.teamId)
        }));
        
        const eventData = {
            event: { ...event, ballPosition: event.ballPosition },
            snapshot: snapshot,
            precedingEvents: precedingEvents,
            homeTeam: this._currentComparisonResult?.homeTeam,
            awayTeam: this._currentComparisonResult?.awayTeam,
            eventMarker: event.eventLabel
        };
        
        this._comparisonVisualizer.visualize(eventData);
    }
}


// =============================================================================
// Initialize app when DOM is ready
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if matchesData exists (passed from Django template)
    if (typeof matchesData !== 'undefined') {
        window.app = new App(matchesData);
    } else {
        console.error('matchesData not found. Make sure Django is passing the data.');
    }
});
