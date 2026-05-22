import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Expected environment variables in your .env file:
// TTS_PROVIDER="google" # options: "google", "elevenlabs", "openai"
// GOOGLE_API_KEY="..."
// ELEVENLABS_API_KEY="..."
// OPENAI_API_KEY="..."

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => {
        throw error(400, 'Invalid JSON body');
    });

    const { text, provider: requestedProvider } = body;

    if (!text || typeof text !== 'string') {
        throw error(400, 'Text is required');
    }

    // Use requested provider or fallback to env variable, then default to whichever key exists
    let provider = requestedProvider || env.TTS_PROVIDER;

    // Prioritize free tiers first: Google > ElevenLabs > OpenAI
    if (!provider) {
        if (env.GOOGLE_API_KEY) provider = 'google';
        else if (env.ELEVENLABS_API_KEY) provider = 'elevenlabs';
        else if (env.OPENAI_API_KEY) provider = 'openai';
        else throw error(500, 'No TTS provider configured. Please add an API key to your .env file.');
    }

    try {
        let audioBuffer: ArrayBuffer;
        let contentType = 'audio/mpeg';

        if (provider === 'google') {
            if (!env.GOOGLE_API_KEY) throw error(500, 'GOOGLE_API_KEY is not set');
            const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: text },
                    voice: { languageCode: 'fr-FR', name: 'fr-FR-Neural2-B' }, // Premium French Voice
                    audioConfig: { audioEncoding: 'MP3' }
                })
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            // Google returns base64 encoded audio
            const binaryString = atob(data.audioContent);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            audioBuffer = bytes.buffer;
        } 
        else if (provider === 'elevenlabs') {
            if (!env.ELEVENLABS_API_KEY) throw error(500, 'ELEVENLABS_API_KEY is not set');
            // Using "Rachel" as a default voice id, you can replace this with a French voice ID
            const voiceId = '21m00Tcm4TlvDq8ikWAM'; 
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2', // Multilingual model is better for French
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
                })
            });
            if (!res.ok) throw new Error(await res.text());
            audioBuffer = await res.arrayBuffer();
        } 
        else if (provider === 'openai') {
            if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY is not set');
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy' // You can change this to: echo, fable, onyx, nova, or shimmer
                })
            });
            if (!res.ok) throw new Error(await res.text());
            audioBuffer = await res.arrayBuffer();
        } 
        else {
            throw error(400, `Unsupported TTS provider: ${provider}`);
        }

        return new Response(audioBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400'
            }
        });

    } catch (e: any) {
        console.error(`[${provider}] TTS generation failed:`, e);
        throw error(500, e?.message || 'Failed to generate speech');
    }
};
