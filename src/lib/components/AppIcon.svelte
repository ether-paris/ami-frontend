<script lang="ts">
  import GlowingIcon from './GlowingIcon.svelte';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let isActive: boolean = false;
  export let size: number = 32;
  export let isSpeaking: boolean = false;
  
  // Animation states
  let isGlowing = false;
  let visualizer: any = null;
  
  // Sync state
  $: isGlowing = isActive;
  
  function handleClick() {
    // Add a quick feedback effect on click
    const btn = document.querySelector('.orb-click-container');
    if (btn) {
      btn.classList.add('clicked');
      setTimeout(() => btn.classList.remove('clicked'), 200);
    }
  }
  
  // Expose method to connect audio elements to visualizer
  export function connectAudioElement(element: HTMLAudioElement) {
    if (visualizer && typeof visualizer.connectAudio === 'function') {
      visualizer.connectAudio(element);
    }
  }
</script>

<button 
  class="orb-click-container relative inline-flex p-0 border-none bg-transparent cursor-pointer rounded-full transition-transform active:scale-95"
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  aria-label="App icon"
  tabindex="0"
>

  
  <!-- Smooth high-fidelity glassy/matte orb -->
  <span class="relative z-10 flex items-center justify-center">
    {#if isSpeaking}
      <AudioVisualizer bind:this={visualizer} isActive={isSpeaking} size={size}>
        <GlowingIcon
          size={size}
          scheme="matte-lavender"
          pulse={false}
          active={true}
        />
      </AudioVisualizer>
    {:else}
      <GlowingIcon
        size={size}
        scheme="matte-lavender"
        pulse={isGlowing && !isActive}
        active={isActive}
      />
    {/if}
  </span>
</button>

<style>
  .orb-click-container {
    outline: none;
  }
  
  .orb-click-container:focus-visible {
    box-shadow: 0 0 0 2px #38bdf8;
  }

  :global(.clicked) {
    transform: scale(0.9) !important;
  }
</style>