// Network utility functions for handling retries and errors
import axios from 'axios';

/**
 * Network error codes that should trigger retries
 */
const RETRY_ERROR_CODES = [
    'ECONNRESET', 'ECONNABORTED', 'ENOTFOUND', 'ECONNREFUSED',
    'ENETDOWN', 'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH',
    'EAI_AGAIN', 'ETIMEDOUT'
];

/**
 * HTTP status codes that should trigger retries
 */
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524];

/**
 * Check if an error should trigger a retry
 * @param {Error} error - The error to check
 * @returns {boolean} - Whether to retry
 */
export function shouldRetry(error) {
    // Network errors
    if (RETRY_ERROR_CODES.includes(error.code)) {
        return true;
    }
    
    // HTTP status errors
    if (error.response && RETRY_STATUS_CODES.includes(error.response.status)) {
        return true;
    }
    
    // DNS resolution errors
    if (error.message && error.message.includes('getaddrinfo')) {
        return true;
    }
    
    return false;
}

/**
 * Enhanced axios instance with automatic retries
 */
export const axiosWithRetry = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'SB-Manifest-Bot/1.0'
    }
});

// Add retry interceptor
axiosWithRetry.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        
        // Initialize retry count
        if (!config._retryCount) {
            config._retryCount = 0;
        }
        
        // Check if we should retry
        const maxRetries = config._maxRetries || 3;
        if (config._retryCount < maxRetries && shouldRetry(error)) {
            config._retryCount++;
            
            // Exponential backoff delay
            const delay = Math.min(1000 * Math.pow(2, config._retryCount - 1), 10000);
            console.warn(`🔄 Retry ${config._retryCount}/${maxRetries} for ${config.url} after ${delay}ms (${error.code || error.message})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return axiosWithRetry(config);
        }
        
        return Promise.reject(error);
    }
);

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {string} context - Context for logging
 * @returns {Promise} - The result of the function
 */
export async function retryWithBackoff(fn, maxRetries = 3, context = 'operation') {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (attempt <= maxRetries && shouldRetry(error)) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`🔄 ${context} failed (attempt ${attempt}/${maxRetries + 1}): ${error.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                break;
            }
        }
    }
    
    throw lastError;
}

/**
 * Check internet connectivity
 * @returns {Promise<boolean>} - Whether internet is available
 */
export async function checkConnectivity() {
    try {
        await axios.get('https://8.8.8.8', { timeout: 5000 });
        return true;
    } catch (error) {
        console.warn('🌐 Internet connectivity check failed:', error.message);
        return false;
    }
}

/**
 * Enhanced error handling for specific error types
 * @param {Error} error - The error to handle
 * @param {string} context - Context for the error
 * @returns {string} - User-friendly error message
 */
export function getErrorMessage(error, context = 'operation') {
    if (error.code === 'EAI_AGAIN' || error.message?.includes('getaddrinfo')) {
        return `🌐 DNS resolution failed during ${context}. This is usually a temporary network issue. Please try again in a moment.`;
    }
    
    if (error.code === 'ECONNRESET') {
        return `🔌 Connection was reset during ${context}. The server may be busy. Please try again.`;
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        return `⏱️ ${context} timed out. The server may be slow or busy. Please try again.`;
    }
    
    if (error.code === 'ENOTFOUND') {
        return `🔍 Could not reach the server during ${context}. Please check your internet connection.`;
    }
    
    if (error.response?.status === 429) {
        return `🚦 Rate limited during ${context}. Please wait a moment before trying again.`;
    }
    
    if (error.response?.status >= 500) {
        return `🚨 Server error during ${context}. The service may be temporarily unavailable.`;
    }
    
    return `❌ ${context} failed: ${error.message || 'Unknown error'}`;
}

/**
 * Execute multiple operations with fail-fast or fail-safe behavior
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {boolean} failFast - Whether to stop on first failure (default: false)
 * @returns {Promise<Array>} - Array of results or errors
 */
export async function executeMultiple(operations, failFast = false) {
    if (failFast) {
        const results = [];
        for (const op of operations) {
            results.push(await op());
        }
        return results;
    } else {
        return Promise.allSettled(operations.map(op => op()));
    }
}