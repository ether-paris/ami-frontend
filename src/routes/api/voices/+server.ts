import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Mistral } from '@mistralai/mistralai';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!mistralApiKey) {
        throw error(500, 'MISTRAL_API_KEY is not set');
    }

    try {
        const client = new Mistral({ apiKey: mistralApiKey });
        const response = await client.audio.voices.list();
        return json(response.items);
    } catch (e: any) {
        console.error('[mistral] Failed to fetch voices:', e);
        throw error(500, e?.message || 'Failed to fetch voices');
    }
};
