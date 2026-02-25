import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateAppId } from '../utils/steam.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { createZipArchive } from '../utils/zip.js';
import { getDb } from '../utils/database.js';
import { getClient } from '../utils/discordClient.js';
import logger from '../utils/logger.js';

const log = logger.child('API');
const app = express();
let server = null; // Store server reference for graceful shutdown

// Configuration from environment
const BIND_PORT = parseInt(process.env.API_BIND_PORT || '6308', 10);
const BIND_ADDR = process.env.API_BIND_ADDR || '0.0.0.0';
const API_PRIMARY_URL = process.env.API_PRIMARY_URL || `http://localhost:${BIND_PORT}`;
const API_BACKUP_URL = process.env.API_BACKUP_URL || '';

// Allowed CORS origins (comma-separated in env, or default to restrictive)
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000']; // Default: localhost only

// Security middleware
app.use(helmet());

// CORS middleware — restricted origins
app.use(cors({
    origin: CORS_ORIGINS,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-signature', 'x-timestamp'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false
}));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure downloads directory exists
const downloadsDir = path.join(process.cwd(), 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Serve downloads directory statically
app.use('/downloads', express.static(downloadsDir));

// --- Download file cleanup (runs every 10 minutes) ---
let cleanupInterval = null;

function startDownloadCleanup() {
    cleanupInterval = setInterval(async () => {
        try {
            const files = await fs.promises.readdir(downloadsDir);
            const now = Date.now();
            let cleaned = 0;

            for (const file of files) {
                if (!file.endsWith('.zip')) continue;
                const filePath = path.join(downloadsDir, file);
                try {
                    const stat = await fs.promises.stat(filePath);
                    // Delete files older than 30 minutes
                    if (now - stat.mtimeMs > 30 * 60 * 1000) {
                        await fs.promises.unlink(filePath);
                        cleaned++;
                    }
                } catch { /* file may have been deleted already */ }
            }

            if (cleaned > 0) {
                log.info(`Cleaned up ${cleaned} expired download files`);
            }
        } catch (error) {
            log.error('Download cleanup error', error);
        }
    }, 10 * 60 * 1000); // Every 10 minutes
}

// --- Middleware: API key validation ---
const validateApiKey = async (req, res, next) => {
    const apiKey =
        req.headers.authorization?.replace('Bearer ', '') ||
        req.headers['x-api-key'] ||
        '';

    if (!apiKey) {
        log.warn(`Missing API key from IP ${req.ip}`);
        return res.status(401).json({ error: 'API key required' });
    }

    try {
        const db = await getDb();
        const user = await db.collection('api_users').findOne({ apiKey });

        if (!user) {
            log.warn(`Invalid API key from IP ${req.ip}`);
            return res.status(401).json({ error: 'Invalid API key' });
        }
        if (user.blacklisted) {
            log.warn(`Blacklisted user ${user.userId} tried to access API`);
            return res.status(403).json({ error: 'Your access has been revoked. Please contact the owner.' });
        }
        if (!user.active) {
            log.warn(`Inactive API key for user ${user.userId}`);
            return res.status(403).json({ error: 'API key is inactive' });
        }
        if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
            log.warn(`Expired subscription for user ${user.userId}`);
            return res.status(403).json({ error: 'Your subscription has expired. Please renew via Ko-fi and contact the owner.' });
        }

        // Per-user rate limiting (2 second cooldown)
        const now = Date.now();
        const userLimits = await db.collection('api_usage').findOne({ userId: user.userId });

        if (userLimits) {
            const timeDiff = now - userLimits.lastRequest;
            if (timeDiff < 2000) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    retryAfter: Math.ceil((2000 - timeDiff) / 1000)
                });
            }
        }

        // Update usage tracking
        await db.collection('api_usage').updateOne(
            { userId: user.userId },
            {
                $set: { lastRequest: now, ip: req.ip, userAgent: req.get('User-Agent') },
                $inc: { requestCount: 1 }
            },
            { upsert: true }
        );

        // Try to get user avatar from Discord client
        let avatarUrl = null;
        try {
            const discordClient = getClient();
            if (discordClient) {
                const discordUser = await discordClient.users.fetch(user.userId);
                avatarUrl = discordUser.displayAvatarURL({ dynamic: true, size: 128 });
            }
        } catch { /* avatar fetch is non-critical */ }

        req.user = { ...user, avatar: avatarUrl };
        next();
    } catch (error) {
        log.error('API key validation error', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// --- Middleware: Request signature validation ---
const validateSignature = (req, res, next) => {
    const { gameId, action, timestamp, signature } = req.body;

    if (!gameId && !action) {
        return res.status(400).json({ error: 'Missing required parameters (gameId or action)' });
    }
    if (!timestamp || !signature) {
        return res.status(400).json({ error: 'Missing required parameters (timestamp and signature)' });
    }

    // Check if request is not too old (5 minutes)
    const now = Date.now();
    if (now - timestamp > 5 * 60 * 1000) {
        return res.status(400).json({ error: 'Request expired' });
    }

    // Verify HMAC signature
    const dataToSign = gameId || action;
    const expectedSignature = crypto.createHmac('sha256', req.user.apiKey)
        .update(`${dataToSign}${timestamp}`)
        .digest('hex');

    if (signature !== expectedSignature) {
        log.warn(`Invalid signature from user ${req.user.userId}`);
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// --- Routes ---

// Health check (includes DB status)
app.get('/health', async (req, res) => {
    let dbStatus = 'unknown';
    try {
        const db = await getDb();
        await db.command({ ping: 1 });
        dbStatus = 'connected';
    } catch {
        dbStatus = 'disconnected';
    }

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: dbStatus,
        uptime: process.uptime()
    });
});

// Search game info
app.post('/api/search', validateApiKey, validateSignature, async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = req.user;
        log.info(`Search by ${user.username || user.userId} for gameId: ${gameId}`);

        if (!/^\d+$/.test(gameId)) {
            return res.status(400).json({ success: false, error: 'Invalid game ID format' });
        }

        const gameData = await validateAppId(gameId);

        const db = await getDb();
        await db.collection('api_requests').insertOne({
            userId: req.user.userId, gameId, ip: req.ip,
            userAgent: req.get('User-Agent'), timestamp: new Date(), type: 'search'
        });

        res.json({
            success: true,
            gameName: gameData.name,
            price: gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A'),
            image: gameData.header_image,
            description: gameData.short_description,
            genres: gameData.genres?.map(g => g.description) || [],
            user: { id: req.user.userId, username: req.user.username, avatar: req.user.avatar }
        });
    } catch (error) {
        log.error('Search error', error);
        res.status(404).json({ success: false, error: 'Game not found on Steam' });
    }
});

// Get game info
app.get('/api/game/:gameId', validateApiKey, async (req, res) => {
    try {
        const { gameId } = req.params;
        if (!/^\d+$/.test(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID format' });
        }

        const gameData = await validateAppId(gameId);

        const db = await getDb();
        await db.collection('api_requests').insertOne({
            userId: req.user.userId, gameId, ip: req.ip,
            userAgent: req.get('User-Agent'), timestamp: new Date(), type: 'game_info'
        });

        res.json({
            appId: gameId,
            name: gameData.name,
            price: gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A'),
            image: gameData.header_image,
            description: gameData.short_description,
            genres: gameData.genres?.map(g => g.description) || [],
            user: { id: req.user.userId, username: req.user.username, avatar: req.user.avatar }
        });
    } catch (error) {
        log.error('Game info error', error);
        res.status(404).json({ error: 'Game not found' });
    }
});

// Download game files
app.post('/api/download', validateApiKey, validateSignature, async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = req.user;
        log.info(`Download by ${user.username || user.userId} for gameId: ${gameId}`);

        if (!/^\d+$/.test(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID format' });
        }

        // Get game info from Steam
        let gameData;
        try {
            gameData = await validateAppId(gameId);
        } catch (error) {
            return res.status(404).json({ error: 'Game not found on Steam' });
        }

        // Import filtering functions
        const { isGameFiltered, getBaseGameIfDLC, fetchSteamStoreInfo, fetchPeakCCU } = await import('../utils/gen.js');

        // Check if it's a DLC
        const baseAppId = getBaseGameIfDLC(gameData);
        if (baseAppId && baseAppId !== gameId) {
            return res.status(400).json({
                error: 'DLCs are not supported. Please download the base game.',
                baseGameId: baseAppId
            });
        }

        // Fetch Steam info for filtering
        let steamInfo = null;
        let peakCCU = null;
        try {
            const [steamInfoResult, peakCCUResult] = await Promise.allSettled([
                fetchSteamStoreInfo(gameId), fetchPeakCCU(gameId)
            ]);
            if (steamInfoResult.status === 'fulfilled') steamInfo = steamInfoResult.value;
            if (peakCCUResult.status === 'fulfilled') peakCCU = peakCCUResult.value;
        } catch { /* non-critical */ }

        gameData = { ...gameData, ...(steamInfo || {}), peak_ccu: peakCCU };

        // AI content filtering
        let filterResult;
        try {
            filterResult = await isGameFiltered(gameData);
        } catch {
            filterResult = { filtered: false, whitelisted: false, reason: 'AI check failed' };
        }

        if (filterResult.filtered) {
            return res.status(403).json({
                error: `Game contains explicit content. Reason: ${filterResult.reason}`
            });
        }

        // Fetch files from GitHub
        let files;
        try {
            files = await fetchFilesFromRepo(gameId);
        } catch (error) {
            return res.status(404).json({ error: 'No files found for this game.' });
        }

        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'No files found for this game' });
        }

        // Create ZIP archive
        const zipBuffer = await createZipArchive(files);
        log.info(`Created ZIP for ${gameData.name} (${gameId}), size: ${zipBuffer.length} bytes`);

        // Save to database
        const db = await getDb();
        await db.collection('games').updateOne(
            { appId: gameId.toString() },
            { $set: { name: gameData.name, lastUpdated: new Date(), requester: user.userId } },
            { upsert: true }
        );

        // Generate download
        const downloadId = crypto.randomBytes(16).toString('hex');
        const downloadPath = `/downloads/${downloadId}.zip`;

        await db.collection('api_downloads').insertOne({
            downloadId, userId: user.userId, gameId, ip: req.ip,
            timestamp: new Date(), expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });

        await db.collection('api_requests').insertOne({
            userId: user.userId, gameId, ip: req.ip,
            userAgent: req.get('User-Agent'), timestamp: new Date(), type: 'download', downloadId
        });

        // Save ZIP to disk
        const zipFilePath = path.join(downloadsDir, `${downloadId}.zip`);
        try {
            await fs.promises.writeFile(zipFilePath, zipBuffer);
        } catch (writeErr) {
            log.error('Failed to write ZIP file', writeErr);
            return res.status(500).json({ error: 'Failed to save ZIP file on server.' });
        }

        const response = {
            success: true,
            downloadUrlPrimary: `${API_PRIMARY_URL}${downloadPath}`,
            gameName: gameData.name,
            fileCount: files.length,
            zipSize: zipBuffer.length,
            user: { id: user.userId, username: user.username, avatar: user.avatar }
        };

        if (API_BACKUP_URL) {
            response.downloadUrlBackup = `${API_BACKUP_URL}${downloadPath}`;
        }

        res.json(response);
    } catch (error) {
        log.error('Download error', error);
        res.status(500).json({ error: 'Failed to process download request' });
    }
});

// Remove game from library
app.post('/api/remove-game', validateApiKey, validateSignature, async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = req.user;
        log.info(`Remove game by ${user.username || user.userId} for gameId: ${gameId}`);

        if (!/^\d+$/.test(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID format' });
        }

        let gameData;
        try {
            gameData = await validateAppId(gameId);
        } catch (error) {
            return res.status(404).json({ error: 'Game not found on Steam' });
        }

        const db = await getDb();
        await db.collection('api_requests').insertOne({
            userId: user.userId, gameId, ip: req.ip,
            userAgent: req.get('User-Agent'), timestamp: new Date(), type: 'remove_game'
        });

        res.json({
            success: true, gameName: gameData.name,
            message: 'Game removal request processed. Lua file will be deleted.'
        });
    } catch (error) {
        log.error('Remove game error', error);
        res.status(500).json({ error: 'Failed to process remove request' });
    }
});

// Steam control endpoint
app.post('/api/steam-control', validateApiKey, validateSignature, async (req, res) => {
    try {
        const { action } = req.body;
        const user = req.user;
        log.info(`Steam control by ${user.username || user.userId}: ${action}`);

        const validActions = ['open', 'restart', 'exit'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ error: 'Invalid action. Valid actions: open, restart, exit' });
        }

        const db = await getDb();
        await db.collection('api_requests').insertOne({
            userId: user.userId, action, ip: req.ip,
            userAgent: req.get('User-Agent'), timestamp: new Date(), type: 'steam_control'
        });

        res.json({
            success: true, action,
            message: `Steam ${action} command received and will be executed.`,
            user: { id: user.userId, username: user.username, avatar: user.avatar || null }
        });
    } catch (err) {
        log.error('Steam control error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Server lifecycle ---

export async function startApiServer() {
    server = app.listen(BIND_PORT, BIND_ADDR, () => {
        log.info(`API server listening on ${BIND_ADDR}:${BIND_PORT}`);
    });

    // Start download cleanup scheduler
    startDownloadCleanup();
}

export async function stopApiServer() {
    // Stop download cleanup
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }

    // Close server
    if (server) {
        return new Promise((resolve) => {
            server.close(() => {
                log.info('API server closed');
                resolve();
            });
            // Force close after 5 seconds
            setTimeout(resolve, 5000);
        });
    }
}