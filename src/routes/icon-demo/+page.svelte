<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import GlowingIcon from '$lib/components/GlowingIcon.svelte';
  
  let isActive = false;
  let showNotification = false;

  function toggleActive() {
    isActive = !isActive;
  }

  function toggleNotification() {
    showNotification = !showNotification;
    // Auto-turn off notification after 3 seconds
    if (showNotification) {
      setTimeout(() => showNotification = false, 3000);
    }
  }
</script>

<div class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
    <h1 class="text-2xl font-bold text-gray-800 mb-6">Glowing Icon Demo</h1>

    <div class="space-y-6">
      <!-- Basic Glowing Icon -->
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 class="font-medium text-gray-900">Basic Glowing Icon</h3>
          <p class="text-sm text-gray-500">Simple SVG with glow effect</p>
        </div>
        <GlowingIcon size={28} color="#10b981" glowColor="#34d399" />
      </div>

      <!-- App Icon with State -->
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 class="font-medium text-gray-900">App Icon (Active State)</h3>
          <p class="text-sm text-gray-500">Click to toggle active state</p>
        </div>
        <button on:click={toggleActive} class="focus:outline-none">
          <AppIcon size={32} isActive={isActive} />
        </button>
      </div>

      <!-- App Icon with Notification -->
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 class="font-medium text-gray-900">App Icon with Notification</h3>
          <p class="text-sm text-gray-500">Click to trigger notification</p>
        </div>
        <button on:click={toggleNotification} class="focus:outline-none">
          <AppIcon size={32} notify={showNotification} />
        </button>
      </div>

      <!-- Different Colors -->
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 class="font-medium text-gray-900">Custom Colors</h3>
          <p class="text-sm text-gray-500">Purple theme example</p>
        </div>
        <GlowingIcon size={28} color="#8b5cf6" glowColor="#a78bfa" pulse={true} />
      </div>
    </div>

    <div class="mt-8 p-4 bg-blue-50 rounded-lg">
      <h3 class="font-medium text-blue-800 mb-2">Usage Examples:</h3>
      <div class="space-y-2 text-sm">
        <div class="flex items-center">
          <code class="bg-gray-100 px-2 py-1 rounded mr-2">&lt;AppIcon isActive={true} /&gt;</code>
          <AppIcon isActive={true} size={20} />
        </div>
        <div class="flex items-center">
          <code class="bg-gray-100 px-2 py-1 rounded mr-2">&lt;AppIcon notify={true} /&gt;</code>
          <AppIcon notify={true} size={20} />
        </div>
        <div class="flex items-center">
          <code class="bg-gray-100 px-2 py-1 rounded mr-2">&lt;GlowingIcon pulse /&gt;</code>
          <GlowingIcon size={20} pulse={true} />
        </div>
      </div>
    </div>
  </div>
</div>