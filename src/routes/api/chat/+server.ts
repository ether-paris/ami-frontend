import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const BACKEND_URL = process.env.BACKEND_URL || 'https://api-ami.ether.paris';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const payload = {
            messages:
                typeof body?.message === 'string' && body.message.trim()
                    ? [{ role: 'user', content: body.message.trim() }]
                    : [],
            audio_base64: typeof body?.audio === 'string' ? body.audio : undefined
        };

        const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw error(res.status, data?.message || 'Backend request failed');
        }

        return json(data, {
            status: res.status
        });
    } catch (err) {
        console.error('Backend proxy error:', err);
        throw error(500, 'Error communicating with internal backend');
    }
};
