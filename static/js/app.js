/**
 * FIFA World Cup 2022 Goal Visualizer - Main Application
 * OOP Implementation with 4 Principles:
 * - Encapsulation: Classes bundle data and methods
 * - Abstraction: Public API hides complex logic
 * - Inheritance: GoalVisualizer uses PitchRenderer
 * - Polymorphism: Different event types rendered differently
 */

// =============================================================================
// INHERITANCE: GoalVisualizer uses composition with PitchRenderer
// =============================================================================
class GoalVisualizer {
    constructor(canvasId, tooltipId) {
        this._canvas = document.getElementById(canvasId);
        this._tooltip = document.getElementById(tooltipId);
        this._renderer = null;
        this._infoCard = null;
        this._currentGoalData = null;
        
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

    visualize(goalData) {
        this._currentGoalData = goalData;
        
        if (!this._renderer) return;
        
        const snapshot = goalData.snapshot || {};
        const goal = goalData.goal || {};
        
        // Build team colors map
        const teamColors = {};
        if (goalData.homeTeam) {
            teamColors[goalData.homeTeam.id] = goalData.homeTeam.primaryColor || '#3b82f6';
        }
        if (goalData.awayTeam) {
            teamColors[goalData.awayTeam.id] = goalData.awayTeam.primaryColor || '#ef4444';
        }
        
        // Set players
        this._renderer.setPlayers(
            snapshot.homePlayers || [],
            snapshot.awayPlayers || [],
            goalData.homeTeam,
            goalData.awayTeam
        );
        
        // Set ball position
        this._renderer.setBall(snapshot.ball);
        
        // Build pass sequence from preceding events
        const passEvents = (goalData.precedingEvents || [])
            .filter(e => e.eventType === 'pass' || e.eventType === 'shot')
            .map(e => ({
                ballPosition: e.ballPosition,
                teamId: e.teamId
            }));
        
        // Add goal position
        if (goal.ballPosition) {
            passEvents.push({
                ballPosition: goal.ballPosition,
                teamId: goal.teamId
            });
        }
        
        this._renderer.setPassSequence(passEvents, teamColors);
        
        // Render
        this._renderer.render();
    }

    resize() {
        if (this._canvas) {
            this._setupCanvas();
            if (this._currentGoalData) {
                this.visualize(this._currentGoalData);
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
        this._goals = [];
        this._visualizer = null;
        this._currentMatch = null;
        
        this._initElements();
        this._bindEvents();
        this._renderMatches();
    }

    _initElements() {
        // Main grid
        this.matchesGrid = document.getElementById('matchesGrid');
        this.matchCount = document.getElementById('matchCount');
        
        // Goals modal
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
        // Goals modal close
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
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => this._selectMatch(match.id));
        
        return card;
    }

    _darken(color) {
        // Simple color darkening
        if (!color || color.length < 7) return '#333';
        const r = Math.max(0, parseInt(color.slice(1, 3), 16) - 40);
        const g = Math.max(0, parseInt(color.slice(3, 5), 16) - 40);
        const b = Math.max(0, parseInt(color.slice(5, 7), 16) - 40);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
                    <p>Loading goals...</p>
                </div>
            `;
        }
        
        // Open modal immediately
        this._openGoalsModal();
        
        // Load goals
        try {
            const response = await fetch(`/api/matches/${matchId}/goals/`);
            const data = await response.json();
            
            this._goals = data.goals || [];
            this._currentMatch = data.match;
            
            const homeName = this._currentMatch?.homeTeam?.name || 'Home';
            const awayName = this._currentMatch?.awayTeam?.name || 'Away';
            
            if (this.matchTitle) {
                this.matchTitle.textContent = `${homeName} vs ${awayName}`;
            }
            if (this.matchGoalCount) {
                this.matchGoalCount.textContent = `${this._goals.length} Goal${this._goals.length !== 1 ? 's' : ''}`;
            }
            
            this._renderGoals();
            
        } catch (error) {
            console.error('Error loading goals:', error);
            if (this.goalsGrid) {
                this.goalsGrid.innerHTML = `
                    <div class="empty-state error">
                        <div class="empty-icon">⚠️</div>
                        <p>Error loading goals</p>
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

    _renderGoals() {
        if (!this.goalsGrid) return;
        
        if (this._goals.length === 0) {
            this.goalsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🥅</div>
                    <p>No goals in this match</p>
                </div>
            `;
            return;
        }
        
        // Create list container
        const list = document.createElement('ul');
        list.className = 'goals-list';
        
        this._goals.forEach((goalData, index) => {
            const item = this._createGoalListItem(goalData, index);
            list.appendChild(item);
        });
        
        this.goalsGrid.innerHTML = '';
        this.goalsGrid.appendChild(list);
    }

    _createGoalListItem(goalData, index) {
        const goal = goalData.goal || {};
        const isHome = goal.teamId === this._currentMatch?.homeTeam?.id;
        const teamShort = isHome 
            ? (this._currentMatch?.homeTeam?.shortName || 'HOM')
            : (this._currentMatch?.awayTeam?.shortName || 'AWY');
        
        const item = document.createElement('li');
        item.className = 'goal-list-item';
        
        item.innerHTML = `
            <span class="goal-index">${index + 1}.</span>
            <span class="goal-scorer-name">${goal.playerName || 'Unknown'}</span>
            <span class="goal-team-short">(${teamShort})</span>
            <span class="goal-time-badge">${goal.formattedTime || ''}</span>
            <button class="view-pitch-btn">View Pitch →</button>
        `;
        
        item.querySelector('.view-pitch-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this._openPitchModal(goalData);
        });
        
        item.addEventListener('click', () => this._openPitchModal(goalData));
        
        return item;
    }

    _openPitchModal(goalData) {
        const goal = goalData.goal || {};
        
        // Update header
        if (this.pitchMatchTitle) {
            const homeName = this._currentMatch?.homeTeam?.name || 'Home';
            const awayName = this._currentMatch?.awayTeam?.name || 'Away';
            this.pitchMatchTitle.textContent = `${homeName} vs ${awayName}`;
        }
        
        if (this.goalScorerName) {
            this.goalScorerName.textContent = goal.playerName || 'Unknown';
        }
        
        if (this.goalMinute) {
            this.goalMinute.textContent = goal.formattedTime || '';
        }
        
        // Render pass sequence
        this._renderPassSequence(goalData);
        
        // Show modal
        if (this.pitchModal) {
            this.pitchModal.classList.add('active');
        }
        
        // Initialize and render pitch
        setTimeout(() => {
            if (!this._visualizer) {
                this._visualizer = new GoalVisualizer('pitchCanvas', 'playerTooltip');
            }
            
            // Add team info to goal data
            goalData.homeTeam = this._currentMatch?.homeTeam;
            goalData.awayTeam = this._currentMatch?.awayTeam;
            
            this._visualizer.visualize(goalData);
        }, 100);
    }

    _closePitchModal() {
        if (this.pitchModal) {
            this.pitchModal.classList.remove('active');
        }
    }

    _renderPassSequence(goalData) {
        if (!this.passSequenceList) return;
        
        this.passSequenceList.innerHTML = '';
        
        const goal = goalData.goal || {};
        const isPenalty = goal.isPenalty || false;
        
        // For penalties, show simple penalty indicator
        if (isPenalty) {
            const penaltyItem = document.createElement('div');
            penaltyItem.className = 'pass-item penalty-item';
            penaltyItem.innerHTML = `
                <span class="pass-num">⚽</span>
                <span class="pass-icon">🎯</span>
                <span class="pass-player">${goal.playerName || 'Unknown'}</span>
                <span class="pass-type">Penalty Kick</span>
            `;
            this.passSequenceList.appendChild(penaltyItem);
            
            // Add goal
            const goalItem = document.createElement('div');
            goalItem.className = 'pass-item goal-item';
            goalItem.innerHTML = `
                <span class="pass-num">✓</span>
                <span class="pass-icon">🎉</span>
                <span class="pass-player">SCORED!</span>
                <span class="pass-type">GOAL!</span>
            `;
            this.passSequenceList.appendChild(goalItem);
            return;
        }
        
        // For regular goals, show pass sequence
        const events = goalData.precedingEvents || [];
        
        // Show last 5 events max
        const recentEvents = events.slice(-5);
        
        recentEvents.forEach((event, index) => {
            const item = document.createElement('div');
            item.className = 'pass-item';
            
            const icon = event.eventType === 'pass' ? '🎯' : 
                         event.eventType === 'shot' ? '💥' : '⚡';
            
            item.innerHTML = `
                <span class="pass-num">${index + 1}</span>
                <span class="pass-icon">${icon}</span>
                <span class="pass-player">${event.playerName || 'Unknown'}</span>
                <span class="pass-type">${event.label || event.eventType || 'Event'}</span>
            `;
            
            this.passSequenceList.appendChild(item);
        });
        
        // Add goal
        const goalItem = document.createElement('div');
        goalItem.className = 'pass-item goal-item';
        goalItem.innerHTML = `
            <span class="pass-num">⚽</span>
            <span class="pass-icon">🎉</span>
            <span class="pass-player">${goal.playerName || 'Unknown'}</span>
            <span class="pass-type">GOAL!</span>
        `;
        this.passSequenceList.appendChild(goalItem);
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
