<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Message = {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    lesson?: string;
    includeInContext?: boolean;
    pending?: boolean;
  };

  type ChatHistoryMessage = {
    role: 'user' | 'assistant';
    content: string;
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

  let synth: SpeechSynthesis | null = null;
  let ttsEnabled = true;
  let ttsReady = false;
  let activeVoiceName = 'System default';

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

  const selectPreferredVoice = () => {
    if (!synth) return null;

    const voices = synth.getVoices();
    if (voices.length === 0) return null;

    const frenchVoice =
      voices.find((voice) => voice.default && voice.lang.toLowerCase().startsWith('fr')) ||
      voices.find((voice) => /siri/i.test(voice.name) && voice.lang.toLowerCase().startsWith('fr')) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('fr')) ||
      voices.find((voice) => voice.default) ||
      null;

    activeVoiceName = frenchVoice?.name || 'System default';
    ttsReady = true;

    return frenchVoice;
  };

  const speak = (text: string) => {
    if (!ttsEnabled || !synth || !text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text.trim());
    const preferredVoice = selectPreferredVoice();

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = 'fr-FR';
    }

    synth.cancel();
    synth.speak(utterance);
  };

  const pushAssistantError = (text: string) => {
    messages = [...messages, createMessage('assistant', text, { includeInContext: false })];
    isThinking = false;
    scrollToLatest();
  };

  const handleResponse = async (res: Response, pendingAudioId?: number) => {
    if (!res.ok) {
      pushAssistantError('Error communicating with backend.');
      return;
    }

    const data = await res.json();
    const replyText = typeof data?.reply === 'string' ? data.reply : '';
    const lessonText = typeof data?.lesson === 'string' ? data.lesson : undefined;
    const transcriptText = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
    const assistantMessage = createMessage('assistant', replyText, { lesson: lessonText });

    if (pendingAudioId) {
      messages = messages.map((message) =>
        message.id === pendingAudioId
          ? {
              ...message,
              text: transcriptText || 'Voice note sent',
              includeInContext: Boolean(transcriptText),
              pending: false
            }
          : message
      );
    }

    messages = [...messages, assistantMessage];
    isThinking = false;
    await scrollToLatest();

    // Read only the conversational answer, never the teaching note.
    speak(replyText);
  };

  const sendPayload = async (payload: { message?: string; audio?: string; messages: ChatHistoryMessage[] }, pendingAudioId?: number) => {
    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      await handleResponse(res, pendingAudioId);
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
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Audio = base64data.split(',')[1];

          const pendingAudioMessage = createMessage('user', 'Transcribing voice note...', {
            includeInContext: false,
            pending: true
          });
          messages = [...messages, pendingAudioMessage];
          isThinking = true;
          await scrollToLatest();

          await sendPayload({ audio: base64Audio, messages: toChatHistory() }, pendingAudioMessage.id);
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

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
  };

  onMount(() => {
    synth = window.speechSynthesis;
    const loadVoices = () => {
      selectPreferredVoice();
    };

    loadVoices();

    if (synth?.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
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
          <span>{ttsReady ? activeVoiceName : 'Preparing voice'}</span>
        </div>
        <button class:muted={!ttsEnabled} class="voice-toggle" on:click={() => (ttsEnabled = !ttsEnabled)}>
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
