import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { saveRecoveryConfig } from '../../data/db/repository';
import { DEFAULT_RECOVERY_CONFIG, type RecoveryConfig } from '../../domain/recovery/recoveryConfig';

const FIELDS: Array<{ key: keyof RecoveryConfig; label: string; step: string }> = [
  { key: 'hrvZYellow', label: 'VFC amarillo si z <', step: '0.1' },
  { key: 'hrvZRed', label: 'VFC rojo si z <', step: '0.1' },
  { key: 'rhrDeltaYellow', label: 'Pulso en reposo amarillo si sube ≥ (lpm)', step: '1' },
  { key: 'rhrDeltaRed', label: 'Pulso en reposo rojo si sube ≥ (lpm)', step: '1' },
  { key: 'sleepYellow', label: 'Sueño amarillo si < (h)', step: '0.25' },
  { key: 'sleepRed', label: 'Sueño rojo si < (h)', step: '0.25' },
  { key: 'sleepBelowMeanYellow', label: 'Sueño amarillo si duermes más de … h bajo tu media', step: '0.25' },
  { key: 'acwrYellow', label: 'Carga (ACWR) amarillo si >', step: '0.1' },
];

export function RecoverySettings() {
  const { db, recoveryConfig, reload } = useAppData();
  const [draft, setDraft] = useState<RecoveryConfig>(recoveryConfig);
  const [status, setStatus] = useState<string>();

  return (
    <section className="card">
      <h2>Umbrales de recuperación</h2>
      <p className="metric-hint">Cuándo el semáforo pasa a amarillo o rojo. Si no estás seguro, deja los valores por defecto.</p>
      <details>
        <summary className="muted" style={{ cursor: 'pointer', marginTop: 8 }}>
          Editar umbrales
        </summary>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveRecoveryConfig(db, draft);
            await reload();
            setStatus('Umbrales guardados.');
          }}
        >
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                value={draft[f.key]}
                onChange={(e) => {
                  setStatus(undefined);
                  const v = Number(e.target.value.replace(',', '.'));
                  if (Number.isFinite(v)) setDraft({ ...draft, [f.key]: v });
                }}
              />
            </label>
          ))}
          <div className="row-gap">
            <button className="btn primary" type="submit">
              Guardar
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await saveRecoveryConfig(db, null);
                setDraft(DEFAULT_RECOVERY_CONFIG);
                await reload();
                setStatus('Valores por defecto restaurados.');
              }}
            >
              Restaurar por defecto
            </button>
          </div>
          {status && <span className="status ok">{status}</span>}
        </form>
      </details>
    </section>
  );
}
