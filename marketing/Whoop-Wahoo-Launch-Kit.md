# Draft × WHOOP / Wahoo — Launch Kit

Every post goes out from Brandon's own accounts, as the person who built it. That's what makes it read as human: a real rider-developer showing something he made, answering questions in the comments. Images live in `marketing/ads/`.

**Order of operations (one channel a day, so you can answer every comment):**

| Day | Channel | Post | Image |
|---|---|---|---|
| 1 | r/whoop | Post A | whoop-square |
| 1 | Email WHOOP partnerships | Email 1 | — |
| 2 | r/wahoofitness | Post B | wahoo-square |
| 2 | Email Wahoo developer team | Email 2 | — |
| 3 | intervals.icu forum | Post C | both |
| 4 | Facebook (your profile + 3–5 groups that allow it) | Post D | both |
| 4 | Instagram / Strava club / X | Captions E | stories + squares |
| 5+ | Paid: Meta ads | Ad copy F | all four |

---

## A. r/whoop

**Title:** I built a cycling coach that changes your workout based on your WHOOP recovery. Looking for feedback

> Disclosure up front: I'm the solo dev behind this, so I'm biased.
>
> I ride with a WHOOP and kept running into the same thing. I'd wake up at 28% recovery, then go do the VO2 session my training plan had on the calendar anyway, because the plan has no idea what WHOOP is telling me.
>
> So I hooked my app (Draft, an AI cycling coach) up to the WHOOP API. Here's what happens now:
> - Your recovery, HRV, RHR, sleep and strain come in each morning once WHOOP scores you.
> - If you're in the red, the coach proposes a swap (e.g. VO2 → easy Z2) and moves the hard session to a day you're likely to be green. You tap accept or keep the original. It never changes anything without asking.
> - If you're green, it leaves the hard day alone.
> - It waits for today's recovery instead of guessing from yesterday's, and sends a push once it's scored.
>
> Screenshot of what a red morning looks like attached.
>
> What I'd really like to know from WHOOP people: how far do you actually trust the recovery score when you're deciding to train? Should a 40% day mean "go easier," or only under 33%? I'm tuning the thresholds and would rather hear from people who live with the number every day.
>
> It's at draftcycling.com if you want to try it (7-day free trial). Happy to answer anything.

---

## B. r/wahoofitness

**Title:** Made a training app that pushes planned workouts straight to your ELEMNT. Would love to hear from Wahoo riders

> Full disclosure: I'm the developer.
>
> I just shipped a Wahoo integration for Draft, my AI cycling coach. You connect your Wahoo account once, and every workout the coach puts on your calendar shows up in your planned workouts on the ELEMNT, with no .fit exporting and no emailing files to yourself. Move a workout or have the coach adjust it, and the version on your Wahoo updates too.
>
> Power targets come from your FTP, and max efforts get an open-ended band so ERG doesn't pin you during sprints. That one took me an embarrassingly long time to get right.
>
> Screenshot attached of the phone → head unit flow.
>
> Questions for the Wahoo crowd:
> 1. Do you mostly ride planned workouts outside on the ELEMNT or inside on a KICKR?
> 2. Anything that annoys you about how other apps' workouts show up on your unit (naming, interval labels, ramps)?
>
> draftcycling.com if you want to try it, 7-day free trial. I'll be in the comments.

---

## C. intervals.icu forum (Third-party apps / Show & tell)

**Title:** Draft: AI coach now with WHOOP recovery + Wahoo planned workouts (plus intervals.icu sync)

> Hi all, I'm Brandon and I build Draft (draftcycling.com), an AI cycling coach that already syncs plans to intervals.icu. Two new integrations went out this week that people here might care about:
>
> **WHOOP:** recovery, HRV, RHR and sleep feed the daily coaching decision. A red day gets an easier-day proposal that you can accept or reject. For non-WHOOP watches we use HRV trend from intervals.icu / Apple Health instead of a single-day number.
>
> **Wahoo:** scheduled workouts push to Wahoo planned workouts automatically.
>
> If you've thought about readiness-based adjustment (single-day score vs. rolling HRV baseline, how to weight sleep), I'd really value pushback on the logic. Happy to share how the thresholds work.

---

## D. Facebook: personal profile (post this first), then groups that allow member promo

> Little personal milestone: Draft, the cycling coach app I've been building nights and weekends, now works with **WHOOP** and **Wahoo**.
>
> 🔴 Bad night's sleep? It sees your WHOOP recovery in the morning and offers to swap the hard intervals for an easy spin.
> 🚴 Planned a workout? It's already on your Wahoo when you clip in.
>
> If you ride with either one, I'd love for you to try it and tell me what's broken: draftcycling.com (free for 7 days). Shares mean a lot. I'm one guy doing this. 🙏

*For groups: only post where the rules allow member promotion, and keep the first line "I'm the developer of…".*

---

## E. Short captions

**Instagram / Strava club (WHOOP image):**
> Rough night? Your coach already knows. Draft now reads your WHOOP recovery every morning and adjusts the day's ride before you clip in. Link in bio, 7 days free. #cycling #whoop #cyclingtraining #zone2

**Instagram / Strava club (Wahoo image):**
> Planned by your coach. Waiting on your Wahoo. Every Draft workout syncs straight to your ELEMNT, so there's no exporting and no files. Link in bio. #wahoo #elemnt #cyclingtraining #indoorcycling

**X / Threads:**
> Shipped two integrations for Draft this week:
> • WHOOP: red recovery → coach proposes an easier day
> • Wahoo: workouts land on your ELEMNT automatically
> Solo dev, real feedback welcome. draftcycling.com

---

## F. Paid (Meta: Facebook + Instagram) once organic posts have a few comments

- **Audience 1 (WHOOP ad):** US/CA/UK/AU, 25–55, interests *WHOOP* + (*Road cycling* OR *Zwift* OR *Strava*). Placements: Feed + Stories.
- **Audience 2 (Wahoo ad):** interests *Wahoo Fitness* OR *Wahoo KICKR* + *Road cycling*.
- Budget: $10/day per ad for 5 days, then keep whichever has the lower cost per trial start.
- **Primary text (WHOOP):** "Your WHOOP says 31%. Your training plan says VO2 intervals. Draft listens to the first one."
- **Primary text (Wahoo):** "Every workout your coach plans shows up on your Wahoo automatically. No files. Just ride."
- Headline: "AI cycling coach — 7 days free". CTA: Sign up → draftcycling.com.

---

## Email 1: WHOOP partnerships (ask to be listed in WHOOP's app integrations)

**Subject:** Draft (AI cycling coach) is live on the WHOOP API: integrations listing?

> Hi WHOOP team,
>
> I'm Brandon, developer of Draft (draftcycling.com), an AI cycling coach. We've just launched a WHOOP integration: members' daily recovery, HRV and sleep drive same-day training adjustments (a red recovery prompts an easier session, which the rider approves).
>
> I'd love for Draft to be considered for WHOOP's integrations/partners listing, and I'm happy to provide logos, screenshots, and a free account for anyone on your team who wants to test it.
>
> Thanks,
> Brandon Nelson, draftcycling.com

## Email 2: Wahoo developer / partner team (ask for a spot on wahoofitness.com/apps)

**Subject:** Draft: new Wahoo Cloud API partner app, request for apps page listing

> Hi Wahoo team,
>
> Draft (draftcycling.com), an AI cycling coach, now pushes planned workouts to riders' Wahoo accounts via the Cloud API (app ID 1649). Every scheduled session appears in the ELEMNT's planned workouts automatically.
>
> Could Draft be added to the partner apps page at wahoofitness.com/apps? I can send logos, copy and screenshots in whatever format you need.
>
> Thanks,
> Brandon Nelson, draftcycling.com
