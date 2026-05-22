<script lang="ts">
  import GoogleAuth from '$lib/components/GoogleAuth.svelte';
  import { goto } from '$app/navigation';
  
  // Check if user is already authenticated
  $: if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      goto('/');
    }
  }
</script>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
      Sign in to Ami Tutor
    </h2>
    <p class="mt-2 text-center text-sm text-gray-600">
      Continue with your Google account
    </p>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
      <div class="space-y-6">
        <div>
          <GoogleAuth redirectTo="/" />
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Add any page-specific styles here */
</style>