"use strict";

/**
 * CONSTANTS
 */
const FONT_SIZE = 72;
const BOARD_HEIGHT = 16;

/**
 * Efraimidis-Spirakis Algorithm A-ExpJ with a constant reservoir size of 1
 */
class ESSampler {
    constructor() {
        this.reservoir = [];
        this.skipWeight = 0;
    }

    insert(item, weight) {
        if (this.reservoir.length < 1) {
            const score = Math.pow(Math.random(), 1 / weight);

            this.reservoir.push({ item, score });
            this.skipWeight = Math.log(Math.random()) / Math.log(this.reservoir[0].score);
        } else {
            this.skipWeight -= weight;

            if (this.skipWeight <= 0) {
                const t = Math.pow(this.reservoir[0].score, weight);
                const adjusted_dist = () => Math.random() * (1 - t) + t;
                const adjusted_score = Math.pow(adjusted_dist(), 1 / weight);

                this.reservoir[0] = { item, score: adjusted_score };
                this.skipWeight = Math.log(Math.random()) / Math.log(this.reservoir[0].score);
            }
        }
    }

    getResult() {
        return this.reservoir[0]?.item;
    }
};

/**
 * JS doesn't have enums, so...
 */
const Occupant = {
    NOBODY: 0,
    PLAYER_1: 1,
    PLAYER_2: 2,
};

/**
 * Board class, holds data about the board
 */
class Board {
    constructor(nrows) {
        const w = Math.floor(nrows / 2 + 1);
        const h = Math.ceil(nrows / 2);

        this.tiles = Array.from({ length: w * h }, () => Occupant.NOBODY);
        this.nrows = nrows;
        this.ncols = w;
        this.matWidth = w;
        this.matHeight = h;
    }

    /** Trapezoidal mapping */
    toIndex(r, c) {
        const newr = r % this.matHeight;

        if (r < 0 || r >= this.nrows ||
            c < 0 || c >= this.ncols ||
            r < this.matHeight && c > r ||
            r >= this.matHeight && c <= newr
        ) {
            return undefined;
        }

        return newr * this.matWidth + c;
    }

    getOccupant(r, c) {
        const i = this.toIndex(r, c);
        if (i === undefined) return undefined;
        return this.tiles[i];
    }

    setOccupant(r, c, o) {
        const i = this.toIndex(r, c);
        if (i === undefined) throw new Error(`setOccupant: Invalid location: { r = ${r}, c = ${c} }`);
        this.tiles[i] = o;
    }

    forEach(f) {
        for (let r = 0; r < this.nrows; ++r) {
            const cb = Math.max(0, r - this.matHeight + 1);
            const ce = Math.min(r - this.matHeight + this.ncols, this.ncols);

            for (let c = cb; c < ce; ++c) {
                f({ r, c });
            }
        }
    }

    getScores() {
        const p1sets = Array.from({ length: this.tiles.length }, (_, i) => i);
        const p2sets = Array.from({ length: this.tiles.length }, (_, i) => i);

        this.forEach(({ r, c }) => {
            const i = this.toIndex(r, c);
            const occupant = this.tiles[i];

            if (occupant === Occupant.NOBODY) {
                p1sets[i] = undefined;
                p2sets[i] = undefined;
                return;
            }

            const [my_sets, other_sets] = occupant === Occupant.PLAYER_1 ? [p1sets, p2sets] : [p2sets, p1sets];

            other_sets[i] = undefined;

            const joinSets = (s1, s2) => {
                my_sets.forEach((s, i) => {
                    if (s === s1) {
                        my_sets[i] = s2;
                    }
                });
            };

            const checkNeighbor = (nr, nc) => {
                if (this.getOccupant(nr, nc) === occupant) {
                    joinSets(my_sets[i], my_sets[this.toIndex(nr, nc)]);
                }
            };

            checkNeighbor(r - 1, c);
            checkNeighbor(r - 1, c - 1);
            checkNeighbor(r, c - 1);
        });

        const scoreSets = (sets) => {
            const scores = {};

            for (const s of sets) {
                if (s !== undefined) {
                    scores[s] = (scores[s] ?? 0) + 1;
                }
            }

            let score = 1;
            
            for (const k in scores) {
                if (Object.prototype.hasOwnProperty.call(scores, k)) {
                    score *= scores[k];
                }
            }

            return score;
        };

        const p1score = scoreSets(p1sets);
        const p2score = scoreSets(p2sets);

        return { p1score, p2score };
    }
}

/**
 * Global game data
 */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const board = new Board(BOARD_HEIGHT);
const events = [];
let prevnow = undefined;
let nextFrame = 0;
let currentPlayer = 1;

/**
 * Step / tick / update / draw
 */
const step = (now) => {
    requestAnimationFrame(step);

    // Delta time
    if (!prevnow) prevnow = now;
    const dt = (now - prevnow) / 1000;
    prevnow = now;

    // Framerate limiter
    nextFrame -= dt;
    if (nextFrame > 0) return;
    nextFrame = 1/30;

    // Constants
    const scrw = canvas.width;
    const scrh = canvas.height;
    const camw = 100 * scrw / scrh;
    const camh = 100;
    const cam2scr = (x, y) => ({ x: x / camw * scrw, y: y / camh * scrh });
    const scr2cam = (x, y) => ({ x: x / scrw * camw, y: y / scrh * camh });
    const tilew = camh / board.nrows;
    const tileh = tilew;
    const { x: tilescrw, y: tilescrh } = cam2scr(tilew, tileh);
    const tile2scr = (r, c) => cam2scr(c * tilew + camw / 2 - ((r + 1) * tilew / 2), r * tileh);
    const scr2tile = (x, y) => {
        const cam = scr2cam(x, y);
        const rf = cam.y / tileh;
        const r = Math.floor(rf);
        const cf = (2 * cam.x - camw + (r + 1) * tilew) / (2 * tilew);
        const c = Math.floor(cf);
        return { r, c, rf, cf };
    };

    // Process events
    for (const { type, event } of events) {
        switch (type) {
            case 'click': {
                if (currentPlayer !== 1) break;

                const { r, c } = scr2tile(event.clientX, event.clientY);
                const occupant = board.getOccupant(r, c);

                if (occupant !== undefined) {
                    switch (occupant) {
                        case Occupant.NOBODY:
                            board.setOccupant(r, c, Occupant.PLAYER_1);
                            currentPlayer = 2;
                            break;
                    }
                }
                break;
            }
        }
    }
    events.length = 0;

    // AI turn
    if (currentPlayer === 2) {
        const samp = new ESSampler();

        board.forEach(({ r, c }) => {
            if (board.getOccupant(r, c) === Occupant.NOBODY) {
                samp.insert({ r, c }, 1);
            }
        });

        const result = samp.getResult();

        if (result) {
            board.setOccupant(result.r, result.c, Occupant.PLAYER_2);
            currentPlayer = 1;
        } else {
            currentPlayer = 3;
        }
    }

    // Cls
    ctx.clearRect(0, 0, scrw, scrh);

    // Draw board
    board.forEach(({r, c}) => {
        const { x, y } = tile2scr(r, c);
        const occupant = board.getOccupant(r, c);
        const drawCircle = (style) => {
            ctx.fillStyle = style;
            ctx.beginPath();
            ctx.ellipse(x + tilescrw / 2, y + tilescrh / 2, tilescrw / 3, tilescrh / 3, 0, 0, 2 * Math.PI);
            ctx.fill();
        };

        ctx.strokeStyle = '#000';
        ctx.strokeRect(x, y, tilescrw, tilescrh);

        switch (occupant) {
            case Occupant.NOBODY:
                break;
            case Occupant.PLAYER_1:
                drawCircle('#e40');
                break;
            case Occupant.PLAYER_2:
                drawCircle('#04e');
                break;
        }
    });

    // Draw scores
    const { p1score, p2score } = board.getScores();
    
    ctx.font = `${FONT_SIZE}px Consolas`;

    ctx.fillStyle = '#e40';
    ctx.fillText(`P1: ${p1score}`, 32, 32 + FONT_SIZE);

    ctx.fillStyle = '#04e';
    ctx.fillText(`P2: ${p2score}`, 32, 32 + FONT_SIZE * 2);
};
requestAnimationFrame(step);

/**
 * Click event
 */
canvas.addEventListener('mousedown', (e) => {
    events.push({
        type: 'click',
        event: e,
    });
});

/**
 * Keeps canvas size filling the screen (mostly)
 */
const syncSize = () => {
    const w = window.innerWidth - 8;
    const h = window.innerHeight - 8;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
};
window.addEventListener('resize', syncSize);
syncSize();

/**
 * Just some debugging stuff, nothing too critical
 */
console.log(`nrows = ${board.nrows}`);
console.log(`ncols = ${board.ncols}`);
console.log(`tiles.length = ${board.tiles.length}`);
