import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_VERSIONS_PATH = path.join(process.cwd(), 'keys', 'game_versions.json');

class ManifestProcessor {
    constructor() {
        this.depotKeysPath = path.join(process.cwd(), 'keys', 'depotkeys.json');
        this.depotKeys = null;
    }

    async loadDepotKeys() {
        try {
            const data = await fs.readFile(this.depotKeysPath, 'utf8');
            this.depotKeys = JSON.parse(data);
            console.log('Depot keys loaded successfully');
        } catch (error) {
            console.error('Failed to load depot keys:', error);
            throw new Error('Failed to load depot keys');
        }
    }

    async processManifest(manifestPath, appId) {
        try {
            // Ensure depot keys are loaded
            if (!this.depotKeys) {
                await this.loadDepotKeys();
            }

            // Read and parse the manifest file
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifestLines = manifestContent.split('\n');
            
            // Extract depot IDs and their corresponding information
            const depots = {};
            let currentDepotId = null;

            for (const line of manifestLines) {
                const trimmedLine = line.trim();
                
                // Look for depot ID
                if (trimmedLine.startsWith('"depots"')) {
                    continue;
                }
                
                const depotMatch = trimmedLine.match(/"(\d+)"/);
                if (depotMatch) {
                    currentDepotId = depotMatch[1];
                    depots[currentDepotId] = {};
                }

                // Look for manifest ID if we have a current depot
                if (currentDepotId) {
                    const manifestMatch = trimmedLine.match(/"manifest"\s+"(\d+)"/);
                    if (manifestMatch) {
                        depots[currentDepotId].manifest = manifestMatch[1];
                    }
                }
            }

            // Generate Lua content
            const luaContent = this.generateLuaContent(appId, depots);
            
            // Save Lua file
            const luaPath = path.join(path.dirname(manifestPath), `${appId}.lua`);
            await fs.writeFile(luaPath, luaContent, 'utf8');
            
            console.log(`Generated Lua file at: ${luaPath}`);
            return luaPath;

        } catch (error) {
            console.error('Failed to process manifest:', error);
            throw new Error('Failed to process manifest');
        }
    }

    generateLuaContent(appId, depots) {
        let luaContent = `return {\n    ["${appId}"] = {\n`;
        
        for (const [depotId, depotInfo] of Object.entries(depots)) {
            const depotKey = this.depotKeys[depotId];
            if (depotKey) {
                luaContent += `        ["${depotId}"] = {\n`;
                luaContent += `            manifest = "${depotInfo.manifest}",\n`;
                luaContent += `            key = "${depotKey}"\n`;
                luaContent += `        },\n`;
            }
        }
        
        luaContent += '    }\n}';
        return luaContent;
    }
}

const manifestProcessor = new ManifestProcessor();
export default manifestProcessor;

export function getStoredBuildVersion(appId) {
    try {
        if (!fs.existsSync(GAME_VERSIONS_PATH)) return null;
        const data = JSON.parse(fs.readFileSync(GAME_VERSIONS_PATH, 'utf8'));
        return data[appId] || null;
    } catch (e) {
        return null;
    }
}

export function setStoredBuildVersion(appId, buildVersion) {
    let data = {};
    try {
        if (fs.existsSync(GAME_VERSIONS_PATH)) {
            data = JSON.parse(fs.readFileSync(GAME_VERSIONS_PATH, 'utf8'));
        }
    } catch (e) {}
    data[appId] = buildVersion;
    fs.writeFileSync(GAME_VERSIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
} 