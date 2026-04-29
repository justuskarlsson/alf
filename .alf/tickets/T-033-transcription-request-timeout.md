---
id: T-033
title: Voice transcription times out on longer recordings
type: bug
status: done
priority: high
epic: agents
effort: S
created: 2026-04-25
updated: 2026-04-29
---

A ~3 minute voice recording transcribed successfully on the backend (Whisper), but the frontend request timed out because of a 10-second default timeout in the relay request layer. The transcribed text never appeared.

## Context

The `request()` function in `RelayProvider.tsx` likely has a hardcoded 10s timeout. Whisper processing time scales with audio length — a 3-minute clip can easily take 15-30s. The timeout needs to be much higher for transcription, or removed/configurable per request type.

### Options
1. **Per-request timeout override** — `request({ ... }, { timeout: 60000 })` for transcription calls
2. **Increase global default** — bump from 10s to something more reasonable (30-60s)
3. **Remove timeout entirely** — rely on Whisper/network to fail naturally. Timeouts mostly just cause false negatives.

Option 1 is safest. Option 3 is worth considering as a philosophy — timeouts on WS request/response patterns rarely help.

## Acceptance

- [x] 3-minute voice recordings transcribe without timeout
- [x] Transcribed text appears in input after processing completes
- [x] No regression on shorter recordings

## Notes

<!-- 2026-04-29T07:38Z agent:alfred --> Fixed. Passed 120_000ms (2 min) timeout to the transcription `request()` call in AgentsPanel.tsx. The `request()` fn already supported an optional timeout param — just wasn't being used.
