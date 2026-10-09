import { planAdvice, type RecoveryState } from '../../domain/recovery/recoveryEngine';
import { useRecovery } from './useRecovery';

// Status colours always come with an icon and a label, never colour alone.
const STATE_UI: Record<RecoveryState, { label: string; icon: string; tone: string }> = {
  green: { label: 'Verde', icon: '●', tone: 'good' },
  yellow: { label: 'Amarillo', icon: '▲', tone: 'warn' },
  red: { label: 'Rojo', icon: '■', tone: 'bad' },
  calibrating: { label: 'Calibrando', icon: '◌', tone: 'neutral' },
  noData: { label: 'Sin datos', icon: '○', tone: 'neutral' },
};

const TITLE: Record<RecoveryState, string> = {
  green: 'Listo para entrenar',
  yellow: 'Baja un poco la intensidad',
  red: 'Hoy toca recuperar',
  calibrating: 'Aprendiendo tus valores normales',
  noData: 'Esperando datos de Salud',
};

export function RecoveryCard() {
  const r = useRecovery();
  const ui = STATE_UI[r.state];

  return (
    <section className={`card recovery-card tone-${ui.tone}`} aria-live="polite">
      <div className="recovery-head">
        <span className={`status-pill tone-${ui.tone}`}>
          <span aria-hidden>{ui.icon}</span> {ui.label}
        </span>
        <h2>{TITLE[r.state]}</h2>
      </div>
      <ul className="reasons">
        {r.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="advice">
        <strong>Plan de hoy:</strong> {planAdvice(r.state)}
      </p>
    </section>
  );
}
