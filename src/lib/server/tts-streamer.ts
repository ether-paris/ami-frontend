import { Buffer } from 'node:buffer';
import { Mistral } from '@mistralai/mistralai';

/**
 * Highly optimized streaming middleware for converting an async token stream 
 * (LLM output) into an ordered sequence of synthesized audio chunks.
 *
 * Features:
 * - Detects French phrase terminators without stripping essential spacing.
 * - Dispatches chunks immediately to minimize Time-To-First-Audio.
 * - Guarantees strict gapless playback ordering via Promise orchestration.
 * - Automatically halts audio generation if "Petite leçon :" is encountered.
 */
export async function* streamFrenchAudioChunks(
    textStream: AsyncIterable<string>,
    apiKey: string,
    voiceId?: string
): AsyncGenerator<Uint8Array> {
    // Matches French phrase terminators: ., !, ?, or : followed by space or newline
    // Uses capture groups to keep the punctuation attached to the preceding words
    const boundaryRegex = /([.!?:]+(?:\s+|\n))/;
    let textBuffer = '';
    
    // Ordered queue of active Google TTS API requests
    const audioQueue: Promise<Uint8Array>[] = [];
    
    // Orchestration signals
    let resolveTask: ((value: void | PromiseLike<void>) => void) | null = null;
    const triggerTaskAdded = () => {
        if (resolveTask) {
            resolveTask();
        }
    };
    let isTextStreamComplete = false;
    let haltAudioGeneration = false;

    // Helper: Invokes the Mistral TTS API
    const dispatchTTS = async (text: string): Promise<Uint8Array> => {
        try {
            const client = new Mistral({ apiKey: apiKey });
            const response = await client.audio.speech.complete({
                model: 'voxtral-mini-tts-2603',
                input: text,
                ...(voiceId ? { voiceId } : {}),
            });
            
            if ('audioData' in response) {
                return Buffer.from(response.audioData, 'base64');
            }
            
            console.error('[TTS Streamer] Unexpected response format:', response);
            return new Uint8Array(0);
        } catch (err) {
            console.error('[TTS Streamer] API Error:', err);
            return new Uint8Array(0);
        }
    };

    // 1. Background Producer: Consumes text tokens, detects boundaries, and queues TTS tasks
    (async () => {
        try {
            for await (const chunk of textStream) {
                if (haltAudioGeneration) continue;

                textBuffer += chunk;
                
                // Fast-fail: if the lesson marker is detected anywhere in the buffer, handle it and halt
                const lowerBuffer = textBuffer.toLowerCase();
                const lessonMatch = lowerBuffer.match(/petite le[c\u00e7]on/);
                
                let match;
                while (!haltAudioGeneration && (match = textBuffer.match(boundaryRegex)) !== null) {
                    const boundaryIndex = match.index! + match[0].length;
                    
                    // If the lesson marker appears *before* this boundary, slice up to the marker and halt
                    if (lessonMatch && lessonMatch.index !== undefined && lessonMatch.index < boundaryIndex) {
                        const preLessonText = textBuffer.slice(0, lessonMatch.index);
                        if (preLessonText.trim().length > 0) {
                            audioQueue.push(dispatchTTS(preLessonText));
                            triggerTaskAdded();
                        }
                        haltAudioGeneration = true;
                        break;
                    }

                    // Extract the complete sentence including punctuation and spacing
                    const sentence = textBuffer.slice(0, boundaryIndex);
                    textBuffer = textBuffer.slice(boundaryIndex);
                    
                    if (sentence.trim().length > 0) {
                        audioQueue.push(dispatchTTS(sentence));
                        triggerTaskAdded(); // Wake up the consumer
                    }
                }
            }

            // Stream ended: Force-flush any remaining un-terminated text
            if (!haltAudioGeneration && textBuffer.trim().length > 0) {
                const finalLessonMatch = textBuffer.toLowerCase().match(/petite le[c\u00e7]on/);
                if (finalLessonMatch && finalLessonMatch.index !== undefined) {
                    const finalPreLesson = textBuffer.slice(0, finalLessonMatch.index);
                    if (finalPreLesson.trim().length > 0) {
                        audioQueue.push(dispatchTTS(finalPreLesson));
                    }
                } else {
                    audioQueue.push(dispatchTTS(textBuffer));
                }
                triggerTaskAdded();
            }
        } finally {
            isTextStreamComplete = true;
            triggerTaskAdded();
        }
    })();

    // 2. Foreground Consumer: Yields completed audio buffers strictly in the order they were queued
    let currentIndex = 0;
    while (true) {
        if (currentIndex < audioQueue.length) {
            // Awaiting ensures gapless sequential extraction, even if request N+1 finished before N
            const audioChunk = await audioQueue[currentIndex];
            if (audioChunk.length > 0) {
                yield audioChunk;
            }
            currentIndex++;
        } else if (isTextStreamComplete) {
            break; // No more tasks queued and the text stream is exhausted
        } else {
            // Await the next sentence being queued to avoid hot-looping
            await new Promise<void>(resolve => { resolveTask = resolve; });
            resolveTask = null;
        }
    }
}
