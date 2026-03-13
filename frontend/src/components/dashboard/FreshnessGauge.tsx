interface FreshnessGaugeProps {
  tsb: number;
  ctl?: number;
  atl?: number;
}

// Gradient: Blue (fresh/left) → Green (center) → Red (overtraining/right)
// Exact mirror of the original gradient, just reversed direction
const HSL_STOPS = [
  { pos: 0, h: 220, s: 90, l: 60 },      // blue (fresh)
  { pos: 0.25, h: 190, s: 75, l: 50 },   // teal-cyan
  { pos: 0.5, h: 145, s: 70, l: 45 },    // green (productive)
  { pos: 0.75, h: 45, s: 90, l: 50 },    // orange-yellow
  { pos: 1, h: 0, s: 85, l: 55 },        // red (overtraining)
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

/**
 * Determine status using ACWR (Acute:Chronic Workload Ratio).
 * Scales to individual fitness — high-CTL athletes can sustain larger loads.
 * Falls back to simplified TSB thresholds for new athletes (CTL < 15).
 */
function getStatus(tsb: number, ctl = 0, atl = 0) {
  if (ctl < 15) {
    if (tsb > 10) return { label: 'Fresh', subtitle: 'Ready to train — build your base consistently' };
    if (tsb >= -10) return { label: 'Balanced', subtitle: 'Good balance of training and recovery' };
    return { label: 'Productive', subtitle: 'Building your training base — nice work' };
  }

  const acwr = atl / ctl;
  if (acwr > 1.5) return { label: 'Overtraining', subtitle: 'Training load is spiking — rest and recover' };
  if (acwr > 1.3) return { label: 'Overreaching', subtitle: 'Heavy block — plan a recovery day soon' };
  if (acwr > 1.0) return { label: 'Productive', subtitle: 'In the sweet spot — building fitness effectively' };
  if (acwr > 0.8) return { label: 'Balanced', subtitle: 'Maintained fitness — ready for harder efforts' };
  if (ctl > 40 && acwr < 0.5) return { label: 'Detrained', subtitle: 'Fitness is fading — time to start riding again' };
  return { label: 'Fresh', subtitle: 'Well-rested — ideal for racing or hard efforts' };
}

/**
 * Map ACWR to gauge percentage.
 * Left (0%) = fresh/rested, Right (100%) = overtraining.
 * Productive (ACWR 1.0-1.3) lands around 50-80% — in the green zone.
 */
function acwrToGaugePct(ctl: number, atl: number, tsb: number): number {
  if (ctl < 15) {
    // New athlete: use TSB [30, -30] → [0%, 100%] (flipped: fresh=left)
    return Math.max(0, Math.min(100, ((30 - tsb) / 60) * 100));
  }
  const acwr = atl / ctl;
  // Map ACWR [0.5, 1.5] → [0%, 100%]
  return Math.max(0, Math.min(100, ((acwr - 0.5) / 1.0) * 100));
}

// CSS gradient string matching the HSL stops
const GRADIENT_CSS = `linear-gradient(to right, ${HSL_STOPS.map(
  (s) => `hsl(${s.h}, ${s.s}%, ${s.l}%) ${s.pos * 100}%`
).join(', ')})`;

export function FreshnessGauge({ tsb, ctl = 0, atl = 0 }: FreshnessGaugeProps) {
  const status = getStatus(tsb, ctl, atl);

  // Use ACWR-based gauge position (scales to individual fitness)
  const pct = acwrToGaugePct(ctl, atl, tsb);
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
        <span>Fresh</span>
        <span>Productive</span>
        <span>Overreaching</span>
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
