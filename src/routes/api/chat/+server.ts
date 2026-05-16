import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Resolves internally within the Kubernetes 'ether' namespace to the ami-backend service
const BACKEND_URL = process.env.BACKEND_URL || 'http://ami-backend.ether.svc.cluster.local';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.text();
        
        const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body
        });

        const data = await res.text();

        return new Response(data, {
            status: res.status,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (err) {
        console.error('Backend proxy error:', err);
        throw error(500, 'Error communicating with internal backend');
    }
};