/**
 * Client-side image upscaling via pica (Lanczos/mks2013 resampling in web
 * workers). No AI, no network, no tokens spent.
 */

import Pica from 'pica';

// 32 MP RGBA ≈ 128 MB of pixel data — a sane ceiling for in-browser work.
export const MAX_OUTPUT_PIXELS = 33554432;
// Many browsers fail (sometimes silently) above 8192px per side.
export const MAX_OUTPUT_SIDE = 8192;

export const SCALE_OPTIONS = [2, 3, 4];

let _pica = null;

/** Lazy singleton so importing this module never spins up workers. */
function getUpscaler() {
    if (!_pica) _pica = new Pica();
    return _pica;
}

/** Target dimensions (and megapixels) for a given scale factor. */
export function computeTargetDims(srcW, srcH, scale) {
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    return { w, h, mp: (w * h) / 1e6 };
}

/** Whether a scale factor stays within output caps. */
export function isScaleAllowed(srcW, srcH, scale) {
    const { w, h } = computeTargetDims(srcW, srcH, scale);
    if (w > MAX_OUTPUT_SIDE || h > MAX_OUTPUT_SIDE) {
        return {
            allowed: false,
            reason: `${w}×${h} exceeds the ${MAX_OUTPUT_SIDE}px per-side limit`
        };
    }
    if (w * h > MAX_OUTPUT_PIXELS) {
        return {
            allowed: false,
            reason: `${w}×${h} exceeds the ${Math.round(MAX_OUTPUT_PIXELS / 1e6)} MP output limit`
        };
    }
    return { allowed: true, reason: '' };
}

/** Format a dimensions info line like "1024×1024 · 1.0 MP". */
export function formatDims(w, h) {
    const mp = (w * h) / 1e6;
    return `${w}×${h} · ${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP`;
}

/**
 * Upscale a source canvas. Returns a new canvas at the target size.
 *
 * @param {HTMLCanvasElement} srcCanvas
 * @param {number} scale
 * @param {{ sharpen?: boolean, cancelToken?: Promise, onStage?: (label: string) => void }} [options]
 */
export async function upscaleCanvas(srcCanvas, scale, { sharpen = false, cancelToken, onStage } = {}) {
    const { w, h } = computeTargetDims(srcCanvas.width, srcCanvas.height, scale);
    const check = isScaleAllowed(srcCanvas.width, srcCanvas.height, scale);
    if (!check.allowed) {
        throw new Error(`Upscale blocked: ${check.reason}`);
    }

    onStage?.('Preparing…');
    const dst = document.createElement('canvas');
    dst.width = w;
    dst.height = h;

    // Some browsers (notably mobile Safari) silently produce dead canvases
    // over their total-area limit instead of throwing. Probe before resampling.
    const probeCtx = dst.getContext('2d');
    probeCtx.fillStyle = '#010203';
    probeCtx.fillRect(0, 0, 1, 1);
    const probe = probeCtx.getImageData(0, 0, 1, 1).data;
    if (probe[3] === 0) {
        throw new Error(`This device cannot allocate a ${w}×${h} canvas — try a smaller scale.`);
    }
    probeCtx.clearRect(0, 0, 1, 1);

    onStage?.('Resampling…');
    await getUpscaler().resize(srcCanvas, dst, {
        filter: 'mks2013',
        ...(sharpen ? { unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 } : {}),
        ...(cancelToken ? { cancelToken } : {})
    });

    return dst;
}

/**
 * Promisified canvas.toBlob. Prefer this over toDataURL for downloads —
 * it avoids holding a giant base64 string in memory.
 */
export function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
            type,
            quality
        );
    });
}
