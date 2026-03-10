interface FreshnessGaugeProps {
  tsb: number;
}

// HSL interpolation avoids the muddy brown of RGB red→green blending.
// Gradient: Red (hue 0) → Yellow (45) → Green (145) → Cyan (190) → Blue (220)
const HSL_STOPS = [
  { pos: 0, h: 0, s: 85, l: 55 },       // red
  { pos: 0.25, h: 45, s: 90, l: 50 },    // orange-yellow
  { pos: 0.5, h: 145, s: 70, l: 45 },    // green
  { pos: 0.75, h: 190, s: 75, l: 50 },   // teal-cyan
  { pos: 1, h: 220, s: 90, l: 60 },      // blue
];

function interpolateHsl(pct: number): { h: number; s: number; l: number } {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < HSL_STOPS.length - 2 && HSL_STOPS[i + 1].pos < t) i++;
  const a = HSL_STOPS[i];
  const b = HSL_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  return {
    h: a.h + (b.h - a.h) * localT,
    s: a.s + (b.s - a.s) * localT,
    l: a.l + (b.l - a.l) * localT,
  };
}

function interpolateColor(pct: number): string {
  const { h, s, l } = interpolateHsl(pct);
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function textColorForBg(pct: number): string {
  const { l } = interpolateHsl(pct);
  return l > 50 ? '#000000' : '#ffffff';
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overreaching', subtitle: 'Training load is too high — take a rest day' };
  if (tsb < -20) return { label: 'Optimal', subtitle: 'Fitness is building — plan recovery soon' };
  if (tsb < -5) return { label: 'Optimal', subtitle: 'On track and absorbing training well' };
  if (tsb < 5) return { label: 'Balanced', subtitle: 'Fully recovered and ready to train' };
  if (tsb < 25) return { label: 'Fresh', subtitle: 'Peak form — ideal for racing or hard efforts' };
  return { label: 'Detrained', subtitle: 'Fitness is fading — time to start riding again' };
}

// CSS gradient string matching the HSL stops
const GRADIENT_CSS = `linear-gradient(to right, ${HSL_STOPS.map(
  (s) => `hsl(${s.h}, ${s.s}%, ${s.l}%) ${s.pos * 100}%`
).join(', ')})`;

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  const status = getStatus(tsb);

  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));
  const bg = interpolateColor(pct);
  const textColor = textColorForBg(pct);

  return (
    <div className="space-y-3">
      {/* Gradient Gauge */}
      <div className="relative">
        <div
          className="h-3 rounded-full"
          style={{ background: GRADIENT_CSS }}
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
