<script lang="ts">
  import { goto } from "$app/navigation";

  export let redirectTo: string = "/";

  async function handleGoogleSignIn() {
    try {
      // Load Google Identity Services
      const google = window.google;

      if (!google) {
        console.error("Google Identity Services not loaded");
        alert(
          "Google authentication service not loaded. Please refresh the page.",
        );
        return;
      }

      // Check if Google Client ID is configured
      if (
        !import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
        import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID === "your_google_client_id"
      ) {
        console.error("Google Client ID not configured");
        alert(
          "Google authentication not configured. Please set VITE_GOOGLE_OAUTH_CLIENT_ID in .env",
        );
        return;
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID,
        scope: "openid profile email",
        callback: async (tokenResponse) => {
          try {
            if (!tokenResponse || !tokenResponse.access_token) {
              console.error("No access token received from Google");
              alert("Google authentication failed. Please try again.");
              return;
            }

            // Send token to your backend to verify and create session
            const response = await fetch("/api/auth/google", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token: tokenResponse.access_token }),
            });

            const data = await response.json();

            if (response.ok) {
              // Store the JWT token
              localStorage.setItem("auth_token", data.token);

              // Store user info if provided by backend
              if (data.user) {
                localStorage.setItem("user_info", JSON.stringify(data.user));
              } else {
                // Fallback for development mock
                const userInfo = {
                  name: "Development User",
                  picture: "https://www.gravatar.com/avatar/default?s=200&d=mp",
                  email: "dev@example.com",
                };
                localStorage.setItem("user_info", JSON.stringify(userInfo));
              }

              // Trigger storage event to update other tabs/components
              window.dispatchEvent(
                new StorageEvent("storage", {
                  key: "auth_token",
                  newValue: data.token,
                }),
              );

              // Redirect to the desired page
              await goto(redirectTo);
            } else {
              console.error(
                "Authentication failed:",
                data.error || "Unknown error",
              );
              alert(
                "Authentication failed: " + (data.error || "Unknown error"),
              );
            }
          } catch (error) {
            console.error("Error during authentication:", error);
            alert("Authentication error: " + error.message);
          }
        },
      });

      client.requestAccessToken();
    } catch (error) {
      console.error("Google sign-in error:", error);
      alert("Google sign-in error: " + error.message);
    }
  }
</script>

<button
  on:click={handleGoogleSignIn}
  class="px-3 py-1.5 bg-white border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
  aria-label="Login with Google"
  title="Login with Google"
>
  Login
</button>

<style>
  /* Add any component-specific styles here */
</style>
