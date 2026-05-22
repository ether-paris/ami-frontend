import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => {
        throw error(400, 'Invalid JSON body');
    });

    const { text } = body;

    if (!text || typeof text !== 'string') {
        throw error(400, 'Text is required');
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;

    if (!googleApiKey) {
        throw error(500, 'GOOGLE_API_KEY is not set');
    }

    try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: { text: text },
                voice: { languageCode: 'fr-FR', name: 'fr-FR-Neural2-B' },
                audioConfig: { audioEncoding: 'MP3' }
            })
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        const binaryString = atob(data.audioContent);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes.buffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400'
            }
        });

    } catch (e: any) {
        console.error('[google] TTS generation failed:', e);
        throw error(500, e?.message || 'Failed to generate speech');
    }
};
