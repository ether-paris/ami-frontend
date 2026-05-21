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
    if (messagesEl) {
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }
  };

  const scrollClipsToLatest = async () => {
    await tick();
    if (clipsEl) {
        clipsEl.scrollTo({ top: clipsEl.scrollHeight, behavior: 'smooth' });
    }
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

<main class="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
  <!-- Desktop Sidebar -->
  <aside class="hidden md:flex w-80 flex-col bg-slate-950 text-slate-50 border-r border-slate-800 shadow-2xl z-20">
    <div class="p-6 flex flex-col gap-2 border-b border-slate-800/80">
      <div class="flex items-center gap-3">
         <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-inner">A</div>
         <h1 class="text-xl font-bold tracking-tight text-white">Ami Tutor</h1>
      </div>
      <p class="text-slate-400 text-sm mt-3 leading-relaxed">Your voice-first French tutor that listens and replies naturally.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-6" bind:this={clipsEl}>
      <!-- Voice Clips Section -->
      <div>
        <div class="flex items-center justify-between mb-3 px-2">
          <h2 class="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Recorded Clips</h2>
          <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{voiceClips.length}</span>
        </div>
        
        <div class="flex flex-col gap-1">
          {#if voiceClips.length === 0}
            <div class="text-slate-500 text-sm px-2 py-4 italic text-center border border-dashed border-slate-800 rounded-xl mt-2">No recordings yet.</div>
          {/if}
          {#each voiceClips as clip}
            <button 
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/50 transition-colors text-left group {activeClipId === clip.id ? 'bg-slate-800/80 ring-1 ring-slate-700' : ''}"
              on:click={() => playClip(clip.id)}
            >
              <div class="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center flex-shrink-0 text-slate-400 transition-colors {activeClipId === clip.id ? 'bg-indigo-600 text-white' : ''}">
                {#if activeClipId === clip.id}
                  <!-- Pause icon -->
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                {:else}
                  <!-- Play icon -->
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-slate-200 truncate flex items-center gap-2">
                  Clip {clip.id}
                  <span class="text-[10px] text-slate-500 font-normal">{new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="text-[13px] text-slate-400 truncate mt-0.5">
                   {#if clip.status === 'transcribing'}
                    <span class="text-indigo-400 animate-pulse">Transcribing...</span>
                  {:else if clip.transcript}
                    {clip.transcript}
                  {:else}
                    Tap to play
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
    
    <div class="p-4 border-t border-slate-800/80 bg-slate-900/30">
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-medium text-slate-200">Voice Output</span>
          <span class="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full {ttsReady ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
            {ttsError ?? (ttsReady ? activeVoiceName : 'Preparing...')}
          </span>
        </div>
        <button 
          class="w-11 h-6 rounded-full transition-colors relative shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 {ttsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}"
          on:click={() => { ttsEnabled = !ttsEnabled; if (!ttsEnabled) stopSpeech(); }}
          aria-label="Toggle voice output"
        >
          <span class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm {ttsEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
        </button>
      </div>
    </div>
  </aside>

  <!-- Main Chat Area -->
  <main class="flex-1 flex flex-col bg-white relative shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-10">
    <!-- Mobile Header -->
    <header class="md:hidden flex items-center justify-between p-4 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-sm">A</div>
        <h1 class="text-lg font-bold text-slate-900">Ami Tutor</h1>
      </div>
      <button 
         class="text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors {ttsEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}"
         on:click={() => { ttsEnabled = !ttsEnabled; if (!ttsEnabled) stopSpeech(); }}
      >
        {ttsEnabled ? 'Voice On' : 'Voice Off'}
      </button>
    </header>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto" bind:this={messagesEl}>
      <div class="max-w-3xl mx-auto w-full p-4 sm:p-6 md:p-8 flex flex-col gap-8 pb-40">
        {#if messages.length === 0}
          <div class="flex flex-col items-center justify-center text-center mt-12 md:mt-24 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-4xl shadow-xl shadow-indigo-500/20 ring-4 ring-indigo-50">A</div>
            <h2 class="text-3xl font-bold text-slate-900 tracking-tight">Bonjour!</h2>
            <p class="text-slate-500 max-w-sm text-[15px] leading-relaxed">I'm Ami, your AI French tutor. Send a message or record a voice clip to get started.</p>
          </div>
        {/if}

        {#each messages as msg (msg.id)}
          <div class="flex gap-4 group {msg.role === 'user' ? 'flex-row-reverse' : ''}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-auto mb-1 shadow-sm {msg.role === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'}">
              {#if msg.role === 'user'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              {:else}
                <span class="font-bold text-sm">A</span>
              {/if}
            </div>

            <div class="flex flex-col gap-2 max-w-[85%] md:max-w-[75%] {msg.role === 'user' ? 'items-end' : 'items-start'}">
              <div class="px-5 py-3.5 text-[15px] shadow-sm {msg.role === 'user' ? 'bg-slate-900 text-white rounded-3xl rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-3xl rounded-bl-sm'}">
                <p class="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              </div>

              {#if msg.role === 'assistant' && msg.text.trim()}
                <div class="flex items-center gap-2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="text-xs font-medium flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                    disabled={!ttsEnabled || msg.audioStatus === 'generating'}
                    on:click={() => void speakMessage(msg.id, msg.text)}
                  >
                    {#if msg.audioStatus === 'generating'}
                      <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                      Generating...
                    {:else if msg.audioStatus === 'blocked'}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      Tap to play
                    {:else}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
                      Read aloud
                    {/if}
                  </button>
                </div>
              {/if}

              {#if msg.lesson}
                <div class="mt-1 p-5 rounded-2xl bg-indigo-50/80 border border-indigo-100/80 text-indigo-950 w-full shadow-sm">
                  <div class="flex items-center gap-2 mb-3">
                    <div class="p-1.5 rounded-md bg-indigo-100 text-indigo-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    </div>
                    <span class="text-xs font-bold tracking-widest uppercase text-indigo-800">Petite leçon</span>
                  </div>
                  <p class="whitespace-pre-wrap text-[14px] leading-relaxed text-indigo-900/90 font-medium">{msg.lesson}</p>
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if isThinking}
          <div class="flex gap-4">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center flex-shrink-0 mt-auto mb-1 shadow-sm">
              <span class="font-bold text-sm">A</span>
            </div>
            <div class="px-5 py-4 bg-white border border-slate-200 rounded-3xl rounded-bl-sm flex items-center gap-1.5 shadow-sm h-[52px]">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay: 0.15s"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay: 0.3s"></span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Input Area -->
    <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-white/0 pt-10 pb-6 px-4 sm:px-6 md:px-8">
      <div class="max-w-3xl mx-auto">
        <form 
          class="relative flex items-end gap-2 bg-white border border-slate-300 rounded-3xl p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all"
          on:submit|preventDefault={sendText}
        >
          <button 
            type="button"
            class="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors mb-0.5 {isRecording ? 'text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-600 animate-pulse' : ''}"
            on:click={isRecording ? stopRecording : startRecording}
            disabled={isThinking}
            title={isRecording ? "Stop recording" : "Record voice"}
          >
            {#if isRecording}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            {:else}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
            {/if}
          </button>
          
          <textarea
            class="flex-1 max-h-32 min-h-[48px] py-3.5 px-2 bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-[15px] placeholder:text-slate-400 disabled:opacity-50 font-medium"
            bind:value={inputText}
            placeholder="Message Ami in French..."
            disabled={isThinking}
            rows="1"
            on:keydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputText.trim()) sendText();
              }
            }}
          ></textarea>

          <button 
            type="submit"
            class="p-3 m-0.5 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 transition-colors mb-0.5 shadow-sm"
            disabled={isRecording || isThinking || !inputText.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
        <div class="text-center mt-3">
          <span class="text-[11px] font-medium text-slate-400">Ami can make mistakes. Consider verifying important information.</span>
        </div>
      </div>
    </div>
  </main>
</main>
