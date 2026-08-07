import './hpbar.css';

export interface HpBarProps {
  label: string;
  hp: number;
  maxHp: number;
  /** Flips the fill direction so the opponent's bar drains toward the screen edge. */
  mirrored?: boolean;
  /** Shown as a floating delta when the value has just changed. */
  delta?: number | null;
  compact?: boolean;
}

export function HpBar({ label, hp, maxHp, mirrored = false, delta = null, compact = false }: HpBarProps) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const level = ratio <= 0.25 ? 'critical' : ratio <= 0.55 ? 'low' : 'ok';

  return (
    <div className={`hpbar ${mirrored ? 'hpbar--mirrored' : ''} ${compact ? 'hpbar--compact' : ''}`}>
      <div className="hpbar__label tiny">{label}</div>
      <div className="hpbar__track">
        <div className={`hpbar__fill hpbar__fill--${level}`} style={{ width: `${ratio * 100}%` }} />
        <div className="hpbar__value">
          {hp}
          <span className="hpbar__max">/{maxHp}</span>
        </div>
        {delta !== null && delta !== 0 && (
          <span key={`${hp}-${delta}`} className={`hpbar__delta ${delta > 0 ? 'is-up' : 'is-down'}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
    </div>
  );
}
