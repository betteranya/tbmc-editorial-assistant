# Clip to social — Vercel (public demo bucket)

Drop in an audio or video clip and get on-brand TBMC social copy back. The browser uploads the clip
straight to a public Google Cloud Storage bucket, then a Vercel function reads it, has Gemini
transcribe it, and Claude write the copy.

```
browser ──uploads file directly to the public bucket (unique name)
browser ──sends the file's public URL──► /api/generate
                                          │ fetches it from the bucket
                                          │ Gemini transcribes
                                          │ Claude writes the copy
                                          ▼
                                      copy back to the browser
```

## Important: this uses a temporary, wide-open demo bucket

This build is wired to a specific demo bucket that Connor set up for the hackathon:

- Bucket base URL: `https://storage.googleapis.com/tbmc-hackathon-082026-anna`
- It is **world-readable and world-writable, no auth**, until ~end of Friday Aug 28.
- Objects **auto-delete 7 days** after upload.
- Object names must be unique (create-only); the app uses timestamp + uuid names automatically.

Because of that, treat it as strictly throwaway:

- **Only upload demo-safe clips.** Anything in the bucket is public and anyone can read it.
- **Don't trust files you didn't upload** — anyone who guesses a name can write. (The app only reads
  back the exact URL it just uploaded, and only from this bucket.)
- **After Friday** the write grant is removed and uploads will start failing. At that point the app
  needs the proper signed-URL setup (a service account + `/api/sign-upload`). Ask if you want that
  version restored — it was the original design before we simplified to this bucket.

## What you need

- A **Vercel** account.
- An **Anthropic API key**: https://console.anthropic.com/
- A **Google AI (Gemini) API key**: https://aistudio.google.com/

That's it — no Google Cloud service account or key needed for this version, because the bucket takes
anonymous uploads.

## Deploy to Vercel

1. Put this folder in a GitHub repo (or use the Vercel CLI). In Vercel: **Add New → Project**, import it.
2. **Set environment variables** (Project → Settings → Environment Variables), see `.env.example`:
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
3. **Deploy.** Open the URL, pick a short clip, and try it.

If you ever change buckets, update `BUCKET_BASE` in `public/index.html` and the matching `BUCKET_BASE`
guard in `api/generate.js`.

## Deferred (known limitations, on purpose for speed)

- **Very long videos** can exceed the function's time or memory limit (the clip is transcribed in one
  request). Short clips are the happy path.
- **No retries or progress bar.** If a step fails, re-run it.
- **maxDuration 300** is requested but only granted on plans that allow it; on the hobby tier the real
  limit is lower — another reason short clips are the reliable path.
- **Cleanup** is handled by the bucket's 7-day auto-delete, the app doesn't delete files itself (the
  public grant can't delete anyway).

## Files

```
api/generate.js      Fetches the clip, Gemini transcribes, Claude writes the copy
lib/houseRules.js    TBMC voice + accuracy rules (shared with the other tools)
public/index.html    The page: pick a clip, upload to the bucket, get copy
vercel.json          Vercel config
.env.example         The two keys to set in the Vercel dashboard
```
