import { useCallback, useId, useMemo, useState } from 'react';
import type { SeriesPoint } from '../../domain/health/baselineSeries';

// Single-series SVG chart: line (with optional rolling-baseline band) or bars (with a goal line).
// One y-axis, thin marks, recessive grid, hover/touch crosshair + tooltip, and a table view.

const DEFAULT_W = 340;
const H = 170;

/** Width of the element in CSS pixels, so the SVG is drawn 1:1 and text keeps its real size. */
function useWidth(): [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = useState(DEFAULT_W);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry!.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
  }, []);
  return [ref, width];
}
const PAD = { top: 10, right: 8, bottom: 22, left: 40 };
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export interface TrendChartProps {
  title: string;
  points: SeriesPoint[];
  kind: 'line' | 'bar';
  format: (v: number) => string;
  /** Exact format for the tooltip and the table (defaults to `format`). */
  formatExact?: (v: number) => string;
  /** Horizontal reference (e.g. step goal). */
  goal?: { value: number; label: string };
  /** Smoothed line drawn over the raw values (e.g. 7-day weight average); raw values become dots. */
  trend?: Array<number | undefined>;
  trendLabel?: string;
  baselineLabel?: string;
}

function niceTicks(min: number, max: number, count = 3): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function TrendChart(props: TrendChartProps) {
  const { points, kind, format, goal, trend } = props;
  const exact = props.formatExact ?? format;
  const [hover, setHover] = useState<number>();
  const clipId = useId();
  const [wrapRef, W] = useWidth();

  const geo = useMemo(() => {
    const vals: number[] = [];
    for (const p of points) {
      for (const v of [p.value, p.lo, p.hi]) if (v !== undefined) vals.push(v);
    }
    for (const v of trend ?? []) if (v !== undefined) vals.push(v);
    if (goal) vals.push(goal.value);
    if (vals.length === 0) return undefined;
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (kind === 'bar') min = 0;
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
    if (kind !== 'bar') min -= pad;
    max += pad;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = points.length;
    const step = innerW / Math.max(n, 1);
    const x = (i: number) => PAD.left + (kind === 'bar' ? step * (i + 0.5) : n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = (v: number) => PAD.top + innerH * (1 - (v - min) / (max - min));
    return { x, y, step, ticks: niceTicks(min, max), innerH };
  }, [points, trend, goal, kind, W]);

  const latest = [...points].reverse().find((p) => p.value !== undefined);

  if (!geo) {
    return (
      <section className="card">
        <h2>{props.title}</h2>
        <p className="metric-hint">Sin datos en este periodo.</p>
      </section>
    );
  }
  const { x, y, step, ticks } = geo;

  // Line segments break at missing days instead of drawing across gaps.
  const segments = (vals: Array<number | undefined>) => {
    const out: string[] = [];
    let cur = '';
    vals.forEach((v, i) => {
      if (v === undefined) {
        if (cur) out.push(cur);
        cur = '';
      } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (cur) out.push(cur);
    return out;
  };

  const band = (() => {
    const idx = points.map((p, i) => (p.lo !== undefined && p.hi !== undefined ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return undefined;
    const top = idx.map((i) => `${x(i).toFixed(1)},${y(points[i]!.hi!).toFixed(1)}`);
    const bottom = [...idx].reverse().map((i) => `${x(i).toFixed(1)},${y(points[i]!.lo!).toFixed(1)}`);
    return `M${top.join('L')}L${bottom.join('L')}Z`;
  })();

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let dist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(x(i) - sx);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== undefined ? points[hover] : undefined;
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const hasBaseline = points.some((p) => p.mean !== undefined);

  return (
    <section className="card">
      <div className="chart-head">
        <h2>{props.title}</h2>
        {latest?.value !== undefined && <span className="chart-latest">{format(latest.value)}</span>}
      </div>
      <div className="chart-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${props.title}: gráfica de ${points.length} días`}>
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} />
            </clipPath>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {format(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) =>
            points[i] ? (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                fontSize="11"
                fill="var(--muted)"
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              >
                {shortDate(points[i].date)}
              </text>
            ) : null,
          )}

          <g clipPath={`url(#${clipId})`}>
            {band && <path d={band} fill="var(--muted)" opacity="0.16" />}
            {hasBaseline &&
              segments(points.map((p) => p.mean)).map((d, i) => (
                <path key={`m${i}`} d={d} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
              ))}
            {kind === 'bar' &&
              points.map((p, i) => {
                if (p.value === undefined || p.value <= 0) return null;
                const bw = Math.max(2, step - 2); // 2px gap between bars
                const top = y(p.value);
                const h = y(0) - top;
                const r = Math.min(4, bw / 2, h);
                const x0 = x(i) - bw / 2;
                // Rounded top, square base anchored to the baseline.
                const d = `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z`;
                return <path key={i} d={d} fill="var(--accent)" opacity={hover === undefined || hover === i ? 1 : 0.55} />;
              })}

            {goal && (
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(goal.value)}
                y2={y(goal.value)}
                stroke="var(--text)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.7"
              />
            )}

            {kind === 'line' &&
              !trend &&
              segments(points.map((p) => p.value)).map((d, i) => (
                <path key={`v${i}`} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              ))}

            {trend && (
              <>
                {points.map((p, i) =>
                  p.value !== undefined ? (
                    <circle key={`d${i}`} cx={x(i)} cy={y(p.value)} r="3" fill="var(--accent)" opacity="0.45" />
                  ) : null,
                )}
                {segments(trend).map((d, i) => (
                  <path key={`t${i}`} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
                ))}
              </>
            )}
          </g>

          {kind === 'line' && latest?.value !== undefined && hover === undefined && (
            <circle
              cx={x(points.lastIndexOf(latest))}
              cy={y(latest.value)}
              r="4"
              fill="var(--accent)"
              stroke="var(--card)"
              strokeWidth="2"
            />
          )}

          {hp && hover !== undefined && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth="1" />
              {hp.value !== undefined && kind === 'line' && (
                <circle cx={x(hover)} cy={y(hp.value)} r="4.5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />
              )}
            </g>
          )}

          <rect
            x={PAD.left}
            y={0}
            width={W - PAD.left - PAD.right}
            height={H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(undefined)}
          />
        </svg>

        {hp && hover !== undefined && (
          <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <strong>{shortDate(hp.date)}</strong>
            <br />
            {hp.value !== undefined ? exact(hp.value) : 'Sin dato'}
            {trend?.[hover] !== undefined && ` · media 7 d ${format(trend[hover]!)}`}
            {hp.mean !== undefined && (
              <>
                <br />
                {props.baselineLabel ?? 'Línea base'}: {format(hp.mean)}
              </>
            )}
          </div>
        )}
      </div>

      {(hasBaseline || goal || trend) && (
        <div className="chart-legend">
          {hasBaseline && (
            <span>
              <span className="swatch" style={{ background: 'var(--muted)', opacity: 0.35 }} />
              {props.baselineLabel ?? 'Línea base'} (media ± 1 desv.)
            </span>
          )}
          {goal && (
            <span>
              <span className="swatch" style={{ borderTop: '2px dashed var(--text)', height: 0, opacity: 0.6 }} />
              {goal.label}
            </span>
          )}
          {trend && (
            <span>
              <span className="swatch" style={{ background: 'var(--accent)', height: 2 }} />
              {props.trendLabel ?? 'Tendencia'}
            </span>
          )}
        </div>
      )}

      <details className="chart-table">
        <summary>Ver tabla</summary>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Valor</th>
              {hasBaseline && <th>{props.baselineLabel ?? 'Línea base'}</th>}
            </tr>
          </thead>
          <tbody>
            {[...points]
              .reverse()
              .filter((p) => p.value !== undefined)
              .map((p) => (
                <tr key={p.date}>
                  <td>{shortDate(p.date)}</td>
                  <td>{exact(p.value!)}</td>
                  {hasBaseline && <td>{p.mean !== undefined ? format(p.mean) : '—'}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
