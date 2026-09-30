import type { Schedule } from './interviews';
import type { T } from '../i18n';

/**
 * Время собеседования: поля ввода, файл .ics и ссылка Google Календаря.
 *
 * Сервер писем не шлёт, поэтому приглашение в календарь уходит через
 * календарь самого интервьюера: ссылка Google открывает готовое событие с
 * кандидатом в гостях, и Google сам пришлёт ему приглашение. Для остальных
 * календарей — .ics, его можно приложить к письму.
 */

export const DURATIONS = [30, 45, 60, 90, 120];

/** ISO → значение input[type=datetime-local] в часовом поясе браузера. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Время начала и длительность: назначить можно и потом. */
export function ScheduleFields({
  t,
  value,
  onChange,
}: {
  t: T;
  value: Schedule;
  onChange: (next: Schedule) => void;
}) {
  return (
    <div className="pg-iv-new">
      <input
        className="pg-input"
        type="datetime-local"
        aria-label={t('when.at')}
        value={toLocalInput(value.at)}
        onChange={(event) => onChange({ ...value, at: fromLocalInput(event.currentTarget.value) })}
      />
      <select
        className="pg-input pg-select"
        aria-label={t('when.duration')}
        value={value.minutes}
        onChange={(event) => onChange({ ...value, minutes: Number(event.currentTarget.value) })}
      >
        {DURATIONS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {t('when.minutes', { n: String(minutes) })}
          </option>
        ))}
      </select>
    </div>
  );
}

/** «3 окт., 15:00 · 60 мин» — одинаково в списке, на заставке и в письме. */
export function formatSchedule(schedule: Schedule, lang: string, t: T): string {
  if (!schedule.at) return '';
  const when = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(schedule.at));
  return `${when} · ${t('when.minutes', { n: String(schedule.minutes) })}`;
}

interface Event {
  title: string;
  details: string;
  url: string;
  start: string;
  minutes: number;
  guest?: string;
}

/** 20261003T120000Z — формат времени и iCalendar, и Google Календаря. */
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(event: Event): string {
  const start = new Date(event.start);
  const end = new Date(start.getTime() + event.minutes * 60_000);
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.title);
  url.searchParams.set('dates', `${stamp(start)}/${stamp(end)}`);
  url.searchParams.set('details', `${event.details}\n\n${event.url}`);
  url.searchParams.set('location', event.url);
  if (event.guest) url.searchParams.set('add', event.guest);
  return url.toString();
}

/** Экранирование текста iCalendar: запятые, точки с запятой и переводы строк. */
const escape = (text: string) => text.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\n/g, '\\n');

export function downloadIcs(event: Event) {
  const start = new Date(event.start);
  const end = new Date(start.getTime() + event.minutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//why//playground//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@why`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`${event.details}\n\n${event.url}`)}`,
    `URL:${event.url}`,
    `LOCATION:${escape(event.url)}`,
    ...(event.guest ? [`ATTENDEE;RSVP=TRUE:mailto:${event.guest}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'interview.ics';
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Кнопки календаря под выпущенной ссылкой — если время назначено. */
export function CalendarButtons({ t, event }: { t: T; event: Event }) {
  return (
    <>
      <a className="pg-button" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
        <i className="codicon codicon-calendar" aria-hidden="true" /> {t('when.google')}
      </a>
      <button type="button" className="pg-button" onClick={() => downloadIcs(event)}>
        <i className="codicon codicon-cloud-download" aria-hidden="true" /> .ics
      </button>
    </>
  );
}
