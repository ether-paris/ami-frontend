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

<main class="min-h-screen bg-slate-50 p-4 md:p-8 flex justify-center">
  <section class="w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col">
    <header class="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-end justify-between gap-6 border-b border-slate-100 bg-slate-50/50">
      <div class="max-w-xl">
        <p class="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">Voice-first French practice</p>
        <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Ami</h1>
        <p class="text-slate-600 mt-3">{assistantIntro}</p>
      </div>

      <div class="bg-slate-900 text-slate-50 rounded-2xl p-4 flex items-center gap-4 shadow-lg min-w-[260px]">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-200 to-orange-400 text-amber-950 flex items-center justify-center font-bold text-xl flex-shrink-0" aria-hidden="true">
          <span>A</span>
        </div>
        <div class="flex flex-col flex-grow">
          <strong class="font-semibold">AI Tutor</strong>
          <span class="text-slate-400 text-sm">{ttsError ?? (ttsReady ? activeVoiceName : 'Preparing Kokoro')}</span>
        </div>
        <button
          class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors {ttsEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white/10 text-white/50'}"
          on:click={() => {
            ttsEnabled = !ttsEnabled;
            if (!ttsEnabled) stopSpeech();
          }}
        >
          {ttsEnabled ? 'Voice on' : 'Voice off'}
        </button>
      </div>
    </header>

    <section class="flex flex-col flex-grow min-h-0">
      <div class="flex-grow overflow-y-auto p-6 md:p-8 flex flex-col gap-6" bind:this={messagesEl}>
        {#if messages.length === 0}
          <div class="flex items-start gap-4 p-6 rounded-2xl bg-amber-50/50 border border-amber-100">
            <div class="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center font-bold text-xl flex-shrink-0" aria-hidden="true">A</div>
            <div>
              <h2 class="text-lg font-semibold text-slate-900 mb-1">Start in French</h2>
              <p class="text-slate-600">Ask a question, introduce yourself, or record your voice. Ami will answer aloud and keep any correction in a separate lesson card.</p>
            </div>
          </div>
        {/if}

        {#each messages as msg (msg.id)}
          <article class="flex items-end gap-3 {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
            {#if msg.role === 'assistant'}
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 to-orange-400 text-amber-950 flex items-center justify-center font-bold text-sm flex-shrink-0 hidden sm:flex" aria-hidden="true">A</div>
            {/if}

            <div class="flex flex-col gap-2 max-w-[85%] md:max-w-[75%] {msg.role === 'user' ? 'items-end' : 'items-start'}">
              <div class="px-5 py-4 rounded-2xl shadow-sm {msg.role === 'assistant' ? 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm' : 'bg-slate-800 text-slate-50 rounded-br-sm'}">
                <p class="whitespace-pre-wrap">{msg.text}</p>
                {#if msg.role === 'assistant' && msg.text.trim()}
                  <button
                    class="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    type="button"
                    disabled={!ttsEnabled || msg.audioStatus === 'generating'}
                    on:click={() => void speakMessage(msg.id, msg.text)}
                  >
                    {#if msg.audioStatus === 'generating'}
                      Preparing voice...
                    {:else if msg.audioStatus === 'blocked'}
                      Tap to play
                    {:else}
                      Play voice
                    {/if}
                  </button>
                {/if}
              </div>

              {#if msg.lesson}
                <aside class="p-4 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-900 w-full">
                  <span class="block mb-2 text-xs font-bold tracking-widest uppercase text-amber-700">Petite leçon</span>
                  <p class="whitespace-pre-wrap text-sm">{msg.lesson}</p>
                </aside>
              {/if}
            </div>

            {#if msg.role === 'user'}
              <div class="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs flex-shrink-0 hidden sm:flex" aria-hidden="true">You</div>
            {/if}
          </article>
        {/each}

        {#if isThinking}
          <article class="flex items-end gap-3 justify-start">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 to-orange-400 text-amber-950 flex items-center justify-center font-bold text-sm flex-shrink-0 hidden sm:flex" aria-hidden="true">A</div>
            <div class="px-5 py-4 rounded-2xl bg-white border border-slate-100 shadow-sm rounded-bl-sm flex items-center gap-1.5 h-[56px]">
              <span class="w-2 h-2 rounded-full bg-slate-300 animate-pulse"></span>
              <span class="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style="animation-delay: 0.15s"></span>
              <span class="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style="animation-delay: 0.3s"></span>
            </div>
          </article>
        {/if}
      </div>

      <section class="px-6 md:px-8 pb-4">
        <div class="flex items-end justify-between gap-4 mb-3">
          <div>
            <p class="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Voice clips</p>
            <h2 class="text-sm font-medium text-slate-800">Recorded audio</h2>
          </div>
          <span class="text-xs text-slate-500">{voiceClips.length} clips</span>
        </div>

        <div class="max-h-48 overflow-y-auto flex flex-col gap-2 pr-1" bind:this={clipsEl}>
          {#if voiceClips.length === 0}
            <div class="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-500 text-sm text-center">
              Your recordings will appear here after you stop speaking.
            </div>
          {/if}

          {#each voiceClips as clip}
            <article class="flex items-center gap-4 p-3 md:p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
              <button
                class="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
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

              <div class="flex-grow min-w-0">
                <div class="flex flex-wrap gap-2 items-baseline mb-1">
                  <strong class="text-sm text-slate-800">Recording {clip.id}</strong>
                  <span class="text-xs text-slate-400">{new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p class="text-sm text-slate-600 truncate">
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

      <form class="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-3" on:submit|preventDefault={sendText}>
        <label class="flex-grow">
          <span class="sr-only">Message in French</span>
          <input
            class="w-full h-12 px-5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-slate-800 disabled:opacity-50"
            type="text"
            bind:value={inputText}
            placeholder="Write in French..."
            autocomplete="off"
            disabled={isThinking}
          />
        </label>

        <div class="flex gap-2">
          <button 
            class="h-12 px-6 rounded-xl font-medium transition-all {isRecording ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'} disabled:opacity-50" 
            type="button" 
            on:click={isRecording ? stopRecording : startRecording} 
            disabled={isThinking}
          >
            {isRecording ? 'Stop recording' : 'Speak'}
          </button>
          <button 
            class="h-12 px-6 rounded-xl font-medium transition-all bg-slate-900 hover:bg-slate-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
            type="submit" 
            disabled={isRecording || isThinking || !inputText.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </section>
  </section>
</main>
