# Lightspeed X-Series Promo Code Uploader

Command-line tools for generating promo codes and uploading them to a Lightspeed X-Series promotion.

The tool supports OAuth setup, token refresh, CSV generation, CSV upload, dry runs, batching, and basic retry handling.

## Requirements

* Node.js 14 or newer
* A Lightspeed X-Series account with access to manage promotions
* A Lightspeed Developer application
* A promotion already created in Lightspeed

## Install

Clone the project and install dependencies:

```bash
git clone https://github.com/anthonyraudino/lightspeed-promouploader.git
cd lightspeed-promo-uploader
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

## Configure Lightspeed OAuth

Create an app in the Lightspeed Developer Portal:

1. Go to `https://developers.retail.lightspeed.app/register`
2. Register or sign in
3. Go to `https://developers.retail.lightspeed.app/applications`
4. Create a new application
5. Set the redirect URI to:

```text
http://localhost:3000/callback
```

Add the client details to `.env`:

```bash
LS_CLIENT_ID="your_client_id"
LS_CLIENT_SECRET="your_client_secret"
LS_REDIRECT_URI="http://localhost:3000/callback"
LS_PROMOTION_ID="your_lightspeed_promotion_id"
```

The redirect URI in `.env` must match the redirect URI in the Developer Portal exactly.

## Authorise the app

Run:

```bash
npm run auth
```

The script will open a browser authorisation flow, exchange the returned code for tokens, and save the token values to `.env`.

Run this again if you need to connect a different Lightspeed account or your refresh token stops working.

## Generate promo codes

Generate a CSV of unique promo codes:

```bash
npm run generate -- --count 1000 --prefix JUNE-
```

By default, this writes to:

```text
csv/promo-codes.csv
```

### Generate options

| Option      | Default                            | Description                            |
| ----------- | ---------------------------------- | -------------------------------------- |
| `--count`   | `1000`                             | Number of codes to generate            |
| `--length`  | `8`                                | Length of the random part of each code |
| `--prefix`  | `JUNE-`                            | Prefix added before the random code    |
| `--charset` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | Characters used for the random part    |
| `--out`     | `csv/promo-codes.csv`              | Output file                            |

Examples:

```bash
npm run generate -- --count 5000 --prefix JUNE-
```

```bash
npm run generate -- --count 10000 --prefix MEMBER- --length 8 --out csv/member-codes.csv
```

```bash
npm run generate -- --count 2000 --charset 0123456789 --length 10 --out csv/numeric-codes.csv
```

The default character set avoids similar-looking characters such as `O`, `0`, `I`, and `1`.

## Upload promo codes

Upload codes from a CSV file:

```bash
npm run upload -- --file csv/promo-codes.csv --promotion YOUR_PROMOTION_ID
```

If `LS_PROMOTION_ID` is set in `.env`, you can omit `--promotion`:

```bash
npm run upload -- --file csv/promo-codes.csv
```

### Upload options

| Option             | Default                 | Description                          |
| ------------------ | ----------------------- | ------------------------------------ |
| `--file`           | `june-member-codes.csv` | CSV file to upload                   |
| `--promotion`      | `LS_PROMOTION_ID`       | Lightspeed promotion ID              |
| `--batchSize`      | `250`                   | Number of codes sent per request     |
| `--maxRedemptions` | `1`                     | Maximum redemptions allowed per code |
| `--dryRun`         | `false`                 | Build the payload without uploading  |

Examples:

```bash
npm run upload -- --file csv/member-codes.csv --promotion 2058781611949719552
```

```bash
npm run upload -- --file csv/member-codes.csv --batchSize 100
```

```bash
npm run upload -- --file csv/member-codes.csv --maxRedemptions 1
```

```bash
npm run upload -- --file csv/member-codes.csv --dryRun
```

Dry runs write a test payload to:

```text
test/dry-run-promotion-upload-payload.json
```

No codes are uploaded during a dry run.

## CSV format

The CSV must have a header row named either `promo_code` or `code`.

Valid format:

```csv
promo_code
JUNE-ABC12345
JUNE-XYZ67890
JUNE-DEF11111
```

Also valid:

```csv
code
JUNE-ABC12345
JUNE-XYZ67890
JUNE-DEF11111
```

Rules:

* One code per row
* Header row is required
* Header must be `promo_code` or `code`
* Empty rows are skipped
* Leading and trailing spaces are removed
* Codes are converted to uppercase
* Duplicate codes are removed before upload

## Common workflow

Create the promotion in Lightspeed first, then use this tool to generate and upload codes.

```bash
# 1. Authorise with Lightspeed
npm run auth

# 2. Generate codes
npm run generate -- \
  --count 10000 \
  --prefix JUNE- \
  --length 8 \
  --out csv/june-codes.csv

# 3. Check the payload
npm run upload -- \
  --file csv/june-codes.csv \
  --promotion YOUR_PROMOTION_ID \
  --dryRun

# 4. Upload the codes
npm run upload -- \
  --file csv/june-codes.csv \
  --promotion YOUR_PROMOTION_ID
```

## Batch size

Uploads are split into batches so large files do not need to be sent in a single request.

Default batch size:

```text
250 codes per request
```

For most uploads, the default is fine.

Use a smaller batch size if requests are timing out or rate limiting becomes an issue:

```bash
npm run upload -- --file csv/codes.csv --promotion YOUR_PROMOTION_ID --batchSize 100
```

Suggested batch sizes:

| Upload size        | Suggested batch size |
| ------------------ | -------------------- |
| Under 1,000 codes  | 250-500              |
| 1,000-10,000 codes | 150-250              |
| 10,000+ codes      | 100-150              |

## Token management

The tool stores OAuth tokens in `.env` after authorisation.

Before an upload, it checks whether the access token is close to expiry. If needed, it uses the refresh token to get a new access token.

To refresh manually:

```bash
npm run refresh
```

To start the OAuth flow again:

```bash
npm run auth
```

## Environment variables

Example `.env`:

```bash
LS_CLIENT_ID="your_client_id"
LS_CLIENT_SECRET="your_client_secret"
LS_REDIRECT_URI="http://localhost:3000/callback"
LS_PROMOTION_ID="your_promotion_id"

LS_API_VERSION="2026-04"
LS_SCOPES="promotions:read promotions:write outlets:read"

# Created by npm run auth
LS_ACCESS_TOKEN=""
LS_REFRESH_TOKEN=""
LS_TOKEN_EXPIRES_AT=""
LS_DOMAIN_PREFIX=""
```

Do not commit `.env`.

## Finding the promotion ID

1. Open Lightspeed Retail Admin
2. Go to the promotion you want to add codes to
3. Copy the promotion ID from the URL
4. Add it to `.env` as `LS_PROMOTION_ID`, or pass it with `--promotion`

Example:

```bash
LS_PROMOTION_ID="2058781611949719552"
```

## Troubleshooting

### Missing `LS_CLIENT_ID` in `.env`

Your OAuth details are not configured.

Check `.env` and make sure these values exist:

```bash
LS_CLIENT_ID="your_client_id"
LS_CLIENT_SECRET="your_client_secret"
LS_REDIRECT_URI="http://localhost:3000/callback"
```

Then run:

```bash
npm run auth
```

### Invalid redirect URI

The redirect URI in `.env` does not match the one in the Developer Portal.

Check for:

* `http` vs `https`
* wrong port
* trailing slash differences
* different path
* different domain

These must match exactly:

```bash
LS_REDIRECT_URI="http://localhost:3000/callback"
```

### Token expired or invalid

Try refreshing the token:

```bash
npm run refresh
```

If that fails, run the OAuth flow again:

```bash
npm run auth
```

### Port 3000 is already in use

Either stop the process using port 3000 or change the redirect URI to another port.

Example:

```bash
LS_REDIRECT_URI="http://localhost:3001/callback"
```

If you change the port, update the Developer Portal redirect URI as well.

### CSV must contain a `promo_code` or `code` column

Your CSV header is wrong.

Use one of these:

```csv
promo_code
CODE1
CODE2
```

or:

```csv
code
CODE1
CODE2
```

### Promotion ID invalid

Check that:

* the promotion ID is correct
* the promotion exists in the connected Lightspeed account
* the promotion supports promo codes
* your account has permission to edit the promotion

### Rate limited

The upload will retry when possible.

For future uploads, reduce the batch size:

```bash
npm run upload -- --file csv/codes.csv --promotion YOUR_PROMOTION_ID --batchSize 100
```

## Security notes

Do not commit or share `.env`.

The `.env` file can contain:

* client secret
* access token
* refresh token
* store domain details

If `.env` is exposed:

1. Regenerate the client secret in the Lightspeed Developer Portal
2. Run `npm run auth` again
3. Replace the exposed `.env`
4. Remove the exposed file from any shared location or repository history

Use the minimum scopes needed for this tool:

```bash
LS_SCOPES="promotions:read promotions:write"
```

## Project structure

```text
lightspeed-promo-uploader/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── authorize.js
│   │   │   ├── refresh.js
│   │   │   ├── generate.js
│   │   │   └── upload.js
│   │   └── index.js
│   ├── lib/
│   │   ├── oauth.js
│   │   ├── lightspeed-api.js
│   │   ├── config.js
│   │   └── csv.js
│   └── utils/
│       ├── env.js
│       ├── errors.js
│       ├── logger.js
│       └── parse-args.js
├── test/
│   ├── unit/
│   ├── fixtures/
│   └── sample-codes.csv
├── csv/
│   └── promo-codes.csv
├── index.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Notes

* Re-uploading the same CSV should not create duplicate codes if duplicates are handled by the script or rejected by the API.
* Use `--dryRun` before large uploads.
* Keep a copy of each campaign CSV so the marketing team can load the same codes into MailerLite or another email platform.
* Create and test the Lightspeed promotion before uploading thousands of codes.

## License

MIT