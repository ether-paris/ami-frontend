import { Mistral } from '@mistralai/mistralai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.error("MISTRAL_API_KEY is not defined!");
  process.exit(1);
}

const client = new Mistral({ apiKey });
const dummyBase64 = "GkXfo69ChoEBQveBAULygQRC64EPQOqg";

try {
  console.log("Testing with input_audio type...");
  const response = await client.chat.complete({
    model: "voxtral-small-latest",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcription s'il vous plaît." },
          {
            type: "input_audio",
            inputAudio: dummyBase64
          }
        ]
      }
    ]
  });
  console.log("Success with input_audio!", response.choices?.[0]?.message?.content);
} catch (err) {
  console.log("Failed with input_audio:", err.message);
}
