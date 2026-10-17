import { DATE_FORMAT, toLocalDate, type CalendarDay } from '@todo/shared';
import { DateTime } from 'luxon';
import { useSearchParams } from 'react-router';
import { useMe } from '../api/auth';
import { useCalendar, useDayTasks } from '../api/tasks';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/PageHeader';
import { TaskSection } from '../components/TaskItem';
import { Button } from '../components/ui';
import { useTaskEditor } from '../hooks/useTaskEditor';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_PARAM = /^\d{4}-\d{2}$/;
const DAY_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** Month grid (weeks start on Monday) with a panel listing the selected day's tasks. */
export function CalendarPage() {
  const tz = useMe().data!.timezone;
  const [params, setParams] = useSearchParams();
  const today = toLocalDate(new Date(), tz);

  const monthParam = params.get('month');
  const month = DateTime.fromFormat(
    monthParam && MONTH_PARAM.test(monthParam) ? monthParam : today.slice(0, 7),
    'yyyy-MM',
    { zone: tz },
  );
  const dayParam = params.get('day');
  const selected = dayParam && DAY_PARAM.test(dayParam) ? dayParam : today;

  const gridStart = month.startOf('month').minus({ days: month.startOf('month').weekday - 1 });
  const gridEnd = month.endOf('month').plus({ days: 7 - month.endOf('month').weekday });
  const days: DateTime[] = [];
  for (let d = gridStart; d <= gridEnd; d = d.plus({ days: 1 })) days.push(d);

  const { data: summary, isError } = useCalendar(
    gridStart.toFormat(DATE_FORMAT),
    gridEnd.toFormat(DATE_FORMAT),
  );

  const go = (next: { month?: string; day?: string }) =>
    setParams(
      (p) => {
        if (next.month) p.set('month', next.month);
        if (next.day) p.set('day', next.day);
        return p;
      },
      { replace: true },
    );

  const selectDay = (d: DateTime) =>
    go({ day: d.toFormat(DATE_FORMAT), month: d.toFormat('yyyy-MM') });

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{month.toFormat('LLLL yyyy')}</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              aria-label="Previous month"
              onClick={() => go({ month: month.minus({ months: 1 }).toFormat('yyyy-MM') })}
            >
              ‹
            </Button>
            <Button
              variant="secondary"
              onClick={() => go({ month: today.slice(0, 7), day: today })}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              aria-label="Next month"
              onClick={() => go({ month: month.plus({ months: 1 }).toFormat('yyyy-MM') })}
            >
              ›
            </Button>
          </div>
        </div>

        {isError && <LoadError />}

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500"
            >
              {w}
            </div>
          ))}
          {days.map((d) => {
            const key = d.toFormat(DATE_FORMAT);
            return (
              <DayCell
                key={key}
                date={d}
                info={summary?.days[key]}
                inMonth={d.month === month.month}
                isToday={key === today}
                isSelected={key === selected}
                onSelect={() => selectDay(d)}
              />
            );
          })}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500" /> Has tasks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Has overdue tasks
          </span>
        </p>
      </section>

      <DayPanel date={selected} tz={tz} />
    </div>
  );
}

function DayCell({
  date,
  info,
  inMonth,
  isToday,
  isSelected,
  onSelect,
}: {
  date: DateTime;
  info: CalendarDay | undefined;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const overdue = (info?.overdue ?? 0) > 0;
  const open = info ? info.total - info.completed : 0;
  const label = [
    date.toFormat('cccc d LLLL'),
    info ? `${info.total} task${info.total === 1 ? '' : 's'}` : 'no tasks',
    overdue ? `${info!.overdue} overdue` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={isSelected}
      className={[
        'relative flex min-h-16 flex-col items-start p-1.5 text-left sm:min-h-20 sm:p-2',
        overdue ? 'bg-rose-50 hover:bg-rose-100' : 'bg-white hover:bg-slate-50',
        isSelected ? 'z-10 ring-2 ring-indigo-500 ring-inset' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full text-xs sm:text-sm',
          isToday ? 'bg-indigo-600 font-semibold text-white' : '',
          !isToday && !inMonth ? 'text-slate-300' : '',
          !isToday && inMonth ? 'text-slate-700' : '',
        ].join(' ')}
      >
        {date.day}
      </span>
      {info && (
        <span
          className={[
            'mt-auto flex items-center gap-1 text-xs font-medium',
            overdue ? 'text-rose-600' : open ? 'text-indigo-600' : 'text-slate-400',
          ].join(' ')}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${overdue ? 'bg-rose-500' : open ? 'bg-indigo-500' : 'bg-slate-300'}`}
          />
          <span className="hidden sm:inline">{info.total}</span>
        </span>
      )}
    </button>
  );
}

function DayPanel({ date, tz }: { date: string; tz: string }) {
  const { data: tasks, isPending, isError } = useDayTasks(date);
  const { openNew, openEdit, editor } = useTaskEditor({ dueDate: date });
  const d = DateTime.fromFormat(date, DATE_FORMAT, { zone: tz });

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:w-96 xl:shrink-0">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{d.toFormat('cccc')}</h2>
          <p className="text-sm text-slate-500">{d.toFormat('d LLLL yyyy')}</p>
        </div>
        <Button onClick={openNew}>+ Add</Button>
      </div>
      {isPending ? null : isError ? (
        <LoadError />
      ) : tasks.length ? (
        <TaskSection tasks={tasks} onEdit={openEdit} snoozable />
      ) : (
        <EmptyState kind="free" seed={date} compact />
      )}
      {editor}
    </aside>
  );
}
