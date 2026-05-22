<script lang="ts">
  import { goto } from '$app/navigation';
  
  export let redirectTo: string = '/';
  
  async function handleGoogleSignIn() {
    try {
      // Load Google Identity Services
      const google = window.google;
      
      if (!google) {
        console.error('Google Identity Services not loaded');
        alert('Google authentication service not loaded. Please refresh the page.');
        return;
      }
      
      // Check if Google Client ID is configured
      if (!import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID === 'your_google_client_id') {
        console.error('Google Client ID not configured');
        alert('Google authentication not configured. Please set VITE_GOOGLE_CLIENT_ID in .env');
        return;
      }
      
      const client = google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'openid profile email',
        callback: async (tokenResponse) => {
          try {
            if (!tokenResponse || !tokenResponse.access_token) {
              console.error('No access token received from Google');
              alert('Google authentication failed. Please try again.');
              return;
            }
            
            // Send token to your backend to verify and create session
            const response = await fetch('/api/auth/google', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token: tokenResponse.access_token }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              // Store the JWT token
              localStorage.setItem('auth_token', data.token);
              // Redirect to the desired page
              await goto(redirectTo);
            } else {
              console.error('Authentication failed:', data.error || 'Unknown error');
              alert('Authentication failed: ' + (data.error || 'Unknown error'));
            }
          } catch (error) {
            console.error('Error during authentication:', error);
            alert('Authentication error: ' + error.message);
          }
        },
      });
      
      client.requestAccessToken();
    } catch (error) {
      console.error('Google sign-in error:', error);
      alert('Google sign-in error: ' + error.message);
    }
  }
</script>

<button
  on:click={handleGoogleSignIn}
  class="flex items-center justify-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
>
  <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.48 10.92v3.28h7.84c-0.16 1.88-1.12 3.52-2.64 4.68-0.72 0.56-1.52 0.88-2.32 0.88-0.76 0-1.52-0.32-2.16-0.84l-3.24-2.48c-0.32-0.24-0.56-0.56-0.72-0.92l-1.6 1.6c-0.4 0.4-0.88 0.64-1.36 0.64-0.48 0-0.96-0.24-1.36-0.64l-1.6-1.6c-0.4-0.4-0.64-0.88-0.64-1.36s0.24-0.96 0.64-1.36l10-7.6c0.4-0.32 0.88-0.56 1.36-0.64 0.48 0 0.96 0.24 1.36 0.64l1.6 1.6c0.16 0.16 0.32 0.32 0.48 0.52 0.72 0.8 1.2 1.84 1.44 3.04z"/>
  </svg>
  Sign in with Google
</button>

<style>
  /* Add any component-specific styles here */
</style>