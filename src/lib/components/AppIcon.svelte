<script lang="ts">
  import GlowingIcon from './GlowingIcon.svelte';
  
  export let isActive: boolean = false;
  export let size: number = 32;
  export let notify: boolean = false;

  // Animation states
  let isGlowing = false;

  // Sync state
  $: isGlowing = isActive || notify;

  function handleClick() {
    // Add a quick feedback effect on click
    const btn = document.querySelector('.orb-click-container');
    if (btn) {
      btn.classList.add('clicked');
      setTimeout(() => btn.classList.remove('clicked'), 200);
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
  <!-- Notification dot -->
  {#if notify}
    <span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 z-20"></span>
  {/if}
  
  <!-- Smooth high-fidelity glassy/matte orb -->
  <span class="relative z-10 flex items-center justify-center">
    <GlowingIcon
      size={size}
      scheme="matte-lavender"
      pulse={isGlowing && !isActive}
      active={isActive}
    />
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