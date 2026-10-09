import { useRef, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { importHealth } from '../../data/db/repository';
import { HealthPayloadError, parseHealthPayload } from '../../data/health/payload';
import { pushHealthPayload } from '../../data/sync/syncClient';

const timeFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function useHealthImport() {
  const { db, timeZone, reload, cloud } = useAppData();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string }>();

  /** `upload: false` for data that must never reach the cloud (demo data). */
  async function importText(text: string, { upload = true } = {}) {
    try {
      const parsed = parseHealthPayload(text);
      const info = await importHealth(db, parsed, timeZone);
      await reload();
      const extra = info.warnings.length > 0 ? ` Avisos: ${info.warnings.join(' ')}` : '';
      let cloudNote = '';
      if (upload && cloud.config) {
        // Share with the other devices; the payload comes back on the next sync and re-imports idempotently.
        cloudNote = await pushHealthPayload(cloud.config, text)
          .then(() => ' Enviado a tus otros dispositivos.')
          .catch((e) => ` No se pudo enviar a la nube: ${e instanceof Error ? e.message : String(e)}`);
      }
      setStatus({
        kind: 'ok',
        text: `Sincronizado: ${info.daysUpdated} días, ${info.workoutsAdded} entrenos nuevos.${extra}${cloudNote}`,
      });
    } catch (e) {
      const msg = e instanceof HealthPayloadError ? e.message : `Error al importar: ${String(e)}`;
      setStatus({ kind: 'error', text: msg });
    }
  }

  return { status, importText };
}

export function HealthSyncCard() {
  const { lastSync } = useAppData();
  const { status, importText } = useHealthImport();
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      await importText(clip);
    } catch {
      // Clipboard API refused (permissions / older iOS): fall back to a paste box.
      setManual(true);
    }
  }

  const stale = !lastSync || Date.now() - lastSync.lastSyncMs > 20 * 3600_000;

  return (
    <section className={`card sync-card ${stale ? 'stale' : ''}`}>
      <div className="sync-row">
        <div>
          <h2>Datos de Salud</h2>
          <p className="metric-hint">
            {lastSync
              ? `Última sincronización: ${timeFmt.format(new Date(lastSync.lastSyncMs))}`
              : 'Aún no hay datos. Ejecuta el atajo "FitPlan sync" y pulsa Pegar.'}
          </p>
        </div>
        <button className="btn primary" onClick={pasteFromClipboard}>
          Pegar
        </button>
      </div>

      {manual && (
        <div className="manual-paste">
          <textarea
            placeholder="Mantén pulsado aquí y elige Pegar"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="row-gap">
            <button className="btn primary" disabled={!text} onClick={() => importText(text).then(() => setText(''))}>
              Importar
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Desde archivo…
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,.txt"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await importText(await f.text());
          e.target.value = '';
        }}
      />

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </section>
  );
}
