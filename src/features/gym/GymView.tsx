import { useAppData } from '../../app/AppData';
import type { Exercise } from '../../data/db/models';

const CATEGORY_LABEL: Record<Exercise['category'], string> = { push: 'Empuje', pull: 'Tracción', legs: 'Pierna' };
const dec = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function GymView() {
  const { exercises, bestSets, gymSessions } = useAppData();
  const dated = gymSessions.filter((s) => s.date).sort((a, b) => b.date!.localeCompare(a.date!));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Gimnasio</h1>
        <p className="subtitle">Importación de capturas y registro manual: fase 3.</p>
      </header>

      {(['push', 'pull', 'legs'] as const).map((cat) => (
        <section className="card" key={cat}>
          <h2>{CATEGORY_LABEL[cat]}</h2>
          <ul className="list">
            {exercises
              .filter((e) => e.category === cat)
              .map((e) => {
                const best = bestSets
                  .filter((b) => b.exerciseId === e.id)
                  .sort((a, b) => b.weightKg - a.weightKg)[0];
                return (
                  <li key={e.id}>
                    <span>
                      {e.name}
                      {e.loadMode === 'unconfirmed' && <span className="tag">¿mancuerna o par?</span>}
                    </span>
                    <span className="muted nowrap">
                      {best
                        ? `${dec.format(best.weightKg)} kg × ${best.reps}${e.loadMode === 'perDumbbell' ? ' /manc.' : ''}`
                        : 'No realizado'}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <section className="card">
        <h2>Sesiones importadas ({gymSessions.length})</h2>
        <ul className="list">
          {dated.map((s) => (
            <li key={s.id}>
              <span>{s.templateName}</span>
              <span className="muted">{shortDate(s.date!)}</span>
            </li>
          ))}
          {gymSessions
            .filter((s) => !s.date)
            .map((s) => (
              <li key={s.id}>
                <span>{s.templateName}</span>
                <span className="muted">sin fecha · {s.sets.length} series</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
