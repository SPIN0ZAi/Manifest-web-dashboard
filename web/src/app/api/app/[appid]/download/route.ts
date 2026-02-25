import { NextResponse } from 'next/server';
import { getBranchFiles, getFileContent } from '@/lib/github';
import JSZip from 'jszip';

export async function GET(
    request: Request,
    { params }: { params: { appid: string } }
) {
    const { appid } = params;

    if (!/^\d+$/.test(appid)) {
        return NextResponse.json({ success: false, error: 'Invalid AppID' }, { status: 400 });
    }

    try {
        const files = await getBranchFiles(appid);
        if (files.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No files found for this AppID.' },
                { status: 404 }
            );
        }

        const zip = new JSZip();

        // Download each file and add to ZIP
        for (const file of files) {
            try {
                const content = await getFileContent(appid, file.name);
                if (content) {
                    zip.file(file.name, content);
                }
            } catch {
                // Skip files that fail to download
                console.warn(`Failed to download ${file.name} for AppID ${appid}`);
            }
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        return new Response(zipBuffer, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${appid}_manifest.zip"`,
                'Content-Length': String(zipBuffer.length),
            },
        });
    } catch (error) {
        console.error(`Download error for AppID ${appid}:`, error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate download.' },
            { status: 500 }
        );
    }
}
