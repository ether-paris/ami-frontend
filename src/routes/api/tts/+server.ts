import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => {
        throw error(400, 'Invalid JSON body');
    });

    const { text, voice = 'ff_siwis', language = 'fr-fr', speed = 1.0 } = body;

    if (!text || typeof text !== 'string') {
        throw error(400, 'Text is required');
    }

    // You can set KOKORO_API_URL in your environment variables.
    // Defaulting to the deployed ingress for local development if not provided.
    const apiUrl = process.env.KOKORO_API_URL || 'http://kokoro.ether.paris';
    const endpoint = `${apiUrl}/v1/audio/speech`;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'kokoro',
                input: text,
                voice: voice,
                response_format: 'mp3',
                speed: speed
            })
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            console.error('Kokoro TTS error:', res.status, errorText);
            throw error(res.status, `TTS Service Error: ${errorText}`);
        }

        const audioBuffer = await res.arrayBuffer();
        
        return new Response(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400'
            }
        });
    } catch (e) {
        console.error('Kokoro TTS connection failed:', e);
        throw error(500, 'Failed to connect to TTS service');
    }
};
