import {
  advanceAgents, boardShip, captureAgents, executeAgent, hasEmbassy, opinionOf, sendDiplomat,
} from '../src/engine/agents';
import {
  acceptProposal, canPropose, cancelTreaty, checkForcedVassalage, declareWar, diplomacyIncome, propose,
  proposalScore, rejectProposal, runDiplomacy,
} from '../src/engine/diplomacy';
import { runEspionage, startMission, successChance } from '../src/engine/espionage';
import { relationKey } from '../src/engine/ids';
import { relation } from '../src/engine/query';
import { Rng, seedRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';

function diplomatOf(g: GameState, f: string) {
  return Object.values(g.agents).find((a) => a.owner === f && a.kind === 'diplomat')!;
}

function embassy(g: GameState, a: string, b: string) {
  const r = g.relations[relationKey(a, b)];
  r.contact = true;
  if (r.a === a) r.embassyA = true; else r.embassyB = true;
  if (r.status === 'neutral') r.status = 'relations';
}

describe('diplomats', () => {
  it('travel to a home system and open an embassy', () => {
    const g = newGame('dip');
    relation(g, 'concord', 'lattice').contact = true;
    const d = diplomatOf(g, 'concord');
    expect(sendDiplomat(g, d.id, 'lattice').ok).toBe(true);
    for (let i = 0; i < 40 && !d.resident; i++) advanceAgents(g, 'concord');
    expect(d.resident).toBe(true);
    expect(hasEmbassy(g, 'concord', 'lattice')).toBe(true);
    expect(relation(g, 'concord', 'lattice').status).toBe('relations');
    expect(canPropose(g, 'concord', 'lattice')).toBe(true);
  });

  it('need contact first', () => {
    const g = newGame('dip');
    expect(sendDiplomat(g, diplomatOf(g, 'concord').id, 'lattice').ok).toBe(false);
  });

  it('can be captured by hostile ships, and executing them costs opinion', () => {
    const g = newGame('dip');
    g.rng = seedRng('cap');
    setStatus(g, 'concord', 'rynkai', 'war');
    const d = diplomatOf(g, 'concord');
    fleetOf(g, 'rynkai', firstDesign('rynkai', (x) => x.role === 'scout'), d.hex);
    for (let i = 0; i < 10 && !d.capturedBy; i++) captureAgents(g, 'rynkai');
    expect(d.capturedBy).toBe('rynkai');
    const before = opinionOf(g, 'concord', 'rynkai');
    expect(executeAgent(g, 'rynkai', d.id).ok).toBe(true);
    expect(opinionOf(g, 'concord', 'rynkai')).toBeLessThan(before);
  });

  it('are safe aboard ships', () => {
    const g = newGame('dip');
    setStatus(g, 'concord', 'rynkai', 'war');
    const d = diplomatOf(g, 'concord');
    const ferry = fleetOf(g, 'concord', firstDesign('concord', (x) => x.role === 'cargo'), d.hex);
    expect(boardShip(g, d.id, g.fleets[ferry].ships[0]).ok).toBe(true);
    fleetOf(g, 'rynkai', firstDesign('rynkai', (x) => x.role === 'scout'), d.hex);
    for (let i = 0; i < 10; i++) captureAgents(g, 'rynkai');
    expect(d.capturedBy).toBeNull();
  });
});

describe('treaties and war', () => {
  it('declaring war breaks treaties and drags in allies', () => {
    const g = newGame('war');
    setStatus(g, 'concord', 'varrhen', 'nap');
    setStatus(g, 'varrhen', 'lattice', 'alliance');
    setStatus(g, 'concord', 'lattice', 'neutral');
    const before = opinionOf(g, 'krasnyr', 'concord');
    expect(declareWar(g, 'concord', 'varrhen').ok).toBe(true);
    expect(relation(g, 'concord', 'varrhen').status).toBe('war');
    expect(relation(g, 'concord', 'varrhen').aggressor).toBe('concord');
    expect(relation(g, 'concord', 'lattice').status).toBe('war');
    expect(opinionOf(g, 'krasnyr', 'concord')).toBeLessThan(before);
  });

  it("the Ryn'kai never break a treaty first, but can cancel with notice", () => {
    const g = newGame('war');
    setStatus(g, 'rynkai', 'concord', 'nap');
    expect(declareWar(g, 'rynkai', 'concord').ok).toBe(false);
    expect(cancelTreaty(g, 'rynkai', 'concord').ok).toBe(true);
    g.turn += 3;
    runDiplomacy(g, 'rynkai');
    expect(relation(g, 'rynkai', 'concord').status).not.toBe('nap');
    expect(declareWar(g, 'rynkai', 'concord').ok).toBe(true);
  });

  it('betraying the Ryn\'kai earns a grudge', () => {
    const g = newGame('war');
    setStatus(g, 'rynkai', 'concord', 'alliance');
    declareWar(g, 'concord', 'rynkai');
    expect(g.factions.rynkai.flags['grudge:concord']).toBe(1);
  });

  it('lightning war gives the Varrhen a movement window', () => {
    const g = newGame('war');
    relation(g, 'varrhen', 'concord').contact = true;
    declareWar(g, 'varrhen', 'concord');
    expect(g.factions.varrhen.flags.lightningUntil).toBe(g.turn + 3);
  });
});

describe('proposals', () => {
  it('requires an embassy and transfers items when accepted', () => {
    const g = newGame('prop');
    relation(g, 'concord', 'lattice').contact = true;
    expect(propose(g, 'concord', 'lattice', [{ kind: 'resource', resource: 'energy', amount: 50 }], []).ok).toBe(false);
    embassy(g, 'concord', 'lattice');
    g.factions.concord.research.known.push('lasers');
    const r = propose(g, 'concord', 'lattice',
      [{ kind: 'resource', resource: 'energy', amount: 50 }, { kind: 'tech', tech: 'lasers' }],
      [{ kind: 'resource', resource: 'metals', amount: 20 }, { kind: 'agreement', agreement: 'trade' }]);
    expect(r.ok).toBe(true);
    const e0 = g.factions.lattice.stock.energy, m0 = g.factions.concord.stock.metals;
    expect(acceptProposal(g, r.id!).ok).toBe(true);
    expect(g.factions.lattice.stock.energy).toBe(e0 + 50);
    expect(g.factions.concord.stock.metals).toBe(m0 + 20);
    expect(g.factions.lattice.research.known).toContain('lasers');
    expect(relation(g, 'concord', 'lattice').agreements).toContain('trade');
    expect(diplomacyIncome(g, 'concord').energy).toBeGreaterThan(0);
    expect(acceptProposal(g, r.id!).ok).toBe(false);
  });

  it('peace ends a war; generous offers score well and greedy ones badly', () => {
    const g = newGame('prop');
    embassy(g, 'concord', 'varrhen');
    setStatus(g, 'concord', 'varrhen', 'war');
    const peace = propose(g, 'concord', 'varrhen', [{ kind: 'status', status: 'relations' }], []);
    expect(peace.ok).toBe(true);
    acceptProposal(g, peace.id!);
    expect(relation(g, 'concord', 'varrhen').status).toBe('relations');
    g.factions.concord.stock.energy = 1000;
    const gift = propose(g, 'concord', 'varrhen', [{ kind: 'resource', resource: 'energy', amount: 500 }], []);
    const greedy = propose(g, 'concord', 'varrhen', [], [{ kind: 'resource', resource: 'metals', amount: g.factions.varrhen.stock.metals }]);
    expect(proposalScore(g, g.proposals[gift.id!])).toBeGreaterThan(0);
    expect(proposalScore(g, g.proposals[greedy.id!])).toBeLessThan(0);
    expect(rejectProposal(g, greedy.id!).ok).toBe(true);
  });

  it('per-turn payments run for their duration', () => {
    const g = newGame('prop');
    embassy(g, 'concord', 'lattice');
    const r = propose(g, 'concord', 'lattice', [{ kind: 'resource', resource: 'energy', amount: 10, perTurn: 2 }], []);
    acceptProposal(g, r.id!);
    const e0 = g.factions.lattice.stock.energy;
    runDiplomacy(g, 'concord');
    g.turn++;
    runDiplomacy(g, 'concord');
    g.turn++;
    runDiplomacy(g, 'concord');
    expect(g.factions.lattice.stock.energy).toBe(e0 + 20);
  });

  it('minors can become vassals and pay tribute', () => {
    const g = newGame('prop');
    embassy(g, 'concord', 'myrr');
    const r = propose(g, 'concord', 'myrr', [], [{ kind: 'vassal' }]);
    expect(r.ok).toBe(true);
    acceptProposal(g, r.id!);
    expect(g.factions.myrr.overlord).toBe('concord');
    const e0 = g.factions.concord.stock.energy;
    runDiplomacy(g, 'myrr');
    expect(g.factions.concord.stock.energy).toBeGreaterThan(e0);
  });

  it('occupying a minor home forces vassalage', () => {
    const g = newGame('prop');
    setStatus(g, 'rynkai', 'quorr', 'war');
    const home = g.factions.quorr.home;
    for (const f of Object.values(g.fleets)) if (f.owner === 'quorr') f.hex = 0;
    g.map.hexes[home].system!.defense = 0;
    fleetOf(g, 'rynkai', firstDesign('rynkai', (x) => x.role === 'line'), home);
    checkForcedVassalage(g, 'rynkai');
    expect(g.factions.quorr.overlord).toBe('rynkai');
  });
});

describe('espionage', () => {
  function spyAt(g: GameState, owner: string, hex: number) {
    const id = `spy-${owner}-${hex}`;
    g.agents[id] = { id, owner, kind: 'spy', hex, ship: null, path: [], target: null, mission: null, progress: 0, resident: false, capturedBy: null };
    return id;
  }

  it('steals tech over a few turns', () => {
    let stolen = 0;
    for (let t = 0; t < 10; t++) {
      const g = newGame('spy');
      g.rng = seedRng(`s${t}`);
      g.factions.lattice.research.known.push('lasers', 'missiles');
      const id = spyAt(g, 'krasnyr', g.factions.lattice.home);
      expect(startMission(g, id, 'stealTech').ok).toBe(true);
      for (let i = 0; i < 3; i++) runEspionage(g, 'krasnyr');
      if (g.factions.krasnyr.research.known.some((x) => x === 'lasers' || x === 'missiles')) stolen++;
    }
    expect(stolen).toBeGreaterThan(3);
  });

  it('only the Krasnyr subvert, and the Myrr are immune', () => {
    const g = newGame('spy');
    const id = spyAt(g, 'concord', g.factions.lattice.home);
    expect(startMission(g, id, 'subversion').ok).toBe(false);
    expect(successChance(g, 'krasnyr', 'myrr', 'stealTech')).toBe(0);
    expect(successChance(g, 'krasnyr', 'lattice', 'stealTech')).toBeGreaterThan(successChance(g, 'concord', 'lattice', 'stealTech'));
  });

  it('subversion makes a system defect', () => {
    const g = newGame('spy');
    g.rng = seedRng('sub');
    const colony = g.map.hexes.findIndex((h) => h.owner === 'lattice' && h.system && !h.system.homeOf);
    g.map.hexes[colony].system!.unrest = 90;
    const id = spyAt(g, 'krasnyr', colony);
    startMission(g, id, 'subversion');
    for (let i = 0; i < 30 && g.map.hexes[colony].owner === 'lattice'; i++) runEspionage(g, 'krasnyr');
    expect(g.map.hexes[colony].owner).toBe('krasnyr');
    void new Rng(g.rng);
  });
});
