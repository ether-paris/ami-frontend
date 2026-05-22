<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  export let isActive: boolean = false;
  export let size: number = 40;
  
  // Animation state
  let scale = 1;
  let brightness = 1;
  let rotation = 0;
  let animationId: number | null = null;
  
  // Audio analysis
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let audioSource: MediaElementAudioSourceNode | null = null;
  let dataArray: Uint8Array | null = null;
  let lastVolume = 0;
  let isPaused = false;
  
  onMount(() => {
    if (isActive) {
      setupAudioAnalysis();
    }
  });
  
  onDestroy(() => {
    cleanupAudioAnalysis();
  });
  
  function setupAudioAnalysis() {
    if (audioContext || !isActive) return;
    
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7; // Smoother transitions
      
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      
      // We'll connect the audio source when we have it
      startAnimation();
    } catch (error) {
      console.error('Error setting up audio analysis:', error);
      // Fallback to simple pulse if audio analysis fails
      startFallbackAnimation();
    }
  }
  
  function connectAudioSource(audioElement: HTMLAudioElement) {
    if (!audioContext || !analyser) return;
    
    try {
      if (audioSource) {
        audioSource.disconnect();
      }
      
      audioSource = audioContext.createMediaElementSource(audioElement);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);
    } catch (error) {
      console.error('Error connecting audio source:', error);
    }
  }
  
  function cleanupAudioAnalysis() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    if (audioSource) {
      try {
        audioSource.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio source:', error);
      }
      audioSource = null;
    }
    
    if (audioContext) {
      try {
        audioContext.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
      audioContext = null;
    }
    
    analyser = null;
    dataArray = null;
    
    // Reset to default state
    scale = 1;
    brightness = 1;
    rotation = 0;
    lastVolume = 0;
    isPaused = false;
  }
  
  function startAnimation() {
    if (animationId) return;
    animate();
  }
  
  function startFallbackAnimation() {
    if (animationId) return;
    
    let phase = 0;
    const animateFallback = () => {
      phase += 0.05;
      const pulse = Math.sin(phase) * 0.5 + 0.5;
      
      // Very subtle animations
      scale = 1 + (pulse * 0.03);
      brightness = 1 + (pulse * 0.05);
      rotation = pulse * 1;
      
      animationId = requestAnimationFrame(animateFallback);
    };
    animateFallback();
  }
  
  function animate() {
    if (!analyser || !dataArray) {
      startFallbackAnimation();
      return;
    }
    
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const averageVolume = sum / dataArray.length;
    const normalizedVolume = Math.min(averageVolume / 100, 1);
    
    // Detect pauses (volume drops significantly)
    const volumeChange = Math.abs(normalizedVolume - lastVolume);
    const isCurrentPaused = normalizedVolume < 0.1; // Very quiet
    
    if (isCurrentPaused && !isPaused && volumeChange > 0.3) {
      // Pause detected - create a small "breath" effect
      isPaused = true;
    } else if (!isCurrentPaused && isPaused && volumeChange > 0.2) {
      // Speech resumed - create a small "wake up" effect
      isPaused = false;
    }
    
    lastVolume = normalizedVolume;
    
    // More dynamic animation based on actual speech patterns
    if (isPaused) {
      // Subtle breathing during pauses
      scale = 1 + 0.01; // Very slight expansion
      brightness = 1 + 0.02;
      rotation = 0;
    } else {
      // Dynamic response to speech amplitude
      const dynamicFactor = 0.5 + (normalizedVolume * 0.5); // 0.5 to 1.0 based on volume
      
      // Base animation with volume modulation
      const now = Date.now();
      const basePulse = Math.sin(now / 800) * 0.5 + 0.5;
      const finalPulse = basePulse * dynamicFactor;
      
      // More responsive animations
      scale = 1 + (finalPulse * 0.04); // Scale between 1.0 and 1.04
      brightness = 1 + (finalPulse * 0.06); // Brightness between 1.0 and 1.06
      rotation = finalPulse * 1.5; // Rotation up to 1.5 degrees
      
      // Add some "energy" based on volume changes
      const energy = Math.min(volumeChange * 2, 0.3);
      scale += energy * 0.02;
      brightness += energy * 0.03;
    }
    
    animationId = requestAnimationFrame(animate);
  }
  
  // Expose method to connect audio element
  export function connectAudio(element: HTMLAudioElement) {
    if (audioContext && analyser) {
      connectAudioSource(element);
    }
  }
  
  $: if (isActive) {
    setupAudioAnalysis();
  } else {
    cleanupAudioAnalysis();
  }
</script>

<div class="audio-visualizer-container" style="--size: {size}px;">
  <div 
    class="visualizer-sphere"
    style="
      transform: scale({scale}) rotate({rotation}deg);
      filter: brightness({brightness});
      width: var(--size);
      height: var(--size);
    "
  >
    <slot></slot>
  </div>
</div>

<style>
  .audio-visualizer-container {
    position: relative;
    width: var(--size);
    height: var(--size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  }
  
  .visualizer-sphere {
    transition: transform 0.1s ease-out, filter 0.1s ease-out;
    will-change: transform, filter;
  }
</style>