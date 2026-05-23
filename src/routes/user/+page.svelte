<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  let userInfo = {
    name: '',
    picture: '',
    email: '',
    stats: {
      totalConversations: 0,
      totalMessages: 0,
      totalCharacters: 0,
      learningStreak: 0,
      lastActive: 'Never'
    }
  };

  // State variables
  let selectedVoiceId = '';
  let voicesList: any[] = [];
  let isFetchingVoices = false;
  let preferredTranscriptionService: 'groq' | 'mistral' | 'auto' = 'auto';

  async function fetchVoices() {
    isFetchingVoices = true;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/voices', { headers });
      if (res.ok) {
        const data = await res.json();
        // Filter list to only include French-supporting voices!
        voicesList = data.filter((voice: any) =>
          voice.languages?.some((lang: string) => lang.toLowerCase().trim().startsWith('fr'))
        );
      }
    } catch (err) {
      console.error('Failed to fetch voices:', err);
    } finally {
      isFetchingVoices = false;
    }
  }

  function saveVoiceSelection() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected_voice_id', selectedVoiceId);
      // Trigger storage event to notify other tabs/components
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'selected_voice_id',
        newValue: selectedVoiceId
      }));
    }
  }
  
  function saveTranscriptionService() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_transcription_service', preferredTranscriptionService);
      // Trigger storage event to notify other tabs/components
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'preferred_transcription_service',
        newValue: preferredTranscriptionService
      }));
    }
  }
  
  onMount(() => {
    // Check if user is logged in
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const storedUserInfo = localStorage.getItem('user_info');
      
      if (!token) {
        // Redirect to home if not logged in
        goto('/');
        return;
      }
      
       if (storedUserInfo) {
        try {
          const parsedInfo = JSON.parse(storedUserInfo);
          userInfo = {
            ...userInfo,
            name: parsedInfo.name || userInfo.name,
            picture: parsedInfo.picture || userInfo.picture,
            email: parsedInfo.email || userInfo.email
          };
        } catch (e) {
          console.error('Error parsing user info:', e);
        }
      }

      selectedVoiceId = localStorage.getItem('selected_voice_id') || '';
      const storedTranscriptionService = localStorage.getItem('preferred_transcription_service');
      if (storedTranscriptionService && ['groq', 'mistral', 'auto'].includes(storedTranscriptionService)) {
        preferredTranscriptionService = storedTranscriptionService as 'groq' | 'mistral' | 'auto';
      }
      void fetchVoices();
      
      // In a real app, you would fetch actual stats from your backend
      // This is mock data for demonstration
      userInfo.stats = {
        totalConversations: Math.floor(Math.random() * 50) + 10,
        totalMessages: Math.floor(Math.random() * 500) + 100,
        totalCharacters: Math.floor(Math.random() * 10000) + 2000,
        learningStreak: Math.floor(Math.random() * 30) + 1,
        lastActive: new Date().toLocaleDateString()
      };
    }
  });
  
  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      localStorage.removeItem('selected_voice_id');
      window.location.href = '/';
    }
  }
</script>

<div class="min-h-screen bg-[#efeae2] py-8 px-4">
  <div class="max-w-4xl mx-auto">
    <!-- Back Button -->
    <div class="mb-6">
      <button
        on:click={() => goto('/')}
        class="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span class="font-medium">Back to Chat</span>
      </button>
    </div>

    <!-- User Profile Section -->
    <div class="bg-white rounded-2xl shadow-sm p-8 mb-8">
      <div class="flex flex-col items-center gap-4">
        <div class="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-md">
          <img
            src={userInfo.picture || 'https://www.gravatar.com/avatar/default?s=200&d=mp'}
            alt="User avatar"
            class="w-full h-full object-cover"
            referrerpolicy="no-referrer"
          />
        </div>
        <div class="text-center">
          <h1 class="text-2xl font-bold text-slate-800 mb-1">{userInfo.name || 'French Learner'}</h1>
          <p class="text-slate-500 text-sm">Learning French with Ami</p>
        </div>
      </div>
    </div>

    <!-- Voice Settings Section -->
    <div class="bg-white rounded-2xl shadow-sm p-8 mb-8">
      <h2 class="text-xl font-semibold text-slate-800 mb-2">Tutor Voice Settings</h2>
      <p class="text-sm text-slate-500 mb-6 font-normal">Choose the voice you would like Ami to use during your lessons. The default multilingual voice offers native French pronunciation.</p>
       
      <div class="max-w-md">
        <label for="voice-select" class="block text-sm font-medium text-slate-700 mb-2">Ami's Voice</label>
        {#if isFetchingVoices}
          <div class="flex items-center gap-2 text-slate-500 text-sm">
            <svg class="animate-spin h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading voices from catalog...</span>
          </div>
        {:else}
          <select
            id="voice-select"
            bind:value={selectedVoiceId}
            on:change={saveVoiceSelection}
            class="w-full bg-white border border-slate-200 text-slate-700 rounded-xl text-[14px] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium shadow-sm transition-colors cursor-pointer"
          >
            <option value="">Default Multilingual (French) - Recommended</option>
            {#each voicesList as voice}
              <option value={voice.id}>{voice.name}</option>
            {/each}
          </select>
          {#if voicesList.length === 0}
            <p class="text-[11px] text-slate-400 mt-2">Only native French-supporting custom voices from your Mistral account are shown here. Other custom voices (e.g., English-only) are excluded to ensure correct pronunciation.</p>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Transcription Service Settings (Bassem only) -->
    {#if userInfo.email === 'bassem.bme@gmail.com'}
    <div class="bg-white rounded-2xl shadow-sm p-8 mb-8">
      <h2 class="text-xl font-semibold text-slate-800 mb-2">Transcription Service</h2>
      <p class="text-sm text-slate-500 mb-6 font-normal">Choose which transcription service to use for voice messages.</p>
      
      <div class="max-w-md">
        <label for="transcription-select" class="block text-sm font-medium text-slate-700 mb-2">Transcription Service</label>
        <select
          id="transcription-select"
          bind:value={preferredTranscriptionService}
          on:change={saveTranscriptionService}
          class="w-full bg-white border border-slate-200 text-slate-700 rounded-xl text-[14px] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium shadow-sm transition-colors cursor-pointer"
        >
          <option value="auto">Auto (Groq → Mistral)</option>
          <option value="groq">Groq (Whisper)</option>
          <option value="mistral">Mistral (Voxtral)</option>
        </select>
      </div>
    </div>
    {/if}

    <!-- Stats Section -->
    <div class="bg-white rounded-2xl shadow-sm p-8 mb-8">
      <h2 class="text-xl font-semibold text-slate-800 mb-6">Your Learning Progress</h2>
      
      <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600 mb-2">{userInfo.stats.totalConversations}</div>
          <div class="text-sm text-slate-500 uppercase tracking-wider">Conversations</div>
        </div>
        
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600 mb-2">{userInfo.stats.totalMessages}</div>
          <div class="text-sm text-slate-500 uppercase tracking-wider">Messages</div>
        </div>
        
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600 mb-2">{userInfo.stats.totalCharacters}</div>
          <div class="text-sm text-slate-500 uppercase tracking-wider">Characters</div>
        </div>
        
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600 mb-2">
            <svg class="inline-block w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {userInfo.stats.learningStreak}
          </div>
          <div class="text-sm text-slate-500 uppercase tracking-wider">Day Streak</div>
        </div>
        
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600 mb-2">{userInfo.stats.lastActive}</div>
          <div class="text-sm text-slate-500 uppercase tracking-wider">Last Active</div>
        </div>
      </div>
    </div>

    <!-- Logout Section -->
    <div class="mt-8 flex justify-center">
      <button
        on:click={handleLogout}
        class="w-full sm:w-auto bg-white border border-slate-200 text-red-600 py-2.5 px-8 rounded-full font-medium hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all shadow-sm flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        <span>Sign Out</span>
      </button>
    </div>
  </div>
</div>

<style>
  /* Add any page-specific styles here */
</style>