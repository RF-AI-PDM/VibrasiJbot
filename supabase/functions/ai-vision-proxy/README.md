# AI Vision Proxy

Supabase Edge Function proxy for Mobius Simulation AI Upload production mode.

The browser should call this function endpoint instead of a third-party AI provider directly. Provider credentials stay in Supabase secrets.

## Required Secrets

```bash
supabase secrets set AI_PROVIDER_ENDPOINT="https://provider.example.com/vision"
supabase secrets set AI_PROVIDER_API_KEY="provider-secret-key"
supabase secrets set AI_PROVIDER_MODEL="vision-default"
```

`AI_PROVIDER_MODEL` is optional. If the browser request includes a model, that value is forwarded.

## Deploy

```bash
supabase functions deploy ai-vision-proxy
```

Then set the in-app AI Provider endpoint to:

```text
https://<project-ref>.functions.supabase.co/ai-vision-proxy
```

The app still expects the same provider-neutral JSON response shape used by `AiVisionResult`.
