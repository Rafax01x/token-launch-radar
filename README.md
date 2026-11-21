# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rafax01x/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rafax01x/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar: 198 pre-token protocols ranked by implied value, on a sealed DefiLlama snapshot. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, scores every protocol with the radar-2 model in `lib/model.ts`, writes the ranked board to `board.json`, the dashboard's data to `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` last with the vendored make.fun library.

The model: implied value = TVL × category multiple × growth multiplier × maturity multiplier × breadth multiplier, all from the snapshot's own figures. The dashboard is a static, no-network page: a sortable, filterable board, a live-token view set aside with market caps, and a detail view per protocol with the model's breakdown and a concrete farm plan (cost and time on every step).

---

<sub>Entered on [make.fun](https://make.fun/?ref=rafax01&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
