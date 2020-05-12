"use strict";

/**
 * CONSTANTS
 */
const FONT_SIZE = 72;
const BOARD_HEIGHT = 16;

/**
 * JS doesn't have enums, so...
 */
const Occupant = {
    NOBODY: 0,
    PLAYER_1: 1,
    PLAYER_2: 2,
};

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
 * Board class, holds data about the board
 */
class Board {
    constructor(nrows) {
        const w = Math.floor(nrows / 2 + 1);
        const h = Math.ceil(nrows / 2);

        /**
         * Matrix of tiles organized in stacked triangular fashion. Like this:
         * 
         * Board:
         * 
         *  [0]
         * [1|2]
         *  [3|4]
         *   [5]
         * 
         * nrows = 4
         * tiles = [
         *     0, 3, 4,
         *     1, 2, 5
         * ]
         */
        this.tiles = Array.from({ length: w * h }, () => Occupant.NOBODY);
        /** Number of physical rows on the board */
        this.nrows = nrows;
        /** Number of physical columns on the board */
        this.ncols = w;
        /** Columns in the tiles matrix */
        this.matWidth = w;
        /** Rows in the tiles matrix */
        this.matHeight = h;
    }

    /** Converts a physical location to an index into the tiles matrix */
    toIndex(r, c) {
        const newr = r % this.matHeight;

        // Check for out-of-bounds, just to be safe.
        // Everything should mostly be using forEach, so this might not be necessary.
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
        if (i === undefined) return undefined; // No error in the case of a failed bounds check
        return this.tiles[i];
    }

    setOccupant(r, c, o) {
        const i = this.toIndex(r, c);
        if (i === undefined) throw new Error(`setOccupant: Invalid location: { r = ${r}, c = ${c} }`);
        this.tiles[i] = o;
    }

    /** Calls the given function with every valid {r,c} location */
    forEach(f) {
        for (let r = 0; r < this.nrows; ++r) {
            const cb = Math.max(0, r - this.matHeight + 1);
            const ce = Math.min(r - this.matHeight + this.ncols, this.ncols);

            for (let c = cb; c < ce; ++c) {
                f({ r, c });
            }
        }
    }

    /** Calculates the current score for both players */
    getScores() {
        // Initialize disjoint sets (https://en.wikipedia.org/wiki/Disjoint-set_data_structure)
        const p1sets = Array.from({ length: this.tiles.length }, (_, i) => i);
        const p2sets = Array.from({ length: this.tiles.length }, (_, i) => i);

        // Process each tile once
        this.forEach(({ r, c }) => {
            /** Set index */
            const i = this.toIndex(r, c);
            /** Occupant of current tile */
            const occupant = this.tiles[i];

            // If no piece is in tile, nuke its set in both p1 and p2, and skip
            if (occupant === Occupant.NOBODY) {
                // Nuking the sets like this isn't strictly necessary,
                // since it will simply lead to a group of 1 being counted for that player,
                // and a group of 1 doesn't change a players score.
                // Still, it's useful for clarity while debugging.
                p1sets[i] = undefined;
                p2sets[i] = undefined;
                return;
            }

            // Rename player sets for clarity
            const [my_sets, other_sets] = occupant === Occupant.PLAYER_1 ? [p1sets, p2sets] : [p2sets, p1sets];

            // Nuke set in other player's list (again, this isn't strictly necessary)
            other_sets[i] = undefined;

            /**
             * Union two sets together and fully compress them.
             * Full compression hurts performance, but it's the easiest way to ensure correctness.
             * A more efficient way would be to store the sizes of the sets and union-by-size,
             * and then to perform path compression opportunistically.
             */
            const joinSets = (s1, s2) => {
                my_sets.forEach((s, i) => {
                    if (s === s1) {
                        my_sets[i] = s2;
                    }
                });
            };

            /** Checks a neighbor tile to see if it belongs to us, and if so, union it to the current tile. */
            const checkNeighbor = (nr, nc) => {
                if (this.getOccupant(nr, nc) === occupant) { // Relies on the bounds checking in getOccupant
                    joinSets(my_sets[i], my_sets[this.toIndex(nr, nc)]);
                }
            };

            // Check neighbors
            checkNeighbor(r - 1, c); // NorthEast
            checkNeighbor(r - 1, c - 1); // NorthWest
            checkNeighbor(r, c - 1); // West

            // We don't need to check the other 3 neighbors, since they will be processed by themselves later.
        });

        /** Calculates the score of a list of sets */
        const scoreSets = (sets) => {
            /** Mapping table of set indices to set size */
            const scores = {};

            // Calculate set sizes
            for (const s of sets) {
                if (s !== undefined) {
                    scores[s] = (scores[s] ?? 0) + 1;
                }
            }

            /** Final score for this player */
            let score = 1;
            
            // Multiply all the set sizes together
            for (const k in scores) {
                if (Object.prototype.hasOwnProperty.call(scores, k)) { // Just being paranoid
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

    // Framerate limiter (30 fps)
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
 * Click event, uses mousedown for better responsiveness
 */
canvas.addEventListener('mousedown', (e) => {
    events.push({
        type: 'click',
        event: e,
    });
});

/**
 * Keeps canvas size filling the screen (mostly, not quite 100% to avoid spurious scrollbars)
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
