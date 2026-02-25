// === Core TypeScript interfaces for Project Cairo Dashboard ===

export interface GameData {
    appId: number;
    name: string;
    type: string;
    isFreeApp: boolean;
    updateTime: string;
    changeNumber: number;
    headerImage: string;
    shortDescription: string;
    depots: DepotInfo[];
    totalDepots: number;
    depotsWithManifests: number;
    sharedDepots: number;
    dlcAppIds: number[];
    dlcList: DlcInfo[];
    totalDlc: number;
    contentDlcCount: number;
    extraDlcCount: number;
    trackedDlc: number;
    trackedContentDlc: number;
    missingDlc: number;
    dlcCompletionPercent: number;
    depotCompletionPercent: number;
    invalidEntries: number;
    missingList: string[];
    notes: string[];
    luaContent: string;
    files: GameFile[];
    genres: string[];
    releaseDate: string;
    isReleased: boolean;
    price: string;
}

export type DlcType = 'content' | 'extra';

export interface DlcInfo {
    appId: number;
    name: string;
    isTracked: boolean;
    hasOwnDepot: boolean;
    dlcType: DlcType;
}

export interface DepotInfo {
    depotId: string;
    manifestId: string | null;
    size: string | null;
    downloadSize: string | null;
    oslist: string | null;
    language: string | null;
    isShared: boolean;
    sharedFromApp: string | null;
    isOptional: boolean;
    hasDecryptionKey: boolean;
}

export interface GameFile {
    name: string;
    size: number;
    type: 'json' | 'lua' | 'manifest' | 'vdf' | 'other';
    downloadUrl: string;
}

export interface StatsOverview {
    totalGames: number;
    totalDlcsTracked: number;
    totalDepotsTracked: number;
    averageCompletion: number;
    recentlyUpdated: RecentGame[];
    topGamesByDlc: { name: string; appId: number; dlcCount: number }[];
}

export interface RecentGame {
    appId: number;
    name: string;
    updateTime: string;
    headerImage: string;
    completionPercent: number;
    totalDlc: number;
}

export interface SearchResult {
    appId: number;
    name: string;
    headerImage: string;
    type: string;
    isAvailable: boolean;
    isReleased: boolean;
    isFreeApp: boolean;
    price: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// Raw JSON structure from the GitHub repo
export interface RawGameJson {
    appid: number;
    name: string;
    type: string;
    schinese_name?: string;
    isfreeapp: number;
    update_time: string;
    change_number: number;
    depot: Record<string, RawDepot>;
    dlc?: Record<string, unknown>;
}

export interface RawDepot {
    systemdefined?: string;
    optional?: string;
    config?: {
        oslist?: string;
        language?: string;
        lowviolence?: string;
    };
    manifests?: {
        public?: {
            gid: string;
            size: string;
            download: string;
        };
        [key: string]: unknown;
    };
    depotfromapp?: string;
    sharedinstall?: string;
    decryptionkey?: string;
}
