import { Mistral } from '@mistralai/mistralai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.error("MISTRAL_API_KEY is not defined!");
  process.exit(1);
}

const client = new Mistral({ apiKey });

// 1. Let's test the standard multimodal format for audio:
// { type: "audio_url", audioUrl: "data:audio/webm;base64,..." }
// or { type: "audio_url", audioUrl: { url: "data:audio/webm;base64,..." } }

try {
  console.log("Testing with audioUrl as object { url }...");
  const response = await client.chat.complete({
    model: "voxtral-small-latest",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this audio?" },
          {
            type: "audio_url",
            audioUrl: { url: "data:audio/webm;base64,GkXfo69ChoEBQveBAULygQRC64EPQOqg" }
          }
        ]
      }
    ]
  });
  console.log("Success with { url }!", response.choices?.[0]?.message?.content);
} catch (err) {
  console.log("Failed with { url }:", err.message);
}

try {
  console.log("Testing with audioUrl as direct string...");
  const response = await client.chat.complete({
    model: "voxtral-small-latest",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this audio?" },
          {
            type: "audio_url",
            audioUrl: "data:audio/webm;base64,GkXfo69ChoEBQveBAULygQRC64EPQOqg"
          }
        ]
      }
    ]
  });
  console.log("Success with string!", response.choices?.[0]?.message?.content);
} catch (err) {
  console.log("Failed with string:", err.message);
}
