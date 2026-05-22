<script lang="ts">
import { onDestroy, onMount, tick } from 'svelte';
import AppIcon from '$lib/components/AppIcon.svelte';
import GoogleAuth from '$lib/components/GoogleAuth.svelte';
import GlowingIcon from '$lib/components/GlowingIcon.svelte';

  type Message = {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    lesson?: string;
    includeInContext?: boolean;
    pending?: boolean;
    audioUrl?: string;
    audioStatus?: 'idle' | 'generating' | 'ready' | 'blocked' | 'error';
    audioTriggered?: boolean;
    userAudioUrl?: string;
    userAudioPlaying?: boolean;
    showTranscript?: boolean;
    transcript?: string;
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


  let ttsEnabled = true;
  let ttsReady = true;
  let activeVoiceName = 'Chatterbox TTS';
  let ttsError: string | null = null;
  let currentSpeechAudio: HTMLAudioElement | null = null;
  let currentSpeechUrl: string | null = null;
  let isAppSpeaking = false;
  let appIcon: any = null;
  let hasRecentUserInteraction = false;
  let lastUserInteractionTime = 0;
  
  // Reactive auth state
  let isAuthenticated = false;
  let userInfo = { name: '', picture: '' };
  let selectedVoiceId = '';

  // Check auth state reactively
  function checkAuthState() {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const storedUserInfo = localStorage.getItem('user_info');
      
      isAuthenticated = !!token;
      
      if (storedUserInfo) {
        try {
          userInfo = JSON.parse(storedUserInfo);
        } catch (e) {
          console.error('Error parsing user info:', e);
          userInfo = { name: '', picture: '' };
        }
      }

      selectedVoiceId = localStorage.getItem('selected_voice_id') || '';
    }
  }
  
  // Set up storage event listener for cross-tab sync
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === 'auth_token' || event.key === 'user_info' || event.key === 'selected_voice_id') {
        checkAuthState();
      }
    });
  }

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



  const stopSpeech = () => {
    currentSpeechAudio?.pause();
    currentSpeechAudio = null;
    currentSpeechUrl = null;
    audioQueue.forEach(URL.revokeObjectURL);
    audioQueue = [];
    isPlayingAudioQueue = false;

    if (currentUserAudio) {
      currentUserAudio.pause();
      if (playingUserAudioMessageId !== null) {
        updateMessageUserAudioPlaying(playingUserAudioMessageId, false);
      }
      currentUserAudio = null;
      playingUserAudioMessageId = null;
    }
  };

  let audioQueue: string[] = [];
  let isPlayingAudioQueue = false;

  const playNextInQueue = async () => {
    if (audioQueue.length === 0) {
      isPlayingAudioQueue = false;
      return;
    }
    isPlayingAudioQueue = true;
    const url = audioQueue.shift()!;
    
    currentSpeechAudio?.pause();
    currentSpeechAudio = null;
    currentSpeechUrl = null;

    currentSpeechUrl = url;
    currentSpeechAudio = new Audio(url);
    
    currentSpeechAudio.onplay = () => {
      isAppSpeaking = true;
      // Connect this audio element to the visualizer
      if (appIcon && typeof appIcon.connectAudioElement === 'function') {
        appIcon.connectAudioElement(currentSpeechAudio);
      }
    };
    
    currentSpeechAudio.onended = () => {
      URL.revokeObjectURL(url);
      isAppSpeaking = false;
      playNextInQueue();
    };
    
    currentSpeechAudio.onerror = () => {
      console.error('Audio playback error in queue');
      isAppSpeaking = false;
      playNextInQueue();
    };

    try {
      await currentSpeechAudio.play();
    } catch (err) {
      console.warn('Playback blocked', err);
      // If blocked, we stop the queue
      isPlayingAudioQueue = false;
      audioQueue.forEach(URL.revokeObjectURL);
      audioQueue = [];
    }
  };

  const enqueueAudioChunk = (base64Audio: string) => {
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    audioQueue.push(url);
    if (!isPlayingAudioQueue) {
      void playNextInQueue();
    }
  };

  const updateMessageAudio = (messageId: number, patch: Partial<Pick<Message, 'audioUrl' | 'audioStatus'>>) => {
    messages = messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message));
  };

  const generateSpeechUrl = async (text: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    // Add authorization header if user is authenticated
    if (isAuthenticated && typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text, voice_id: selectedVoiceId || undefined })
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
    
    currentSpeechAudio.onplay = () => {
      isAppSpeaking = true;
      // Connect this audio element to the visualizer
      if (appIcon && typeof appIcon.connectAudioElement === 'function') {
        appIcon.connectAudioElement(currentSpeechAudio);
      }
    };
    
    currentSpeechAudio.onended = () => {
      isAppSpeaking = false;
    };
    
    currentSpeechAudio.onerror = () => {
      isAppSpeaking = false;
    };
    
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
        console.error('TTS playback failed', err);
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
         console.warn('Browser blocked automatic TTS playback', err);
         updateMessageAudio(messageId, { audioUrl: url, audioStatus: 'blocked' });
         // Show a subtle indication that user needs to tap to play
         ttsError = 'Tap to hear response';
         setTimeout(() => { ttsError = null; }, 3000);
       }
    } catch (err) {
      console.error('Chatterbox TTS failed', err);
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

  let currentUserAudio: HTMLAudioElement | null = null;
  let playingUserAudioMessageId: number | null = null;

  const playUserAudio = (messageId: number, url: string) => {
    if (playingUserAudioMessageId === messageId && currentUserAudio) {
      if (currentUserAudio.paused) {
        void currentUserAudio.play();
        updateMessageUserAudioPlaying(messageId, true);
      } else {
        currentUserAudio.pause();
        updateMessageUserAudioPlaying(messageId, false);
      }
      return;
    }

    if (currentUserAudio) {
      currentUserAudio.pause();
      if (playingUserAudioMessageId !== null) {
        updateMessageUserAudioPlaying(playingUserAudioMessageId, false);
      }
    }

    stopSpeech(); // Stop any tutor speech

    currentUserAudio = new Audio(url);
    playingUserAudioMessageId = messageId;
    updateMessageUserAudioPlaying(messageId, true);

    currentUserAudio.onended = () => {
      updateMessageUserAudioPlaying(messageId, false);
      currentUserAudio = null;
      playingUserAudioMessageId = null;
    };

    currentUserAudio.onerror = () => {
      console.error('User audio playback error');
      updateMessageUserAudioPlaying(messageId, false);
      currentUserAudio = null;
      playingUserAudioMessageId = null;
    };

    void currentUserAudio.play();
  };

  const updateMessageUserAudioPlaying = (messageId: number, playing: boolean) => {
    messages = messages.map((m) => m.id === messageId ? { ...m, userAudioPlaying: playing } : m);
  };

   const handleResponse = async (res: Response, pendingMessageId?: number) => {
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      let message = errorText ? `Error communicating with backend: ${errorText}` : 'Error communicating with backend.';

      // Handle specific error cases
      if (res.status === 401) {
        message = 'Please log in to continue this conversation.';
        
        // If user was logged in but got 401, their session might be expired
        if (isAuthenticated && typeof window !== 'undefined') {
          const token = localStorage.getItem('auth_token');
          if (token) {
            // Token might be expired, suggest re-login
            message = 'Your session has expired. Please log in again.';
          }
        }
      }

      if (pendingMessageId) {
        messages = messages.filter((message) => message.id !== pendingMessageId);
      }

      pushAssistantError(message);
      return;
    }

    // Immediately create an empty assistant message to stream into
    const assistantMessage = createMessage('assistant', '');
    messages = [...messages, assistantMessage];
    await scrollToLatest();

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let accumulatedText = '';
    let accumulatedAudioBytes: Uint8Array[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'transcript') {
              if (pendingMessageId) {
                messages = messages.map((message) =>
                  message.id === pendingMessageId
                    ? {
                        ...message,
                        text: data.text || 'Voice note sent',
                        transcript: data.text || 'Voice note sent',
                        includeInContext: Boolean(data.text),
                        pending: false
                      }
                    : message
                );
              }
            } else if (data.type === 'chunk') {
              isThinking = false;
              accumulatedText += data.text;

              messages = messages.map((message) => {
                if (message.id === assistantMessage.id) {
                  return { ...message, text: accumulatedText };
                }
                return message;
              });
              await scrollToLatest();
            } else if (data.type === 'audio') {
              isThinking = false;
              if (ttsEnabled) {
                const binary = atob(data.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                accumulatedAudioBytes.push(bytes);
                enqueueAudioChunk(data.data);
              }
            } else if (data.type === 'lesson') {
              messages = messages.map((message) => {
                if (message.id === assistantMessage.id) {
                  return { ...message, lesson: data.text };
                }
                return message;
              });
              await scrollToLatest();
            } else if (data.type === 'error') {
              isThinking = false;
              pushAssistantError(data.message);
             } else if (data.type === 'done') {
               isThinking = false;
               if (accumulatedAudioBytes.length > 0) {
                 const totalLength = accumulatedAudioBytes.reduce((acc, val) => acc + val.length, 0);
                 const fullBytes = new Uint8Array(totalLength);
                 let offset = 0;
                 for (const bytes of accumulatedAudioBytes) {
                   fullBytes.set(bytes, offset);
                   offset += bytes.length;
                 }
                 const blob = new Blob([fullBytes], { type: 'audio/mpeg' });
                 const fullUrl = URL.createObjectURL(blob);
                 updateMessageAudio(assistantMessage.id, { audioUrl: fullUrl, audioStatus: 'ready' });
                 
                  // Auto-play the complete audio if TTS is enabled and there was recent user interaction
                 if (ttsEnabled && hasRecentUserInteraction && (Date.now() - lastUserInteractionTime) < 30000) {
                   // Only attempt autoplay within 30 seconds of user interaction to comply with browser policies
                   void speakMessage(assistantMessage.id, accumulatedText, true);
                 }
               }
             }
          } catch (e) {
            // Ignore malformed JSON from partial stream chunks
          }
        }
      }
    }
    isThinking = false;
  };

  const sendPayload = async (
    payload: { message?: string; audio?: string; audioMimeType?: string; messages: ChatHistoryMessage[]; ttsEnabled?: boolean },
    pendingMessageId?: number
  ) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      // Add authorization header if user is authenticated
      if (isAuthenticated && typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ ...payload, ttsEnabled, voice_id: selectedVoiceId || undefined })
      });

      await handleResponse(res, pendingMessageId);
    } catch (e) {
      console.error(e);
      isThinking = false;
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
    hasRecentUserInteraction = true;
    lastUserInteractionTime = Date.now();
    await scrollToLatest();

    await sendPayload({ message: text, messages: toChatHistory(nextMessages) });
  };

  const startRecording = async () => {
    try {
      hasRecentUserInteraction = true;
      lastUserInteractionTime = Date.now();
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
        const userAudioUrl = URL.createObjectURL(audioBlob);

        const reader = new FileReader();
        const pendingAudioMessage = createMessage('user', '', {
          includeInContext: false,
          pending: true
        });
        pendingAudioMessage.userAudioUrl = userAudioUrl;
        pendingAudioMessage.transcript = '';
        pendingAudioMessage.showTranscript = false;

        messages = [...messages, pendingAudioMessage];
        isThinking = true;
        await scrollToLatest();

        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Audio = base64data.split(',')[1];

           await sendPayload(
             { audio: base64Audio, audioMimeType, messages: toChatHistory(messages) },
             pendingAudioMessage.id
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

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      isRecording = false;
    }
    

  };

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  onDestroy(() => {
    messages.forEach((message) => {
      if (message.audioUrl) URL.revokeObjectURL(message.audioUrl);
      if (message.userAudioUrl) URL.revokeObjectURL(message.userAudioUrl);
    });
    stopSpeech();
  });

  onMount(() => {
    // Check initial auth state
    checkAuthState();
    
    // TTS is now handled by the backend server
    const handleViewportResize = () => {
      void scrollToLatest();
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };
  });
</script>

<svelte:head>
  <title>Ami • French Tutor</title>
  <meta
    name="description"
    content="Ami is your voice-first French tutor that replies naturally and keeps grammar lessons separate for fluid conversation."
  />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://ami-tutor.com" />
  <meta property="og:title" content="Ami • French Tutor" />
  <meta property="og:description" content="Ami is your voice-first French tutor that replies naturally and keeps grammar lessons separate for fluid conversation." />
  <meta property="og:image" content="https://ami-tutor.com/og-image.svg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta property="og:site_name" content="Ami French Tutor" />
  <meta property="og:locale" content="en_US" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@AmiFrenchTutor" />
  <meta name="twitter:creator" content="@AmiFrenchTutor" />
  <meta name="twitter:title" content="Ami • French Tutor" />
  <meta name="twitter:description" content="Ami is your voice-first French tutor that replies naturally and keeps grammar lessons separate for fluid conversation." />
  <meta name="twitter:image" content="https://ami-tutor.com/og-image.svg" />
  <meta name="twitter:image:alt" content="Ami French Tutor - Voice-first French learning with a beautiful lavender orb" />
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  
  <!-- Theme color -->
  <meta name="theme-color" content="#8b5cf6" />
  <meta name="apple-mobile-web-app-status-bar-style" content="#8b5cf6" />
  
  <!-- Mobile viewport -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  
  <!-- PWA manifest -->
  <link rel="manifest" href="/manifest.json" />
</svelte:head>

<main class="flex flex-col h-dvh w-full bg-[#efeae2] font-sans text-slate-900 overflow-hidden relative">
  <!-- Top App Bar -->
  <header class="h-16 bg-[#f0f2f5] px-4 flex items-center justify-between border-b border-slate-200/60 z-20 shrink-0">
    <div class="flex items-center gap-3 cursor-default">
      <!-- Glowing App Icon - reacts to model state -->
      <AppIcon 
        bind:this={appIcon}
        size={40} 
        isActive={isThinking || isRecording} 
        isSpeaking={isAppSpeaking}
      />
      <div class="flex flex-col">
        <h1 class="text-[16px] font-semibold text-slate-800 leading-tight">Ami Tutor</h1>
        <span class="text-[13px] text-emerald-600 font-medium flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          {ttsReady ? 'Online' : 'Connecting...'}
        </span>
      </div>
    </div>

    <!-- Right Controls -->
    <div class="flex items-center gap-2">
       <!-- User Profile Picture (when logged in) - links to user stats page -->
       {#if isAuthenticated}
         <a href="/user" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
           <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
             <img
               src={userInfo.picture || 'https://www.gravatar.com/avatar/default?s=200&d=mp'}
               alt="User avatar"
               class="w-full h-full object-cover"
               referrerpolicy="no-referrer"
             />
           </div>
         </a>
       {:else}
         <!-- Google Auth Button (when not logged in) -->
         <GoogleAuth redirectTo="/" />
       {/if}
      
      <!-- Voice Toggle -->
      <button 
        class="flex items-center justify-center w-10 h-10 rounded-full transition-colors {ttsEnabled ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-400 bg-slate-200/50'}"
        on:click={() => { ttsEnabled = !ttsEnabled; if (!ttsEnabled) stopSpeech(); }}
        title={ttsEnabled ? "Mute Voice" : "Enable Voice"}
      >
        {#if ttsEnabled}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
        {/if}
      </button>
    </div>
  </header>

  <!-- Main Chat Area -->
  <div class="flex-1 overflow-y-auto px-2 sm:px-4 md:px-10 py-6" bind:this={messagesEl} style="background-image: radial-gradient(#d5d0c8 1px, transparent 1px); background-size: 24px 24px;">
    <div class="max-w-4xl mx-auto flex flex-col gap-3 pb-4">
      
      <!-- Welcome Message -->
      {#if messages.length === 0}
        <div class="flex justify-center mb-6">
          <div class="bg-[#ffeeba] text-slate-800 text-[13px] px-4 py-2 rounded-lg shadow-sm text-center max-w-sm">
            Bonjour ! I am Ami, your French tutor. Messages are end-to-end simulated. 
            Send a message or record a voice note to start.
          </div>
        </div>
      {/if}

      <!-- Messages Loop -->
      {#each messages as msg (msg.id)}
        {#if msg.text || msg.role === 'user' || msg.pending}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full">
          <div class="flex flex-col gap-1 max-w-[85%] md:max-w-[70%]">
            
            <!-- Message Bubble -->
            <div class="relative px-3 py-2 sm:px-4 sm:py-2.5 text-[15px] shadow-[0_1px_1px_rgba(0,0,0,0.1)] 
              {msg.role === 'user' 
                ? 'bg-[#d9fdd3] text-slate-900 rounded-lg rounded-tr-none' 
                : 'bg-white text-slate-900 rounded-lg rounded-tl-none'
              }"
            >
              <!-- Tail Triangles -->
              {#if msg.role === 'user'}
                <svg class="absolute top-0 -right-2 text-[#d9fdd3]" width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
                  <path d="M0 0h8L0 13V0z"/>
                </svg>
              {:else}
                <svg class="absolute top-0 -left-2 text-white" width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
                  <path d="M8 0H0l8 13V0z"/>
                </svg>
              {/if}

              {#if msg.userAudioUrl}
                <!-- WhatsApp-like Audio Player -->
                <div class="flex items-center gap-3 py-1">
                  <!-- Play/Pause Button -->
                  <button
                    on:click={() => playUserAudio(msg.id, msg.userAudioUrl)}
                    class="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    {#if msg.userAudioPlaying}
                      <!-- Pause Icon -->
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="4" height="16" rx="1"></rect><rect x="16" y="4" width="4" height="16" rx="1"></rect></svg>
                    {:else}
                      <!-- Play Icon -->
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    {/if}
                  </button>

                  <!-- Waveform / Progress Indicator -->
                  <div class="flex-1 flex flex-col gap-1 min-w-[120px] sm:min-w-[180px]">
                    <div class="flex items-center gap-1">
                      <!-- Simulated waveform blocks -->
                      <div class="h-5 flex items-center gap-0.5 opacity-60">
                        <div class="w-0.5 h-3 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-4 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-2 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-5 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-3 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-4 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-2 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-4 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-3 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-5 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-2 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-4 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-3 bg-slate-800 rounded-full"></div>
                        <div class="w-0.5 h-1 bg-slate-800 rounded-full"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Transcribe Toggle Button -->
                  <button
                    on:click={() => { msg.showTranscript = !msg.showTranscript; }}
                    class="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-800 border border-emerald-500/15 shadow-sm transition-all cursor-pointer shrink-0"
                  >
                    {msg.showTranscript ? 'Hide Text' : 'Transcribe'}
                  </button>
                </div>

                <!-- Expanded Transcript text -->
                {#if msg.showTranscript}
                  <div class="mt-2.5 pt-2.5 border-t border-emerald-500/10 text-[13.5px] text-slate-700 italic font-normal leading-relaxed">
                    {#if msg.pending}
                      <span class="flex items-center gap-1.5 text-slate-500">
                        <svg class="animate-spin h-3.5 w-3.5 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Transcribing voice...
                      </span>
                    {:else}
                      "{msg.transcript || 'Voice note sent'}"
                    {/if}
                  </div>
                {/if}
              {:else}
                <p class="whitespace-pre-wrap leading-snug">{msg.text}</p>
              {/if}
              
              <!-- Voice Button for Assistant -->
              {#if msg.role === 'assistant' && msg.text.trim()}
                <div class="mt-1 -mb-1 flex justify-end">
                  <button
                    class="text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50
                      {msg.audioStatus === 'generating' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}"
                    disabled={!ttsEnabled || msg.audioStatus === 'generating'}
                    on:click={() => void speakMessage(msg.id, msg.text)}
                  >
                    {#if msg.audioStatus === 'generating'}
                      <svg class="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                      Loading voice
                    {:else if msg.audioStatus === 'blocked'}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      Play
                    {:else}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                      Listen
                    {/if}
                  </button>
                </div>
              {/if}
            </div>

            <!-- Teaching Note (Separate Card) -->
            {#if msg.lesson}
              <div class="mt-1 bg-[#f0f2f5] border border-slate-200/60 rounded-lg p-3 shadow-sm text-slate-700 self-start w-full">
                <div class="flex items-center gap-1.5 mb-1.5">
                  <svg class="text-emerald-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  <span class="text-[12px] font-bold uppercase tracking-wider text-slate-500">Petite leçon</span>
                </div>
                <p class="whitespace-pre-wrap text-[13.5px] leading-relaxed">{msg.lesson}</p>
              </div>
            {/if}

          </div>
        </div>
        {/if}
      {/each}

      <!-- Thinking Indicator -->
      {#if isThinking}
        <div class="flex justify-start w-full mt-1">
          <div class="relative px-4 py-3 bg-white text-slate-900 rounded-lg rounded-tl-none shadow-sm flex items-center gap-1">
            <svg class="absolute top-0 -left-2 text-white" width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
              <path d="M8 0H0l8 13V0z"/>
            </svg>
            <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.15s"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.3s"></span>
          </div>
        </div>
      {/if}
    </div>
  </div>



  <!-- Bottom Input Bar -->
  <footer class="bg-[#f0f2f5] px-2 sm:px-4 py-3 border-t border-slate-200/60 shrink-0">
    <div class="max-w-4xl mx-auto">
      <form 
        class="flex items-end gap-2 relative"
        on:submit|preventDefault={sendText}
      >
        <!-- Text Input -->
        <div class="flex-1 bg-white rounded-2xl sm:rounded-full border border-slate-300 shadow-sm flex items-end relative overflow-hidden transition-all focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500">
          <textarea
            class="w-full max-h-32 min-h-[44px] py-3 pl-4 pr-12 bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-[16px] placeholder:text-slate-400 disabled:opacity-50"
            bind:value={inputText}
            placeholder="Type a message"
            disabled={isThinking || isRecording}
            rows="1"
            on:keydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputText.trim()) sendText();
              }
            }}
          ></textarea>

          <!-- Submit Button (Inside input on right) -->
          {#if inputText.trim()}
            <button 
              type="submit"
              class="absolute right-1 bottom-1 p-2 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              disabled={isThinking}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
          {/if}
        </div>

        <!-- Voice Record Button -->
        {#if !inputText.trim()}
          <button 
            type="button"
            class="flex-shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center transition-all shadow-sm
              {isRecording 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'}"
            on:click={handleRecordClick}
            disabled={isThinking}
          >
            {#if isRecording}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
            {/if}
          </button>
        {/if}
      </form>
    </div>
  </footer>
</main>
