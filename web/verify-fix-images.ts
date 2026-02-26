/**
 * verify-fix-images.ts
 * 1. Pulls every game from the DB
 * 2. Tests if its image URL actually loads (HTTP HEAD)
 * 3. If broken, searches Steam for the real AppID and re-assigns the image
 * 4. For games that can't be found on Steam at all, tries IGDB-style fallback
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const GameSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    steamAppId: { type: String },
    title: { type: String, required: true },
    status: { type: String },
    releaseDate: { type: String },
    drm: { type: String },
    image: { type: String },
    cracker: { type: String },
    crackDate: { type: String },
    notes: { type: String },
}, { timestamps: true });

const Game = mongoose.models.Game || mongoose.model('Game', GameSchema);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function testImageUrl(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        // Steam returns 200 even for missing images but with content-type text/html
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.startsWith('image');
    } catch {
        return false;
    }
}

async function steamSearchReal(title: string): Promise<number | null> {
    // Try multiple search variations
    const variations = [
        title,
        title.replace(/[™®©:!]/g, ''),
        title.replace(/[™®©:!\-\+]/g, ' ').replace(/\s+/g, ' ').trim(),
        title.split(':')[0].trim(), // Just the main part before colon
        title.split('-')[0].trim(),
    ];

    for (const q of variations) {
        try {
            const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (data?.items?.length > 0) {
                // Try to find exact match first
                const exactMatch = data.items.find((item: any) =>
                    item.name.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                    title.toLowerCase().replace(/[^a-z0-9]/g, '')
                );
                return exactMatch?.id || data.items[0].id;
            }
        } catch { }
        await sleep(300);
    }
    return null;
}

async function getDetailsImage(appId: number): Promise<string | null> {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const entry = data?.[String(appId)]?.data;
        return entry?.header_image || null;
    } catch {
        return null;
    }
}

async function run() {
    if (!process.env.MONGODB_URI) { console.error('Missing MONGODB_URI'); process.exit(1); }
    console.log('Connecting...');
    await mongoose.connect(process.env.MONGODB_URI);

    const allGames = await Game.find({}).lean();
    console.log(`Checking ${allGames.length} games...\n`);

    let broken = 0;
    let fixed = 0;
    let unfixable = 0;

    for (const game of allGames) {
        const g = game as any;
        const imageUrl = g.image;

        // Test if image works
        let imageOk = false;
        if (imageUrl) {
            imageOk = await testImageUrl(imageUrl);
        }

        if (imageOk) continue; // Image is fine, skip

        broken++;
        console.log(`✗ BROKEN: ${g.title} (${g.id})`);
        console.log(`  Current URL: ${imageUrl || 'NONE'}`);

        // Try to find real Steam AppID
        const realAppId = await steamSearchReal(g.title);
        await sleep(400);

        if (realAppId) {
            // Get the REAL header image from Steam details
            const detailsImage = await getDetailsImage(realAppId);
            await sleep(400);

            if (detailsImage) {
                // Verify the details image works
                const works = await testImageUrl(detailsImage);
                if (works) {
                    await Game.updateOne({ _id: g._id }, {
                        $set: {
                            image: detailsImage,
                            steamAppId: String(realAppId)
                        }
                    });
                    console.log(`  ✓ FIXED with Steam details: AppID ${realAppId}`);
                    fixed++;
                    continue;
                }
            }

            // Fallback: try Steam CDN directly
            const cdnUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${realAppId}/header.jpg`;
            const cdnWorks = await testImageUrl(cdnUrl);
            if (cdnWorks) {
                await Game.updateOne({ _id: g._id }, {
                    $set: { image: cdnUrl, steamAppId: String(realAppId) }
                });
                console.log(`  ✓ FIXED with Steam CDN: AppID ${realAppId}`);
                fixed++;
                continue;
            }
        }

        // If we have a steamAppId already, try the old CDN format
        if (g.steamAppId) {
            const oldCdn = `https://cdn.akamai.steamstatic.com/steam/apps/${g.steamAppId}/header.jpg`;
            const oldWorks = await testImageUrl(oldCdn);
            if (oldWorks) {
                await Game.updateOne({ _id: g._id }, { $set: { image: oldCdn } });
                console.log(`  ✓ FIXED with old CDN format: AppID ${g.steamAppId}`);
                fixed++;
                continue;
            }
        }

        console.log(`  ✗ UNFIXABLE — no working image found`);
        // Clear the broken URL so the UI fallback kicks in
        await Game.updateOne({ _id: g._id }, { $set: { image: '' } });
        unfixable++;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total games: ${allGames.length}`);
    console.log(`Broken images: ${broken}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Unfixable (will use UI fallback): ${unfixable}`);
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
