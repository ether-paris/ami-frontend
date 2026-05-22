import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { streamFrenchAudioChunks } from "$lib/server/tts-streamer";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

Teaching section format (if needed):
"Petite lecon :
- [correction 1]
- [correction 2]"`;

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
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw error(500, "GROQ_API_KEY is not configured");
  }

  const audioBytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBytes], { type: "audio/webm" }),
    "audio.webm",
  );
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "fr");
  form.append("response_format", "json");

  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: form,
    },
  );

  if (!res.ok) {
    throw error(502, "Audio transcription failed");
  }

  const data = (await res.json()) as GroqTranscription;

  return data.text?.trim() || "";
};

const splitLesson = (text: string) => {
  const cleanText = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const lessonMatch = cleanText.match(/petite le[c\u00e7]on/i);

  if (!lessonMatch || lessonMatch.index === undefined) {
    return { reply: cleanText, lesson: null, fullText: cleanText };
  }

  return {
    reply: cleanText.slice(0, lessonMatch.index).trimEnd(),
    lesson: cleanText.slice(lessonMatch.index).trimEnd(),
    fullText: cleanText,
  };
};

export const POST: RequestHandler = async ({ request }) => {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    throw error(500, "OPENROUTER_API_KEY is not configured");
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

    const MODELS_TO_TRY = [
        'openai/gpt-oss-120b:free',
        'deepseek/deepseek-v4-flash:free',
        'qwen/qwen3-next-80b-a3b-instruct:free',
        'google/gemma-4-26b-a4b-it:free',
        'minimax/minimax-m2.5:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'openrouter/free'
    ];

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (type: string, payload?: any) => {
          const data = JSON.stringify({ type, ...payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const ttsEnabled = Boolean(body?.ttsEnabled);
        const googleApiKey = process.env.GOOGLE_API_KEY;
        const textQueue = createPushable<string>();
        let audioTask: Promise<void> | null = null;

        if (ttsEnabled && googleApiKey) {
            audioTask = (async () => {
                try {
                    for await (const chunk of streamFrenchAudioChunks(textQueue.iterable, googleApiKey)) {
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

        let success = false;
        let lastErrorStatus = 502;

        for (const model of MODELS_TO_TRY) {
          console.log(`Trying OpenRouter model: ${model}...`);

          const abortController = new AbortController();
          // 1.5 second TTFB timeout
          const timeoutId = setTimeout(() => abortController.abort(), 1500);

          try {
            const res = await fetch(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openRouterApiKey}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://ami.ether.paris",
                  "X-OpenRouter-Title": "Ami French Tutor",
                },
                        body: JSON.stringify({
                            model: model,
                            stream: true,
                            max_tokens: 1000,
                            messages: requestMessages
                        }),
                signal: abortController.signal,
              },
            );

            if (!res.ok) {
              clearTimeout(timeoutId);
              const errorText = await res
                .text()
                .catch(() => "Could not read error body");
              console.warn(
                `Model ${model} failed with ${res.status}:`,
                errorText,
              );
              lastErrorStatus = res.status;
              continue;
            }

            const reader = res.body?.getReader();
            if (!reader) {
              clearTimeout(timeoutId);
              continue;
            }

            const decoder = new TextDecoder();
            let firstChunkReceived = false;

            while (true) {
              const { value, done } = await reader.read();

              if (!firstChunkReceived) {
                firstChunkReceived = true;
                clearTimeout(timeoutId); // Got TTFB, cancel timeout!
                console.log(`Success with model: ${model} (Stream started)`);
                success = true;
              }

              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");

              for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const text = data.choices?.[0]?.delta?.content;
                    if (text) {
                      sendEvent("chunk", { text });
                      if (ttsEnabled) textQueue.push(text);
                    }
                  } catch (e) {
                    // ignore malformed JSON chunks
                  }
                }
              }
            }

            if (success) {
                textQueue.end();
                break;
            }
          } catch (e) {
            clearTimeout(timeoutId);
            const error = e as Error;
            if (error.name === "AbortError") {
              console.warn(`Model ${model} timed out after 1.5 seconds.`);
            } else {
              console.warn(`Model ${model} threw an error:`, error.message);
            }
          }
        }

        if (!success) {
          console.error("All models in the hierarchy failed or timed out.");
          sendEvent("error", {
            message: `All models failed (Last status: ${lastErrorStatus})`,
          });
          textQueue.end();
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
