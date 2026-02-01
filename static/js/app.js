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
        
        // Build team colors map
        const teamColors = {};
        if (eventData.homeTeam) {
            teamColors[eventData.homeTeam.id] = eventData.homeTeam.primaryColor || '#3b82f6';
        }
        if (eventData.awayTeam) {
            teamColors[eventData.awayTeam.id] = eventData.awayTeam.primaryColor || '#ef4444';
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
            .filter(e => e.eventType)
            .map(e => ({
                ballPosition: e.ballPosition,
                teamId: e.teamId
            }));
        
        // Add current event position
        if (event.ballPosition) {
            passEvents.push({
                ballPosition: event.ballPosition,
                teamId: event.teamId
            });
        }
        
        this._renderer.setPassSequence(passEvents, teamColors);
        
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
        
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._closePitchModal();
                this._closeGoalsModal();
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            if (this._visualizer) {
                this._visualizer.resize();
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
                    <span class="goal-badge">${match.goalCount || 0} ⚽</span>
                    <span class="play-badge">${match.playCount || 0} plays</span>
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
            <button class="expand-btn">▼</button>
        `;
        
        // Events list (collapsed by default, expanded if has goal)
        const eventsList = document.createElement('div');
        eventsList.className = 'events-list' + (hasGoal ? ' expanded' : '');
        
        sequence.events.forEach((event, eventIndex) => {
            const eventItem = this._createEventItem(event, eventIndex, sequence);
            eventsList.appendChild(eventItem);
        });
        
        container.appendChild(header);
        container.appendChild(eventsList);
        
        // Toggle expansion
        header.querySelector('.expand-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            eventsList.classList.toggle('expanded');
            e.target.textContent = eventsList.classList.contains('expanded') ? '▲' : '▼';
        });
        
        return container;
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
            let visible = false;
            
            seq.querySelectorAll('.event-item').forEach(item => {
                const eventType = item.dataset.eventType;
                const isGoal = item.classList.contains('goal-event');
                
                let show = false;
                if (filter === 'all') {
                    show = true;
                } else if (filter === 'goal') {
                    show = isGoal;
                } else {
                    // Match by label (Shot, Pass, etc.)
                    show = eventType === filter;
                }
                
                item.style.display = show ? 'flex' : 'none';
                if (show) visible = true;
            });
            
            seq.style.display = visible ? 'block' : 'none';
        });
    }

    _openPitchModal(event, sequence) {
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
            
            // Build snapshot from event data
            const snapshot = {
                homePlayers: event.homePlayers || [],
                awayPlayers: event.awayPlayers || [],
                ball: event.ballPosition
            };
            
            // Build event data for visualizer
            const eventData = {
                event: {
                    ...event,
                    ballPosition: event.ballPosition
                },
                snapshot: snapshot,
                precedingEvents: sequence.events.slice(0, sequence.events.indexOf(event)).map(e => ({
                    eventType: e.eventLabel || e.eventType,
                    playerName: e.playerName,
                    ballPosition: e.ballPosition,
                    teamId: e.teamId
                })),
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
        
        // Show all events in sequence with current one highlighted
        const events = sequence.events || [];
        const currentIndex = events.indexOf(currentEvent);
        
        // Show context: 3 before and 3 after current event
        const startIdx = Math.max(0, currentIndex - 3);
        const endIdx = Math.min(events.length, currentIndex + 4);
        
        for (let i = startIdx; i < endIdx; i++) {
            const event = events[i];
            const isCurrent = i === currentIndex;
            const icon = event.isGoal ? '⚽' : (EVENT_ICONS[event.eventLabel] || EVENT_ICONS['Unknown']);
            
            const item = document.createElement('div');
            item.className = 'pass-item' + (isCurrent ? ' current-event' : '') + (event.isGoal ? ' goal-item' : '');
            
            item.innerHTML = `
                <span class="pass-num">${i + 1}</span>
                <span class="pass-icon">${icon}</span>
                <span class="pass-player">${event.playerName || 'Unknown'}</span>
                <span class="pass-type">${event.isGoal ? 'GOAL!' : (event.eventLabel || event.eventType)}</span>
            `;
            
            this.passSequenceList.appendChild(item);
        }
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
