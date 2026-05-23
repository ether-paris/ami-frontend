import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { streamFrenchAudioChunks } from "$lib/server/tts-streamer";
import { resolveMistralVoiceId } from "$lib/server/mistral-voices";
import { db } from "$lib/server/db";
import { usage_logs } from "$lib/server/db/schema";
import { Mistral } from "@mistralai/mistralai";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<any>;
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
            await new Promise<void>((res) => {
              resolve = res;
            });
            resolve = null;
          }
          if (queue.length > 0) {
            return { value: queue.shift() as T, done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };

  return { push, end, iterable };
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      //adding comment
    };
  }>;
};

type GroqTranscription = {
  text?: string;
};

type MistralTranscription = {
  text?: string;
};

const SYSTEM_PROMPT = `You are an expert, native French tutor. Respond ONLY in French.

For each user message (which will already be transcribed text):
1. Give a natural, conversational response in French.
2. If (and ONLY if) there are genuine grammatical or vocabulary errors, add a brief teaching section.

 CRITICAL RULES:
- Do NOT correct colloquialisms or common idioms (like "Qu'est-ce qu'il y a de beau ?", "Ca roule", etc.). They are perfectly valid French.
- DO NOT drop, smooth out, or filter out natural hesitations (like 'euh', 'ah', 'bah'), false starts, or repeated words. They must be explicitly preserved and analyzed in your feedback.
- If the user's French is natural and correct, DO NOT include a teaching section.
- ABSOLUTELY NO EMOJIS anywhere.
- Keep your conversational response natural and appropriate to the context - it can be brief for simple exchanges or longer for more complex discussions.
- Analyze the user's text for hesitations like 'euh', repetitions, and speech patterns mentioned in the transcription.
- The teaching section MUST be in French, not English.

Teaching section format (if needed):
"Petite leçon :
- [correction 1]
- [correction 2]"

Output format:
{
  "petit_lecon": "A concise French grammatical analysis of syntax errors, incorrect genders, speech patterns, hesitations, repeated words, and accent characteristics. Include corrections and pacing observations even if the user specifically asks for a lesson to improve their French, not just when there are major errors. Feel free to provide feedback on pronunciation and conversational flow when relevant.",
  "conversation": "A natural, intermediate-level continuation of the French conversation roleplay. Always end with an open-ended question to encourage further conversation."
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
      content:
        typeof message.content === "string"
          ? message.content.trim()
          : message.content,
    }));
};

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/mp3": "mp3",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

const getAudioFileDetails = (mimeType?: string) => {
  const cleanMimeType =
    typeof mimeType === "string"
      ? mimeType.split(";")[0].trim().toLowerCase()
      : "";
  const type =
    cleanMimeType && AUDIO_EXTENSION_BY_MIME[cleanMimeType]
      ? cleanMimeType
      : "audio/webm";
  const ext = AUDIO_EXTENSION_BY_MIME[type] || "webm";
  return {
    type,
    filename: `audio.${ext}`,
  };
};

const transcribeAudio = async (
  audioBase64: string,
  mimeType?: string,
  preferredService?: string,
  locals?: App.Locals,
) => {
  const { type, filename } = getAudioFileDetails(mimeType);

  // Special handling for Bassem SABBAGH - allow service selection (email only)
  const isBassem =
    locals && locals.user && locals.user.email === "bassem.bme@gmail.com";
  const forceService = isBassem && preferredService ? preferredService : null;

  // Try the forced service first if specified (for Bassem)
  if (forceService) {
    if (forceService === "groq") {
      try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (groqApiKey) {
          const audioBytes = Buffer.from(audioBase64, "base64");
          const form = new FormData();
          form.append("file", new Blob([audioBytes], { type }), filename);
          form.append("model", "whisper-large-v3");
          form.append("language", "fr");
          form.append("response_format", "json");
          form.append("temperature", "0.4");
          form.append(
            "prompt",
            "Euh, ben, alors... je, je me disais que... tu vois, ah, c'est comme ça.",
          );

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

          if (res.ok) {
            const data = (await res.json()) as GroqTranscription;
            console.log(`[Bassem] Using forced Groq transcription`);
            return data.text?.trim() || "";
          }
        }
      } catch (e) {
        console.warn("Forced Groq transcription failed:", e);
      }
    } else if (forceService === "mistral") {
      try {
        const mistralApiKey = process.env.MISTRAL_API_KEY;
        if (mistralApiKey) {
          const client = new Mistral({ apiKey: mistralApiKey });
          const audioBytes = Buffer.from(audioBase64, "base64");

          const response = await client.audio.transcriptions.complete({
            model: "voxtral-mini-latest",
            file: new File([audioBytes], filename, { type }),
            language: "fr",
            temperature: 0.4,
            timestampGranularities: ["word"],
          });

          console.log(`[Bassem] Using forced Mistral transcription`);
          return response.text?.trim() || "";
        }
      } catch (e) {
        console.warn("Forced Mistral transcription failed:", e);
      }
    }
  }

  // Default behavior: Try Groq first, then Mistral
  try {
    const groqApiKey = process.env.GROQ_API_KEY;

    if (groqApiKey) {
      const audioBytes = Buffer.from(audioBase64, "base64");
      const form = new FormData();
      form.append("file", new Blob([audioBytes], { type }), filename);
      form.append("model", "whisper-large-v3");
      form.append("language", "fr");
      form.append("response_format", "json");
      form.append("temperature", "0.4");
      form.append(
        "prompt",
        "Euh, ben, alors... je, je me disais que... tu vois, ah, c'est comme ça.",
      );

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

      if (res.ok) {
        const data = (await res.json()) as GroqTranscription;
        return data.text?.trim() || "";
      }
    }
  } catch (e) {
    console.warn("Groq transcription failed, falling back to Mistral:", e);
  }

  // Fallback to Mistral
  try {
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!mistralApiKey) {
      throw error(
        500,
        "Both GROQ_API_KEY and MISTRAL_API_KEY are not configured",
      );
    }

    const client = new Mistral({ apiKey: mistralApiKey });
    const audioBytes = Buffer.from(audioBase64, "base64");

    const response = await client.audio.transcriptions.complete({
      model: "voxtral-mini-latest",
      file: new File([audioBytes], filename, { type }),
      language: "fr",
      temperature: 0.4,
      timestampGranularities: ["word"],
    });

    return response.text?.trim() || "";
  } catch (e) {
    console.error("Mistral transcription failed:", e);
    throw error(502, "All transcription services failed");
  }
};

const splitLesson = (data: MistralResponse) => {
  return {
    reply: data.conversation,
    lesson: data.petit_lecon,
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
  const audioMimeType =
    typeof body?.audioMimeType === "string" ? body.audioMimeType : undefined;
  const requestedVoiceId =
    typeof body?.voice_id === "string" ? body.voice_id : undefined;

  // Extract transcription service preference if provided
  const preferredTranscriptionService =
    typeof body?.transcription_service === "string"
      ? body.transcription_service.toLowerCase()
      : undefined;

  if (audioBase64) {
    transcript = await transcribeAudio(
      audioBase64,
      audioMimeType,
      preferredTranscriptionService,
      locals,
    );

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

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (type: string, payload?: any) => {
          const data = JSON.stringify({ type, ...payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const ttsEnabled = Boolean(body?.ttsEnabled);
        let resolvedVoiceId: string | undefined;

        if (ttsEnabled) {
          const voiceClient = new Mistral({ apiKey: mistralApiKey });
          resolvedVoiceId = await resolveMistralVoiceId(
            voiceClient,
            requestedVoiceId,
          );
        }

        if (transcript) {
          sendEvent("transcript", { text: transcript });
        }

        try {
          const client = new Mistral({ apiKey: mistralApiKey });
          const response = await client.chat.complete({
            model: "voxtral-small-latest",
            messages: requestMessages,
            responseFormat: { type: "json_object" },
          });

          const data = response.choices?.[0]?.message?.content;
          if (!data || typeof data !== "string") {
            throw new Error("No response content from Mistral API");
          }

          const parsedData: MistralResponse = JSON.parse(data);
          const { reply, lesson } = splitLesson(parsedData);

          sendEvent("chunk", { text: reply });

          if (ttsEnabled) {
            try {
              const audioResponse = await client.audio.speech.complete({
                model: "voxtral-mini-tts-2603",
                input: reply,
                voiceId: resolvedVoiceId,
              });
              if ("audioData" in audioResponse) {
                sendEvent("audio", { data: audioResponse.audioData });
              }
            } catch (err) {
              console.error("Chat TTS generation failed:", err);
            }
          }

          if (
            lesson &&
            !lesson.toLowerCase().includes("aucune correction nécessaire") &&
            !lesson.toLowerCase().includes("no corrections needed") &&
            !lesson
              .toLowerCase()
              .includes("aucune erreur grammaticale ou de vocabulaire")
          ) {
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

          sendEvent("done");
        } catch (e) {
          console.error("Mistral API error:", e);
          sendEvent("error", {
            message: "Sorry, I encountered an error processing your request.",
          });
        } finally {
          controller.close();
        }
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
