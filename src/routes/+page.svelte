<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  type Message = {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    lesson?: string;
    includeInContext?: boolean;
    pending?: boolean;
    audioUrl?: string;
    audioStatus?: 'idle' | 'generating' | 'ready' | 'blocked' | 'error';
  };

  type ChatHistoryMessage = {
    role: 'user' | 'assistant';
    content: string;
  };

  type VoiceClip = {
    id: number;
    url: string;
    createdAt: number;
    transcript: string | null;
    status: 'recorded' | 'transcribing' | 'ready';
  };

  const API_ENDPOINT = '/api/chat';

  let messages: Message[] = [];
  let nextMessageId = 1;
  let inputText = '';
  let isRecording = false;
  let isThinking = false;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let messagesEl: HTMLDivElement | null = null;
  let clipsEl: HTMLDivElement | null = null;
  let voiceClips: VoiceClip[] = [];
  let nextClipId = 1;
  let activeClipId: number | null = null;

  let ttsEnabled = true;
  let ttsReady = true;
  let activeVoiceName = 'Kokoro (k8s)';
  let ttsError: string | null = null;
  let currentSpeechAudio: HTMLAudioElement | null = null;
  let currentSpeechUrl: string | null = null;

  const KOKORO_VOICE = 'ff_siwis';
  const KOKORO_LANGUAGE = 'fr-fr';

  const assistantIntro =
    'Your French tutor listens, replies out loud, and keeps corrections separate so the conversation stays natural.';

  const createMessage = (
    role: Message['role'],
    text: string,
    options: Pick<Message, 'lesson' | 'includeInContext' | 'pending'> = {}
  ): Message => ({
    id: nextMessageId++,
    role,
    text,
    includeInContext: true,
    ...options
  });

  const toChatHistory = (items: Message[] = messages): ChatHistoryMessage[] =>
    items
      .filter((message) => message.includeInContext !== false && !message.pending && message.text.trim())
      .map((message) => ({
        role: message.role,
        content: message.text.trim()
      }));

  const scrollToLatest = async () => {
    await tick();
    messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  };

  const scrollClipsToLatest = async () => {
    await tick();
    clipsEl?.scrollTo({ top: clipsEl.scrollHeight, behavior: 'smooth' });
  };

  const stopSpeech = () => {
    currentSpeechAudio?.pause();
    currentSpeechAudio = null;
    currentSpeechUrl = null;
  };

  const updateMessageAudio = (messageId: number, patch: Partial<Pick<Message, 'audioUrl' | 'audioStatus'>>) => {
    messages = messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message));
  };

  const generateSpeechUrl = async (text: string) => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        voice: KOKORO_VOICE,
        language: KOKORO_LANGUAGE
      })
    });

    if (!res.ok) {
      throw new Error('TTS generation failed');
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
  };

  const playSpeechUrl = async (url: string) => {
    stopSpeech();
    currentSpeechUrl = url;
    currentSpeechAudio = new Audio(url);
    await currentSpeechAudio.play();
  };

  const speakMessage = async (messageId: number, text: string, autoplay = false) => {
    if (!ttsEnabled || !text.trim()) return;

    const existingMessage = messages.find((message) => message.id === messageId);

    if (existingMessage?.audioUrl) {
      try {
        await playSpeechUrl(existingMessage.audioUrl);
        updateMessageAudio(messageId, { audioStatus: 'ready' });
      } catch (err) {
        console.error('Kokoro playback failed', err);
        updateMessageAudio(messageId, { audioStatus: 'blocked' });
      }
      return;
    }

    try {
      updateMessageAudio(messageId, { audioStatus: 'generating' });
      const url = await generateSpeechUrl(text);
      updateMessageAudio(messageId, { audioUrl: url, audioStatus: 'ready' });

      if (!autoplay) {
        await playSpeechUrl(url);
        return;
      }

      try {
        await playSpeechUrl(url);
      } catch (err) {
        console.warn('Browser blocked automatic Kokoro playback', err);
        updateMessageAudio(messageId, { audioUrl: url, audioStatus: 'blocked' });
      }
    } catch (err) {
      console.error('Kokoro TTS failed', err);
      ttsError = 'Voice needs a tap';
      ttsReady = false;
      updateMessageAudio(messageId, { audioStatus: 'error' });
    }
  };

  const pushAssistantError = (text: string) => {
    messages = [...messages, createMessage('assistant', text, { includeInContext: false })];
    isThinking = false;
    scrollToLatest();
  };

  const addVoiceClip = (audioBlob: Blob) => {
    const url = URL.createObjectURL(audioBlob);
    const clip: VoiceClip = {
      id: nextClipId++,
      url,
      createdAt: Date.now(),
      transcript: null,
      status: 'recorded'
    };

    voiceClips = [clip, ...voiceClips];
    void scrollClipsToLatest();

    return clip;
  };

  const updateVoiceClip = (clipId: number, patch: Partial<Omit<VoiceClip, 'id' | 'url'>>) => {
    voiceClips = voiceClips.map((clip) =>
      clip.id === clipId
        ? {
            ...clip,
            ...patch
          }
        : clip
    );
  };

  const playClip = (clipId: number) => {
    const clip = voiceClips.find((item) => item.id === clipId);
    if (!clip) return;

    if (activeClipId === clipId) {
      const currentAudio = document.getElementById(`clip-audio-${clipId}`) as HTMLAudioElement | null;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      activeClipId = null;
      return;
    }

    activeClipId = clipId;
    const currentAudio = document.getElementById(`clip-audio-${clipId}`) as HTMLAudioElement | null;
    currentAudio?.play().catch(() => {
      activeClipId = null;
    });
  };

  const handleResponse = async (res: Response, pendingMessageId?: number, clipId?: number) => {
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      const message = errorText ? `Error communicating with backend: ${errorText}` : 'Error communicating with backend.';

      if (pendingMessageId) {
        messages = messages.filter((message) => message.id !== pendingMessageId);
      }

      if (clipId) {
        updateVoiceClip(clipId, { status: 'recorded' });
      }

      pushAssistantError(message);
      return;
    }

    const data = await res.json();
    const replyText = typeof data?.reply === 'string' ? data.reply : '';
    const lessonText = typeof data?.lesson === 'string' ? data.lesson : undefined;
    const transcriptText = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
    const assistantMessage = createMessage('assistant', replyText, { lesson: lessonText });

    if (pendingMessageId) {
      messages = messages.map((message) =>
        message.id === pendingMessageId
          ? {
              ...message,
              text: transcriptText || 'Voice note sent',
              includeInContext: Boolean(transcriptText),
              pending: false
            }
          : message
      );

      if (clipId) {
        updateVoiceClip(clipId, {
          transcript: transcriptText || null,
          status: 'ready'
        });
      }
    }

    messages = [...messages, assistantMessage];
    isThinking = false;
    await scrollToLatest();

    // Read only the conversational answer, never the teaching note.
    void speakMessage(assistantMessage.id, replyText, true);
  };

  const sendPayload = async (
    payload: { message?: string; audio?: string; audioMimeType?: string; messages: ChatHistoryMessage[] },
    pendingMessageId?: number,
    clipId?: number
  ) => {
    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await handleResponse(res, pendingMessageId, clipId);
    } catch (e) {
      console.error(e);
      pushAssistantError('Network error.');
    }
  };

  const sendText = async () => {
    if (!inputText.trim()) return;

    const text = inputText.trim();
    const nextMessages = [...messages, createMessage('user', text)];
    messages = nextMessages;
    inputText = '';
    isThinking = true;
    await scrollToLatest();

    await sendPayload({ message: text, messages: toChatHistory(nextMessages) });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioMimeType = mediaRecorder?.mimeType || mimeType || audioChunks[0]?.type || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: audioMimeType });
        const clip = addVoiceClip(audioBlob);
        updateVoiceClip(clip.id, { status: 'transcribing' });

        const reader = new FileReader();
        const pendingAudioMessage = createMessage('user', 'Transcribing voice note...', {
          includeInContext: false,
          pending: true
        });
        messages = [...messages, pendingAudioMessage];
        isThinking = true;
        await scrollToLatest();

        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Audio = base64data.split(',')[1];

          await sendPayload(
            { audio: base64Audio, audioMimeType, messages: toChatHistory() },
            pendingAudioMessage.id,
            clip.id
          );
        };

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
    } catch (err) {
      console.error('Error accessing microphone', err);
      alert('Could not access microphone.');
    }
  };

  onDestroy(() => {
    voiceClips.forEach((clip) => URL.revokeObjectURL(clip.url));
    messages.forEach((message) => {
      if (message.audioUrl) URL.revokeObjectURL(message.audioUrl);
    });
    stopSpeech();
  });

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
  };

  onMount(() => {
    // TTS is now handled by the backend server
  });
</script>

<svelte:head>
  <title>Ami French Tutor</title>
  <meta
    name="description"
    content="A voice-first French tutor that replies naturally and keeps grammar notes separate."
  />
</svelte:head>

<main class="page-shell">
  <section class="chat-frame">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Voice-first French practice</p>
        <h1>Ami</h1>
        <p class="hero-text">{assistantIntro}</p>
      </div>

      <div class="assistant-card">
        <div class="assistant-avatar" aria-hidden="true">
          <span>A</span>
        </div>
        <div class="assistant-meta">
          <strong>AI Tutor</strong>
          <span>{ttsError ?? (ttsReady ? activeVoiceName : 'Preparing Kokoro')}</span>
        </div>
        <button
          class:muted={!ttsEnabled}
          class="voice-toggle"
          on:click={() => {
            ttsEnabled = !ttsEnabled;
            if (!ttsEnabled) stopSpeech();
          }}
        >
          {ttsEnabled ? 'Voice on' : 'Voice off'}
        </button>
      </div>
    </header>

    <section class="conversation">
      <div class="messages" bind:this={messagesEl}>
        {#if messages.length === 0}
          <div class="welcome-card">
            <div class="welcome-avatar" aria-hidden="true">A</div>
            <div>
              <h2>Start in French</h2>
              <p>Ask a question, introduce yourself, or record your voice. Ami will answer aloud and keep any correction in a separate lesson card.</p>
            </div>
          </div>
        {/if}

        {#each messages as msg (msg.id)}
          <article class="message-row {msg.role}">
            {#if msg.role === 'assistant'}
              <div class="message-avatar assistant-avatar small" aria-hidden="true">A</div>
            {/if}

            <div class="message-stack">
              <div class="bubble {msg.role}">
                <p>{msg.text}</p>
                {#if msg.role === 'assistant' && msg.text.trim()}
                  <button
                    class="speak-reply"
                    type="button"
                    disabled={!ttsEnabled || msg.audioStatus === 'generating'}
                    on:click={() => void speakMessage(msg.id, msg.text)}
                  >
                    {#if msg.audioStatus === 'generating'}
                      Preparing voice
                    {:else if msg.audioStatus === 'blocked'}
                      Tap to play
                    {:else}
                      Play voice
                    {/if}
                  </button>
                {/if}
              </div>

              {#if msg.lesson}
                <aside class="lesson-card">
                  <span class="lesson-label">Petite leçon</span>
                  <p>{msg.lesson}</p>
                </aside>
              {/if}
            </div>

            {#if msg.role === 'user'}
              <div class="message-avatar user-avatar small" aria-hidden="true">You</div>
            {/if}
          </article>
        {/each}

        {#if isThinking}
          <article class="message-row assistant">
            <div class="message-avatar assistant-avatar small" aria-hidden="true">A</div>
            <div class="message-stack">
              <div class="bubble assistant thinking-bubble">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </article>
        {/if}
      </div>

      <section class="clips-panel">
        <div class="clips-header">
          <div>
            <p class="eyebrow clips-eyebrow">Voice clips</p>
            <h2>Recorded audio</h2>
          </div>
          <span>{voiceClips.length} clips</span>
        </div>

        <div class="clips-list" bind:this={clipsEl}>
          {#if voiceClips.length === 0}
            <div class="clips-empty">
              Your recordings will appear here after you stop speaking.
            </div>
          {/if}

          {#each voiceClips as clip}
            <article class="clip-item">
              <button
                class="clip-play"
                type="button"
                on:click={() => playClip(clip.id)}
                aria-label={activeClipId === clip.id ? 'Pause recording' : 'Play recording'}
              >
                {activeClipId === clip.id ? 'Pause' : 'Play'}
              </button>

              <audio
                id={`clip-audio-${clip.id}`}
                src={clip.url}
                preload="none"
                on:play={() => (activeClipId = clip.id)}
                on:pause={() => {
                  if (activeClipId === clip.id) activeClipId = null;
                }}
                on:ended={() => {
                  if (activeClipId === clip.id) activeClipId = null;
                }}
              ></audio>

              <div class="clip-meta">
                <div class="clip-title">
                  <strong>Recording {clip.id}</strong>
                  <span>{new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p>
                  {#if clip.status === 'transcribing'}
                    Transcribing...
                  {:else if clip.transcript}
                    {clip.transcript}
                  {:else}
                    Tap play to listen back.
                  {/if}
                </p>
              </div>
            </article>
          {/each}
        </div>
      </section>

      <form class="composer" on:submit|preventDefault={sendText}>
        <label class="composer-field">
          <span class="sr-only">Message in French</span>
          <input
            type="text"
            bind:value={inputText}
            placeholder="Write in French..."
            autocomplete="off"
            disabled={isThinking}
          />
        </label>

        <div class="composer-actions">
          <button class="secondary" type="button" on:click={isRecording ? stopRecording : startRecording} disabled={isThinking}>
            {isRecording ? 'Stop recording' : 'Speak'}
          </button>
          <button class="primary" type="submit" disabled={isRecording || isThinking || !inputText.trim()}>
            Send
          </button>
        </div>
      </form>
    </section>
  </section>
</main>
