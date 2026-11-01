import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_TITLE_MAX,
  type Checklist,
  type ChecklistItem,
} from '@todo/shared';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  useAddChecklistItem,
  useChecklists,
  useCreateChecklist,
  useDeleteChecklist,
  useDeleteChecklistItem,
  useRenameChecklist,
  useUpdateChecklistItem,
} from '../api/checklists';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageHeader } from '../components/PageHeader';
import { Alert, Button, RoundCheckbox, errorMessage } from '../components/ui';

const fieldClass =
  'w-full min-w-0 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 ' +
  'placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5 focus:outline-none';

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" />
    </svg>
  );
}

const iconButton =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-950';

export function ChecklistsPage() {
  const { data, isPending, isError } = useChecklists();
  const [creating, setCreating] = useState(false);
  // The checklist just created: its "add item" field gets focus.
  const [focusId, setFocusId] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Checklists" subtitle="Simple lists to tick off">
        {!creating && <Button onClick={() => setCreating(true)}>+ New checklist</Button>}
      </PageHeader>

      {creating && (
        <NewChecklistForm
          onDone={(created) => {
            setCreating(false);
            if (created) setFocusId(created.id);
          }}
        />
      )}

      {isPending ? null : isError ? (
        <LoadError />
      ) : !data.length ? (
        !creating && (
          <EmptyState kind="no-tasks">
            No checklists yet. Make one for groceries, packing or anything else.
          </EmptyState>
        )
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {data.map((c) => (
            <ChecklistCard key={c.id} checklist={c} autoFocusAdd={c.id === focusId} />
          ))}
        </div>
      )}
    </>
  );
}

function NewChecklistForm({ onDone }: { onDone: (created: Checklist | null) => void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const create = useCreateChecklist();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Give your checklist a name.');
    try {
      onDone(await create.mutateAsync(title.trim()));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6"
      noValidate
    >
      <label htmlFor="new-checklist" className="block text-[13px] font-medium text-neutral-800">
        Checklist name
      </label>
      <input
        id="new-checklist"
        className={`${fieldClass} mt-1.5`}
        placeholder="e.g. Groceries"
        value={title}
        maxLength={CHECKLIST_TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone(null)}
        autoFocus
      />
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ChecklistCard({
  checklist,
  autoFocusAdd,
}: {
  checklist: Checklist;
  autoFocusAdd: boolean;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;

  return (
    <section
      aria-label={checklist.title}
      className="rounded-2xl border border-neutral-200 bg-white"
    >
      <header className="px-5 pt-5 pb-4">
        {mode === 'rename' ? (
          <RenameForm checklist={checklist} onDone={() => setMode('view')} />
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-snug font-semibold tracking-tight text-neutral-950">
                {checklist.title}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500 tabular-nums">
                {total ? `${done} of ${total} done` : 'No items yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('rename')}
              aria-label={`Rename ${checklist.title}`}
              className={iconButton}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => setMode('delete')}
              aria-label={`Delete ${checklist.title}`}
              className={`${iconButton} hover:text-rose-600`}
            >
              <TrashIcon />
            </button>
          </div>
        )}
        {mode === 'delete' && (
          <DeleteConfirm checklist={checklist} onCancel={() => setMode('view')} />
        )}
        {total > 0 && (
          <div
            className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div
              className="h-full rounded-full bg-neutral-950 transition-[width] duration-300"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        )}
      </header>

      {total > 0 && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {checklist.items.map((item) => (
            <ItemRow key={item.id} checklistId={checklist.id} item={item} />
          ))}
        </ul>
      )}
      <AddItemForm checklistId={checklist.id} autoFocus={autoFocusAdd} />
    </section>
  );
}

function RenameForm({ checklist, onDone }: { checklist: Checklist; onDone: () => void }) {
  const [title, setTitle] = useState(checklist.title);
  const [error, setError] = useState('');
  const rename = useRenameChecklist();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError('Give your checklist a name.');
    if (trimmed === checklist.title) return onDone();
    try {
      await rename.mutateAsync({ id: checklist.id, title: trimmed });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${fieldClass} flex-1 basis-full sm:basis-0`}
          value={title}
          maxLength={CHECKLIST_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          aria-label="Checklist name"
          autoFocus
        />
        <Button type="submit" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </form>
  );
}

function DeleteConfirm({ checklist, onCancel }: { checklist: Checklist; onCancel: () => void }) {
  const remove = useDeleteChecklist();
  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
      <p className="text-sm text-rose-700">
        Delete this checklist and its {checklist.items.length}{' '}
        {checklist.items.length === 1 ? 'item' : 'items'}? This can't be undone.
      </p>
      {remove.isError && <p className="mt-1 text-xs text-rose-700">{errorMessage(remove.error)}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={remove.isPending}
          onClick={() => remove.mutate(checklist.id)}
        >
          Delete
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ checklistId, item }: { checklistId: string; item: ChecklistItem }) {
  const update = useUpdateChecklistItem();
  const remove = useDeleteChecklistItem();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  function save() {
    setEditing(false);
    const trimmed = text.trim();
    if (!trimmed || trimmed === item.text) return setText(item.text);
    update.mutate({ id: checklistId, itemId: item.id, text: trimmed });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') {
      setText(item.text);
      setEditing(false);
    }
  }

  return (
    // Checked items stay where they are, faded.
    <li
      className={`flex items-start gap-3 px-5 py-3 transition-opacity duration-200 ${item.done ? 'opacity-55' : ''}`}
    >
      <RoundCheckbox
        checked={item.done}
        onChange={() => update.mutate({ id: checklistId, itemId: item.id, done: !item.done })}
        label={item.done ? `Uncheck "${item.text}"` : `Check "${item.text}"`}
      />
      {editing ? (
        <input
          className="-my-1 min-w-0 flex-1 rounded-lg border border-neutral-950 bg-white px-2 py-1 text-[15px] text-neutral-950 focus:ring-4 focus:ring-neutral-950/5 focus:outline-none"
          value={text}
          maxLength={CHECKLIST_ITEM_MAX}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          aria-label="Edit item"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit"
          className={`min-w-0 flex-1 text-left text-[15px] leading-snug transition-colors ${
            item.done ? 'text-neutral-500 line-through decoration-neutral-400' : 'text-neutral-950'
          }`}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        onClick={() => remove.mutate({ id: checklistId, itemId: item.id })}
        disabled={remove.isPending}
        aria-label={`Remove "${item.text}"`}
        className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </li>
  );
}

function AddItemForm({ checklistId, autoFocus }: { checklistId: string; autoFocus: boolean }) {
  const [text, setText] = useState('');
  const add = useAddChecklistItem();
  const input = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    // Clear at once, so the next item can be typed while this one saves.
    setText('');
    input.current?.focus();
    add.mutate(
      { id: checklistId, text: trimmed },
      // Put the text back if it couldn't be saved (unless something new was typed).
      { onError: () => setText((current) => current || trimmed) },
    );
  }
  return (
    <form onSubmit={onSubmit} className="border-t border-neutral-100 px-5 py-3">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-neutral-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M10 5v10M5 10h10" />
        </svg>
        <input
          ref={input}
          className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus:outline-none"
          placeholder="Add an item"
          aria-label="Add an item"
          value={text}
          maxLength={CHECKLIST_ITEM_MAX}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
        />
        {text.trim() && (
          // Never disabled: a disabled submit button would also block Enter for the next item.
          <Button type="submit" size="sm">
            Add
          </Button>
        )}
      </div>
      {add.isError && (
        <div className="mt-2">
          <Alert>{errorMessage(add.error)}</Alert>
        </div>
      )}
    </form>
  );
}
