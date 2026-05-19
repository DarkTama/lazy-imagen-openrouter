/**
 * Export/Import gallery functionality.
 */

import ImagenDB from './db.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import { renderGallery } from './gallery.js';

export async function exportGallery() {
    try {
        const images = await ImagenDB.getAllImages();
        if (!images || images.length === 0) {
            showToast('No images to export', 'warning');
            return;
        }

        if (images.length > 100) {
            const proceed = confirm(
                'You are about to export ' + images.length + ' images. ' +
                'This may produce a very large file and could be slow. Continue?'
            );
            if (!proceed) return;
        }

        showToast('Exporting ' + images.length + ' images...', 'info');

        const exportData = {
            version: 1,
            exportDate: new Date().toISOString(),
            imageCount: images.length,
            images: images
        };

        const jsonString = JSON.stringify(exportData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const date = new Date().toISOString().split('T')[0];
        const link = document.createElement('a');
        link.href = url;
        link.download = 'imagen-gallery-' + date + '.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
        showToast('Export complete!', 'success');
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

export async function importGallery(file) {
    try {
        const text = await file.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            showToast('Invalid JSON file', 'error');
            return;
        }

        if (!data.version || !Array.isArray(data.images)) {
            showToast('Invalid gallery export file (missing version or images)', 'error');
            return;
        }

        const existingIds = new Set(state.images.map(img => img.id));
        let imported = 0;
        let skipped = 0;
        let invalid = 0;

        for (const image of data.images) {
            if (!isValidImageRecord(image)) {
                invalid++;
                continue;
            }
            if (existingIds.has(image.id)) {
                skipped++;
                continue;
            }
            await ImagenDB.saveImage(image);
            imported++;
        }

        // Reload from IndexedDB
        state.images = await ImagenDB.getAllImages();
        renderGallery();

        showToast(
            'Imported ' + imported + ' new images, ' + skipped + ' skipped (duplicates)' +
            (invalid > 0 ? ', ' + invalid + ' skipped (invalid)' : ''),
            'success'
        );
    } catch (error) {
        console.error('Import failed:', error);
        showToast('Import failed: ' + error.message, 'error');
    }
}

function isValidImageRecord(image) {
    if (image.id === undefined || image.id === null) return false;
    if (typeof image.url !== 'string') return false;
    if (!image.url.startsWith('data:image/') && !image.url.startsWith('https://')) return false;
    if (typeof image.prompt !== 'string') return false;
    if (typeof image.createdAt !== 'string') return false;
    return true;
}
