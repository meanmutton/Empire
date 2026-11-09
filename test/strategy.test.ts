import { aiTurn } from '../src/ai/ai';
import { armiesNeeded, campaignTarget, isRunaway, starbaseSite, warsAgainst } from '../src/ai/strategy';
import { DESIGNS } from '../src/data/designs';
import { hexDistance, hexesWithin } from '../src/engine/hex';
import { relation } from '../src/engine/query';
import { grantTech } from '../src/engine/research';
import { fleetOf, newGame, setStatus } from './helpers';

describe('computer strategy', () => {
  it('picks an enemy system as its campaign target, and keeps it while valid', () => {
    const g = newGame('strat');
    setStatus(g, 'varrhen', 'concord', 'war');
    const t = campaignTarget(g, 'varrhen', ['concord'])!;
    expect(g.map.hexes[t].owner).toBe('concord');
    expect(g.map.hexes[t].system!.development).toBeGreaterThan(0);
    expect(campaignTarget(g, 'varrhen', ['concord'])).toBe(t);
    expect(campaignTarget(g, 'varrhen', [])).toBeNull();
  });

  it('rescues an ally’s system under attack first', () => {
    const g = newGame('strat');
    setStatus(g, 'varrhen', 'lattice', 'alliance');
    setStatus(g, 'varrhen', 'concord', 'war');
    setStatus(g, 'lattice', 'concord', 'war');
    const allyHome = g.factions.lattice.home;
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], allyHome, 3);
    expect(campaignTarget(g, 'varrhen', ['concord'])).toBe(allyHome);
  });

  it('sizes the invasion force to the defenders', () => {
    const g = newGame('strat');
    const home = g.factions.concord.home;
    const colony = g.map.hexes.findIndex((h) => h.owner === 'concord' && h.system && !h.system.homeOf);
    expect(armiesNeeded(g, 'varrhen', home)).toBeGreaterThan(armiesNeeded(g, 'varrhen', colony));
  });

  it('puts starbases on the border facing a rival', () => {
    const g = newGame('strat');
    grantTech(g, 'varrhen', 'starbase1');
    const site = starbaseSite(g, 'varrhen')!;
    expect(g.map.hexes[site].owner).toBe('varrhen');
    const rivalHomes = ['concord', 'rynkai', 'krasnyr', 'lattice'].map((f) => g.factions[f].home);
    const nearestRival = Math.min(...rivalHomes.map((h) => hexDistance(g.map, site, h)));
    const homeToRival = Math.min(...rivalHomes.map((h) => hexDistance(g.map, g.factions.varrhen.home, h)));
    expect(nearestRival).toBeLessThanOrEqual(homeToRival);
  });

  it('does not pile on an empire already fighting two great powers', () => {
    const majors = ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'];
    /** Sets up `attacker` far stronger than a defenceless `victim`, then lets the attacker think for a while. */
    const play = (attacker: string, victim: string, victimAlreadyFighting: string[]) => {
      const g = newGame('strat');
      relation(g, attacker, victim).contact = true;
      // Give the attacker a forward capital just across the victim's border, so the two are neighbors.
      const near = hexesWithin(g.map, g.factions[victim].home, 5).filter((x) => !g.map.hexes[x].owner && hexDistance(g.map, x, g.factions[victim].home) >= 4);
      for (const x of near) g.map.hexes[x].owner = attacker;
      g.factions[attacker].home = near[0];
      for (const o of victimAlreadyFighting) setStatus(g, victim, o, 'war');
      for (const f of Object.values(g.fleets)) if (f.owner === victim) { for (const s of f.ships) delete g.ships[s]; delete g.fleets[f.id]; }
      fleetOf(g, attacker, DESIGNS['lattice:proof'], g.factions[attacker].home, 6);
      for (let t = 12; t < 40 && relation(g, attacker, victim).status !== 'war'; t++) {
        g.turn = t;
        g.active = g.turnOrder.indexOf(attacker);
        aiTurn(g, attacker);
      }
      return relation(g, attacker, victim).status === 'war';
    };
    // Find a pair where the attacker does go to war on its own (the control).
    let pair: [string, string] | null = null;
    for (const a of ['rynkai', 'varrhen']) for (const v of majors) if (!pair && v !== a && play(a, v, [])) pair = [a, v];
    expect(pair).not.toBeNull();
    const [attacker, victim] = pair!;
    const others = majors.filter((m) => m !== attacker && m !== victim).slice(0, 2);
    expect(warsAgainst(newGame('strat'), victim)).toBe(0);
    expect(play(attacker, victim, others)).toBe(false);
  });

  it('spots a runaway leader', () => {
    const g = newGame('strat');
    expect(isRunaway(g, 'concord')).toBe(false);
    for (const h of g.map.hexes) if (h.system && !h.owner) h.owner = 'concord';
    expect(isRunaway(g, 'concord')).toBe(true);
  });
});
