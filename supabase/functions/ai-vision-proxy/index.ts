type ProxyError = {
  error: string;
  detail?: string;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' } satisfies ProxyError, 405);
  }

  const providerEndpoint = Deno.env.get('AI_PROVIDER_ENDPOINT')?.trim();
  const providerApiKey = Deno.env.get('AI_PROVIDER_API_KEY')?.trim();
  const providerModel = Deno.env.get('AI_PROVIDER_MODEL')?.trim();

  if (!providerEndpoint || !providerApiKey) {
    return jsonResponse(
      {
        error: 'AI provider is not configured',
        detail: 'Set AI_PROVIDER_ENDPOINT and AI_PROVIDER_API_KEY in Supabase Edge Function secrets.',
      } satisfies ProxyError,
      500,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' } satisfies ProxyError, 400);
  }

  const upstreamPayload = {
    ...payload,
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model : providerModel,
  };

  try {
    const providerResponse = await fetch(providerEndpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${providerApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(upstreamPayload),
    });

    const text = await providerResponse.text();
    if (!providerResponse.ok) {
      return jsonResponse(
        {
          error: `AI provider returned HTTP ${providerResponse.status}`,
          detail: text.slice(0, 800),
        } satisfies ProxyError,
        502,
      );
    }

    try {
      return jsonResponse(JSON.parse(text));
    } catch {
      return jsonResponse(
        {
          error: 'AI provider returned non-JSON response',
          detail: text.slice(0, 800),
        } satisfies ProxyError,
        502,
      );
    }
  } catch (error) {
    return jsonResponse(
      {
        error: 'AI provider request failed',
        detail: error instanceof Error ? error.message : String(error),
      } satisfies ProxyError,
      502,
    );
  }
});
