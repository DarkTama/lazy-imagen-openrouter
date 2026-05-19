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

        showToast('Exporting ' + images.length + ' images...', 'info');

        const exportData = {
            version: 1,
            exportDate: new Date().toISOString(),
            imageCount: images.length,
            images: images
        };

        const jsonString = JSON.stringify(exportData, null, 2);
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

        for (const image of data.images) {
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

        showToast('Imported ' + imported + ' new images, ' + skipped + ' skipped (duplicates)', 'success');
    } catch (error) {
        console.error('Import failed:', error);
        showToast('Import failed: ' + error.message, 'error');
    }
}
