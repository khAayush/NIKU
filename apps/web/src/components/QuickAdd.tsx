import { PARSE_TEXT_MAX, type ParseTaskResponse } from '@todo/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { TaskForm } from './TaskEditor';
import { Alert, Button, errorMessage } from './ui';

const parseTask = (text: string) =>
  api<ParseTaskResponse>('/tasks/parse', { method: 'POST', body: JSON.stringify({ text }) });

/**
 * Type (or say) a sentence like "Submit report tomorrow at 5pm urgent". The server turns it into
 * a draft, which is shown in an editable confirmation card before anything is saved.
 */
export function QuickAdd() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseTaskResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechRecognition();
  const parse = useMutation({ mutationFn: parseTask, onSuccess: setResult });

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaved(false);
    parse.mutate(trimmed);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(text);
  }

  function onMic() {
    if (speech.listening) return speech.stop();
    speech.start((spoken) => {
      setText(spoken);
      submit(spoken); // same flow as typing
    });
  }

  function close(didSave: boolean) {
    setResult(null);
    if (didSave) {
      setText('');
      setSaved(true);
    }
    inputRef.current?.focus();
  }

  return (
    <div className="mb-6">
      <form onSubmit={onSubmit} className="flex gap-2" role="search" aria-label="Quick add">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={speech.listening && speech.interim ? speech.interim : text}
            onChange={(e) => setText(e.target.value)}
            maxLength={PARSE_TEXT_MAX}
            placeholder={speech.listening ? 'Listening…' : 'Quick add: "Call mom every Sunday 6pm"'}
            aria-label="Quick add a task"
            readOnly={speech.listening}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none"
          />
        </div>
        {speech.supported && (
          <button
            type="button"
            onClick={onMic}
            aria-label={speech.listening ? 'Stop listening' : 'Add a task by voice'}
            aria-pressed={speech.listening}
            title={speech.listening ? 'Stop listening' : 'Speak a task'}
            className={`flex w-11 shrink-0 items-center justify-center rounded-lg border shadow-sm ${
              speech.listening
                ? 'animate-pulse border-rose-300 bg-rose-50 text-rose-600'
                : 'border-slate-300 bg-white text-slate-500 hover:text-indigo-600'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Button type="submit" disabled={parse.isPending || !text.trim()}>
          {parse.isPending ? 'Reading…' : 'Add'}
        </Button>
      </form>

      {!speech.supported && (
        <p className="mt-1.5 text-xs text-slate-400">
          Voice input isn't available in this browser. Typing works everywhere.
        </p>
      )}
      {speech.error && <p className="mt-1.5 text-xs text-rose-600">{speech.error}</p>}
      {parse.isError && (
        <div className="mt-2">
          <Alert>{errorMessage(parse.error)}</Alert>
        </div>
      )}
      {saved && (
        <p role="status" className="mt-1.5 text-xs text-emerald-600">
          Task added.
        </p>
      )}

      {result && (
        <section
          aria-label="Confirm new task"
          className="mt-3 rounded-xl border border-indigo-200 bg-white p-5 shadow-md"
        >
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Check and save</h2>
            {result.recognized.length > 0 ? (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                Understood:
                {result.recognized.map((r, i) => (
                  <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                    {r}
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                No date or keywords found. Add any details below.
              </p>
            )}
          </div>
          <TaskForm
            // Remount when a new draft arrives so the fields reset.
            key={JSON.stringify(result.draft)}
            draft={result.draft}
            submitLabel="Save task"
            onDone={() => close(false)}
            onSaved={() => close(true)}
          />
        </section>
      )}
    </div>
  );
}
