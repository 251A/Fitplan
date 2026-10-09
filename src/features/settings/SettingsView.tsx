import { useRef, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { exportBackup, importPersonalSeed, restoreBackup, saveProfile } from '../../data/db/repository';
import type { UserProfile } from '../../data/db/models';
import { useHealthImport } from '../today/HealthSyncCard';
import { buildDemoPayload } from '../../data/health/demoPayload';
import { SyncSettings } from './SyncSettings';
import { RecoverySettings } from './RecoverySettings';
import { ClaudeSettingsCard } from './ClaudeSettingsCard';

function ProfileForm({ profile }: { profile: UserProfile }) {
  const { db, reload } = useAppData();
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const num = (k: keyof UserProfile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setDraft({ ...draft, [k]: Number(e.target.value.replace(',', '.')) });
  };

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        await saveProfile(db, draft);
        await reload();
        setSaved(true);
      }}
    >
      <label>
        Altura (cm)
        <input inputMode="decimal" value={draft.heightCm} onChange={num('heightCm')} />
      </label>
      <label>
        FC máxima observada (lpm)
        <input inputMode="numeric" value={draft.hrMaxObserved} onChange={num('hrMaxObserved')} />
      </label>
      <label>
        Objetivo de pasos
        <input inputMode="numeric" value={draft.stepGoal} onChange={num('stepGoal')} />
      </label>
      <label>
        Días base de gimnasio
        <input inputMode="numeric" value={draft.gymBaseDays} onChange={num('gymBaseDays')} />
      </label>
      <label>
        Plantilla de 3 días
        <select
          value={draft.threeDayTemplate}
          onChange={(e) => setDraft({ ...draft, threeDayTemplate: e.target.value as UserProfile['threeDayTemplate'] })}
        >
          <option value="upperLowerFull">Tren superior · Pierna · Cuerpo completo</option>
          <option value="pushPullLegs">Empuje · Tracción · Pierna</option>
        </select>
      </label>
      <button className="btn primary" type="submit">
        Guardar
      </button>
      {saved && <span className="status ok">Guardado.</span>}
    </form>
  );
}

export function SettingsView() {
  const { db, profile, reload } = useAppData();
  const { status: importStatus, importText } = useHealthImport();
  const [backupStatus, setBackupStatus] = useState<string>();
  const restoreRef = useRef<HTMLInputElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const [seedStatus, setSeedStatus] = useState<string>();

  async function downloadBackup() {
    const backup = await exportBackup(db);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const name = `fitplan-copia-${backup.exportedAt.slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // On iPhone the share sheet lets you save straight to iCloud Drive ("Guardar en Archivos").
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Copia de FitPlan' }).catch(() => undefined);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setBackupStatus('Copia creada.');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Ajustes</h1>
      </header>

      <section className="card">
        <h2>Perfil</h2>
        {profile ? <ProfileForm profile={profile} /> : <p>Sin perfil.</p>}
      </section>

      <SyncSettings />

      <RecoverySettings />

      <ClaudeSettingsCard />

      <section className="card">
        <h2>Datos iniciales</h2>
        <p className="metric-hint">
          Tu perfil, mejores series y sesiones pasadas no están en el código público. Impórtalos una vez desde el
          archivo <code>seed-personal.json</code>.
        </p>
        <div className="row-gap">
          <button className="btn" onClick={() => seedRef.current?.click()}>
            Importar datos iniciales…
          </button>
        </div>
        <input
          ref={seedRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { sessions } = await importPersonalSeed(db, await f.text());
              await reload();
              setSeedStatus(`Datos iniciales importados: ${sessions} sesiones.`);
            } catch (err) {
              setSeedStatus(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        {seedStatus && <p className="status">{seedStatus}</p>}
      </section>

      <section className="card">
        <h2>Atajo de Salud</h2>
        <p className="metric-hint">
          La app recibe los datos de Apple Salud mediante el atajo "FitPlan sync". Las instrucciones están en
          la carpeta <code>shortcuts/</code> del proyecto.
        </p>
      </section>

      <section className="card">
        <h2>Copia de seguridad</h2>
        <p className="metric-hint">
          Los datos viven solo en este iPhone. Guarda una copia en iCloud Drive de vez en cuando.
        </p>
        <div className="row-gap">
          <button className="btn primary" onClick={downloadBackup}>
            Exportar copia
          </button>
          <button className="btn" onClick={() => restoreRef.current?.click()}>
            Restaurar copia…
          </button>
        </div>
        <input
          ref={restoreRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!confirm('Restaurar sustituye todos los datos actuales por los de la copia. ¿Continuar?')) return;
            try {
              await restoreBackup(db, await f.text());
              await reload();
              setBackupStatus('Copia restaurada.');
            } catch (err) {
              setBackupStatus(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        {backupStatus && <p className="status">{backupStatus}</p>}
      </section>

      {import.meta.env.DEV && (
        <section className="card">
          <h2>Desarrollo</h2>
          <p className="metric-hint">Solo en modo desarrollo: carga 35 días de datos inventados para probar la interfaz.</p>
          <button
            className="btn"
            onClick={() => importText(JSON.stringify(buildDemoPayload(new Date())), { upload: false })}
          >
            Cargar datos de demo
          </button>
          {importStatus && <p className={`status ${importStatus.kind}`}>{importStatus.text}</p>}
        </section>
      )}
    </div>
  );
}
