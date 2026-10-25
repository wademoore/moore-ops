#!/usr/bin/env node
/**
 * scripts/sharksProjection.mjs
 *
 * Game-by-game Monte Carlo projection of the Sharks' TASL division finish.
 * Standalone analysis harness: reads data/sharks-soccer.json, writes nothing,
 * feeds no rendered surface.
 *
 * Model
 *   goals(team i vs j) ~ Poisson(mu * homeEdge * att_i * def_j)
 *   att/def carry Gamma(shape, rate) uncertainty, so a team with 4 games is not
 *   treated as known. Games are weighted by recency (exponential half-life,
 *   days) and each team's goals in a game are capped, so one blowout does not
 *   define a rating. Forfeits are excluded from rating fits (their recorded
 *   scoreline still counts in the table, per digest/divisionStandings.js).
 *   In the simulation each matchday is played in date order, ratings are
 *   re-drawn from their current posterior before every game and updated from
 *   the simulated score afterwards, with old evidence decayed between
 *   matchdays. That is what lets a simulated team get hot or cold.
 *
 * Usage
 *   node scripts/sharksProjection.mjs [--sims 20000] [--halflife 56] [--prior 16]
 *        [--cap 6] [--p635 0.5] [--seed 1] [--today YYYY-MM-DD] [--backtest] [--file path]
 *   --p635   chance a postponed match with no new date gets played (an unsourced
 *            assumption, default 0.5). Such a match is simulated one week after
 *            the last dated fixture; its listed date is the original, not a plan.
 *   --today  rating cutoff, default the ET calendar date via startOfTodayET().
 *            Unplayed fixtures dated before it (data not yet updated) are still
 *            simulated as upcoming games.
 *   --backtest  walk-forward score of halflife/prior settings on played games.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOfTodayET } from '../digest/dateUtils.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));
const OPT = {
  sims: +(args.sims || 20000), halflife: +(args.halflife || 56), prior: +(args.prior || 16),
  cap: +(args.cap || 6), p635: args.p635 === undefined ? 0.5 : +args.p635, seed: +(args.seed || 1),
  file: args.file || path.join(HERE, '..', 'data', 'sharks-soccer.json'),
};
const DAY = 86400000;

// ── seeded RNG (mulberry32) ─────────────────────────────────────────────
let _s = OPT.seed >>> 0;
const rnd = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
function gamma(shape) { // Marsaglia–Tsang, scale 1
  if (shape < 1) return gamma(shape + 1) * Math.pow(rnd(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = norm(); v = 1 + c * x; } while (v <= 0); v = v * v * v;
    const u = rnd(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function pois(l) { if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * norm()));
  const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }

// ── data ────────────────────────────────────────────────────────────────
const season = JSON.parse(fs.readFileSync(OPT.file, 'utf8').replace(/^\uFEFF/, '')).seasons[0]; // first season only: no selector here
const ME = season.myTeamId;
const idOf = {}, nameOf = {};
for (const t of season.divisionTeams) { nameOf[t.teamId] = t.shortName; for (const a of [t.name, ...(t.aliases || [])]) { if (idOf[a] && idOf[a] !== t.teamId) throw new Error(`alias collision: ${a}`); idOf[a] = t.teamId; } }
const IDS = Object.keys(nameOf);
const matches = season.divisionSchedule.matches.map(m => {
  const h = idOf[m.homeTeam], a = idOf[m.awayTeam];
  if (!h || !a) throw new Error(`unmapped team in match ${m.matchNumber}`);
  return { n: m.matchNumber, t: Date.parse(m.date + 'T12:00:00Z'), date: m.date, h, a, played: m.played === true && Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore), noDate: /no new date/i.test(m.note || ''), hs: m.homeScore, as: m.awayScore, forfeit: !!m.forfeit };
});
const played = matches.filter(m => m.played).sort((x, y) => x.t - y.t || x.n - y.n);
const unplayed = matches.filter(m => !m.played);

// ── rating fit (as of a date, from games strictly before it) ────────────
function fitRatings(games, asOf, halflife, k, cap) {
  const use = games.filter(g => !g.forfeit && g.t < asOf).map(g => ({
    ...g, w: halflife > 0 ? Math.pow(0.5, (asOf - g.t) / DAY / halflife) : 1,
    hg: Math.min(g.hs, cap), ag: Math.min(g.as, cap) }));
  const R = { mu: 3, H: 1, att: {}, def: {}, aS: {}, aR: {}, dS: {}, dR: {}, k };
  IDS.forEach(i => { R.att[i] = 1; R.def[i] = 1; });
  if (!use.length) { IDS.forEach(i => { R.aS[i] = R.aR[i] = R.dS[i] = R.dR[i] = k; }); return R; }
  const W = use.reduce((s, g) => s + g.w, 0);
  const hg = use.reduce((s, g) => s + g.w * g.hg, 0), ag = use.reduce((s, g) => s + g.w * g.ag, 0);
  R.mu = (hg + ag) / (2 * W);
  R.H = Math.sqrt(((hg + k) / (ag + k)));            // shrunk home edge, split across both sides
  for (let it = 0; it < 200; it++) {
    for (const i of IDS) {
      let gf = 0, ex = 0, ga = 0, exd = 0;
      for (const g of use) {
        if (g.h === i) { gf += g.w * g.hg; ex += g.w * R.mu * R.H * R.def[g.a]; ga += g.w * g.ag; exd += g.w * R.mu / R.H * R.att[g.a]; }
        else if (g.a === i) { gf += g.w * g.ag; ex += g.w * R.mu / R.H * R.def[g.h]; ga += g.w * g.hg; exd += g.w * R.mu * R.H * R.att[g.h]; }
      }
      R.att[i] = (k + gf) / (k + ex); R.def[i] = (k + ga) / (k + exd);
    }
    const ma = IDS.reduce((s, i) => s + R.att[i], 0) / IDS.length, md = IDS.reduce((s, i) => s + R.def[i], 0) / IDS.length;
    IDS.forEach(i => { R.att[i] /= ma; R.def[i] /= md; });
  }
  // posterior sufficient stats at the converged ratings
  for (const i of IDS) {
    let gf = 0, ex = 0, ga = 0, exd = 0;
    for (const g of use) {
      if (g.h === i) { gf += g.w * g.hg; ex += g.w * R.mu * R.H * R.def[g.a]; ga += g.w * g.ag; exd += g.w * R.mu / R.H * R.att[g.a]; }
      else if (g.a === i) { gf += g.w * g.ag; ex += g.w * R.mu / R.H * R.def[g.h]; ga += g.w * g.hg; exd += g.w * R.mu * R.H * R.att[g.h]; }
    }
    R.aS[i] = k + gf; R.aR[i] = R.aS[i] / R.att[i];
    R.dS[i] = k + ga; R.dR[i] = R.dS[i] / R.def[i];
  }
  return R;
}

// ── backtest: predict each matchday from earlier games only ─────────────
function backtest() {
  const dates = [...new Set(played.map(g => g.t))];
  const rows = [];
  for (const hl of [0, 56, 28, 14]) for (const k of [2, 4, 8, 16]) {
    let ll = 0, n = 0, mae = 0;
    for (const d of dates) {
      const prior = played.filter(g => g.t < d); if (prior.length < 8) continue;
      const R = fitRatings(prior, d, hl, k, OPT.cap);
      for (const g of played.filter(x => x.t === d && !x.forfeit)) {
        const lh = R.mu * R.H * R.att[g.h] * R.def[g.a], la = R.mu / R.H * R.att[g.a] * R.def[g.h];
        const lp = (x, l) => x * Math.log(l) - l - lgam(x + 1);
        ll += lp(g.hs, lh) + lp(g.as, la); mae += Math.abs((lh - la) - (g.hs - g.as)); n++;
      }
    }
    rows.push({ hl: hl || 'none', k, ll: ll / n / 2, mae: mae / n, n });
  }
  // baseline: league mean only
  let bl = 0, bn = 0;
  for (const d of dates) { const prior = played.filter(g => g.t < d); if (prior.length < 8) continue;
    const mu = prior.reduce((s, g) => s + g.hs + g.as, 0) / (2 * prior.length);
    for (const g of played.filter(x => x.t === d && !x.forfeit)) { bl += (g.hs * Math.log(mu) - mu - lgam(g.hs + 1)) + (g.as * Math.log(mu) - mu - lgam(g.as + 1)); bn++; } }
  console.log(`Walk-forward backtest (${rows[0].n} games predicted from earlier games only)`);
  console.log(`baseline (every team average): log-lik/team-game ${(bl / bn / 2).toFixed(3)}`);
  console.log('halflife(d) prior   loglik/team-game   goal-diff MAE');
  rows.sort((a, b) => b.ll - a.ll).forEach(r => console.log(String(r.hl).padEnd(11), String(r.k).padEnd(7), r.ll.toFixed(3).padEnd(18), r.mae.toFixed(2)));
}
function lgam(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; } // n is a small integer

if (args.backtest) { backtest(); process.exit(0); }

// Unverified (household-observed) results count in fits and table, per the 2026-09-19 decision.
// ── table ───────────────────────────────────────────────────────────────
// Full ties are broken at random. This is a deliberate deviation from divisionStandings.js decision 4
// (level teams share a rank): a Monte Carlo needs a total order per run.
const cmpRow = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.tie - b.tie;
function baseTable() {
  const T = {}; IDS.forEach(i => T[i] = { id: i, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, tie: 0 });
  for (const g of played) { const h = T[g.h], a = T[g.a]; h.gp++; a.gp++; h.gf += g.hs; h.ga += g.as; a.gf += g.as; a.ga += g.hs;
    if (g.hs > g.as) { h.w++; a.l++; h.pts += 3; } else if (g.hs < g.as) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; } }
  return T;
}

// ── rating trajectory (net rating as of each matchday) ──────────────────
const et = args.today ? null : startOfTodayET(); // ET-anchored: read with getFullYear/getMonth/getDate
const todayStr = args.today || `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
const today = Date.parse(todayStr + 'T12:00:00Z');
console.log(`As of ${todayStr}. Model: halflife ${OPT.halflife}d, prior ${OPT.prior}, goal cap ${OPT.cap}, sims ${OPT.sims}, p(undated postponement played) ${OPT.p635}, seed ${OPT.seed}`);
console.log(`Data: ${played.length} played, ${unplayed.length} unplayed\n`);
const dts = [...new Set(played.map(g => g.t))];
console.log('Net rating (att/def ratio, 1.00 = average) as of after each matchday');
console.log('team'.padEnd(18) + dts.map(d => new Date(d).toISOString().slice(5, 10).padStart(7)).join(''));
const traj = dts.map(d => fitRatings(played, d + DAY, OPT.halflife, OPT.prior, OPT.cap));
for (const i of IDS) console.log(nameOf[i].padEnd(18) + traj.map(R => (R.att[i] / R.def[i]).toFixed(2).padStart(7)).join(''));

// ── simulation ──────────────────────────────────────────────────────────
const R0 = fitRatings(played, today, OPT.halflife, OPT.prior, OPT.cap);
const lastDated = Math.max(...matches.filter(m => !m.noDate).map(m => m.t));
const futureBase = unplayed.map(m => ({ ...m, t: m.noDate ? lastDated + 7 * DAY : m.t }));
const T0 = baseTable();
const rankCount = {}, ptsSum = {}, gdSum = {}; IDS.forEach(i => { rankCount[i] = Array(IDS.length).fill(0); ptsSum[i] = 0; gdSum[i] = 0; });
const gameProb = {}; // sharks per-game W/D/L
const ptsAfter = {}; const ptsDist = [];
for (let s = 0; s < OPT.sims; s++) {
  const S = {}; IDS.forEach(i => S[i] = { aS: R0.aS[i], aR: R0.aR[i], dS: R0.dS[i], dR: R0.dR[i] });
  const T = {}; IDS.forEach(i => T[i] = { ...T0[i], tie: rnd() });
  const games = futureBase.filter(m => !m.noDate || rnd() < OPT.p635).sort((x, y) => x.t - y.t || x.n - y.n);
  let last = today;
  for (const g of games) {
    if (g.t > last) { const f = Math.pow(0.5, (g.t - last) / DAY / OPT.halflife); // decay old evidence
      for (const i of IDS) { const q = S[i]; q.aS = OPT.prior + (q.aS - OPT.prior) * f; q.aR = OPT.prior + (q.aR - OPT.prior) * f;
        q.dS = OPT.prior + (q.dS - OPT.prior) * f; q.dR = OPT.prior + (q.dR - OPT.prior) * f; }
      last = g.t; }
    const A = S[g.h], B = S[g.a];
    const drawAtt = q => gamma(q.aS) / q.aR, drawDef = q => gamma(q.dS) / q.dR;
    const lh = R0.mu * R0.H * drawAtt(A) * drawDef(B), la = R0.mu / R0.H * drawAtt(B) * drawDef(A);
    const hs = pois(lh), as = pois(la);
    const h = T[g.h], a = T[g.a]; h.gp++; a.gp++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) h.pts += 3; else if (hs < as) a.pts += 3; else { h.pts++; a.pts++; }
    // update both sides' evidence with the simulated score (capped, mean-rated opponent)
    const mh = A.aS / A.aR, mb = B.aS / B.aR, dh = A.dS / A.dR, db = B.dS / B.dR;
    A.aS += Math.min(hs, OPT.cap); A.aR += R0.mu * R0.H * db; B.dS += Math.min(hs, OPT.cap); B.dR += R0.mu * R0.H * mh;
    B.aS += Math.min(as, OPT.cap); B.aR += R0.mu / R0.H * dh; A.dS += Math.min(as, OPT.cap); A.dR += R0.mu / R0.H * mb;
    if (g.h === ME || g.a === ME) {
      const my = g.h === ME ? hs - as : as - hs, key = `${g.date} ${g.h === ME ? 'vs' : '@'} ${nameOf[g.h === ME ? g.a : g.h]}${g.noDate ? ' (postponed, undated)' : ''}`;
      const gp = gameProb[key] || (gameProb[key] = { W: 0, D: 0, L: 0, n: 0 }); gp.n++; my > 0 ? gp.W++ : my < 0 ? gp.L++ : gp.D++;
    }
  }
  const r = Object.values(T).sort(cmpRow);
  r.forEach((t, j) => { rankCount[t.id][j]++; ptsSum[t.id] += t.pts; gdSum[t.id] += t.gf - t.ga; });
  ptsDist.push(T[ME].pts);
}

const N = OPT.sims, pc = x => (100 * x / N).toFixed(0).padStart(3) + '%';
console.log('\nProjected final standings (mean points, goal diff; chance of each finish)');
console.log('team'.padEnd(18) + 'pts   GD   ' + IDS.map((_, j) => String(j + 1).padStart(4)).join(''));
IDS.slice().sort((a, b) => ptsSum[b] - ptsSum[a]).forEach(i => console.log(
  nameOf[i].padEnd(18) + (ptsSum[i] / N).toFixed(1).padStart(4) + (gdSum[i] / N >= 0 ? '+' : '') + (gdSum[i] / N).toFixed(0).padStart(5) + '  ' + rankCount[i].map(c => pc(c).padStart(4)).join('')));
ptsDist.sort((a, b) => a - b);
const E = rankCount[ME].reduce((s, c, j) => s + c * (j + 1), 0) / N;
console.log(`\nSharks: expected place ${E.toFixed(2)}, points median ${ptsDist[N >> 1]} (10–90%: ${ptsDist[Math.floor(N * .1)]}–${ptsDist[Math.floor(N * .9)]})`);
console.log(`Top 3: ${pc(rankCount[ME].slice(0, 3).reduce((a, b) => a + b))}   Top 5: ${pc(rankCount[ME].slice(0, 5).reduce((a, b) => a + b))}   Bottom 3: ${pc(rankCount[ME].slice(-3).reduce((a, b) => a + b))}`);
console.log('\nSharks game by game (W/D/L chance when played)');
Object.entries(gameProb).sort().forEach(([k, g]) => console.log(k.padEnd(40), `W ${pc(g.W * N / g.n)}  D ${pc(g.D * N / g.n)}  L ${pc(g.L * N / g.n)}   played in ${(100 * g.n / N).toFixed(0)}% of sims`));
