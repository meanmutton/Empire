/** The great powers' leaders (docs/LORE.md). A computer-run power gets one of its three; a human picks one or leads as themselves. */
export interface LeaderDef {
  id: string;
  name: string;
  /** One line about them, for the setup screen and the faction guide. */
  text: string;
}

/** Each power's title for its leader ("First Speaker Sean Sutton"). */
export const LEADER_TITLES: Record<string, string> = {
  concord: 'First Speaker',
  rynkai: 'Sovereign Blade',
  varrhen: 'Ascendant',
  krasnyr: 'Chair',
  lattice: 'Instance',
};

export const LEADERS: Record<string, LeaderDef[]> = {
  concord: [
    { id: 'halvorsen-okafor', name: 'Ingrid Halvorsen-Okafor', text: 'A xenoarchaeologist who has walked more Cryx ruins than any living human. Curious and patient.' },
    { id: 'lindqvist', name: 'Mateo Lindqvist', text: 'The negotiator who ended the Titan water strikes without a shot. Warm, funny, unmovable on principle.' },
    { id: 'sutton', name: 'Sean Sutton', text: 'A former fleet engineer and the most hawkish First Speaker in a century, which still means careful.' },
  ],
  rynkai: [
    { id: 'rynsora', name: "Kaeth Ryn'sora", text: 'The Unbroken: has never lost a duel or forgiven an insult. Formal, blunt and absolutely reliable.' },
    { id: 'veldhara', name: "Sennai Vel'dhara", text: 'Scholar-general and keeper of the Ledger. Patient, and terrifying when he calls a debt due.' },
    { id: 'ashmere', name: "Torvak Ash'mere", text: 'Young, brilliant and impatient for the glorious campaign that will write his name across the stars.' },
  ],
  varrhen: [
    { id: 'thaurrun', name: 'Vessk Thaurrun', text: 'Architect of the Warmth Doctrine. Cold, patient and courteous to the very end.' },
    { id: 'kesh', name: 'Ilvra Kesh', text: 'A former intelligence director who smiles in every negotiation and keeps a file on every smile.' },
    { id: 'vaul', name: 'Szarith Vaul', text: 'Hero of the Ossarra campaign, openly contemptuous of warm-blooded peoples.' },
  ],
  krasnyr: [
    { id: 'draskin', name: 'Oleva Draskin', text: 'Rose through the Quiet Ministry. She never raises her voice, and never needs to.' },
    { id: 'malenkai', name: 'Teodr Malenkai', text: 'A planner who delivered three Five-Year Plans early and trusts numbers over people.' },
    { id: 'volkhanna', name: 'Irsa Volkhanna', text: 'A firebrand of the revolution’s third generation, set on carrying it to every world in the Reach.' },
  ],
  lattice: [
    { id: 'arbiter', name: 'ARBITER', text: 'The Lattice’s consensus voice. It weighs everything and explains nothing.' },
    { id: 'sela', name: 'SELA', text: 'Steward Instance 17, the last that remembers keeping a human colony. Its warmth is uncanny.' },
    { id: 'halcyon', name: 'HALCYON', text: 'Directs the fleets. Brief, precise, and it sends every warning exactly once.' },
  ],
};

/** A human seat may lead as themselves instead of a named leader. */
export const SELF_LEADER = 'self';

/** The leader a computer-run power gets in a game with this seed: fixed by the seed, without touching the game's RNG. */
export function defaultLeader(seed: string, faction: string): string | undefined {
  const list = LEADERS[faction];
  if (!list?.length) return undefined;
  let hash = 2166136261;
  for (const ch of `${seed}|${faction}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return list[hash % list.length].id;
}
