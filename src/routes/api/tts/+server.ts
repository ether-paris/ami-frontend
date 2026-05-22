import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { usage_logs } from "$lib/server/db/schema";
import { Mistral } from "@mistralai/mistralai";
import { resolveMistralVoiceId } from "$lib/server/mistral-voices";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  const body = await request.json().catch(() => {
    throw error(400, "Invalid JSON body");
  });

  const text = typeof body?.text === "string" ? body.text : "";
  const requestedVoiceId =
    typeof body?.voice_id === "string" ? body.voice_id : undefined;

  if (!text) {
    throw error(400, "Text is required");
  }

  const mistralApiKey = process.env.MISTRAL_API_KEY;

  if (!mistralApiKey) {
    throw error(500, "MISTRAL_API_KEY is not set");
  }

  try {
    const client = new Mistral({ apiKey: mistralApiKey });
    const voiceId = await resolveMistralVoiceId(client, requestedVoiceId);
    const response = await client.audio.speech.complete({
      model: "voxtral-mini-tts-2603",
      input: text,
      ...(voiceId ? { voiceId } : {}),
    });

    if (!("audioData" in response)) {
      throw error(500, "Invalid response format from Mistral TTS API");
    }

    const audioBuffer = Buffer.from(response.audioData, "base64");

    // Log usage
    if (locals.user) {
      await db.insert(usage_logs).values({
        user_id: locals.user.id,
        resource_type: "tts",
        characters_processed: text.length,
        tokens_consumed: text.length,
      });
    }

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e: any) {
    console.error("[mistral] TTS generation failed:", e);
    throw error(500, e?.message || "Failed to generate speech");
  }
};
