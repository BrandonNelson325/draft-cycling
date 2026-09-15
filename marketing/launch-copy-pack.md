# Draft Cycling — Launch Copy Pack

*Send-ready posts for the one-time "launch spike" channels. Every post leads with what's genuinely new (GPX→plan, chat-with-coach, $9.99 vs $200 coach) and links to a clean page. Post to ONE channel at a time so you can respond to every comment in the first few hours — that's what makes or breaks these.*

**Golden rule for all of these:** you are the founder. Say so. "I built this" earns goodwill; pretending to be a neutral fan gets you torched. Reply to every single comment for the first 24 hours.

---

## 1. Product Hunt

**Best day:** Tue–Thu. Line up 10–15 friends/riders to comment (not just upvote — comments matter). Have the free FTP calculator and a 60-sec demo clip ready.

**Name:** Draft — AI cycling coach

**Tagline (60 char max):**
> Your AI cycling coach — plans from your event's GPX file

**Description:**
> Draft is an AI cycling coach for riders who can't justify $200+/mo for a human one. Drop in your event's route (even a GPX file) and it builds a structured, power-based plan for *that* course. Chat with it like a real coach, and when life gets in the way — missed a week, got sick, work exploded — the plan reshapes instead of guilting you. Syncs with Strava, exports workouts to your bike computer. $9.99/mo, 7-day free trial.

**First comment (from you, the maker):**
> Hey PH 👋 I'm Brandon, I built Draft.
>
> I love structured training but a real coach costs more than my rent's worth of coffee, and every app I tried either handed me a rigid plan that fell apart the first busy week, or a wall of charts with no actual *coaching*. So I built the thing I wanted: a coach you can talk to that plans around your real event and adapts when your week goes sideways.
>
> The part I'm most proud of: give it your event's GPX route and it builds a plan specific to that course. And when you miss workouts, it doesn't just shift the calendar — it re-reasons about your fitness.
>
> Free FTP/watts-per-kg calculator here if you want to try something with zero signup: draftcycling.com/tools/ftp-calculator
>
> Would genuinely love feedback from riders — what's made training apps frustrating for you? I'm here all day.

---

## 2. Hacker News — "Show HN"

*HN rewards honesty, technical substance, and humility. No marketing voice. Post ~8–9am ET on a weekday. Reply fast and never get defensive.*

**Title:**
> Show HN: An AI cycling coach that builds training plans from your event's GPX

**Body:**
> I'm Brandon. Draft is an AI cycling coach I've been building. You give it a goal event and your weekly availability and it generates a structured, power-based training plan; you can chat with it like a coach, and it re-plans when you miss sessions.
>
> A few things that were interesting to build:
> - **GPX → plan.** Parsing a route file to infer the demands of the event (climbing, duration) and shaping the plan around it.
> - **Adaptation.** When a rider skips workouts, naively shifting the calendar produces nonsense. The interesting problem was re-deriving the athlete's current fitness and rippling changes forward rather than just sliding blocks.
> - **Guardrails on the model.** The model makes the coaching decisions (periodization, workout types), but code synthesizes the actual intervals and clamps everything to the athlete's real availability — so a bad generation can't produce a broken or unsafe plan.
>
> Stack: TypeScript/Express + React + Supabase, Strava integration, workouts export as ZWO/FIT.
>
> It's a paid product ($9.99/mo) but there's a free FTP/W-kg calculator with no signup if you just want to poke at something: draftcycling.com/tools/ftp-calculator
>
> Happy to go deep on any of the technical or product decisions. Feedback welcome, including the harsh kind.

*(HN tip: if asked "why not just use TrainerRoad/intervals.icu?", answer honestly and specifically — the chat-coach + adaptation + price, and be upfront about what those tools do better. Defensiveness kills Show HN threads.)*

---

## 3. Reddit — r/SideProject / r/roastmyapp / r/Entrepreneur

*These want the founder story and are fine with self-promotion IF it's transparent and you engage. Not your buyers, but good for early feedback + a few signups.*

**Title:**
> I built an AI cycling coach because a human one costs more than my car payment

**Body:**
> Solo-built this over the last several months. It's a cycling training app where the "coach" is an AI you can actually chat with — it builds a structured plan around your goal event (you can even drop in the event's GPX route), syncs your rides from Strava, and rebuilds the plan when you miss workouts instead of leaving you with a broken calendar.
>
> The bet: most riders will never pay $200+/mo for a human coach, but they'd pay ~$10 to stop guessing what to ride. That's the gap.
>
> Live on iOS, web app too. Free FTP calculator (no signup) if you want to see the vibe: draftcycling.com/tools/ftp-calculator
>
> Would love a roast — landing page, pricing, positioning, anything. What would make *you* bounce?

---

## 4. Reddit — r/Velo (your core audience — TREAD CAREFULLY)

*r/Velo is serious, knowledgeable, and allergic to marketing. Do NOT drop this as a launch ad. The right move is not a launch post at all — it's showing up over weeks as a helpful member first (see community-commenting-guide.md). If and only if you've built some standing there, a transparent "I built this, brutal feedback wanted" post can work. Template below for when that time comes.*

**Title:**
> I built an AI cycling coach — would love this sub's brutally honest take on the training logic

**Body:**
> Longtime lurker. I've been building a training app and this is the one sub whose opinion I actually trust, so I'd rather get roasted here than praised anywhere else.
>
> It's an AI coach: give it a goal event + your availability, it periodizes a power-based plan, you can interrogate its reasoning in chat, and it re-plans when you miss sessions. The model makes the coaching calls but code synthesizes the intervals and enforces the athlete's real time constraints.
>
> I'm not going to pretend it replaces a great human coach. What I want to know from people who actually train with power: where does the *logic* fall down? What would make you not trust it? Free lifetime access to anyone here who's willing to tear it apart — DM me.
>
> (Mods, happy to remove if this isn't welcome.)

*Only post #4 after you've earned some presence. Ask the mods first if unsure. One bad launch here does lasting damage; one good one is worth a hundred cold signups.*

---

## 5. r/cycling (~1.3M, general audience)

*Broad and beginner-friendly. Better for a value post than a launch ad. If you post the product at all, frame it around the free tool, not the paywall.*

**Title:**
> Made a free FTP / watts-per-kg calculator (no signup, no email) — plus how to actually read the number

**Body:**
> I kept seeing "what's a good FTP?" questions, and the honest answer is "it depends entirely on your weight." So I put together a free calculator that takes your FTP (or estimates it from a 20-min / 8-min / ramp test) and shows your watts-per-kg and rough rider category: draftcycling.com/tools/ftp-calculator
>
> No signup, no email wall. Full disclosure: I built it as part of a cycling coaching app I make, but the calculator's just free — figured this sub would find it handy.
>
> Quick primer while I'm here: raw watts win on the flats, W/kg wins the moment it goes uphill. So a 250W rider at 65kg (3.85 W/kg) will drop a 280W rider at 85kg (3.29) on any real climb, even though the second rider makes more power. That's why comparing FTP without weight is meaningless.

*The disclosure line is doing important work — it's what keeps r/cycling from removing this as spam. Never omit it.*

---

## 6. Cycling forums (TrainerRoad forum, Slowtwitch, Weight Weenies, TimeTrialForum)

*Forums index on Google and last for years. A genuinely useful thread here earns steady trickle traffic. Same rule: be a member, disclose, lead with value.*

**Example thread (TrainerRoad forum "Training" section):**

**Title:** Free FTP/W-kg calculator + a question on 20-min vs ramp test discrepancy

**Body:**
> Built a small free FTP & W/kg calculator (no signup): draftcycling.com/tools/ftp-calculator — disclosure, I make a coaching app, the tool's free.
>
> Posting partly because I keep seeing people get very different FTP numbers from the 20-min test (×0.95) vs the ramp (×0.75 of best minute) and wondered how this crowd reconciles them. My take: the ramp tends to over-read for riders with big anaerobic contribution and under-read for diesels. Curious what you all use and trust.

*Ending on a real question turns a "here's my tool" post into a discussion the forum actually wants.*

---

## Launch sequencing (don't fire these all at once)

| Week | Action |
|---|---|
| 1 | Post the free-tool value posts to r/cycling + one forum. Watch, reply to everything. |
| 2 | Show HN (weekday morning). Full attention that day. |
| 3 | Product Hunt (line up commenters first). |
| Ongoing | Be a genuine member of r/Velo + forums per the commenting guide. The r/Velo launch post comes only after you have standing. |

**One channel at a time.** A launch post you can't babysit is a wasted shot.
