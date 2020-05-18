"use strict";

/**
 * CONSTANTS
 */
const FONT_SIZE = 48;
const BOARD_HEIGHT = 16;

/**
 * JS doesn't have enums, so...
 */
const Occupant = {
    NOBODY: 0,
    PLAYER_1: 1,
    PLAYER_2: 2,
};
function beep() {
}
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
 * Classic disjoint-set implementation, union-by-size with path compression, with node colors (arbitrary data).
 * 
 * https://en.wikipedia.org/wiki/Disjoint-set_data_structure
 */
class DisjointSet {
    constructor(size, colors) {
        this.sets = Array.from({ length: size }, (_, i) => i);
        this.metadata = Array.from({ length: size }, (_, i) => ({ size: 1, color: colors[i] }));
    }

    findRoot(id) {
        if (this.sets[id] != id) {
            const root = this.findRoot(this.sets[id]);
            this.sets[id] = root;
            return root;
        } else {
            return id;
        }
    }

    union(id1, id2) {
        const root1 = this.findRoot(id1);
        const root2 = this.findRoot(id2);

        if (root1 === root2) return;
        
        const [small, big] = this.metadata[root1].size < this.metadata[root2].size ? [root1, root2] : [root2, root1];

        this.sets[small] = big;
        this.metadata[big].size += this.metadata[small].size;
        this.metadata[small] = undefined;
    }

    eraseNode(id) {
        this.sets[id] = undefined;
        this.metadata[id] = undefined;
    }

    forEach(f) {
        this.metadata.forEach((m, i) => {
            if (m) {
                f(i, m.size, m.color);
            }
        });
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

        /** Cached */
        this.cachedScores = undefined;
    }

    isValidLocation(r, c) {
        const validRow = r >= 0 && r < this.nrows;
        const validCol = c >= 0 && c < this.ncols;
        const inUpperTri = r < this.matHeight && c <= r;
        const inLowerTri = r >= this.matHeight && c > r - this.matHeight;

        return validRow && validCol && (inUpperTri || inLowerTri);
    }

    /** Converts a physical location to an index into the tiles matrix */
    toIndex(r, c) {
        return (r % this.matHeight) * this.matWidth + c;
    }

    getOccupant(r, c) {
        const i = this.toIndex(r, c);
        return this.tiles[i];
    }

    setOccupant(r, c, o) {
        if (!this.isValidLocation(r, c)) throw new Error(`setOccupant: Invalid location: { r = ${r}, c = ${c} }`);
        const i = this.toIndex(r, c);
        this.tiles[i] = o;
        this.cachedScores = undefined;
    }

    /** Calls the given function with every valid {r,c} location */
    forEach(f) {
        for (let r = 0; r < this.nrows; ++r) {
            const cb = Math.max(0, r - this.matHeight + 1);
            const ce = Math.min(r - this.matHeight + this.ncols, this.ncols);

            for (let c = cb; c < ce; ++c) {
                const i = this.toIndex(r, c);
                f({ r, c, i, occupant: this.tiles[i] });
            }
        }
    }

    clear() {
        this.forEach(({ i }) => {
            this.tiles[i] = Occupant.NOBODY;
        });
        this.cachedScores = undefined;
    }

    /**
     * Calculates the current score for both players.
     * 
     * Note: We could make this far more efficient by storing the disjoint-set structure as a class member,
     *       and incrementally update the scores each time setOccupant is called.
     *       However, since this algorithm might need to be applied to arbitrarily constructed boards in the future,
     *       it's more convenient to recalculate the disjoint-sets every time.
     *       The algorithm is essentially O(n) though, so it shouldn't be a problem.
     */
    getScores() {
        if (this.cachedScores) return this.cachedScores;

        /** Tile groups */
        const sets = new DisjointSet(this.tiles.length, this.tiles);

        // Process each tile once
        this.forEach(({ r, c, i, occupant }) => {
            // Don't process unowned tiles
            if (occupant === Occupant.NOBODY) {
                return;
            }

            /** Checks a neighbor tile to see if it belongs to us, and if so, union it to the current tile. */
            const checkNeighbor = (nr, nc) => {
                if (!board.isValidLocation(nr, nc)) return;
                if (this.getOccupant(nr, nc) === occupant) {
                    sets.union(i, this.toIndex(nr, nc));
                }
            };

            // Check neighbors
            // We don't need to check the other 3 neighbors, since they will be processed again later.
            checkNeighbor(r - 1, c); // NorthEast
            checkNeighbor(r - 1, c - 1); // NorthWest
            checkNeighbor(r, c - 1); // West
        });

        let p1score = 1;
        let p2score = 1;
        let p1estimate = 0;
        let p2estimate = 0;

        sets.forEach((_id, size, owner) => {
            // estimate heuristic
            const int = Math.floor(Math.log2(size));
            const frac = (size - Math.pow(2, int)) / Math.pow(2, int);
            const estimate = int + frac;

            switch (owner) {
                case Occupant.PLAYER_1:
                    p1score *= size;
                    p1estimate += estimate;
                    break;
                case Occupant.PLAYER_2:
                    p2score *= size;
                    p2estimate += estimate;
                    break;
            }
        });

        // Log scale
        p1score = Math.log2(p1score);
        p2score = Math.log2(p2score);

        this.cachedScores = { p1score, p2score, p1estimate, p2estimate };

        return this.cachedScores;
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

    // Coordinate systems and conversions
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
                // Only allow during P1's turn
                if (currentPlayer !== 1) break;

                const { r, c } = scr2tile(event.clientX, event.clientY);

                if (!board.isValidLocation(r, c)) break;

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
            case 'randomize': {
                // randomizes the board by alternating random placements
                let p1rem = board.tiles.length / 2;
                let p2rem = board.tiles.length - p1rem;
                board.clear();
                board.forEach(({ r, c }) => {
                    const p1cut = p1rem / (p1rem + p2rem);
                    if (Math.random() < p1cut) {
                        board.setOccupant(r, c, Occupant.PLAYER_1);
                        --p1rem;
                    } else {
                        board.setOccupant(r, c, Occupant.PLAYER_2);
                        --p2rem;
                    }
                });
                break;
            }
        }
    }
    events.length = 0;

    // AI turn
    if (currentPlayer === 2) {
        const samp = new ESSampler();

        board.forEach(({ r, c, occupant }) => {
            if (occupant === Occupant.NOBODY) {
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
    board.forEach(({ r, c, occupant }) => {
        const { x, y } = tile2scr(r, c);
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
    let row = 1;
    const drawScore = (name, value, style) => {
        ctx.fillStyle = style;
        ctx.fillText(`${name}: ${value}`, 32, 32 + FONT_SIZE * row);
        ++row;
    };
    const { p1score, p2score, p1estimate, p2estimate } = board.getScores();
    
    ctx.font = `${FONT_SIZE}px Consolas`;
    drawScore('P1', Math.round(p1score * 100), '#e40');
    drawScore('P1E', p1estimate, '#a32');
    drawScore('P2', Math.round(p2score * 100), '#04e');
    drawScore('P2E', p2estimate, '#23a');
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
    // beep
    var snd = new Audio("data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");  
    snd.play();
});

/**
 * Keypress events, uses keydown for responsiveness
 */
window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'r':
            events.push({
                type: 'randomize',
            });
            break;
    }
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
