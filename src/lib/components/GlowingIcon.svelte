<script lang="ts">
  export let size: number = 40;
  export let pulse: boolean = false;
  export let active: boolean = false;
  
  // Available color schemes: 'matte-lavender' (default), 'aurora-teal', 'sunset-glow'
  export let scheme: 'matte-lavender' | 'aurora-teal' | 'sunset-glow' = 'matte-lavender';

  // Unique ID to avoid SVG filter collisions
  const filterId = `orb-grain-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div 
  class="orb-container"
  style="--orb-size: {size}px;"
  class:pulse={pulse}
  class:active={active}
  data-scheme={scheme}
>
  <!-- Background Glow -->
  <div class="orb-glow"></div>

  <!-- The Matte 3D Orb -->
  <div class="orb-sphere">
    <!-- Base texture and gradients -->
    <div class="orb-gradients">
      {#if scheme === 'matte-lavender'}
        <!-- Lavender/peach matte color scheme from Image 1 -->
        <div class="gradient-layer bg-lavender-base"></div>
        <div class="gradient-layer highlight-peach"></div>
        <div class="gradient-layer highlight-pink"></div>
      {:else if scheme === 'aurora-teal'}
        <!-- Greenish/blue/cyan color scheme -->
        <div class="gradient-layer base-green"></div>
        <div class="gradient-layer warm-yellow"></div>
        <div class="gradient-layer bright-cyan"></div>
      {:else if scheme === 'sunset-glow'}
        <!-- Vibrant violet/orange/rose color scheme -->
        <div class="gradient-layer bg-violet-base"></div>
        <div class="gradient-layer highlight-orange"></div>
        <div class="gradient-layer highlight-gold"></div>
      {/if}
    </div>
    
    <!-- Ultra High-Fidelity Matte Grain Noise Filter - optimized for mobile -->
    <svg class="orb-noise-svg" aria-hidden="true">
      <filter id={filterId}>
        <!-- Higher frequency for fine grain texture rather than large pixelated dots -->
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" result="noise" />
        <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.16 0" result="coloredNoise" />
        <feComposite operator="in" in2="SourceGraphic" result="composited" />
        <feBlend mode="overlay" in2="SourceGraphic" result="finalNoise" />
      </filter>
      <rect width="100%" height="100%" filter="url(#{filterId})" />
    </svg>

    <!-- Subtle Matte Rim Light Overlay (no gloss shine) -->
    <div class="orb-matte-rim"></div>
  </div>
</div>

<style>
  .orb-container {
    position: relative;
    width: var(--orb-size);
    height: var(--orb-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    user-select: none;
    will-change: transform;
    transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    overflow: visible !important; /* Ensure glow is visible outside container */
  }

  /* The 3D Matte Sphere */
  .orb-sphere {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: #8b5cf6; /* Lighter purple base for a more balanced appearance */
    box-shadow: 
      inset 0 2px 4px rgba(255, 255, 255, 0.3),
      inset 0 -8px 20px rgba(224, 203, 255, 0.4), /* Soft lavender inner glow for depth */
      0 8px 20px rgba(0, 0, 0, 0.1),
      0 2px 6px rgba(0, 0, 0, 0.05);
    transform: translateZ(0); /* Force hardware acceleration */
  }

   /* Layered Gradients inside the Orb to create smooth fluid blends */
  .orb-gradients {
    position: absolute;
    inset: -15%;
    border-radius: 50%;
    filter: blur(12px); /* Slightly reduced blur for a more solid, less transparent look */
    will-change: transform;
    overflow: hidden; /* Prevent gradient overflow from causing square artifacts */
  }

  /* Position each layer absolutely so they stack correctly */
  .gradient-layer {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    will-change: transform;
  }

  /* --- 1. MATTE LAVENDER SCHEME (Default - balanced purple and orange, centered) --- */
  .bg-lavender-base {
    /* Lighter purple base with subtle lavender highlights, centered */
    background: radial-gradient(circle at 50% 50%, #a78bfa 0%, #8b5cf6 40%, #7c3aed 80%, #6d28d9 100%);
  }

  .highlight-peach {
    /* Increased orange presence for better balance, centered with gradual dispersion */
    background: radial-gradient(circle at 50% 70%, #fbbf24 0%, #fde047 25%, #fef3c7 50%, rgba(254, 240, 138, 0) 75%);
    mix-blend-mode: normal; /* Opaque but softer peach colors */
    opacity: 0.8; /* Slightly more intense to balance the purple */
    animation: float-matte-1 14s ease-in-out infinite alternate;
  }

  .highlight-pink {
    /* Soft lavender-pink for smooth transitions, centered */
    background: radial-gradient(circle at 50% 40%, #c4b5fd 0%, #a78bfa 40%, rgba(167, 139, 250, 0) 70%);
    mix-blend-mode: overlay; /* Gentle overlay to enhance purple tones */
    opacity: 0.5; /* Reduced opacity to let orange show through */
    animation: float-matte-2 15s ease-in-out infinite alternate;
  }

  /* --- 2. AURORA TEAL SCHEME --- */
  .base-green {
    background: radial-gradient(circle at 50% 60%, #15803d 0%, #166534 40%, #064e3b 100%);
  }

  .warm-yellow {
    background: radial-gradient(circle at 75% 75%, #a3e635 0%, rgba(163, 230, 53, 0) 65%);
    mix-blend-mode: screen;
    animation: float-matte-1 10s ease-in-out infinite alternate;
  }

  .bright-cyan {
    background: radial-gradient(circle at 25% 25%, #38bdf8 0%, #0ea5e9 50%, rgba(14, 165, 233, 0) 80%);
    mix-blend-mode: screen;
    animation: float-matte-2 12s ease-in-out infinite alternate;
  }

  /* --- 3. SUNSET GLOW SCHEME --- */
  .bg-violet-base {
    background: radial-gradient(circle at 35% 30%, #a78bfa 0%, #7c3aed 55%, #5b21b6 100%);
  }

  .highlight-orange {
    background: radial-gradient(circle at 65% 85%, #ff9c5a 0%, #ea580c 50%, rgba(234, 88, 12, 0) 80%);
    mix-blend-mode: screen;
    animation: float-matte-1 11s ease-in-out infinite alternate;
  }

  .highlight-gold {
    background: radial-gradient(circle at 80% 40%, #fef08a 0%, rgba(234, 179, 8, 0) 70%);
    mix-blend-mode: overlay;
    animation: float-matte-2 14s ease-in-out infinite alternate;
  }

  /* Ultra-soft Matte rim shadow/light for organic physical appearance */
  .orb-matte-rim {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: 
      inset 0 2px 4px rgba(255, 255, 255, 0.25), /* Soft white rim light on top-left */
      inset 0 -6px 15px rgba(234, 179, 8, 0.2); /* Soft orange rim light on bottom-right */
    pointer-events: none;
  }

  /* SVG Noise Overlay for paper/grain texture */
  .orb-noise-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
    mix-blend-mode: overlay;
    opacity: 0.75; /* Richer noise for a solid matte texture */
  }

  /* Outer ambient glow */
  .orb-glow {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    filter: blur(10px); /* Less blur for a more solid, less transparent glow */
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity;
  }

  /* Theme-specific glows */
  [data-scheme="matte-lavender"] .orb-glow {
    background: radial-gradient(circle, rgba(234, 179, 8, 0.4) 0%, rgba(167, 139, 250, 0.3) 55%, rgba(0, 0, 0, 0) 75%);
  }

   /* SVG Noise Overlay for paper/grain texture - reduced opacity for mobile compatibility */
  .orb-noise-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
    mix-blend-mode: overlay;
    opacity: 0.65; /* Slightly softer noise for a super smooth, premium matte paper look */
  }

   /* Outer ambient glow - ensure proper clipping on mobile */
  .orb-glow {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    filter: blur(12px);
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity;
    z-index: -1; /* Place behind the orb to prevent clipping issues */
  }

  /* Theme-specific glows */
  [data-scheme="matte-lavender"] .orb-glow {
    background: radial-gradient(circle, rgba(129, 140, 248, 0.35) 0%, rgba(253, 186, 116, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  [data-scheme="aurora-teal"] .orb-glow {
    background: radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(163, 230, 53, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  [data-scheme="sunset-glow"] .orb-glow {
    background: radial-gradient(circle, rgba(236, 72, 153, 0.35) 0%, rgba(249, 115, 22, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  /* Mobile-specific fixes */
  @media (hover: none) and (pointer: coarse) {
    .orb-glow {
      filter: blur(8px); /* Reduce blur on mobile for better performance */
    }
    
    .orb-noise-svg {
      opacity: 0.5; /* Reduce noise intensity on mobile */
    }
    
    /* Specific fix for iOS Safari square frame issue */
    @supports (-webkit-touch-callout: none) {
      .orb-container {
        -webkit-mask-image: -webkit-radial-gradient(white, black); /* Force proper clipping on iOS */
      }
      
      .orb-sphere {
        -webkit-backface-visibility: hidden; /* Prevent rendering artifacts */
      }
    }
  }

  /* Outer ambient glow matched to theme */
  .orb-glow {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    filter: blur(12px);
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity;
  }

  /* Theme-specific glows */
  [data-scheme="matte-lavender"] .orb-glow {
    background: radial-gradient(circle, rgba(129, 140, 248, 0.35) 0%, rgba(253, 186, 116, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  [data-scheme="aurora-teal"] .orb-glow {
    background: radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(163, 230, 53, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  [data-scheme="sunset-glow"] .orb-glow {
    background: radial-gradient(circle, rgba(236, 72, 153, 0.35) 0%, rgba(249, 115, 22, 0.1) 55%, rgba(0, 0, 0, 0) 75%);
  }

  /* Active/Speaking animation states */
  .active .orb-glow, .pulse .orb-glow {
    opacity: 1;
  }

  /* Smooth organic breathing animation when model is active/talking */
  .active {
    animation: breathe 3s ease-in-out infinite;
  }

  .pulse {
    animation: gentle-pulse 4.5s ease-in-out infinite;
  }

  /* Fluid float animations for internal gradients with gradual dispersion */
  @keyframes float-matte-1 {
    0% {
      transform: translate(0, 0) scale(1) rotate(0deg);
    }
    25% {
      transform: translate(-3%, -5%) scale(1.05) rotate(8deg);
    }
    50% {
      transform: translate(-8%, -12%) scale(1.12) rotate(20deg);
    }
    75% {
      transform: translate(2%, 4%) scale(1.08) rotate(-12deg);
    }
    100% {
      transform: translate(0, 0) scale(1) rotate(0deg);
    }
  }

  @keyframes float-matte-2 {
    0% {
      transform: translate(0, 0) scale(1) rotate(0deg);
    }
    25% {
      transform: translate(5%, 3%) scale(0.98) rotate(-10deg);
    }
    50% {
      transform: translate(12%, 8%) scale(0.93) rotate(-25deg);
    }
    75% {
      transform: translate(-2%, -6%) scale(1.05) rotate(18deg);
    }
    100% {
      transform: translate(0, 0) scale(1) rotate(0deg);
    }
  }

  @keyframes breathe {
    0%, 100% {
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      transform: scale(1.07);
      filter: brightness(1.06) contrast(1.02);
    }
  }

  @keyframes gentle-pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
  }
</style>