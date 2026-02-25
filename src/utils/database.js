import 'dotenv/config';
import { MongoClient, ServerApiVersion } from 'mongodb';
import logger from './logger.js';

let client = null;
let db = null;
let isConnecting = false;
let connectionPromise = null;

const log = logger.child('DB');

/**
 * Get the database instance. Reconnects automatically if needed.
 * @returns {Promise<import('mongodb').Db>} The database instance
 */
export async function getDb() {
    if (db && client) {
        // Quick check — if topology exists and is connected, return immediately
        try {
            if (client.topology && client.topology.isConnected()) {
                return db;
            }
        } catch {
            // Topology check failed, try reconnecting
        }
    }

    if (connectionPromise) {
        await connectionPromise;
        return db;
    }

    if (!isConnecting) {
        connectionPromise = connectToDatabase();
        try {
            await connectionPromise;
        } finally {
            connectionPromise = null;
        }
    }

    if (!db) {
        throw new Error('Database not connected. Please try again.');
    }

    return db;
}

/**
 * Connect to the MongoDB database
 * @returns {Promise<import('mongodb').Db>} The database instance
 */
export async function connectToDatabase() {
    if (isConnecting) {
        throw new Error('Database connection already in progress');
    }

    isConnecting = true;

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        const dbName = process.env.MONGODB_DB_NAME || 'sb-manifest';

        // Connect to MongoDB with current recommended options
        client = new MongoClient(process.env.MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true
            }
        });

        await client.connect();
        db = client.db(dbName);

        // Test the connection
        await db.command({ ping: 1 });

        // Initialize collections if they don't exist
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        const requiredCollections = ['settings', 'usage', 'requests', 'branches'];
        for (const collName of requiredCollections) {
            if (!collectionNames.includes(collName)) {
                await db.createCollection(collName);
                log.info(`Created collection: ${collName}`);
            }
        }

        // Create indexes for performance
        await ensureIndexes(db);

        log.info('Successfully connected to database');
        return db;
    } catch (error) {
        log.error('Failed to connect to database', error);
        // Clean up on error
        if (client) {
            try { await client.close(); } catch { /* ignore close errors */ }
            client = null;
        }
        db = null;
        throw error;
    } finally {
        isConnecting = false;
    }
}

/**
 * Create database indexes for query performance.
 * Called once on connection — MongoDB ignores if indexes already exist.
 */
async function ensureIndexes(database) {
    try {
        // Settings — lookup by guild ID (unique)
        await database.collection('settings').createIndex(
            { guildId: 1 }, { unique: true }
        );

        // Usage — compound index for daily usage lookups
        await database.collection('usage').createIndex(
            { userId: 1, guildId: 1, date: 1 }
        );

        // Games — lookup by appId (unique)
        await database.collection('games').createIndex(
            { appId: 1 }, { unique: true }
        );

        // API users — lookup by API key (unique)
        await database.collection('api_users').createIndex(
            { apiKey: 1 }, { unique: true }
        );

        // API requests — query by userId + timestamp
        await database.collection('api_requests').createIndex(
            { userId: 1, timestamp: -1 }
        );

        // API usage — lookup by userId
        await database.collection('api_usage').createIndex(
            { userId: 1 }, { unique: true }
        );

        // Release notifications — compound lookup
        await database.collection('release-notifications').createIndex(
            { appId: 1, userId: 1 }, { unique: true }
        );

        // API downloads — lookup by downloadId + expiry for cleanup
        await database.collection('api_downloads').createIndex(
            { downloadId: 1 }, { unique: true }
        );
        await database.collection('api_downloads').createIndex(
            { expiresAt: 1 }, { expireAfterSeconds: 0 }
        );

        log.info('Database indexes ensured');
    } catch (error) {
        // Index creation errors are non-fatal — the bot will still work, just slower
        log.warn('Could not create some database indexes', error);
    }
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        log.info('Database connection closed');
    }
}