// Week plan → iCalendar (.ics) so it can be added to the iPhone Calendar (stand-in for EventKit).
// Sessions have no fixed time, so they are all-day events; UIDs are stable so re-importing updates.

import { addDays } from '../dates';
import { TEMPLATES } from './gymTemplates';
import type { PlannedSession, WeekPlan } from './weekPlanner';

const compact = (d: string) => d.replace(/-/g, '');

/** RFC 5545 text escaping + line folding at 75 octets. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    const candidate = current + ch;
    if (new TextEncoder().encode(candidate).length > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = ch;
    } else current = candidate;
  }
  out.push(current);
  return out.join('\r\n ');
}

function summary(s: PlannedSession): string {
  if (s.kind === 'gym') return `🏋️ ${s.gymTemplate}`;
  if (s.kind === 'run') return `🏃 ${s.run?.title ?? 'Carrera'}`;
  if (s.kind === 'swim') return `🏊 ${s.swim?.title ?? 'Natación'}`;
  return 'Descanso';
}

function description(s: PlannedSession, exerciseName: (id: string) => string): string {
  if (s.kind === 'gym' && s.gymTemplate) {
    const t = TEMPLATES[s.gymTemplate];
    const factor = s.setsFactor ?? 1;
    return [`~${s.minutes} min`, ...t.exercises.map((e) => `• ${exerciseName(e.exerciseId)}: ${Math.max(1, Math.round(e.sets * factor))} × ${e.reps}`)].join('\n');
  }
  if (s.run) return [`Calentamiento ${s.run.warmupMin} min andando`, s.run.main, `Vuelta a la calma ${s.run.cooldownMin} min`, s.run.notes].join('\n');
  if (s.swim) return [`Calentamiento ${s.swim.warmupM} m`, s.swim.main, `Vuelta a la calma ${s.swim.cooldownM} m`, s.swim.notes].join('\n');
  return '';
}

export function planToIcs(plan: WeekPlan, exerciseName: (id: string) => string = (id) => id, stampMs = Date.now()): string {
  const stamp = new Date(stampMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FitPlan//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:FitPlan'];
  for (const s of plan.sessions) {
    if (s.status === 'skipped') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.kind}-${s.id}@fitplan`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(s.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(s.date, 1))}`,
      `SUMMARY:${escapeText(summary(s) + (s.status === 'done' ? ' ✓' : ''))}`,
      `DESCRIPTION:${escapeText(description(s, exerciseName))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
