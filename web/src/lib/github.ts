import { Octokit } from '@octokit/rest';
import type { GameFile, RawGameJson } from './types';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

// Separate octokit instance for write operations (uses upload token)
const writeOctokit = new Octokit({
    auth: process.env.GITHUB_UPLOAD_TOKEN || process.env.GITHUB_TOKEN,
});

const OWNER = process.env.GITHUB_REPO_OWNER || 'SPIN0ZAi';
const REPO = process.env.GITHUB_REPO_NAME || 'SB_manifest_DB';

/**
 * List all branches (= all tracked AppIDs)
 */
export async function getAllBranches(): Promise<string[]> {
    const branches: string[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const { data } = await octokit.repos.listBranches({
            owner: OWNER,
            repo: REPO,
            per_page: perPage,
            page,
        });

        branches.push(...data.map((b) => b.name));

        if (data.length < perPage) break;
        page++;
    }

    return branches;
}

/**
 * Get paginated branches for stats overview (limits API calls)
 */
export async function getBranchesPaginated(
    page: number = 1,
    perPage: number = 30
): Promise<{ branches: string[]; hasMore: boolean }> {
    const { data } = await octokit.repos.listBranches({
        owner: OWNER,
        repo: REPO,
        per_page: perPage,
        page,
    });

    return {
        branches: data.map((b) => b.name),
        hasMore: data.length === perPage,
    };
}

/**
 * Get the real total branch count by parsing GitHub pagination headers.
 * Makes a single request with per_page=1 and reads the "last" page from Link header.
 */
export async function getTotalBranchCount(): Promise<number> {
    try {
        const response = await octokit.repos.listBranches({
            owner: OWNER,
            repo: REPO,
            per_page: 1,
            page: 1,
        });

        const linkHeader = response.headers.link || '';
        const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (lastMatch) {
            return parseInt(lastMatch[1], 10);
        }

        return response.data.length;
    } catch {
        return 0;
    }
}

/**
 * Get recently updated branches using a hybrid approach:
 * 1. Try GitHub Events API for truly recent pushes
 * 2. Fallback to sampling from the last pages of branches (highest AppIDs = newest)
 */
export async function getRecentlyUpdatedBranches(count: number = 12): Promise<string[]> {
    const recentBranches: string[] = [];
    const seen = new Set<string>();

    // Strategy 1: Try events API
    try {
        const { data: events } = await octokit.activity.listRepoEvents({
            owner: OWNER,
            repo: REPO,
            per_page: 100,
        });

        for (const event of events) {
            if (event.type === 'CreateEvent' || event.type === 'PushEvent') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const payload = event.payload as any;
                // PushEvent ref is just the branch name, CreateEvent ref is branch name
                const branch = payload?.ref || '';
                if (branch && /^\d+$/.test(branch) && !seen.has(branch)) {
                    seen.add(branch);
                    recentBranches.push(branch);
                    if (recentBranches.length >= count) return recentBranches;
                }
            }
        }
    } catch {
        // Events API might fail, continue to fallback
    }

    // Strategy 2: If events didn't give enough, get branches from the last pages
    if (recentBranches.length < count) {
        try {
            const totalCount = await getTotalBranchCount();
            const lastPage = Math.max(1, Math.ceil(totalCount / 100));
            const pages = [lastPage, Math.max(1, lastPage - 1)];

            const fetched = await Promise.all(
                pages.map((p) => getBranchesPaginated(p, 100))
            );

            const candidates = fetched
                .flatMap((r) => r.branches)
                .filter((b) => /^\d+$/.test(b) && !seen.has(b));

            // Sort by AppID descending (higher = newer in most cases)
            candidates.sort((a, b) => parseInt(b) - parseInt(a));

            for (const branch of candidates) {
                if (!seen.has(branch)) {
                    seen.add(branch);
                    recentBranches.push(branch);
                    if (recentBranches.length >= count) break;
                }
            }
        } catch {
            // Final fallback
        }
    }

    return recentBranches;
}

/**
 * Check if a branch (= AppID) exists
 */
export async function branchExists(appId: string): Promise<boolean> {
    try {
        await octokit.repos.getBranch({
            owner: OWNER,
            repo: REPO,
            branch: appId,
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the JSON metadata file for an AppID
 */
export async function getGameJson(appId: string): Promise<RawGameJson | null> {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: `${appId}.json`,
            ref: appId,
        });

        if ('content' in data && data.content) {
            const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
            return JSON.parse(decoded) as RawGameJson;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Get the Lua manifest content for an AppID
 */
export async function getLuaContent(appId: string): Promise<string | null> {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: `${appId}.lua`,
            ref: appId,
            headers: {
                'If-None-Match': '', // Bypass ETag caching to get fresh content
            },
        });

        if ('content' in data && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * List all files in a branch
 */
export async function getBranchFiles(appId: string): Promise<GameFile[]> {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: '',
            ref: appId,
        });

        if (!Array.isArray(data)) return [];

        return data.map((file) => {
            let fileType: GameFile['type'] = 'other';
            if (file.name.endsWith('.json')) fileType = 'json';
            else if (file.name.endsWith('.lua')) fileType = 'lua';
            else if (file.name.endsWith('.manifest')) fileType = 'manifest';
            else if (file.name.endsWith('.vdf')) fileType = 'vdf';

            return {
                name: file.name,
                size: file.size || 0,
                type: fileType,
                downloadUrl: file.download_url || '',
            };
        });
    } catch {
        return [];
    }
}

/**
 * Download raw file content from a branch
 */
export async function getFileContent(
    appId: string,
    filename: string
): Promise<Buffer | null> {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: filename,
            ref: appId,
        });

        if ('content' in data && data.content) {
            return Buffer.from(data.content, 'base64');
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Get recently updated game JSONs using events API + fallback for truly recent data.
 */
export async function getRecentGames(
    count: number = 12
): Promise<{ appId: string; json: RawGameJson }[]> {
    const recentBranches = await getRecentlyUpdatedBranches(count);

    const results: { appId: string; json: RawGameJson }[] = [];

    // Fetch JSON for each in parallel (limited concurrency)
    const batchSize = 6;
    for (let i = 0; i < recentBranches.length; i += batchSize) {
        const batch = recentBranches.slice(i, i + batchSize);
        const fetched = await Promise.allSettled(
            batch.map(async (appId) => {
                const json = await getGameJson(appId);
                return json ? { appId, json } : null;
            })
        );

        for (const result of fetched) {
            if (result.status === 'fulfilled' && result.value) {
                results.push(result.value);
            }
        }
    }

    // Sort by update_time descending (most recently updated first)
    results.sort((a, b) => {
        const aTime = new Date(a.json.update_time || '').getTime() || 0;
        const bTime = new Date(b.json.update_time || '').getTime() || 0;
        return bTime - aTime;
    });

    return results;
}

/**
 * Update or create a file in a branch.
 * Uses the write octokit (GITHUB_UPLOAD_TOKEN) for authentication.
 * Content can be a string (text files) or Buffer (binary files).
 */
export async function updateFileInBranch(
    appId: string,
    filename: string,
    content: string | Buffer,
    commitMessage: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get the current file SHA (needed for updates, not for creates)
        let sha: string | undefined;
        try {
            const { data } = await writeOctokit.repos.getContent({
                owner: OWNER,
                repo: REPO,
                path: filename,
                ref: appId,
            });
            if ('sha' in data) {
                sha = data.sha;
            }
        } catch {
            // File doesn't exist yet — that's fine, we'll create it
        }

        const base64Content = Buffer.isBuffer(content)
            ? content.toString('base64')
            : Buffer.from(content, 'utf-8').toString('base64');

        await writeOctokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filename,
            message: commitMessage,
            content: base64Content,
            branch: appId,
            ...(sha && { sha }),
        });

        return { success: true };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update ${filename} in branch ${appId}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
