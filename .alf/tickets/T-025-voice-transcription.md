---
id: T-025
title: "Voice transcription service + frontend recorder"
type: feature
status: done
priority: high
epic: mvp4
effort: M
created: 2026-04-23
updated: 2026-04-23
---

Add voice recording on frontend and a `voice/transcribe` endpoint on backend. Voice is always converted to text — the agent never sees audio.

## Context

Ref: T-018 §2. Single `voice/transcribe` WS endpoint. No `voice/message`. Transcription result fills into the composer (for chat) or annotation note (for annotations).

### Backend
- `core/transcription.ts` — lightweight service. Calls OpenAI Whisper (`whisper-1`) via REST (`multipart/form-data` POST).
- Single `@handle("voice/transcribe")` handler. Receives `{ audioBase64, audioFormat }`, returns `{ text, language, duration }`.
- `OPENAI_API_KEY` env var. Log warning if missing.
- No audio storage — discard after transcription.

### Frontend
- `useVoiceRecorder` hook wrapping browser `MediaRecorder` API. MIME priority: `audio/mp4` → `audio/webm;codecs=opus` → `audio/webm`. Chunks every 250ms.
- On stop: concat blobs → base64 → send `voice/transcribe` request via relay → receive text.
- Used by both composer (voice chat) and annotation layer (voice annotations).

## Acceptance

- [x] Backend `voice/transcribe` endpoint works (Whisper API call, returns text)
- [x] Frontend `useVoiceRecorder` hook: start/stop/pause recording, returns base64 audio
- [ ] Integration: record → transcribe → text appears in composer (wiring deferred to T-027 annotations)
- [x] Graceful error if `OPENAI_API_KEY` not set

## Notes

- 2026-04-23: Backend `core/transcription.ts` implemented with `@handle("voice/transcribe")`. Frontend `useVoiceRecorder` hook created. Both are standalone — the UI wiring (mic button in composer, transcription-to-text flow) will be done as part of T-027 (annotations) which is the primary consumer.
