interface FreshnessGaugeProps {
  tsb: number;
}

// Gradient stops: Red (0%) → Green (50%) → Blue (100%)
const GRADIENT_STOPS = [
  { pos: 0, r: 239, g: 68, b: 68 },    // #ef4444 red
  { pos: 0.5, r: 34, g: 197, b: 94 },   // #22c55e green
  { pos: 1, r: 59, g: 130, b: 246 },     // #3b82f6 blue
];

function interpolateColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < GRADIENT_STOPS.length - 2 && GRADIENT_STOPS[i + 1].pos < t) i++;
  const a = GRADIENT_STOPS[i];
  const b = GRADIENT_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  const r = Math.round(a.r + (b.r - a.r) * localT);
  const g = Math.round(a.g + (b.g - a.g) * localT);
  const bl = Math.round(a.b + (b.b - a.b) * localT);
  return `rgb(${r}, ${g}, ${bl})`;
}

function textColorForBg(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < GRADIENT_STOPS.length - 2 && GRADIENT_STOPS[i + 1].pos < t) i++;
  const a = GRADIENT_STOPS[i];
  const b = GRADIENT_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  const r = a.r + (b.r - a.r) * localT;
  const g = a.g + (b.g - a.g) * localT;
  const bl = a.b + (b.b - a.b) * localT;
  // Luminance check — use white text on dark backgrounds, black on light
  const luminance = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overreaching', subtitle: 'Time for recovery' };
  if (tsb < -20) return { label: 'Optimal', subtitle: 'Recovery day coming up' };
  if (tsb < -5) return { label: 'Optimal', subtitle: 'Right where you want to be' };
  if (tsb < 5) return { label: 'Balanced', subtitle: 'Recovered and ready' };
  if (tsb < 25) return { label: 'Fresh', subtitle: 'Ready for a big effort' };
  return { label: 'Detrained', subtitle: 'Time to get back on the bike' };
}

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  const status = getStatus(tsb);

  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));
  const bg = interpolateColor(pct);
  const textColor = textColorForBg(pct);

  return (
    <div className="space-y-3">
      {/* Gradient Gauge: Red → Green → Blue */}
      <div className="relative">
        <div
          className="h-3 rounded-full"
          style={{ background: 'linear-gradient(to right, #ef4444, #22c55e, #3b82f6)' }}
        />
        <div
          className="absolute top-[-3px] w-1.5 h-[18px] bg-white rounded-sm shadow-md transition-all"
          style={{
            left: `${pct}%`,
            borderColor: bg,
            borderWidth: 2,
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Tired</span>
        <span>Optimal</span>
        <span>Fresh</span>
      </div>

      {/* Status Badge — background matches gradient position */}
      <div className="text-center p-3 rounded-xl" style={{ backgroundColor: bg }}>
        <div className="text-xl font-bold" style={{ color: textColor }}>
          {status.label}
        </div>
        <div className="text-xs font-medium" style={{ color: textColor, opacity: 0.8 }}>
          {status.subtitle}
        </div>
      </div>
    </div>
  );
}
