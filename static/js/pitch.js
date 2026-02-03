/**
 * FIFA World Cup 2022 - Pitch Visualization
 * OOP Implementation following 4 principles:
 * - Encapsulation: Classes bundle data and behavior
 * - Abstraction: Hide complex rendering logic
 * - Inheritance: Marker classes extend base
 * - Polymorphism: Different markers render differently
 */

// =============================================================================
// ENCAPSULATION: Position class encapsulates coordinate data
// =============================================================================
class Position {
    constructor(x, y, z = 0) {
        this._x = x;
        this._y = y;
        this._z = z;
    }

    get x() { return this._x; }
    get y() { return this._y; }
    get z() { return this._z; }

    // Normalize to canvas coordinates
    toCanvas(canvasWidth, canvasHeight, pitchLength = 105, pitchWidth = 68) {
        const padding = 30;
        const drawWidth = canvasWidth - (padding * 2);
        const drawHeight = canvasHeight - (padding * 2);
        
        // Convert from pitch coordinates (center origin) to canvas coordinates
        const normX = ((this._x + pitchLength / 2) / pitchLength) * drawWidth + padding;
        const normY = ((-this._y + pitchWidth / 2) / pitchWidth) * drawHeight + padding;
        
        return { x: normX, y: normY };
    }
}


// =============================================================================
// ABSTRACTION: Base Marker class with abstract render method
// =============================================================================
class Marker {
    constructor(position, color) {
        this._position = position;
        this._color = color;
    }

    get position() { return this._position; }
    get color() { return this._color; }

    // Abstract method - to be overridden
    render(ctx, canvasWidth, canvasHeight) {
        throw new Error('render() must be implemented by subclass');
    }

    // Check if point is within marker (for hover detection)
    containsPoint(px, py, canvasWidth, canvasHeight) {
        return false; // Override in subclass
    }
}


// =============================================================================
// INHERITANCE: PlayerMarker extends Marker
// =============================================================================
class PlayerMarker extends Marker {
    constructor(position, color, textColor, jerseyNumber, playerName, positionType, isHome) {
        super(position, color);
        this._textColor = textColor;
        this._jerseyNumber = jerseyNumber;
        this._playerName = playerName;
        this._positionType = positionType;
        this._isHome = isHome;
        this._radius = 10;  // Reduced from 16 for less overlap
    }

    get jerseyNumber() { return this._jerseyNumber; }
    get playerName() { return this._playerName; }
    get positionType() { return this._positionType; }
    get isHome() { return this._isHome; }

    render(ctx, canvasWidth, canvasHeight) {
        ctx.save(); // [FIX] Save state to prevent bleeding
        const pos = this._position.toCanvas(canvasWidth, canvasHeight);

        // Draw outer glow (smaller)
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this._radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = this._isHome ? 'rgba(0, 149, 246, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.fill();

        // Draw player circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this._radius, 0, Math.PI * 2);
        ctx.fillStyle = this._color;
        ctx.fill();
        ctx.strokeStyle = this._isHome ? '#0095f6' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw jersey number (smaller font)
        ctx.fillStyle = this._textColor;
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._jerseyNumber.toString(), pos.x, pos.y);
        ctx.restore(); // [FIX] Restore state
    }

    containsPoint(px, py, canvasWidth, canvasHeight) {
        const pos = this._position.toCanvas(canvasWidth, canvasHeight);
        const dx = px - pos.x;
        const dy = py - pos.y;
        return (dx * dx + dy * dy) <= (this._radius + 5) * (this._radius + 5);
    }

    getTooltipData() {
        return {
            name: this._playerName || `Player #${this._jerseyNumber}`,
            jerseyNumber: this._jerseyNumber,
            position: this._positionType,
            team: this._isHome ? 'Home' : 'Away'
        };
    }
}


// =============================================================================
// INHERITANCE: BallMarker extends Marker
// =============================================================================
class BallMarker extends Marker {
    constructor(position) {
        super(position, '#ffffff');
        this._radius = 10;
    }

    render(ctx, canvasWidth, canvasHeight) {
        ctx.save(); // [FIX] Save state
        const pos = this._position.toCanvas(canvasWidth, canvasHeight);

        // Draw ball glow
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this._radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // Draw ball outer
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this._radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw ball pattern (pentagon shapes)
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this._radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.restore(); // [FIX] Restore state
    }

    containsPoint(px, py, canvasWidth, canvasHeight) {
        const pos = this._position.toCanvas(canvasWidth, canvasHeight);
        const dx = px - pos.x;
        const dy = py - pos.y;
        return (dx * dx + dy * dy) <= (this._radius + 5) * (this._radius + 5);
    }
}


// =============================================================================
// ENCAPSULATION: PassArrow encapsulates pass visualization
// =============================================================================
class PassArrow {
    constructor(fromPosition, toPosition, color, index, total) {
        this._from = fromPosition;
        this._to = toPosition;
        this._color = color;
        this._index = index;
        this._total = total;
    }

    render(ctx, canvasWidth, canvasHeight) {
        ctx.save(); // [FIX] Save state
        const from = this._from.toCanvas(canvasWidth, canvasHeight);
        const to = this._to.toCanvas(canvasWidth, canvasHeight);

        // Calculate opacity based on sequence (earlier = more faded)
        const opacity = 0.4 + (this._index / this._total) * 0.6;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = this._color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Draw arrowhead
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 12;

        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle - Math.PI / 6),
            to.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle + Math.PI / 6),
            to.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = this._color;
        ctx.globalAlpha = opacity;
        ctx.fill();
        ctx.restore(); // [FIX] Restore state (handles globalAlpha reset)
    }
}


// =============================================================================
// ENCAPSULATION: PitchRenderer handles all pitch drawing
// =============================================================================
class PitchRenderer {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._width = canvas.width;
        this._height = canvas.height;
        this._padding = 30;
        this._players = [];
        this._ball = null;
        this._passArrows = [];
        this._eventMarker = null;  // {type, position}

        // Pitch colors
        this._pitchColor = '#1a472a';
        this._lineColor = '#ffffff';
    }

    _createPlayerMarker(player, team, isHome) {
        return new PlayerMarker(
            new Position(player.x, player.y),
            team?.primaryColor || (isHome ? '#3b82f6' : '#ef4444'),
            team?.textColor || '#ffffff',
            player.jerseyNum || 0,
            player.playerName || '',
            player.positionGroupType || '',
            isHome
        );
    }

    setEventMarker(type, position) {
        if (type && position) {
            this._eventMarker = { type, position };
        } else {
            this._eventMarker = null;
        }
    }

    _drawEventMarker() {
        if (!this._eventMarker) return;

        const ctx = this._ctx;
        const pos = new Position(this._eventMarker.position.x, this._eventMarker.position.y)
            .toCanvas(this._width, this._height);

        const type = this._eventMarker.type;

        ctx.save();
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const markers = {
            'Challenge': { icon: '⚔️', fill: '#ff4444', shadow: '#ff0000', blur: 10 },
            'Shot': { icon: '💥', fill: '#ffcc00', shadow: '#ffaa00', blur: 10 },
            'Cross': { icon: '↗️', fill: '#00ccff', shadow: '#00aaff', blur: 8 },
            'Clearance': { icon: '🛡️', fill: '#44ff44', shadow: '#22cc22', blur: 8 },
            'Pass': { icon: '🎯', fill: '#ffffff', shadow: '#aaaaaa', blur: 6 }
        };

        const marker = markers[type];
        if (marker) {
            ctx.fillStyle = marker.fill;
            ctx.shadowColor = marker.shadow;
            ctx.shadowBlur = marker.blur;
            ctx.fillText(marker.icon, pos.x, pos.y - 25);
        }

        ctx.restore();
    }

    drawPitch() {
        const ctx = this._ctx;
        const w = this._width;
        const h = this._height;
        const p = this._padding;
        const drawW = w - p * 2;
        const drawH = h - p * 2;

        ctx.save(); // [FIX] Save state before drawing background

        // Background
        ctx.fillStyle = '#0a1f12';
        ctx.fillRect(0, 0, w, h);

        // Pitch grass with gradient
        const gradient = ctx.createLinearGradient(p, p, p + drawW, p);
        gradient.addColorStop(0, '#1a472a');
        gradient.addColorStop(0.5, '#1f5432');
        gradient.addColorStop(1, '#1a472a');
        ctx.fillStyle = gradient;
        ctx.fillRect(p, p, drawW, drawH);

        // Grass stripes
        const stripeWidth = drawW / 12;
        for (let i = 0; i < 12; i += 2) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(p + i * stripeWidth, p, stripeWidth, drawH);
        }

        // Line style
        ctx.strokeStyle = this._lineColor;
        ctx.lineWidth = 2;

        // Outer boundary
        ctx.strokeRect(p, p, drawW, drawH);

        // Center line
        ctx.beginPath();
        ctx.moveTo(w / 2, p);
        ctx.lineTo(w / 2, h - p);
        ctx.stroke();

        // Center circle
        const centerCircleRadius = drawW * 0.0873;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, centerCircleRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Center spot
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = this._lineColor;
        ctx.fill();

        // Penalty areas
        const penaltyAreaWidth = drawW * 0.157;
        const penaltyAreaHeight = drawH * 0.6;
        const penaltyAreaY = (h - penaltyAreaHeight) / 2;

        ctx.strokeRect(p, penaltyAreaY, penaltyAreaWidth, penaltyAreaHeight);
        ctx.strokeRect(w - p - penaltyAreaWidth, penaltyAreaY, penaltyAreaWidth, penaltyAreaHeight);

        // Goal areas
        const goalAreaWidth = drawW * 0.0524;
        const goalAreaHeight = drawH * 0.265;
        const goalAreaY = (h - goalAreaHeight) / 2;

        ctx.strokeRect(p, goalAreaY, goalAreaWidth, goalAreaHeight);
        ctx.strokeRect(w - p - goalAreaWidth, goalAreaY, goalAreaWidth, goalAreaHeight);

        // Penalty spots
        const penaltySpotX = drawW * 0.105;
        ctx.beginPath();
        ctx.arc(p + penaltySpotX, h / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(w - p - penaltySpotX, h / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Goals
        const goalWidth = 8;
        const goalHeight = drawH * 0.11;
        const goalY = (h - goalHeight) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(p - goalWidth, goalY, goalWidth, goalHeight);
        ctx.fillRect(w - p, goalY, goalWidth, goalHeight);

        ctx.restore(); // [FIX] Restore state
    }

    setPlayers(homePlayers, awayPlayers, homeTeam, awayTeam) {
        this._players = [];
        homePlayers.forEach(p => {
            if (p.x !== undefined && p.y !== undefined) {
                this._players.push(this._createPlayerMarker(p, homeTeam, true));
            }
        });
        awayPlayers.forEach(p => {
            if (p.x !== undefined && p.y !== undefined) {
                this._players.push(this._createPlayerMarker(p, awayTeam, false));
            }
        });
    }

    setBall(ballData) {
        if (ballData && ballData.x !== undefined && ballData.y !== undefined) {
            this._ball = new BallMarker(new Position(ballData.x, ballData.y, ballData.z || 0));
        } else {
            this._ball = null;
        }
    }

    setPassSequence(passes, teamColors) {
        this._passArrows = [];
        if (!passes || passes.length === 0) return;

        for (let i = 0; i < passes.length - 1; i++) {
            const currentPass = passes[i];
            const nextPass = passes[i + 1];

            if (currentPass.ballPosition && nextPass.ballPosition) {
                const from = new Position(currentPass.ballPosition.x, currentPass.ballPosition.y);
                const to = new Position(nextPass.ballPosition.x, nextPass.ballPosition.y);
                const color = teamColors[currentPass.teamId] || '#ffff00';
                this._passArrows.push(new PassArrow(from, to, color, i, passes.length));
            }
        }
    }

    render() {
        // [FIX] Explicitly clear canvas before drawing next frame
        // This solves the "multiple graphs rendered on top of each other" bug
        this._ctx.clearRect(0, 0, this._width, this._height);

        // Draw pitch
        this.drawPitch();

        // Draw pass arrows first (under players)
        this._passArrows.forEach(arrow => {
            arrow.render(this._ctx, this._width, this._height);
        });

        // Draw players
        this._players.forEach(player => {
            player.render(this._ctx, this._width, this._height);
        });

        // Draw ball on top
        if (this._ball) {
            this._ball.render(this._ctx, this._width, this._height);
        }

        // Draw event marker above ball
        this._drawEventMarker();
    }

    getPlayerAt(x, y) {
        for (const player of this._players) {
            if (player.containsPoint(x, y, this._width, this._height)) {
                return player;
            }
        }
        return null;
    }
}


// =============================================================================
// ENCAPSULATION: InfoCard handles tooltip display
// =============================================================================
class InfoCard {
    constructor(element) {
        this._element = element;
    }

    show(x, y, data) {
        const teamBadge = data.team === 'Home' ? '🏠' : '✈️';

        this._element.innerHTML = `
            <div class="tooltip-name">
                <span class="tooltip-jersey">${data.jerseyNumber}</span>
                ${data.name}
            </div>
            <div class="tooltip-info">
                ${teamBadge} ${data.team} · ${data.position}
            </div>
        `;

        this._element.style.left = `${x + 15}px`;
        this._element.style.top = `${y - 10}px`;
        this._element.classList.add('active');
    }

    hide() {
        this._element.classList.remove('active');
    }
}

window.PitchRenderer = PitchRenderer;
window.InfoCard = InfoCard;