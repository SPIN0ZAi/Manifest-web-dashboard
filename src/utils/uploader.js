import axios from 'axios';
import FormData from 'form-data';

const GofileToken = process.env.GOFILE_TOKEN; // Recommended for premium accounts

/**
 * Uploads a file to GoFile.io.
 * @param {Buffer} fileBuffer The file content as a buffer.
 * @param {string} fileName The name of the file.
 * @returns {Promise<string>} The direct download link for the file.
 * @throws {Error} If the upload fails.
 */
async function uploadToGoFile(fileBuffer, fileName) {
    const form = new FormData();
    form.append('file', fileBuffer, fileName);

    if (GofileToken) {
        form.append('token', GofileToken);
    }

    try {
        const response = await axios.post('https://upload.gofile.io/uploadFile', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000, // Increased to 120 seconds for large files
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data.status === 'ok') {
            return response.data.data.downloadPage;
        } else {
            throw new Error(response.data.status || 'Unknown GoFile API error.');
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error('The file upload to GoFile.io timed out.');
        }
        console.error('GoFile upload failed:', error.message);
        throw new Error(`GoFile upload failed: ${error.message}`);
    }
}

/**
 * Uploads a file to tmpfiles.org.
 * @param {Buffer} fileBuffer The file content as a buffer.
 * @param {string} fileName The name of the file.
 * @returns {Promise<string>} The direct download link for the file.
 */
async function uploadToTmpfiles(fileBuffer, fileName) {
    const form = new FormData();
    form.append('file', fileBuffer, fileName);

    try {
        const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data.status === 'success') {
            return response.data.data.url;
        } else {
            throw new Error(response.data.error?.message || 'Unknown tmpfiles.org API error.');
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error('The file upload to tmpfiles.org timed out.');
        }
        console.error('tmpfiles.org upload failed:', error.message);
        throw new Error(`tmpfiles.org upload failed: ${error.message}`);
    }
}

/**
 * Uploads a file to file.io
 * @param {Buffer} fileBuffer The file content as a buffer.
 * @param {string} fileName The name of the file.
 * @returns {Promise<string>} The direct download link for the file.
 */
async function uploadToFileIo(fileBuffer, fileName) {
    const form = new FormData();
    form.append('file', fileBuffer, fileName);

    try {
        const response = await axios.post('https://file.io', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data.success) {
            return response.data.link;
        } else {
            throw new Error(response.data.error || 'Unknown file.io API error.');
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error('The file upload to file.io timed out.');
        }
        console.error('file.io upload failed:', error.message);
        throw new Error(`file.io upload failed: ${error.message}`);
    }
}

/**
 * Uploads a file to 0x0.st
 * @param {Buffer} fileBuffer The file content as a buffer.
 * @param {string} fileName The name of the file.
 * @returns {Promise<string>} The direct download link for the file.
 */
async function uploadToNullPointer(fileBuffer, fileName) {
    const form = new FormData();
    form.append('file', fileBuffer, fileName);

    try {
        const response = await axios.post('https://0x0.st', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 0x0.st returns just the URL as plain text
        if (response.data && typeof response.data === 'string' && response.data.startsWith('https://')) {
            return response.data.trim();
        } else {
            throw new Error('Invalid response from 0x0.st');
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error('The file upload to 0x0.st timed out.');
        }
        console.error('0x0.st upload failed:', error.message);
        throw new Error(`0x0.st upload failed: ${error.message}`);
    }
}

/**
 * Upload services in order of preference
 */
const uploadServices = [
    { name: 'GoFile.io', func: uploadToGoFile, priority: 1 },
    { name: 'tmpfiles.org', func: uploadToTmpfiles, priority: 2 },
    { name: 'file.io', func: uploadToFileIo, priority: 3 },
    { name: '0x0.st', func: uploadToNullPointer, priority: 4 }
];

/**
 * Enhanced upload system with multiple fallbacks and retry logic
 * @param {Buffer} fileBuffer The file content as a buffer.
 * @param {string} fileName The name of the file.
 * @param {number} retryCount Number of retries per service (default: 2)
 * @returns {Promise<string>} The download link.
 */
export async function uploadFile(fileBuffer, fileName, retryCount = 2) {
    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
    console.log(`🚀 Starting upload: ${fileName} (${fileSizeMB}MB)`);
    
    let lastError = null;
    
    for (const service of uploadServices) {
        console.log(`📤 Trying ${service.name}...`);
        
        for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
            try {
                const startTime = Date.now();
                const link = await service.func(fileBuffer, fileName);
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                
                console.log(`✅ Successfully uploaded to ${service.name} in ${duration}s: ${link}`);
                return link;
                
            } catch (error) {
                lastError = error;
                const attemptText = attempt <= retryCount ? `attempt ${attempt}/${retryCount + 1}` : 'final attempt';
                console.error(`❌ ${service.name} upload failed (${attemptText}): ${error.message}`);
                
                // Wait before retry (exponential backoff)
                if (attempt <= retryCount) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        console.log(`⚠️ ${service.name} failed after ${retryCount + 1} attempts, trying next service...`);
    }
    
    // All services failed
    console.error(`💥 All upload services failed. Last error: ${lastError?.message}`);
    throw new Error(`Upload failed: All ${uploadServices.length} services are unavailable. Last error: ${lastError?.message}`);
} 