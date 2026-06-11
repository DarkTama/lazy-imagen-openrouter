/**
 * Background removal core: classic (non-AI) computer-vision primitives.
 *
 * Everything in this module is pure typed-array math with zero DOM access so
 * it can be unit-tested directly. The mask convention throughout:
 *   Uint8Array(width * height), 255 = foreground (keep), 0 = background
 *   (transparent). Intermediate values only appear after feathering.
 */

const MAX_BORDER_CLUSTERS = 16;

/** Squared Euclidean distance between two RGB colors. */
export function colorDist2(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr + dg * dg + db * db;
}

/**
 * Map a 0-100 tolerance slider value to a squared-distance threshold.
 * Tolerance 0 means exact match only; 100 is extremely permissive.
 */
export function toleranceToThreshold2(tolerance) {
    const t = Math.max(0, Math.min(100, tolerance)) * 2.55;
    return 3 * t * t;
}

/**
 * Per-step threshold for neighbor-to-neighbor moves during region growing.
 * Deliberately much tighter than the slider tolerance: background gradients
 * and JPEG noise step a few units per pixel, while anti-aliased subject
 * edges ramp over 2-3 pixels with much larger steps — a tight step gate
 * turns those edges into barriers without breaking gradient flow.
 */
export function localStepThreshold2(tolerance) {
    const t = Math.max(0, Math.min(100, tolerance));
    return toleranceToThreshold2(Math.min(t, Math.max(5, t * 0.22)));
}

/**
 * Cluster the colors of all border pixels (greedy, running-average centers).
 * Returns up to MAX_BORDER_CLUSTERS [r, g, b] centers. This makes auto-detect
 * work on multi-tone and gradient backgrounds without a full k-means pass.
 */
export function clusterBorderColors(data, width, height, threshold2) {
    const clusters = []; // { r, g, b, count }

    const addPixel = (idx) => {
        const o = idx * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        for (const c of clusters) {
            if (colorDist2(r, g, b, c.r, c.g, c.b) <= threshold2) {
                // Running average keeps the center representative
                c.r += (r - c.r) / (c.count + 1);
                c.g += (g - c.g) / (c.count + 1);
                c.b += (b - c.b) / (c.count + 1);
                c.count++;
                return;
            }
        }
        if (clusters.length < MAX_BORDER_CLUSTERS) {
            clusters.push({ r, g, b, count: 1 });
        }
    };

    for (let x = 0; x < width; x++) {
        addPixel(x); // top row
        addPixel((height - 1) * width + x); // bottom row
    }
    for (let y = 1; y < height - 1; y++) {
        addPixel(y * width); // left column
        addPixel(y * width + width - 1); // right column
    }

    // Round the running-average centers: fractional drift (e.g. 100.03 from
    // one off-color border pixel) would make exact matching at tolerance 0
    // impossible.
    return clusters.map(c => [Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
}

function minClusterDist2(r, g, b, clusters) {
    let min = Infinity;
    for (const [cr, cg, cb] of clusters) {
        const d = colorDist2(r, g, b, cr, cg, cb);
        if (d < min) min = d;
    }
    return min;
}

/**
 * Auto-detect the background of an RGBA image.
 *
 * Flood-fills from border pixels that match a border color cluster, marking
 * reached pixels as background (0). A pixel joins the fill only if the STEP
 * from the neighbor it was reached from is small (anti-aliased subject edges
 * step too steeply and act as barriers, while background gradients and JPEG
 * noise flow freely) AND it is globally similar to some border cluster
 * within the slider tolerance.
 *
 * @param {Uint8ClampedArray|Uint8Array} data RGBA pixel data (length w*h*4)
 * @param {number} width
 * @param {number} height
 * @param {number} tolerance 0-100 slider value
 * @returns {Uint8Array} mask (255 keep / 0 remove)
 */
export function detectBackgroundMask(data, width, height, tolerance) {
    const n = width * height;
    const mask = new Uint8Array(n);

    // Respect pre-existing transparency (e.g. an uploaded transparent PNG)
    for (let i = 0; i < n; i++) {
        mask[i] = data[i * 4 + 3];
    }

    const tGlobal2 = toleranceToThreshold2(tolerance);
    const tLocal2 = localStepThreshold2(tolerance);
    // Fine cluster spacing so gradient backgrounds get centers close enough
    // that every background pixel sits within tGlobal2 of one of them
    const clusterT2 = Math.max(toleranceToThreshold2(10), tGlobal2 / 4);
    const clusters = clusterBorderColors(data, width, height, clusterT2);
    if (clusters.length === 0) return mask;

    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    let stackTop = 0;

    const qualifies = (idx, fromIdx) => {
        const o = idx * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        const fo = fromIdx * 4;
        if (colorDist2(r, g, b, data[fo], data[fo + 1], data[fo + 2]) > tLocal2) return false;
        return minClusterDist2(r, g, b, clusters) <= tGlobal2;
    };

    const seed = (idx) => {
        if (visited[idx]) return;
        const o = idx * 4;
        if (minClusterDist2(data[o], data[o + 1], data[o + 2], clusters) <= tGlobal2) {
            visited[idx] = 1;
            mask[idx] = 0;
            stack[stackTop++] = idx;
        }
    };

    for (let x = 0; x < width; x++) {
        seed(x);
        seed((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
        seed(y * width);
        seed(y * width + width - 1);
    }

    // 4-neighbor flood fill over an explicit stack (no recursion, no per-pixel
    // object allocation). Simple and fast enough for the 16 MP working cap.
    while (stackTop > 0) {
        const idx = stack[--stackTop];
        const x = idx % width;
        const y = (idx / width) | 0;

        if (x > 0) {
            const left = idx - 1;
            if (!visited[left] && qualifies(left, idx)) {
                visited[left] = 1;
                mask[left] = 0;
                stack[stackTop++] = left;
            }
        }
        if (x < width - 1) {
            const right = idx + 1;
            if (!visited[right] && qualifies(right, idx)) {
                visited[right] = 1;
                mask[right] = 0;
                stack[stackTop++] = right;
            }
        }
        if (y > 0) {
            const up = idx - width;
            if (!visited[up] && qualifies(up, idx)) {
                visited[up] = 1;
                mask[up] = 0;
                stack[stackTop++] = up;
            }
        }
        if (y < height - 1) {
            const down = idx + width;
            if (!visited[down] && qualifies(down, idx)) {
                visited[down] = 1;
                mask[down] = 0;
                stack[stackTop++] = down;
            }
        }
    }

    // Halo pass: eat the background-like outer half of anti-aliased edges
    // that the tight step gate (correctly) refused to walk through. Gated on
    // strong global similarity so 1px hair strands and outlines survive.
    if (tolerance > 0) {
        dilateMaskIntoSimilar(mask, visited, data, width, height, clusters, tGlobal2 / 2);
    }

    return mask;
}

/**
 * Single-pass dilation: kept pixels that touch a removed pixel AND are
 * within threshold2 of one of `centers` get removed. Candidates are
 * collected before applying so the dilation never cascades.
 * Returns the number of pixels removed. Also reused by the AI-assist
 * chroma-key path with centers = [[255, 0, 255]].
 */
export function dilateMaskIntoSimilar(mask, removedFlags, data, width, height, centers, threshold2) {
    const candidates = [];
    const n = width * height;
    for (let idx = 0; idx < n; idx++) {
        if (mask[idx] === 0 || removedFlags[idx]) continue;
        const x = idx % width;
        const y = (idx / width) | 0;
        const nearRemoved =
            (x > 0 && removedFlags[idx - 1]) ||
            (x < width - 1 && removedFlags[idx + 1]) ||
            (y > 0 && removedFlags[idx - width]) ||
            (y < height - 1 && removedFlags[idx + width]);
        if (!nearRemoved) continue;
        const o = idx * 4;
        if (minClusterDist2(data[o], data[o + 1], data[o + 2], centers) <= threshold2) {
            candidates.push(idx);
        }
    }
    for (const idx of candidates) {
        mask[idx] = 0;
        removedFlags[idx] = 1;
    }
    return candidates.length;
}

/**
 * Chroma-key mask: remove ALL pixels (not just border-connected ones) whose
 * color is within tolerance of the key color. Used on AI-assist results
 * where the model repainted the background a solid key color — the global
 * scan also catches enclosed holes a border flood fill can never reach.
 */
export function chromaKeyMask(data, width, height, keyColor, tolerance) {
    const n = width * height;
    const mask = new Uint8Array(n);
    const t2 = toleranceToThreshold2(tolerance);
    const [kr, kg, kb] = keyColor;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        mask[i] = colorDist2(data[o], data[o + 1], data[o + 2], kr, kg, kb) <= t2
            ? 0
            : data[o + 3];
    }
    return mask;
}

/**
 * Magic-wand region grow from a seed pixel. Returns the indices of the
 * contiguous region whose colors are within tolerance of the SEED color and
 * whose neighbor-to-neighbor steps stay below the tight local threshold
 * (so the selection doesn't bleed through anti-aliased edges).
 * Unbounded by default; pass maxRadiusPx for a radius-limited grow.
 *
 * @returns {{ indices: Int32Array, count: number }}
 */
export function localRegionGrow(data, width, height, seedX, seedY, tolerance, maxRadiusPx = Infinity) {
    const n = width * height;
    const result = { indices: new Int32Array(0), count: 0 };
    seedX = Math.round(seedX);
    seedY = Math.round(seedY);
    if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return result;

    const tSeed2 = toleranceToThreshold2(tolerance);
    const tStep2 = localStepThreshold2(tolerance);
    const bounded = Number.isFinite(maxRadiusPx);
    const r2 = bounded ? maxRadiusPx * maxRadiusPx : 0;
    const seedIdx = seedY * width + seedX;
    const so = seedIdx * 4;
    const sr = data[so];
    const sg = data[so + 1];
    const sb = data[so + 2];

    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    let stackTop = 0;
    const collected = [seedIdx];
    visited[seedIdx] = 1;
    stack[stackTop++] = seedIdx;

    const qualifies = (idx, fromIdx) => {
        if (bounded) {
            const x = idx % width;
            const y = (idx / width) | 0;
            const dx = x - seedX;
            const dy = y - seedY;
            if (dx * dx + dy * dy > r2) return false;
        }
        const o = idx * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        if (colorDist2(r, g, b, sr, sg, sb) > tSeed2) return false;
        const fo = fromIdx * 4;
        return colorDist2(r, g, b, data[fo], data[fo + 1], data[fo + 2]) <= tStep2;
    };

    while (stackTop > 0) {
        const idx = stack[--stackTop];
        const x = idx % width;
        const y = (idx / width) | 0;
        const neighbors = [];
        if (x > 0) neighbors.push(idx - 1);
        if (x < width - 1) neighbors.push(idx + 1);
        if (y > 0) neighbors.push(idx - width);
        if (y < height - 1) neighbors.push(idx + width);
        for (const nb of neighbors) {
            if (!visited[nb] && qualifies(nb, idx)) {
                visited[nb] = 1;
                collected.push(nb);
                stack[stackTop++] = nb;
            }
        }
    }

    result.indices = Int32Array.from(collected);
    result.count = collected.length;
    return result;
}

/**
 * Feather (soften) mask edges with a two-pass sliding-window box blur.
 * O(n) regardless of radius. Returns a NEW mask; the input is untouched so
 * the crisp mask stays the source of truth and re-feathering never degrades.
 */
export function featherMask(mask, width, height, radius) {
    if (radius <= 0) return Uint8Array.from(mask);

    const temp = new Uint16Array(mask.length);
    const out = new Uint8Array(mask.length);
    const win = radius * 2 + 1;

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
            sum += mask[row + Math.max(0, Math.min(width - 1, x))];
        }
        for (let x = 0; x < width; x++) {
            temp[row + x] = sum;
            const outX = Math.max(0, x - radius);
            const inX = Math.min(width - 1, x + radius + 1);
            sum += mask[row + inX] - mask[row + outX];
        }
    }

    // Vertical pass
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
            sum += temp[Math.max(0, Math.min(height - 1, y)) * width + x];
        }
        for (let y = 0; y < height; y++) {
            out[y * width + x] = Math.round(sum / (win * win));
            const outY = Math.max(0, y - radius);
            const inY = Math.min(height - 1, y + radius + 1);
            sum += temp[inY * width + x] - temp[outY * width + x];
        }
    }

    return out;
}

/** Stamp a filled circle of `value` into the mask, clamped at the borders. */
export function stampCircle(mask, width, height, cx, cy, radius, value) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    const r = Math.max(0, radius);
    const yMin = Math.max(0, Math.ceil(cy - r));
    const yMax = Math.min(height - 1, Math.floor(cy + r));
    for (let y = yMin; y <= yMax; y++) {
        const dy = y - cy;
        const half = Math.floor(Math.sqrt(r * r - dy * dy));
        const xMin = Math.max(0, cx - half);
        const xMax = Math.min(width - 1, cx + half);
        const row = y * width;
        mask.fill(value, row + xMin, row + xMax + 1);
    }
}

/**
 * Stamp circles along the segment (x0,y0)→(x1,y1) so fast pointer moves
 * leave no gaps. Spacing is a fraction of the radius.
 */
export function strokeSegment(mask, width, height, x0, y0, x1, y1, radius, value) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spacing = Math.max(1, radius / 2);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        stampCircle(mask, width, height, x0 + dx * t, y0 + dy * t, radius, value);
    }
}

/**
 * Composite: copy RGB from src and write the mask as the alpha channel.
 * `outData` may be the same buffer as `srcData`.
 */
export function applyMaskAlpha(srcData, mask, outData) {
    const n = mask.length;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        outData[o] = srcData[o];
        outData[o + 1] = srcData[o + 1];
        outData[o + 2] = srcData[o + 2];
        outData[o + 3] = mask[i];
    }
}

/** Fraction of pixels the mask keeps (>= 128 counts as kept). */
export function maskKeepFraction(mask) {
    if (!mask || mask.length === 0) return 1;
    let kept = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] >= 128) kept++;
    }
    return kept / mask.length;
}

/** Snapshot-based undo/redo for masks. push() clears the redo branch. */
export class MaskHistory {
    constructor(maxSnapshots = 10) {
        this.maxSnapshots = maxSnapshots;
        this._undoStack = [];
        this._redoStack = [];
    }

    get canUndo() {
        return this._undoStack.length > 0;
    }

    get canRedo() {
        return this._redoStack.length > 0;
    }

    /** Push a copy of the mask as it was BEFORE an edit. */
    push(mask) {
        this._undoStack.push(Uint8Array.from(mask));
        if (this._undoStack.length > this.maxSnapshots) {
            this._undoStack.shift();
        }
        this._redoStack = [];
    }

    /** Returns the previous mask, or null. `current` moves to the redo stack. */
    undo(current) {
        if (!this.canUndo) return null;
        this._redoStack.push(Uint8Array.from(current));
        return this._undoStack.pop();
    }

    /** Returns the next mask, or null. `current` moves to the undo stack. */
    redo(current) {
        if (!this.canRedo) return null;
        this._undoStack.push(Uint8Array.from(current));
        return this._redoStack.pop();
    }

    clear() {
        this._undoStack = [];
        this._redoStack = [];
    }
}
