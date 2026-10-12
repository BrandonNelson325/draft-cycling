import { useEffect, useState } from 'react';
import { GRADIENT_CSS, interpolateColor } from '../dashboard/FreshnessGauge';

/**
 * Landing-page phone showing the real dashboard Coach card with sample data.
 * Built in HTML (not a screenshot) so it's crisp everywhere and can animate:
 * the marker slides into place, then the rows appear one by one.
 * Sample data only — it never calls the API.
 */
const TARGET_PCT = 28;

export function PhoneDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [150, 900, 1300, 1700, 2100, 2500].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const pct = step >= 1 ? TARGET_PCT : 0;
  const chip = interpolateColor(TARGET_PCT);
  const show = (n: number) => `transition-all duration-500 ${step >= n ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`;

  return (
    <div className="relative mx-auto w-[300px] sm:w-[320px]" aria-label="Draft app dashboard preview">
      {/* Glow */}
      <div className="absolute -inset-8 bg-gradient-to-tr from-blue-600/30 via-cyan-400/10 to-transparent blur-3xl rounded-full" />

      {/* Phone frame */}
      <div className="relative rounded-[44px] border border-gray-700 bg-gray-900 p-3 shadow-2xl">
        <div className="rounded-[34px] bg-[#0f172a] overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-2 text-[11px] font-semibold text-gray-200">
            <span>6:42</span>
            <span className="h-5 w-20 rounded-full bg-black" />
            <span className="tracking-tight">●●● 5G</span>
          </div>

          <div className="px-3 pb-4 space-y-3">
            {/* Coach card */}
            <div className="rounded-2xl bg-[#1e293b] p-4 space-y-4">
              {/* Gauge + chip */}
              <div>
                <div className="relative h-8">
                  <div
                    className="absolute bottom-1.5 px-2.5 py-0.5 rounded-full text-[13px] font-bold whitespace-nowrap transition-all duration-1000 ease-out"
                    style={{ left: `clamp(0px, calc(${pct}% - 26px), calc(100% - 52px))`, backgroundColor: chip, color: '#ffffff' }}
                  >
                    Fresh
                  </div>
                  <div
                    className="absolute bottom-0 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] transition-all duration-1000 ease-out"
                    style={{ left: `${pct}%`, transform: 'translateX(-50%)', borderTopColor: chip }}
                  />
                </div>
                <div className="relative">
                  <div className="h-2.5 rounded-full" style={{ background: GRADIENT_CSS }} />
                  <div
                    className="absolute top-[-3px] w-1 h-4 bg-white rounded-sm shadow transition-all duration-1000 ease-out"
                    style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] text-slate-500">
                  <span>Fresh</span><span>Productive</span><span>Overreaching</span>
                </div>
              </div>

              {/* Recovery line */}
              <div className={`flex items-center gap-1.5 rounded-full bg-[#0f172a] px-3 py-1.5 text-[11px] ${show(2)}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span className="font-extrabold text-yellow-400">62%</span>
                <span className="text-slate-400 truncate">· HRV 43 · RHR 59 · Sleep 7h</span>
              </div>

              {/* Day rows */}
              <div className="space-y-2">
                <div className={`flex items-center gap-2 rounded-md border-l-[3px] border-blue-400 bg-[#0f172a] px-2.5 py-2 ${show(3)}`}>
                  <span className="w-16 shrink-0 text-[9px] font-bold uppercase tracking-wide text-blue-400">Today</span>
                  <span className="flex-1 truncate text-[12px] font-semibold text-slate-100">Sweet Spot 3×12</span>
                  <span className="text-[10px] text-slate-400">75min</span>
                </div>
                <div className={`flex items-center gap-2 rounded-md border-l-[3px] border-blue-400 bg-[#0f172a] px-2.5 py-2 ${show(4)}`}>
                  <span className="w-16 shrink-0 text-[9px] font-bold uppercase tracking-wide text-blue-400">Tomorrow</span>
                  <span className="flex-1 truncate text-[12px] font-semibold text-slate-100">Endurance Z2</span>
                  <span className="text-[10px] text-slate-400">90min</span>
                </div>
              </div>

              {/* Key points */}
              <ul className={`space-y-1.5 ${show(5)}`}>
                {[
                  'Recovery is middling — hold the low end of sweet spot',
                  'Legs are fresh after Sunday’s easy spin',
                  'Fuel early: 60g carbs per hour',
                ].map((p) => (
                  <li key={p} className="flex gap-1.5 text-[11.5px] leading-snug text-slate-300">
                    <span className="text-blue-400">•</span><span>{p}</span>
                  </li>
                ))}
              </ul>

              <div className={`rounded-lg bg-blue-500 py-2 text-center text-[12px] font-semibold text-white ${show(6)}`}>
                Chat with Coach
              </div>
            </div>

            {/* Peek of the fitness chart below */}
            <div className="rounded-2xl bg-[#1e293b] p-4">
              <div className="text-[12px] font-semibold text-slate-100 mb-2">Fitness &amp; Fatigue</div>
              <svg viewBox="0 0 200 40" className="w-full h-10">
                <path d="M0 32 C30 30 50 26 80 22 S130 14 160 12 200 9 200 9" fill="none" stroke="#3b82f6" strokeWidth="2" />
                <path d="M0 34 C25 20 45 30 70 18 S110 28 140 14 180 22 200 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
