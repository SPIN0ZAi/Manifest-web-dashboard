import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import AdmZip from 'adm-zip';
import { cleanLuaContent } from '@/lib/luaCleaner';
import { updateFileInBranch } from '@/lib/github';
import { getSteamAppDetails } from '@/lib/steam';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Security check: Only admit user with specific Discord ID
        if (!session || session?.user?.id !== '302125862340526120') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        // define a simple type for zip entries to fix TS implicit any
        interface ZipEntry { isDirectory: boolean; entryName: string; getData: () => Buffer; }
        const typedEntries = entries as ZipEntry[];

        const luaFiles = typedEntries.filter(e => !e.isDirectory && e.entryName.endsWith('.lua'));
        const manifestFiles = typedEntries.filter(e => !e.isDirectory && e.entryName.endsWith('.manifest'));
        const jsonDataFiles = typedEntries.filter(e => {
            if (e.isDirectory) return false;
            const name = e.entryName.split('/').pop()?.toLowerCase();
            return name === 'depotkeys.json' || name === 'appaccesstokens.json';
        });

        if (luaFiles.length === 0 || manifestFiles.length === 0) {
            return NextResponse.json({ error: 'ZIP must contain at least one .lua and one .manifest file' }, { status: 400 });
        }

        const stats = {
            appId: '',
            gameName: 'Unknown Game',
            manifestsCount: 0,
            hasTokens: false,
            hasKeys: false
        };

        // Process only the first Lua file (standard bot behavior constraint per file uploaded)
        const luaEntry = luaFiles[0];
        const match = luaEntry.entryName.match(/(\d+)\.lua$/);
        const appId = match ? match[1] : '';

        if (!appId) {
            return NextResponse.json({ error: 'Could not extract AppID from .lua filename.' }, { status: 400 });
        }

        stats.appId = appId;
        const steamData = await getSteamAppDetails(appId);
        if (steamData && steamData.name) {
            stats.gameName = steamData.name;
        }

        // Clean & Extract Lua info
        const rawLuaContent = luaEntry.getData().toString('utf8');
        const cleanedLuaContent = cleanLuaContent(rawLuaContent, stats.gameName, appId);

        const luaReferencedIds = new Set<string>();
        const idRegex = /(?:addappid|setManifestid|addtoken)\s*\(\s*(\d+)/g;
        let idMatch;
        while ((idMatch = idRegex.exec(rawLuaContent)) !== null) {
            luaReferencedIds.add(idMatch[1]);
        }

        // Find relevant manifests
        const potentialManifests = manifestFiles.filter((manifest: ZipEntry) => {
            const baseName = manifest.entryName.split('/').pop() || manifest.entryName;
            const depotMatch = baseName.match(/^(\d+)_\d+\.manifest$/);
            if (depotMatch) return luaReferencedIds.has(depotMatch[1]);
            return baseName.includes(appId);
        });

        if (potentialManifests.length === 0) {
            return NextResponse.json({ error: `No manifest files matched AppID ${appId} or referenced depot IDs.` }, { status: 400 });
        }

        stats.manifestsCount = potentialManifests.length;

        // Push .lua to GitHub
        let { success, error } = await updateFileInBranch(appId, `${appId}.lua`, cleanedLuaContent, `Uploaded via Admin Web Panel - Lua Update`);
        if (!success) throw new Error(`Failed to push .lua: ${error}`);

        // Push manifests (as raw binary Buffer)
        for (const manifest of potentialManifests) {
            const baseName = manifest.entryName.split('/').pop() || manifest.entryName;
            const binaryBuffer = manifest.getData(); // This is the raw Buffer

            const manifestResult = await updateFileInBranch(
                appId,
                baseName,
                binaryBuffer,
                `Uploaded via Admin Web Panel - Manifest`
            );
            if (!manifestResult.success) {
                console.error(`Failed to push manifest ${baseName}: ${manifestResult.error}`);
            }
        }

        // Push JSONs
        for (const jsonEntry of jsonDataFiles) {
            const baseName = jsonEntry.entryName.split('/').pop() || jsonEntry.entryName;
            if (baseName.toLowerCase() === 'depotkeys.json') stats.hasKeys = true;
            if (baseName.toLowerCase() === 'appaccesstokens.json') stats.hasTokens = true;

            const content = jsonEntry.getData().toString('utf8');
            await updateFileInBranch(appId, baseName.toLowerCase(), content, `Uploaded via Admin Web Panel - JSON update`);
        }

        return NextResponse.json({
            success: true,
            message: `Processed AppID ${appId}`,
            stats
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
