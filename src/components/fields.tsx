import { useEffect, useState } from 'react';

interface NumProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  /** true: exige > min; false: exige >= min */
  exclusive?: boolean;
  int?: boolean;
  step?: number;
  suffix?: string;
}

/** Campo numérico que solo confirma valores válidos y marca los inválidos (sin silenciarlos). */
export function NumField({ label, value, onCommit, min = 0, exclusive, int, step = 0.5, suffix }: NumProps) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(Math.round(value * 100) / 100)), [value]);
  const n = Number(txt);
  const ok = txt.trim() !== '' && Number.isFinite(n) && (exclusive ? n > min : n >= min) && (!int || Number.isInteger(n));
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input
          type="number" inputMode="decimal" value={txt} step={step} min={min}
          aria-invalid={!ok}
          onChange={(e) => { setTxt(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && (exclusive ? v > min : v >= min) && (!int || Number.isInteger(v))) onCommit(v); }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
      {!ok && <small className="err">{int ? 'Entero' : 'Valor'} {exclusive ? '>' : '≥'} {min}</small>}
    </label>
  );
}
