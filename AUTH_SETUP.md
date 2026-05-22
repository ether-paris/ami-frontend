# Authentication Setup Guide

## Google OAuth Configuration

### Step 1: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"

### Step 2: Configure OAuth Consent Screen

1. Go to "OAuth consent screen" in the left menu
2. Select "External" user type
3. Fill in your app information:
   - App name: "Ami French Tutor"
   - User support email: your email
   - Developer contact information: your email
4. Add your domain to authorized domains:
   - `ami.ether.paris`
   - `localhost:5173` (for development)

### Step 3: Create OAuth Client ID

1. Application type: "Web application"
2. Name: "Ami Web Client"
3. Authorized JavaScript origins:
   - `https://ami.ether.paris`
   - `http://localhost:5173`
4. Authorized redirect URIs:
   - `https://ami.ether.paris`
   - `http://localhost:5173`

### Step 4: Update .env File

Copy the Client ID from Google Cloud Console and add to your `.env` file:

```env
VITE_GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_AUTH_SECRET=your_generated_secret_here
```

Generate a secret with:

```bash
openssl rand -hex 32
```

### Step 5: Enable Google APIs

Make sure these APIs are enabled:

- Google Identity Toolkit API
- People API

## Testing the Authentication

1. Visit `/login` to test the Google sign-in
2. After successful authentication, you'll be redirected to the home page
3. The JWT token will be stored in localStorage
4. Subsequent API calls will include this token in the Authorization header

## Troubleshooting

- **Invalid redirect URI**: Make sure your redirect URIs match exactly what's in Google Cloud Console
- **Token errors**: Ensure your GOOGLE_OAUTH_AUTH_SECRET matches what's used to sign tokens
- **CORS issues**: Make sure your domain is added to authorized domains

## Production Deployment

For production, update the authorized domains and redirect URIs to use only your production domain:

- `https://ami.ether.paris`

Remove development URLs for security.

## Security Notes

- Never commit your `.env` file to version control
- Keep your GOOGLE_OAUTH_AUTH_SECRET secure
- Use HTTPS in production
- Consider adding rate limiting to your auth endpoints
