/**
 * Transcription service — calls OpenAI Whisper API.
 * Lightweight core service, not a full module.
 */

import { createLogger } from "./logger.js";
import { handle, type Reply } from "./dispatch.js";

const log = createLogger("transcription");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

if (!OPENAI_API_KEY) {
  log.warn("OPENAI_API_KEY not set — voice/transcribe will fail");
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

export async function transcribeAudio(audioBase64: string, audioFormat: string): Promise<TranscriptionResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set — transcription unavailable");
  }

  const ext = audioFormat === "m4a" ? "m4a" : "webm";
  const mimeType = audioFormat === "m4a" ? "audio/mp4" : "audio/webm";
  const buf = Buffer.from(audioBase64, "base64");
  const blob = new Blob([buf], { type: mimeType });

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { text: string; language: string; duration: number };
  return { text: data.text, language: data.language, duration: data.duration };
}

// ---------------------------------------------------------------------------
// WS handler
// ---------------------------------------------------------------------------

class TranscriptionHandler {
  @handle("voice/transcribe")
  static async transcribe(msg: Record<string, unknown>, reply: Reply) {
    const audioBase64 = msg.audioBase64 as string;
    const audioFormat = (msg.audioFormat as string) ?? "webm";

    if (!audioBase64) {
      reply({ type: "voice/transcribe", error: "Missing audioBase64" });
      return;
    }

    try {
      const result = await transcribeAudio(audioBase64, audioFormat);
      log.info("Transcribed", { language: result.language, duration: result.duration, chars: result.text.length });
      reply({ type: "voice/transcribe", ...result });
    } catch (err) {
      log.error("Transcription failed", { error: String(err) });
      reply({ type: "voice/transcribe", error: String(err) });
    }
  }
}
