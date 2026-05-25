# OAuth Setup for Lightspeed X-Series Promo Code Uploader

This guide walks you through setting up OAuth 2.0 authentication for the Lightspeed X-Series Promo Code Uploader.

## Overview

The uploader now supports two authentication methods:

1. **OAuth 2.0 (Recommended)** - For apps connecting to multiple stores
2. **Personal Tokens** - For Plus plan retailers (simpler, but limited to one store)

## Prerequisites

- Node.js 14+ installed
- A Lightspeed account with X-Series (formerly Vend)
- Administrator access to your store or development account

## Step 1: Create a Lightspeed Developer Account

1. Go to https://developers.retail.lightspeed.app/register
2. Register for a **developer account** (separate from your store account)
3. Verify your email
4. Sign in to the developer portal

## Step 2: Create a Lightspeed Application

1. After sign-in, visit https://developers.retail.lightspeed.app/applications
2. Click **"Create Application"** (or **"Add"**)
3. Fill in the application details:
   - **Application Name**: e.g., "Promo Code Uploader"
   - **Redirect URI**: `http://localhost:3000/callback` (for local development)
   - For production, use your actual callback URL

4. You'll receive:
   - **Client ID**
   - **Client Secret** (keep this secret!)

## Step 3: Configure Your Application

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your OAuth credentials:
   ```env
   LS_CLIENT_ID=your_client_id_from_step_2
   LS_CLIENT_SECRET=your_client_secret_from_step_2
   LS_REDIRECT_URI=http://localhost:3000/callback
   LS_PROMOTION_ID=your_promotion_id_in_lightspeed
   ```

3. Optional: Customize API scopes (see [Scopes Reference](https://x-series-api.lightspeedhq.com/docs/scopes))
   ```env
   LS_SCOPES=products:read sales:read customers:read promotions:write
   ```

## Step 4: Authenticate

Run the authentication flow:

```bash
node authenticate.js authorize
```

This script will:
1. Prompt you to confirm your OAuth credentials
2. Open a browser window to Lightspeed's authorization page
3. Ask you to authorize access to your store
4. Receive an authorization code
5. Exchange it for access and refresh tokens
6. Save tokens to `.env` automatically

### What Gets Saved

After successful authentication, `.env` will contain:
- `LS_ACCESS_TOKEN` - Currently valid access token
- `LS_REFRESH_TOKEN` - Token to refresh expired access tokens
- `LS_TOKEN_EXPIRES_AT` - When the access token expires
- `LS_DOMAIN_PREFIX` - Your store's domain

**Never commit these tokens to version control!**

## Step 5: Upload Promo Codes

```bash
# Basic usage with CSV file and promotion ID
node upload-codes.js --file june-member-codes.csv --promotion YOUR_PROMOTION_ID

# Or use .env for promotion ID
node upload-codes.js --file june-member-codes.csv

# Customize batch size and max redemptions
node upload-codes.js --file codes.csv --batchSize 500 --maxRedemptions 5

# Dry run to preview the payload
node upload-codes.js --file codes.csv --dryRun
```

## Token Refresh

Tokens automatically refresh when they expire. The uploader checks token expiration before each upload and refreshes if needed.

To manually refresh:

```bash
node authenticate.js refresh
```

## Troubleshooting

### "Missing LS_CLIENT_ID in .env"
- Make sure you've completed Step 3 (Configure Application)
- Check that `.env` exists and is readable

### "Authorization denied" or redirect error
- Verify your redirect URL in `.env` matches exactly what you set in the Developer Portal
- Ensure you're using `http://localhost:3000/callback` for local development
- Check that port 3000 isn't already in use

### "Token exchange failed"
- Verify your Client Secret is correct
- Ensure your Client ID is correct
- Check that your Redirect URI is configured in the Developer Portal

### "Invalid Redirect URI"
- The redirect URI must match **exactly** (including protocol, domain, port, and path)
- For local development: `http://localhost:3000/callback`
- For production: Use your actual domain (must be HTTPS)

### Token authentication fails with 401
- Token may have expired beyond the 5-minute refresh buffer
- Run: `node authenticate.js refresh`
- If that fails, reauthorize: `node authenticate.js authorize`

## Advanced Configuration

### Custom API Scopes

Edit `LS_SCOPES` in `.env` to request specific permissions:

```env
# Request only what you need
LS_SCOPES=promotions:write promotions:read
```

See [Scopes Reference](https://x-series-api.lightspeed.app/docs/scopes) for available scopes.

### Custom Field Names

If your Lightspeed account uses different field names for promo codes:

```env
LS_PROMO_CODE_FIELD=promotion_code
LS_PROMO_REDEMPTION_FIELD=redemptions_allowed
```

### Production Redirect URI

For production servers, update your redirect URI:

```env
LS_REDIRECT_URI=https://yourdomain.com/oauth/callback
```

Then update this in the Developer Portal as well.

## Alternative: Personal Token Authentication

If you prefer to use a Personal Token instead:

1. In Lightspeed admin, go to **Personal Tokens**
2. Create a new token and copy it
3. Update `.env`:
   ```env
   LS_DOMAIN_PREFIX=your-store-prefix
   LS_ACCESS_TOKEN=your_personal_token
   ```

**Note:** Personal tokens are only available on Plus plans and can only authenticate one store at a time.

## Security Best Practices

1. **Never commit tokens** to version control:
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Rotate credentials** if compromised:
   - Regenerate Personal Tokens in Lightspeed admin
   - Or reauthorize via `node authenticate.js authorize`

3. **Use HTTPS** for production redirect URIs

4. **Limit scope** to only permissions you need

5. **Protect your Client Secret** - don't share it

## Documentation

- [Lightspeed X-Series OAuth Docs](https://x-series-api.lightspeedhq.com/docs/authorization)
- [Scopes Reference](https://x-series-api.lightspeed.app/docs/scopes)
- [Developer Portal](https://developers.retail.lightspeed.app)

## Support

For issues with:
- **OAuth flow**: Check `.env` configuration and token files
- **Lightspeed API errors**: See the error message and check the [API Documentation](https://x-series-api.lightspeedhq.com/)
- **Script issues**: Check the terminal output and error logs
