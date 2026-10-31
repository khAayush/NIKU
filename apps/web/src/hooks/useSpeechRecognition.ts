import { useCallback, useEffect, useRef, useState } from 'react';
import { isIOS, isStandalone } from '../lib/pwa';

// Minimal typings for the Web Speech API (Chrome exposes it as webkitSpeechRecognition).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in the browser to use voice input.',
  'service-not-allowed':
    'Microphone access was blocked. Allow it in the browser to use voice input.',
  'no-speech': "Didn't catch that. Try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection.',
};

/**
 * Browser speech-to-text. `start(onFinal)` listens for one phrase; `interim` holds the live
 * transcript while speaking. `supported` is false when the browser has no Web Speech API.
 */
export function useSpeechRecognition() {
  // iOS exposes the API in the installed (Home Screen) app, but it doesn't work there.
  const [supported] = useState(() => getCtor() !== null && !(isIOS && isStandalone));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback((onFinal: (text: string) => void) => {
    const Ctor = getCtor();
    if (!Ctor) return;
    recognition.current?.abort();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        text += result[0].transcript;
        if (result.isFinal) final = true;
      }
      if (final) {
        setInterim('');
        onFinal(text.trim());
      } else {
        setInterim(text);
      }
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted')
        setError(ERROR_MESSAGES[e.error] ?? 'Voice input failed. Try again.');
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    setError('');
    setInterim('');
    setListening(true);
    recognition.current = rec;
    rec.start();
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
