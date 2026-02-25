import axios from 'axios';
import { Octokit } from '@octokit/rest';

const GITHUB_API_BASE = 'https://api.github.com';

// Single repo definition — no more duplicate entries
const REPOS = [
    {
        owner: process.env.GITHUB_REPO_OWNER || 'SPIN0ZAi',
        name: process.env.GITHUB_REPO_NAME || 'SB_manifest_DB',
        token: process.env.GITHUB_UPLOAD_TOKEN || process.env.GITHUB_TOKEN
    }
];

let octokit = null;
let REPO_OWNER = null;
let REPO_NAME = null;

function initializeGitHubConfig() {
    if (!process.env.GITHUB_UPLOAD_TOKEN) {
        throw new Error('GITHUB_UPLOAD_TOKEN environment variable is not set');
    }
    if (!process.env.GITHUB_REPO_OWNER) {
        throw new Error('GITHUB_REPO_OWNER environment variable is not set');
    }
    if (!process.env.GITHUB_UPLOAD_REPO_NAME) {
        throw new Error('GITHUB_UPLOAD_REPO_NAME environment variable is not set');
    }

    octokit = new Octokit({
        auth: process.env.GITHUB_UPLOAD_TOKEN
    });
    REPO_OWNER = process.env.GITHUB_REPO_OWNER;
    REPO_NAME = process.env.GITHUB_UPLOAD_REPO_NAME;
}

async function fetchFilesFromSingleRepo(owner, repo, branchName, token) {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/`;

    try {
        const response = await axios.get(url, {
            params: {
                ref: branchName,
                _: Date.now()
            },
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                ...(token && { 'Authorization': `token ${token}` })
            },
            timeout: 15000
        });

        const files = response.data;
        const targetFiles = files.filter(file =>
            file.type === 'file' &&
            (file.name.endsWith('.lua') ||
                file.name.endsWith('.manifest') ||
                file.name === 'copyright.txt')
        );

        if (targetFiles.length === 0) {
            return [];
        }

        const filesWithContent = await Promise.all(targetFiles.map(async file => {
            const fileInfo = {
                name: file.name,
                url: `${file.download_url}?_=${Date.now()}`
            };

            if (file.name.endsWith('.manifest')) {
                let attempts = 0;
                let success = false;
                while (attempts < 3 && !success) {
                    try {
                        const contentResponse = await axios.get(fileInfo.url, {
                            responseType: 'arraybuffer',
                            headers: {
                                ...(token && { 'Authorization': `token ${token}` }),
                                'Cache-Control': 'no-cache',
                                'Pragma': 'no-cache'
                            },
                            timeout: 60000 // Increased timeout to 60s
                        });
                        fileInfo.content = Buffer.from(contentResponse.data);
                        success = true;
                    } catch (error) {
                        attempts++;
                        if (attempts >= 3) {
                            console.error(`Failed to fetch manifest content for ${file.name}:`, error.message);
                        } else {
                            await new Promise(res => setTimeout(res, 1000)); // 1s delay between retries
                        }
                    }
                }
            }

            return fileInfo;
        }));

        return filesWithContent;

    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`Timeout fetching from ${repo}`);
            return [];
        }
        if (error.response && error.response.status === 404) {
            return [];
        }
        console.error(`Failed to fetch from ${repo}:`, error.message);
        return [];
    }
}

export async function fetchFilesFromRepo(branchName) {
    let allResults = await Promise.all(REPOS.map(repo =>
        fetchFilesFromSingleRepo(repo.owner, repo.name, branchName, repo.token)
    ));

    allResults = allResults.filter(result => result.length > 0);

    if (allResults.length === 0) {
        throw new Error(`The required branch \`${branchName}\` does not exist in any repository.`);
    }

    return allResults[0];
}

export async function fetchAllBranches() {
    let allBranches = new Set();

    for (const repo of REPOS) {
        let page = 1;
        const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/branches`;

        while (true) {
            try {
                const response = await axios.get(url, {
                    params: { per_page: 100, page },
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(repo.token && { 'Authorization': `token ${repo.token}` })
                    }
                });

                if (response.data.length === 0) break;

                response.data.forEach(branch => allBranches.add(branch.name));
                page++;
            } catch (error) {
                console.error(`Failed to fetch branches from ${repo.name}:`, error.message);
                break;
            }
        }
    }

    return allBranches.size > 0 ? Array.from(allBranches) : null;
}

export async function updateOrCreateBranch(appId, files) {
    initializeGitHubConfig();

    try {
        // Check if the branch exists
        let branchExists = true;
        try {
            await octokit.git.getRef({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                ref: `heads/${appId}`
            });
        } catch (err) {
            if (err.status === 404) {
                branchExists = false;
            } else {
                throw err;
            }
        }

        // Get the latest SHA from main
        const { data: mainRef } = await octokit.git.getRef({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            ref: 'heads/main'
        });
        const baseSha = mainRef.object.sha;

        // Create branch if missing
        if (!branchExists) {
            await octokit.git.createRef({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                ref: `refs/heads/${appId}`,
                sha: baseSha
            });
        }

        // Create blobs
        const blobs = await Promise.all(
            files.map(file =>
                octokit.git.createBlob({
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                    content: Buffer.from(file.content).toString('base64'),
                    encoding: 'base64'
                })
            )
        );

        const tree = blobs.map((blob, i) => ({
            path: files[i].name,
            mode: '100644',
            type: 'blob',
            sha: blob.data.sha
        }));

        const { data: newTree } = await octokit.git.createTree({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            tree,
            base_tree: baseSha
        });

        // Use appropriate commit message based on whether branch existed
        const commitMessage = branchExists
            ? `[bot] Update files for AppID: ${appId}`
            : `[bot] Add new game files for AppID: ${appId}`;

        const { data: newCommit } = await octokit.git.createCommit({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            message: commitMessage,
            tree: newTree.sha,
            parents: [baseSha]
        });

        await octokit.git.updateRef({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            ref: `heads/${appId}`,
            sha: newCommit.sha,
            force: true
        });

        return { success: true, isNewGame: !branchExists };

    } catch (error) {
        console.error('Error in updateOrCreateBranch:', error);
        throw error;
    }
}

// Utility: Check if a branch exists for a given appId
export async function branchExists(appId) {
    initializeGitHubConfig();
    try {
        await octokit.git.getRef({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            ref: `heads/${appId}`
        });
        return true;
    } catch (err) {
        if (err.status === 404) {
            return false;
        }
        throw err;
    }
}
