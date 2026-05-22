import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { streamFrenchAudioChunks } from "$lib/server/tts-streamer";
import { db } from '$lib/server/db/client';
import { usage_logs } from '$lib/server/db/schema';
import { Mistral } from '@mistralai/mistralai';

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type MistralResponse = {
  petit_lecon: string;
  conversation: string;
};

function createPushable<T>() {
    const queue: T[] = [];
    let resolve: ((value: void | PromiseLike<void>) => void) | null = null;
    let isDone = false;

    const push = (value: T) => {
        queue.push(value);
        if (resolve) resolve();
    };

    const end = () => {
        isDone = true;
        if (resolve) resolve();
    };

    const iterable = {
        [Symbol.asyncIterator]() {
            return {
                async next(): Promise<IteratorResult<T>> {
                    while (queue.length === 0 && !isDone) {
                        await new Promise<void>(res => { resolve = res; });
                        resolve = null;
                    }
                    if (queue.length > 0) {
                        return { value: queue.shift() as T, done: false };
                    }
                    return { value: undefined, done: true };
                }
            };
        }
    };

    return { push, end, iterable };
}

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
- Preserve user hesitations like 'euh' and address them pedagogically in the lesson block.

Teaching section format (if needed):
"Petite lecon :
- [correction 1]
- [correction 2]"

Output format:
{
  "petit_lecon": "A concise English grammatical critique analyzing syntax errors, incorrect genders, and speech hesitations like 'euh'.",
  "conversation": "A natural, intermediate-level continuation of the French conversation roleplay, ending with an open-ended question."
}`;

const normalizeMessages = (messages: unknown): ChatMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message): message is ChatMessage =>
        typeof message === "object" &&
        message !== null &&
        "role" in message &&
        "content" in message &&
        (message.role === "system" ||
          message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
};

const transcribeAudio = async (audioBase64: string) => {
  const mistralApiKey = process.env.MISTRAL_API_KEY;

  if (!mistralApiKey) {
    throw error(500, "MISTRAL_API_KEY is not configured");
  }

  const client = new Mistral({ apiKey: mistralApiKey });
  const audioBytes = Buffer.from(audioBase64, "base64");

  const response = await client.audio.transcriptions.complete({
    model: "voxtral-small-latest",
    file: new Blob([audioBytes], { type: "audio/webm" }),
    language: "fr",
  });

  return response.text?.trim() || "";
};

const splitLesson = (data: MistralResponse) => {
  return {
    reply: data.conversation,
    lesson: data.petit_lecon,
    fullText: `${data.conversation}\n\n${data.petit_lecon}`,
  };
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  
  if (!mistralApiKey) {
    throw error(500, "MISTRAL_API_KEY is not configured");
  }
  
  // Check for user in locals (from hooks.server.ts)
  if (!locals?.user) {
    throw error(401, "Unauthorized");
  }

  if (!event.locals.user) {
    throw error(401, "Unauthorized");
  }

  const body = await request.json().catch(() => {
    throw error(400, "Invalid JSON body");
  });

  const messages = normalizeMessages(body?.messages);

  if (
    messages.length === 0 &&
    typeof body?.message === "string" &&
    body.message.trim()
  ) {
    messages.push({ role: "user", content: body.message.trim() });
  }

  let transcript: string | null = null;
  const audioBase64 = typeof body?.audio === "string" ? body.audio : null;
  const voice_id = typeof body?.voice_id === "string" ? body.voice_id : "fr-male-accent-1";

  if (audioBase64) {
    transcript = await transcribeAudio(audioBase64);

    if (transcript) {
      messages.push({ role: "user", content: transcript });
    }
  }

  if (messages.length === 0) {
    throw error(400, "A message or audio note is required");
  }

  const requestMessages =
    messages[0]?.role === "system"
      ? messages
      : [{ role: "system" as const, content: SYSTEM_PROMPT }, ...messages];

  const client = new Mistral({ apiKey: mistralApiKey });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (type: string, payload?: any) => {
          const data = JSON.stringify({ type, ...payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const ttsEnabled = Boolean(body?.ttsEnabled);
        const textQueue = createPushable<string>();
        let audioTask: Promise<void> | null = null;

        if (ttsEnabled) {
            audioTask = (async () => {
                try {
                    for await (const chunk of streamFrenchAudioChunks(textQueue.iterable, mistralApiKey, voice_id)) {
                        sendEvent('audio', { data: Buffer.from(chunk).toString('base64') });
                    }
                } catch (e) {
                    console.error('TTS streaming error:', e);
                }
            })();
        }

        if (transcript) {
          sendEvent("transcript", { text: transcript });
        }

        try {
          const response = await client.chat.complete({
            model: "voxtral-small-latest",
            messages: requestMessages,
            responseFormat: { type: "json_object" },
          });

          const data = response.choices?.[0]?.message?.content;
          if (!data || typeof data !== 'string') {
            throw new Error("No response content from Mistral API");
          }
          
          const parsedData: MistralResponse = JSON.parse(data);
          const { reply, lesson } = splitLesson(parsedData);

          sendEvent("chunk", { text: reply });
          if (ttsEnabled) textQueue.push(reply);

          if (lesson) {
            sendEvent("lesson", { text: lesson });
          }

          // Log usage
          if (locals.user) {
            await db.insert(usage_logs).values({
              user_id: locals.user.id,
              resource_type: "audio_turn",
              characters_processed: reply.length,
              tokens_consumed: data.length,
            });
          }

        } catch (e) {
          console.error('Mistral API error:', e);
          sendEvent("error", { message: "Failed to process request" });
        }

        if (audioTask) {
            await audioTask;
        }

        sendEvent("done");
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
};
