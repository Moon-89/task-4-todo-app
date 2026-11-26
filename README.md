# Daylight

A small task manager built with React and Vite. Tasks are saved to the project's MockAPI todos resource.

## Run locally

1. Install the packages with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `VITE_MOCKAPI_URL` in `.env` to the MockAPI todos URL.
4. Start the app with `npm run dev`.

The local `.env` file is ignored by Git. Vite reads environment values when the app starts, so restart the dev server after changing `.env`.

## Deploy to Vercel

Add `VITE_MOCKAPI_URL` to the Vercel project's Environment Variables for each environment you deploy. Vercel needs it during the build. Deploy again after changing the value.

This is a browser app, so `VITE_` values are included in the public JavaScript bundle. Use this variable for the public MockAPI URL only; never put passwords or private API keys in it.
