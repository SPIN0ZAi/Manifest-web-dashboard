import type { DepotInfo, RawGameJson } from './types';

/**
 * Parse the raw game JSON from GitHub into structured depot information
 * and compute DLC statistics.
 */
export function parseGameDepots(gameJson: RawGameJson): {
    depots: DepotInfo[];
    dlcAppIds: number[];
    totalDepots: number;
    depotsWithManifests: number;
    sharedDepots: number;
    missingManifests: string[];
} {
    const depots: DepotInfo[] = [];
    const dlcAppIds: number[] = [];
    const missingManifests: string[] = [];
    let depotsWithManifests = 0;
    let sharedDepots = 0;

    if (!gameJson.depot) {
        return { depots, dlcAppIds, totalDepots: 0, depotsWithManifests: 0, sharedDepots: 0, missingManifests };
    }

    for (const [depotId, depot] of Object.entries(gameJson.depot)) {
        const isShared = !!depot.depotfromapp;
        const hasManifest = !!depot.manifests?.public?.gid;

        if (isShared) sharedDepots++;
        if (hasManifest) depotsWithManifests++;

        // If it's a non-shared depot without a manifest, it's "missing"
        if (!isShared && !hasManifest && !depot.systemdefined) {
            missingManifests.push(depotId);
        }

        depots.push({
            depotId,
            manifestId: depot.manifests?.public?.gid || null,
            size: depot.manifests?.public?.size || null,
            downloadSize: depot.manifests?.public?.download || null,
            oslist: depot.config?.oslist || null,
            language: depot.config?.language ?? null,
            isShared,
            sharedFromApp: depot.depotfromapp || null,
            isOptional: depot.optional === '1',
            hasDecryptionKey: !!depot.decryptionkey,
        });
    }

    // Extract DLC app IDs if present
    if (gameJson.dlc) {
        for (const dlcId of Object.keys(gameJson.dlc)) {
            const parsed = parseInt(dlcId, 10);
            if (!isNaN(parsed)) dlcAppIds.push(parsed);
        }
    }

    return {
        depots,
        dlcAppIds,
        totalDepots: depots.length,
        depotsWithManifests,
        sharedDepots,
        missingManifests,
    };
}

/**
 * Compute DLC completion statistics
 */
export function computeDlcStats(
    totalDlc: number,
    presentDlc: number
): {
    missingDlc: number;
    completionPercent: number;
} {
    const missingDlc = Math.max(0, totalDlc - presentDlc);
    const completionPercent = totalDlc > 0
        ? Math.round((presentDlc / totalDlc) * 10000) / 100
        : 100;

    return { missingDlc, completionPercent };
}

/**
 * Generate notes/warnings about the manifest
 */
export function generateNotes(
    depots: DepotInfo[],
    dlcAppIds: number[],
    missingManifests: string[]
): string[] {
    const notes: string[] = [];

    if (missingManifests.length === 0) {
        notes.push('✅ All depots have manifests mapped');
    } else {
        notes.push(`⚠️ ${missingManifests.length} depot(s) missing manifests`);
    }

    const depotsWithKeys = depots.filter((d) => d.hasDecryptionKey);
    if (depotsWithKeys.length > 0) {
        notes.push(`🔑 ${depotsWithKeys.length} depot(s) have decryption keys`);
    }

    const sharedCount = depots.filter((d) => d.isShared).length;
    if (sharedCount > 0) {
        notes.push(`🔗 ${sharedCount} shared depot(s) from other apps`);
    }

    if (dlcAppIds.length > 0) {
        notes.push(`📦 ${dlcAppIds.length} DLC(s) tracked`);
    }

    return notes;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number | string | null): string {
    if (!bytes) return 'N/A';
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return 'N/A';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (num === 0) return '0 B';
    const i = Math.floor(Math.log(num) / Math.log(1024));
    return `${(num / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
