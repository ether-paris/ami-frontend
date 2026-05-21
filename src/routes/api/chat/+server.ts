import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type OpenRouterResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
};

type GroqTranscription = {
    text?: string;
};

const SYSTEM_PROMPT = `You are an expert, native French tutor. Respond ONLY in French.

For each user message:
1. FIRST: Give a natural, conversational response.
2. SECOND: If (and ONLY if) there are genuine grammatical or vocabulary errors, add a brief teaching section.

CRITICAL RULES:
- Do NOT correct colloquialisms or common idioms (like "Qu'est-ce qu'il y a de beau ?", "Ca roule", etc.). They are perfectly valid French.
- If the user's French is natural and correct, DO NOT include a teaching section.
- ABSOLUTELY NO EMOJIS anywhere.
- Keep your conversational response brief (1-3 sentences).

Teaching section format (if needed):
"Petite lecon :
- [correction 1]
- [correction 2]"`;

const normalizeMessages = (messages: unknown): ChatMessage[] => {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter(
            (message): message is ChatMessage =>
                typeof message === 'object' &&
                message !== null &&
                'role' in message &&
                'content' in message &&
                (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
                typeof message.content === 'string' &&
                message.content.trim().length > 0
        )
        .map((message) => ({
            role: message.role,
            content: message.content.trim()
        }));
};

const transcribeAudio = async (audioBase64: string) => {
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
        throw error(500, 'GROQ_API_KEY is not configured');
    }

    const audioBytes = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([audioBytes], { type: 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'fr');
    form.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`
        },
        body: form
    });

    if (!res.ok) {
        throw error(502, 'Audio transcription failed');
    }

    const data = (await res.json()) as GroqTranscription;

    return data.text?.trim() || '';
};

const splitLesson = (text: string) => {
    const cleanText = text
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
    const lessonMatch = cleanText.match(/petite le[c\u00e7]on/i);

    if (!lessonMatch || lessonMatch.index === undefined) {
        return { reply: cleanText, lesson: null, fullText: cleanText };
    }

    return {
        reply: cleanText.slice(0, lessonMatch.index).trimEnd(),
        lesson: cleanText.slice(lessonMatch.index).trimEnd(),
        fullText: cleanText
    };
};

export const POST: RequestHandler = async ({ request }) => {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterApiKey) {
        throw error(500, 'OPENROUTER_API_KEY is not configured');
    }

    const body = await request.json().catch(() => {
        throw error(400, 'Invalid JSON body');
    });

    const messages = normalizeMessages(body?.messages);

    if (messages.length === 0 && typeof body?.message === 'string' && body.message.trim()) {
        messages.push({ role: 'user', content: body.message.trim() });
    }

    let transcript: string | null = null;
    const audioBase64 = typeof body?.audio === 'string' ? body.audio : null;

    if (audioBase64) {
        transcript = await transcribeAudio(audioBase64);

        if (transcript) {
            messages.push({ role: 'user', content: transcript });
        }
    }

    if (messages.length === 0) {
        throw error(400, 'A message or audio note is required');
    }

    const requestMessages =
        messages[0]?.role === 'system'
            ? messages
            : [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...messages];

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ami.ether.paris',
            'X-OpenRouter-Title': 'Ami French Tutor'
        },
        body: JSON.stringify({
            model: 'openrouter/free',
            messages: requestMessages
        })
    });

    if (!res.ok) {
        throw error(502, 'AI response failed');
    }

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
        throw error(502, 'AI response was empty');
    }

    const { reply, lesson, fullText } = splitLesson(content);

    return json({
        reply,
        lesson,
        full_text: fullText,
        transcript
    });
};
