// Text-to-speech through any OpenAI-compatible /v1/audio/speech server.
// Default target is a local Kokoro server (tts/kokoro_server.py or Kokoro-FastAPI).
// If none is running, the browser falls back to its own speech voice.
import { config } from './config.js';
import { log } from './log.js';

export async function ttsAvailable() {
  try {
    await fetch(`${config.ttsUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return true; // any HTTP answer means something is listening
  } catch {
    return false;
  }
}

export async function synth(text) {
  const res = await fetch(`${config.ttsUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'kokoro', input: text.slice(0, 2000), voice: config.ttsVoice, response_format: 'wav' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  log('tts', 'synthesized', { chars: text.length, bytes: buf.length });
  return { buf, type: res.headers.get('content-type') || 'audio/wav' };
}
