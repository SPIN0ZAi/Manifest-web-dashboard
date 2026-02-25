import JSZip from 'jszip';
import axios from 'axios';

/**
 * Downloads files from URLs and creates a ZIP archive.
 * @param {Array<{name: string, url: string, content?: string|Buffer}>} files A list of files to download and zip.
 * @returns {Promise<Buffer>} A buffer containing the zipped file data.
 */
export async function createZipArchive(files) {
    const zip = new JSZip();

    const downloadPromises = files.map(file => {
        // If we already have the content (e.g. from manifest files), use it directly
        if (file.content) {
            // If content is already a Buffer, use it as is
            // Otherwise, if it's a string, convert to Buffer
            const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
            zip.file(file.name, content, { binary: true });
            return Promise.resolve();
        }

        // Otherwise download the file with cache busting
        return axios.get(file.url, { 
            responseType: 'arraybuffer',  // Always use arraybuffer for binary safety
            timeout: 15000,
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
            .then(response => {
                // Store all files as binary
                zip.file(file.name, response.data, { binary: true });
            })
            .catch(error => {
                if (error.code === 'ECONNABORTED') {
                    throw new Error(`Download for file \`${file.name}\` timed out.`);
                }
                // Re-throw other errors to be caught by Promise.all
                throw new Error(`Failed to download file \`${file.name}\`.`);
            });
    });

    await Promise.all(downloadPromises);

    return zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 9
        }
    });
} 