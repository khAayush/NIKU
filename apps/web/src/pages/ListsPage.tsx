import { LIST_NAME_MAX, listInputSchema, type List } from '@todo/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useCreateList, useDeleteList, useLists, useRenameList } from '../api/tasks';
import { EmptyMessage, PageHeader } from '../components/PageHeader';
import { Alert, Button, errorMessage, validate } from '../components/ui';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none';

export function ListsPage() {
  const { data: lists, isPending } = useLists();
  const createList = useCreateList();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(listInputSchema, { name });
    setError(errors.name ?? '');
    if (!data) return;
    try {
      await createList.mutateAsync(data);
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Lists" subtitle="Group tasks, e.g. Work or Personal" />
      <form onSubmit={onCreate} className="mb-6 flex max-w-md gap-2" noValidate>
        <input
          className={`${inputClass} flex-1`}
          placeholder="New list name"
          aria-label="New list name"
          value={name}
          maxLength={LIST_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={createList.isPending}>
          Add list
        </Button>
      </form>
      {error && (
        <div className="mb-4 max-w-md">
          <Alert>{error}</Alert>
        </div>
      )}
      {isPending ? null : !lists?.length ? (
        <EmptyMessage>No lists yet. Lists are optional — tasks can live without one.</EmptyMessage>
      ) : (
        <ul className="max-w-md divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {lists.map((l) => (
            <ListRow key={l.id} list={l} />
          ))}
        </ul>
      )}
    </>
  );
}

function ListRow({ list }: { list: List }) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(list.name);
  const [error, setError] = useState('');
  const rename = useRenameList();
  const remove = useDeleteList();

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(listInputSchema, { name });
    setError(errors.name ?? '');
    if (!data) return;
    try {
      await rename.mutateAsync({ id: list.id, name: data.name });
      setMode('view');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="px-4 py-3">
      {mode === 'rename' ? (
        <form onSubmit={onRename} className="flex gap-2" noValidate>
          <input
            className={`${inputClass} flex-1`}
            value={name}
            maxLength={LIST_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            aria-label="List name"
            autoFocus
          />
          <Button type="submit" disabled={rename.isPending}>
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </form>
      ) : mode === 'delete' ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1">
            Delete "{list.name}"? Its tasks will be kept, with no list.
          </span>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(list.id)}
          >
            Delete
          </Button>
          <Button variant="secondary" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            to={`/all?list=${list.id}`}
            className="flex-1 text-sm font-medium text-slate-800 hover:text-indigo-600"
          >
            {list.name}
          </Link>
          <span className="text-xs text-slate-500">{list.openTaskCount} open</span>
          <button
            className="text-sm text-indigo-600 hover:underline"
            onClick={() => setMode('rename')}
          >
            Rename
          </button>
          <button
            className="text-sm text-rose-600 hover:underline"
            onClick={() => setMode('delete')}
          >
            Delete
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </li>
  );
}
