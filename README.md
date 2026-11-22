[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gp897318-beep/gta6-solara/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gp897318-beep/gta6-solara/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLARA — Open-World Crime

A 3D third-person open-world crime game built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01): drive and steal cars, outrun Solara PD (wanted stars, chases, helicopter spotlight, SWAT), and run 10 story jobs for fixer **Luz Marín** in a sun-soaked coastal city at golden hour.

## The city

Solara is a coastal grid city with five named districts — Solara Strand, Beachfront, Sunset Heights, Old Town, Harborlight — a pier, a canal, a harbor with cranes, neon signs, palm-lined avenues and a living beach with umbrellas. The sky is a real golden-hour gradient dome with a low sun over the sea.

## Features

- **10 story missions** (FIRST LIGHT → LAST LIGHT) with timers, checkpoints, survive objectives and payouts
- **5-star wanted system**: Solara PD dispatch with named units + distances + statuses (RAMMING, FLANKING, ROADBLOCK, SPOTLIGHT, PIT, FIRING), helicopter with a bright spotlight cone at 3+ stars, SWAT vans at 5 stars
- **4 side activities**: street races, taxi fares, courier deliveries, stunt rings — plus 12 hidden packages
- **7 cars** to steal and drive, with arcade handling, damage, nitro and garage upgrades (engine / armor / nitro)
- **5 weapons** (fists, pistol, SMG, shotgun, rifle) with unlock progression
- **Crew abilities**: SWAP PLATES, QUICK FIX, EYES OUT
- **District standing**, respect ranks, day/night cycle, rain, radio stations (synthesized WebAudio), saves via localStorage
- **Full HUD**: mission panel, dispatch panel, weapon slots, circular minimap, health/armor, big speedo, dialogue box, radio

## Play

```bash
node serve.ts
# open http://localhost:8080
```

WASD move / drive · E enter & steal car · F punch · click shoot · Q swap plates · R quick fix · V eyes out · C radio · P pause · T side activity · G garage (at Harborlight) · N nitro.

## Tech

Static files under `game/` — Three.js (vendored) + plain ES modules, no build step, no network requests. `main.ts` copies `game/` + `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.

A fully original game. No real city, person or brand appears in it.
