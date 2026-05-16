<script lang="ts">
  import { onMount } from 'svelte';

  type Message = {
    role: 'user' | 'assistant';
    text: string;
    lesson?: string;
  };

  let messages: Message[] = [];
  let inputText = '';
  let isRecording = false;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let isThinking = false;

  let synth: SpeechSynthesis;
  let frenchVoice: SpeechSynthesisVoice | null = null;

  onMount(() => {
    synth = window.speechSynthesis;
    const loadVoices = () => {
      const voices = synth.getVoices();
      frenchVoice = voices.find(v => v.lang.startsWith('fr-')) || null;
    };
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
  });

  const speak = (text: string) => {
    if (!synth || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    if (frenchVoice) utterance.voice = frenchVoice;
    utterance.lang = 'fr-FR';
    synth.speak(utterance);
  };

  const handleResponse = async (res: Response) => {
    if (!res.ok) {
        messages = [...messages, { role: 'assistant', text: 'Error communicating with backend.' }];
        isThinking = false;
        return;
    }
    const data = await res.json();
    messages = [...messages, { role: 'assistant', text: data.reply, lesson: data.lesson }];
    speak(data.reply);
    isThinking = false;
  };

  const API_ENDPOINT = import.meta.env.PROD ? 'https://api-ami.ether.paris/api/chat' : '/api/chat';

  const sendText = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    messages = [...messages, { role: 'user', text }];
    inputText = '';
    isThinking = true;

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      await handleResponse(res);
    } catch (e) {
      console.error(e);
      messages = [...messages, { role: 'assistant', text: 'Network Error.' }];
      isThinking = false;
    }
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
          
          messages = [...messages, { role: 'user', text: '🎤 [Audio Message]' }];
          isThinking = true;

          try {
            const res = await fetch(API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio })
            });
            await handleResponse(res);
          } catch (e) {
            console.error(e);
            messages = [...messages, { role: 'assistant', text: 'Network Error.' }];
            isThinking = false;
          }
        };
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
    } catch (err) {
      console.error('Error accessing microphone', err);
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
  };
</script>

<main class="chat-container">
  <header>
    <h1>Gemma French Tutor</h1>
  </header>

  <div class="messages">
    {#if messages.length === 0}
      <div class="empty-state">Start speaking or typing in French!</div>
    {/if}
    {#each messages as msg}
      <div class="message {msg.role}">
        <div class="bubble">
          <p>{msg.text}</p>
          {#if msg.lesson}
            <div class="lesson">
              <strong>Lesson:</strong> {msg.lesson}
            </div>
          {/if}
        </div>
      </div>
    {/each}
    {#if isThinking}
      <div class="message assistant">
        <div class="bubble thinking">Typing...</div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <input 
      type="text" 
      bind:value={inputText} 
      on:keydown={(e) => e.key === 'Enter' && sendText()} 
      placeholder="Type a message in French..." 
    />
    <button on:click={sendText} disabled={isRecording || isThinking}>Send</button>
    
    {#if isRecording}
      <button class="record-btn recording" on:click={stopRecording}>⏹ Stop</button>
    {:else}
      <button class="record-btn" on:click={startRecording} disabled={isThinking}>🎤 Speak</button>
    {/if}
  </div>
</main>
