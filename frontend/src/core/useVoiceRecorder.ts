/**
 * Browser voice recorder hook — uses MediaRecorder API.
 * Returns base64 audio on stop for use with voice/transcribe endpoint.
 */

import { useRef, useState, useCallback } from "react";

export interface VoiceRecording {
  audioBase64: string;
  audioFormat: "m4a" | "webm";
  durationMs: number;
}

export type RecorderState = "idle" | "recording" | "paused";

function pickMime(): { mime: string; format: "m4a" | "webm" } {
  if (MediaRecorder.isTypeSupported("audio/mp4")) return { mime: "audio/mp4", format: "m4a" };
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return { mime: "audio/webm;codecs=opus", format: "webm" };
  return { mime: "audio/webm", format: "webm" };
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((recording: VoiceRecording) => void) | null>(null);
  const formatRef = useRef<"m4a" | "webm">("webm");

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current;
      setDuration(elapsed);
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async (): Promise<VoiceRecording> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const { mime, format } = pickMime();
    formatRef.current = format;
    chunksRef.current = [];
    pausedDurationRef.current = 0;
    startTimeRef.current = Date.now();

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    return new Promise<VoiceRecording>((resolve) => {
      resolveRef.current = resolve;

      recorder.onstop = () => {
        stopTimer();
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1] ?? "";
          const durationMs = Date.now() - startTimeRef.current - pausedDurationRef.current;
          setState("idle");
          setDuration(0);
          resolveRef.current?.({ audioBase64: base64, audioFormat: format, durationMs });
          resolveRef.current = null;
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setState("recording");
      startTimer();
    });
  }, [startTimer, stopTimer]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      pauseStartRef.current = Date.now();
      stopTimer();
      setState("paused");
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === "paused") {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      recorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  }, [startTimer]);

  return { state, duration, start, stop, pause, resume };
}
