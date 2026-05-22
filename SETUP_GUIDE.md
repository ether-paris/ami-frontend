# Ami French Tutor - Setup Guide

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

### 3. Run database migrations

```bash
npm run migrate
```

### 4. Start the development server

```bash
npm run dev
```

## Authentication Setup

### Google OAuth Configuration

1. **Get Google OAuth credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Navigate to "APIs & Services" > "Credentials"
   - Create "OAuth client ID" with type "Web application"

2. **Configure authorized domains**:
   - Production: `https://ami.ether.paris`
   - Development: `http://localhost:5173`

3. **Add to `.env`**:

```env
VITE_GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_AUTH_SECRET=your_32_char_hex_secret
MISTRAL_API_KEY=your_mistral_api_key
```

### Generate Auth Secret

```bash
openssl rand -hex 32
```

## Database

The application uses SQLite with the following tables:

- `users` - Stores user accounts (Google OAuth)
- `usage_logs` - Tracks API usage

Database location: `~/data/tutor.db`

## Features Implemented

### 1. Glowing App Icon

- Reacts to model state (thinking/recording)
- Shows notifications for new voice clips
- Interactive with click animations

### 2. Google Authentication

- Sign in with Google button
- JWT token generation
- Session management

### 3. Voice Interface

- Record voice notes
- Real-time transcription
- Text-to-speech responses

## Development Notes

### Accessibility Fixes

- Fixed interactive elements to use proper ARIA roles
- Added keyboard navigation support
- Improved button semantics

### Database Migration

The migration script creates tables if they don't exist, making it safe to run multiple times.

## Troubleshooting

### "No such table: users"

Run the migration script:

```bash
npm run migrate
```

### Google Auth Errors

1. Check `.env` has correct `VITE_GOOGLE_OAUTH_CLIENT_ID`
2. Verify authorized domains in Google Cloud Console
3. Ensure you're using HTTPS in production

### Glowing Icon Not Working

- Check that `isActive` prop is set correctly
- Verify CSS animations are not disabled
- Ensure no JavaScript errors in console

## Production Deployment

### Environment Variables

```env
NODE_ENV=production
VITE_GOOGLE_OAUTH_CLIENT_ID=your_production_client_id
GOOGLE_OAUTH_AUTH_SECRET=your_production_secret
MISTRAL_API_KEY=your_production_mistral_key
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

## Component Usage

### AppIcon

```svelte
<AppIcon
  size={32}
  isActive={isThinking || isRecording}
  notify={hasNewNotifications}
/>
```

### GoogleAuth

```svelte
<GoogleAuth redirectTo="/dashboard" />
```
