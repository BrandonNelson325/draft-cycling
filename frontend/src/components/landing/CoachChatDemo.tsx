import { useEffect, useRef, useState } from 'react';

/**
 * Scripted (not live) coach conversation for the landing page. Plays once when
 * scrolled into view; "Replay" restarts it. No API calls, so it costs nothing
 * and can't be abused.
 */
type Msg = { from: 'rider' | 'coach'; text: string };

const SCRIPT: Msg[] = [
  { from: 'rider', text: 'HRV is down and my legs feel heavy. Should I still do the threshold session?' },
  {
    from: 'coach',
    text: 'Good call checking. Your recovery is 41% and you’ve stacked three hard days, so threshold today would mostly dig a hole. I’d swap it for 60 min easy Z2 and move threshold to Thursday — your legs will be ready by then. Want me to make that change?',
  },
  { from: 'rider', text: 'Yes, do it.' },
  { from: 'coach', text: 'Done ✅ Today is now Endurance Z2 (60 min) and threshold is on Thursday. It’s already synced to your calendar and head unit.' },
];

const WORD_MS = 45; // coach reply appears word by word
const PAUSE_MS = 700;

export function CoachChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // bump to (re)start
  const [shown, setShown] = useState<Msg[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Start once the demo is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setRun((r) => (r === 0 ? 1 : r));
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));

    (async () => {
      setShown([]); setTyping(null); setDone(false);
      for (const m of SCRIPT) {
        if (cancelled) return;
        await wait(PAUSE_MS);
        if (m.from === 'rider') {
          setShown((s) => [...s, m]);
          continue;
        }
        setTyping('');
        await wait(500); // "thinking" dots
        const words = m.text.split(' ');
        for (let i = 1; i <= words.length; i++) {
          if (cancelled) return;
          setTyping(words.slice(0, i).join(' '));
          await wait(WORD_MS);
        }
        setShown((s) => [...s, m]);
        setTyping(null);
      }
      if (!cancelled) setDone(true);
    })();

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [run]);

  return (
    <div ref={ref} className="rounded-2xl border border-gray-700/60 bg-gray-900/80 p-4 sm:p-5 shadow-xl">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-gray-800">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-sm font-semibold">Your coach</span>
        <span className="text-xs text-gray-500">· replies in seconds, any time of day</span>
      </div>

      <div className="space-y-3 min-h-[300px]">
        {shown.map((m, i) => <Bubble key={i} msg={m} />)}
        {typing !== null && (
          typing === ''
            ? <div className="flex gap-1 px-3 py-3 w-14 rounded-2xl rounded-bl-sm bg-gray-800">
                {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />)}
              </div>
            : <Bubble msg={{ from: 'coach', text: typing }} />
        )}
      </div>

      <div className="h-6 mt-2 text-right">
        {done && (
          <button onClick={() => setRun((r) => r + 1)} className="text-xs text-gray-400 hover:text-white">
            ↻ Replay
          </button>
        )}
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const rider = msg.from === 'rider';
  return (
    <div className={`flex ${rider ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed rounded-2xl ${
          rider ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'
        }`}
      >
        {msg.text}
      </div>
    </div>
  );
}
