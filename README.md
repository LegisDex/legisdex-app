# LegisDex Desktop

Electron shell for the LegisDex Next.js web app.

## Development

Start the Next.js app first:

```powershell
cd D:\Programming\Nextjs\legisdex
npm run dev
```

Then start the desktop shell:

```powershell
cd D:\Programming\Electron.js\legisdex-app
npm run start
```

In development, the Electron app loads `http://localhost:3000/chat`.

## Production URL

Packaged builds load `https://www.legisdex.com/chat` by default.

To point the shell at another hosted LegisDex deployment, set `LEGISDEX_WEB_URL` before starting or packaging:

```powershell
$env:LEGISDEX_WEB_URL = "https://your-domain.example"
npm run start
```

## Architecture

The desktop app does not bundle the Next.js backend. Auth, database access, Payload, Stripe, AI calls, and webhooks stay in the hosted Next.js app.

The desktop shell keeps `/chat`, `/compliance`, `/tracker`, `/sign-in`, and `/sign-up` inside the app. Marketing, trust, privacy, terms, blog, support, and other public pages open in the user's default browser.
