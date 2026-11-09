/** "How to play": the essentials from docs/GAME_DESIGN.md. */
import { h, modal } from '../dom';

const SECTIONS: [string, string[]][] = [
  ['Turns', [
    'Everyone takes turns in a fixed order. When you end your turn, the computer empires play, then the next human.',
    'Online games are asynchronous: play your turn whenever it comes up. Nobody needs to be online at the same time.',
  ]],
  ['Territory', [
    'A ship that ends your turn alone in a hex claims it at the start of your next turn, which gives enemies one round to contest it.',
    'Only empty hexes are claimed this way. Settled planets must be invaded with armies once their planetary defense is down, and enemy starbases must be destroyed first.',
    'Enemy territory can only be claimed while at war.',
    'Territory cut off from your home produces half as much.',
  ]],
  ['Economy', [
    'Systems produce energy ⚡, metals ⛏, science 🔬 and exotics ✦. Population 👥 grows on habitable worlds and crews big ships.',
    'Found colonies with colony ships and outposts with constructors. Develop systems to raise yields and unlock improvement slots and shipyards.',
    'Builds are paid up front. Each system then works on its own queue. Rush with energy, or cancel for half back.',
    'Ships, starbases, agents and armies cost energy upkeep. Running out of energy weakens your fleets.',
  ]],
  ['Fleets and combat', [
    'Tap a fleet, then tap a destination twice to move. Up to six ships form a battle group and move at the speed of the slowest.',
    'Moving into enemies stops your fleet. At the end of each turn there is a battle wherever enemies share a hex: several combat rounds (the host picks 3–10), fought without you.',
    'Give each fleet battle orders: Full Attack, Engage, Cautious, Hold the Line, Hit and Run or Retreat. They set when it withdraws, how much it trades defense for offense, and which range it fights at (beams like close quarters, missiles and fighters long range). The Ryn’kai never withdraw.',
    'Battles are uncertain: every shot can miss or land a critical hit, each side has its fortunes of war, and rare events can swing a fight. A side with 1.5× the force still loses about a quarter of the time. Damaged ships fire less; crippled ones (under a quarter hull) also move a hex slower until repaired.',
    'Select a hex where your forces meet enemies, or tap an enemy hex once with a fleet selected, to see the battle forecast, from Overwhelming victory to Hopeless cause. It only counts what you can see: scouts nearby reveal their real designs, and a spy at their capital reveals their technology.',
    'Shields stop beams, point defense stops missiles and fighters, and escorts draw fire.',
    'Enemy warships sitting on one of your systems, with none of yours there to contest them, blockade it: half output, and its shipyard can’t finish ships or armies.',
    'Grind a system’s planetary defense to 0, then invade with armies carried by transports.',
  ]],
  ['Diplomacy and spies', [
    'Send a diplomat to another empire’s home system to open an embassy. You need one to trade or sign treaties. Diplomats travelling through hostile space can be captured.',
    'Trade resources, technology, fleets, territory and star charts, or sign trade, research, economic and manufacturing agreements, pacts and alliances.',
    'Minor factions can become your vassals: they pay tribute and join your wars.',
    'Computer-run great powers talk to you in Messages. You can make statements to them there (demand they withdraw, ask for help, threaten, reassure, ask their intentions, denounce a rival), and they answer on their turn.',
    'Spies sneak into enemy systems to steal technology, sabotage, incite unrest or map territory.',
  ]],
  ['Winning', [
    'Each great power wins in its own ways (see the Victory screen and the faction cards), and each has one victory of its own: Ascendance (Concord), Glorious Campaign (Ryn’kai), Hegemony (Varrhen), World Revolution (Krasnyr), Singularity (Lattice).',
    'Shared paths include Conquest, Economic Supremacy, Grand Alliance and the Galactic Council. If nobody wins by the turn limit (200 rounds by default), the highest score wins.',
    'Station spies at a rival’s home system to learn how close they are to winning; idle spies at your own home guard against theirs.',
  ]],
];

export function openHelp(): void {
  const body = h('div');
  for (const [title, lines] of SECTIONS) {
    body.append(h('h3', null, title));
    for (const l of lines) body.append(h('div', { style: 'margin:3px 0' }, l));
  }
  modal('How to play', body, { wide: true });
}
