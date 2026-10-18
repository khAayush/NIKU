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
    <div className="mb-10">
      <form
        onSubmit={onSubmit}
        role="search"
        aria-label="Quick add"
        className="flex items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white p-1.5 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-neutral-950 focus-within:ring-4 focus-within:ring-neutral-950/5"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-neutral-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
        <input
          ref={inputRef}
          value={speech.listening && speech.interim ? speech.interim : text}
          onChange={(e) => setText(e.target.value)}
          maxLength={PARSE_TEXT_MAX}
          placeholder={
            speech.listening ? 'Listening…' : 'Add a task, e.g. “Call mom every Sunday 6pm”'
          }
          aria-label="Quick add a task"
          readOnly={speech.listening}
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus:outline-none"
        />
        {speech.supported && (
          <button
            type="button"
            onClick={onMic}
            aria-label={speech.listening ? 'Stop listening' : 'Add a task by voice'}
            aria-pressed={speech.listening}
            title={speech.listening ? 'Stop listening' : 'Speak a task'}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
              speech.listening
                ? 'animate-pulse bg-neutral-950 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Button type="submit" disabled={parse.isPending || !text.trim()} size="sm">
          {parse.isPending ? 'Reading…' : 'Add'}
        </Button>
      </form>

      {!speech.supported && (
        <p className="mt-2 pl-4 text-xs text-neutral-400">
          Voice input isn't available in this browser. Typing works everywhere.
        </p>
      )}
      {speech.error && <p className="mt-2 pl-4 text-xs text-rose-600">{speech.error}</p>}
      {parse.isError && (
        <div className="mt-2">
          <Alert>{errorMessage(parse.error)}</Alert>
        </div>
      )}
      {saved && (
        <p role="status" className="mt-2 pl-4 text-xs text-neutral-600">
          Task added.
        </p>
      )}

      {result && (
        <section
          aria-label="Confirm new task"
          className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]"
        >
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
              Check and save
            </h2>
            {result.recognized.length > 0 ? (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                Understood:
                {result.recognized.map((r, i) => (
                  <span key={i} className="rounded-full bg-neutral-950 px-2 py-0.5 text-white">
                    {r}
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
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
