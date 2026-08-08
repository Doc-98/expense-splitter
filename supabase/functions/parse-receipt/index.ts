// Deno edge function: reads a receipt photo and asks Claude to extract line items.
//
// Deploy with:
//   supabase functions deploy parse-receipt
// Set your API key as a secret first (never ship it in client code):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Get an API key at https://console.anthropic.com

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-sonnet-5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXTRACTION_PROMPT = `You are reading a photo of a shopping/grocery receipt. Extract every purchased line item.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"items": [{"name": "string", "unit_price": number, "quantity": number}]}

Rules:
- "unit_price" is the price for ONE unit, not the line total. If the receipt only shows a line total, divide by quantity.
- "quantity" defaults to 1 if not shown.
- Ignore subtotals, tax lines, totals, payment method, loyalty program text, and store header/footer info.
- Use plain item names (clean up obvious abbreviations, otherwise keep as printed).
- If you cannot read the receipt at all, return {"items": []}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...'
      )
    }

    const { image, mediaType } = await req.json()
    if (!image) throw new Error("Missing 'image' (base64) in request body")

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image },
              },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Anthropic API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const textBlock = data.content?.find((block) => block.type === 'text')
    const raw = (textBlock?.text || '{}').trim().replace(/^```json\s*|```$/g, '')

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error("Could not parse the model's response as JSON")
    }

    return new Response(JSON.stringify({ items: parsed.items || [] }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    // Always return 200 so the client can read err.message directly from the
    // body instead of fighting supabase-js's generic non-2xx error wrapping.
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
