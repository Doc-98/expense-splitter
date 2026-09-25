// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { describeProviderError, describeNetworkError } from './aiProviderError'

describe('describeProviderError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('turns a real Gemini 503 overload body into a natural-language, actionable message', () => {
    const body = JSON.stringify({
      error: {
        code: 503,
        message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
        status: 'UNAVAILABLE',
      },
    })
    const message = describeProviderError('Gemini', 503, body)
    expect(message).not.toContain('{')
    expect(message).not.toContain('"error"')
    expect(message.toLowerCase()).toContain('overloaded')
    expect(message).toContain('Scan settings')
  })

  it('recognizes a 429 as a rate limit regardless of body shape', () => {
    const message = describeProviderError('Claude', 429, JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } }))
    expect(message.toLowerCase()).toContain('rate limit')
  })

  it('recognizes 401/403 as a bad API key', () => {
    expect(describeProviderError('Gemini', 401, '{}').toLowerCase()).toContain('api key')
    expect(describeProviderError('Claude', 403, '{}').toLowerCase()).toContain('api key')
  })

  it('recognizes 404 as an unknown model', () => {
    expect(describeProviderError('Gemini', 404, '{}').toLowerCase()).toContain('model')
  })

  it("falls back to the provider's own message for an unrecognized status", () => {
    const body = JSON.stringify({ error: { message: 'The request body is malformed.' } })
    expect(describeProviderError('Claude', 400, body)).toBe("Claude couldn't process this: The request body is malformed.")
  })

  it("reads Ollama's flatter error shape (error as a plain string)", () => {
    const body = JSON.stringify({ error: "model 'qwen2.5vl' not found, try pulling it first" })
    const message = describeProviderError('Ollama', 400, body)
    expect(message).toContain("model 'qwen2.5vl' not found")
  })

  it('falls back to a generic message when the body is not JSON at all, rather than throwing', () => {
    expect(() => describeProviderError('Gemini', 500, '<html>Bad Gateway</html>')).not.toThrow()
    const message = describeProviderError('Gemini', 500, '<html>Bad Gateway</html>')
    expect(message).toContain('status 500')
  })

  it('never includes a raw brace or quote from the body in the well-known-status cases', () => {
    const body = '{ "error": { "code": 503, "message": "high demand", "status": "UNAVAILABLE" } }'
    const message = describeProviderError('Gemini', 503, body)
    expect(message).not.toMatch(/[{}]/)
  })
})

describe('describeNetworkError', () => {
  it('names the provider in a plain, actionable message', () => {
    expect(describeNetworkError('Gemini')).toBe("Couldn't reach Gemini — check your connection and try again.")
  })
})
