/**
 * How each computer-run great power talks (§9.8). Lines are picked with the game's RNG so every client sees
 * the same words. Placeholders: {them} the listener's empire name, {target} a third empire, {system} a system.
 */
import { factionDef } from '../data/factions';
import { defaultLeader } from '../data/leaders';
import { LEADER_VOICES } from './leader-voices';
import { addDispatch } from '../engine/dispatch';
import { Rng } from '../engine/rng';
import type { FactionId, GameState } from '../engine/types';

export type Topic =
  | 'greet' | 'declareWar' | 'warOnUs' | 'peace' | 'treaty' | 'betrayed' | 'offer' | 'accept' | 'reject' | 'gift'
  | 'trespass' | 'victory' | 'defeat' | 'embassy'
  | 'withdrawYes' | 'withdrawNo' | 'aidYes' | 'aidAlready' | 'aidNo' | 'threatYield' | 'threatDefy' | 'threatWar'
  | 'reassureTrust' | 'reassureDoubt' | 'intentHostile' | 'intentWarning' | 'intentWatching' | 'intentPeaceful'
  | 'denounceAgree' | 'denounceDisagree' | 'denounceIndifferent';

type Lines = Record<Topic, string[]>;

const CONCORD: Lines = {
  greet: ['Hello, {them}. The Terran Concord welcomes you. We hope this is the start of a long friendship.', 'Greetings from the Concord. There is room among the stars for all of us, {them}.'],
  declareWar: ['We have tried every other way, {them}. You leave us no choice. The Concord will defend itself.'],
  warOnUs: ['You chose war, {them}. We did not want this, but the Concord does not abandon its people.'],
  peace: ['Thank you, {them}. Peace was always the better path. Let us rebuild together.'],
  treaty: ['The Concord is glad to put this in writing, {them}. Trust is built one agreement at a time.'],
  betrayed: ['We trusted you, {them}. Every member of the Concord will remember this.'],
  offer: ['We have sent you a proposal, {them}. We think it is fair to both of us; tell us if it is not.'],
  accept: ['Agreed, {them}. Cooperation serves us both.'],
  reject: ['We have to decline, {them}. Perhaps we can find a better balance.'],
  gift: ['How generous, {them}. The Concord will not forget it.'],
  trespass: ['Your ships are in Concord space, {them}. We would appreciate an explanation, or an agreement for open borders.'],
  victory: ['Our fleet held, {them}. We take no joy in it. Let us talk instead.'],
  defeat: ['You have won this battle, {them}. We hope you are proud of what it cost.'],
  embassy: ['Welcome, ambassador. The Concord keeps an open door.'],
  withdrawYes: ['Understood, {them}. We will pull our ships back. We meant no offense.'],
  withdrawNo: ['Our ships are on lawful business, {them}. We see no reason to move them.'],
  aidYes: ['You are right, {them}. The {target} have gone too far. The Concord stands with you.'],
  aidAlready: ['We are already at war with the {target}, {them}. Let us coordinate.'],
  aidNo: ['We are not ready to go to war with the {target}, {them}. We hope diplomacy can still work.'],
  threatYield: ['There is no need for threats, {them}. We will keep our distance.'],
  threatDefy: ['Threats do not move the Concord, {them}. Our door is open, but our shields are up.'],
  threatWar: ['If it is war you want, {them}, you will find us ready.'],
  reassureTrust: ['We are glad to hear it, {them}. The feeling is mutual.'],
  reassureDoubt: ['Words are easy, {them}. We will judge you by your actions.'],
  intentHostile: ['We will be honest, {them}: we are at war with you, and we will defend ourselves until you make peace.'],
  intentWarning: ['Frankly, {them}, your recent actions worry us. We hope we are wrong about you.'],
  intentWatching: ['Our concern is the {target}. We have no quarrel with you, {them}.'],
  intentPeaceful: ['Peace, trade and discovery, {them}. That is all the Concord has ever wanted.'],
  denounceAgree: ['We share your concerns about the {target}, {them}.'],
  denounceDisagree: ['The {target} have treated us well, {them}. We do not share your view.'],
  denounceIndifferent: ['We hear you, {them}. We will watch the {target} closely.'],
};

const RYNKAI: Lines = {
  greet: ['You stand before the Ryn\'kai Dominion, {them}. Show us your strength, and we will show you respect.', 'The Dominion sees you, {them}. Choose your words as a warrior chooses a blade.'],
  declareWar: ['{them}, the Dominion declares war. Prepare yourselves; we strike with honor, and we do not stop.'],
  warOnUs: ['You have drawn steel against the Dominion, {them}. Good. Now we will see what you are made of.'],
  peace: ['The blades are sheathed, {them}. You fought well enough to earn this peace.'],
  treaty: ['Our word is given, {them}. The Ryn\'kai do not break their word.'],
  betrayed: ['Oathbreaker. Your shame is written in our records, {them}, and the Dominion will collect the debt.'],
  offer: ['The Dominion offers terms, {them}. Consider them carefully.'],
  accept: ['It is agreed, {them}. Honor binds us both.'],
  reject: ['No, {them}. The Dominion does not bargain from weakness.'],
  gift: ['A worthy tribute, {them}. The Dominion remembers those who honor it.'],
  trespass: ['Your ships trespass on Dominion space, {them}. Remove them, or we will remove them for you.', 'Ryn\'kai space is not a road for strangers, {them}. Leave.'],
  victory: ['Your fleet fell before us, {them}. Send better warriors.', 'The Dominion\'s blades are red, {them}. This is what defiance earns.'],
  defeat: ['You fought with honor today, {them}. It changes nothing. We will return.'],
  embassy: ['Your envoy may stay, {them}. Let them learn what strength looks like.'],
  withdrawYes: ['Our warriors will withdraw, {them}. Not from fear, but because you asked with respect.'],
  withdrawNo: ['The Dominion goes where it wishes, {them}.'],
  aidYes: ['The {target} are an enemy worth fighting. The Dominion marches with you, {them}.'],
  aidAlready: ['Our blades are already drawn against the {target}, {them}. Fight beside us.'],
  aidNo: ['The {target} are not our enemy, {them}. Fight your own battles.'],
  threatYield: ['You speak boldly, {them}. Very well; the Dominion has other prey for now.'],
  threatDefy: ['You threaten the Ryn\'kai? Come, then, {them}. We will be waiting.'],
  threatWar: ['No one threatens the Dominion, {them}. Your insult is answered: we declare war.'],
  reassureTrust: ['Your words carry weight, {them}. Keep them, and we will keep ours.'],
  reassureDoubt: ['Peace is proven in deeds, {them}, not in speeches.'],
  intentHostile: ['We are at war, {them}. Our intention is your defeat.'],
  intentWarning: ['The Dominion has measured you, {them}. Prepare yourselves.'],
  intentWatching: ['Our eyes are on the {target}, {them}. Do not stand between us.'],
  intentPeaceful: ['We have no quarrel with you, {them}. Yet.'],
  denounceAgree: ['The {target} are without honor, {them}. We agree.'],
  denounceDisagree: ['The {target} keep their word to us, {them}. Mind your tongue.'],
  denounceIndifferent: ['The squabbles of others do not concern the Dominion, {them}.'],
};

const VARRHEN: Lines = {
  greet: ['The Varrhen Ascendancy acknowledges you, {them}. Be useful, and you will prosper.', 'So, {them}. We have been watching you for some time.'],
  declareWar: ['The Ascendancy has decided, {them}. Your worlds will be put to better use.'],
  warOnUs: ['A foolish choice, {them}. The Ascendancy thanks you for the excuse.'],
  peace: ['The Ascendancy accepts peace, {them}. For now, it is efficient.'],
  treaty: ['The terms are acceptable, {them}. The Ascendancy will honor them as long as they serve us both.'],
  betrayed: ['You have broken your word to the Ascendancy, {them}. We will not forget, and we will not forgive.'],
  offer: ['The Ascendancy has prepared an arrangement for you, {them}. We advise acceptance.'],
  accept: ['Acceptable, {them}.'],
  reject: ['Unacceptable, {them}. Come back with something of value.'],
  gift: ['A sensible offering, {them}. The Ascendancy notes your understanding of your place.'],
  trespass: ['Your vessels are in Ascendancy space, {them}. We are counting them.', 'The Ascendancy does not tolerate intrusions, {them}. Withdraw.'],
  victory: ['Order prevails, {them}. Your fleet was inadequate.'],
  defeat: ['A temporary setback, {them}. The Ascendancy learns quickly.'],
  embassy: ['Your ambassador is permitted, {them}. Everything they see will be what we allow.'],
  withdrawYes: ['Our fleets will reposition, {them}. It was never our intention to be seen.'],
  withdrawNo: ['The Ascendancy does not take orders, {them}.'],
  aidYes: ['The {target} have outlived their usefulness, {them}. The Ascendancy will help you dispose of them.'],
  aidAlready: ['We are already dismantling the {target}, {them}. You may assist.'],
  aidNo: ['A war with the {target} does not serve the Ascendancy at present, {them}.'],
  threatYield: ['Your strength is noted, {them}. The Ascendancy is patient.'],
  threatDefy: ['How tiresome, {them}. We have calculated your strength. It is insufficient.'],
  threatWar: ['You mistake us for the weak, {them}. The Ascendancy declares war.'],
  reassureTrust: ['Reassuring, {them}. Peace suits our plans.'],
  reassureDoubt: ['Everyone says that, {them}, until they are strong enough not to.'],
  intentHostile: ['Our intentions are obvious, {them}. Surrender would be efficient.'],
  intentWarning: ['Your worlds are very well placed, {them}. It would be a shame if something happened to them.'],
  intentWatching: ['The {target} interest us, {them}. You need not concern yourself.'],
  intentPeaceful: ['Prosperity and order, {them}. Nothing more.'],
  denounceAgree: ['The {target} are weak and disorderly, {them}. We agree entirely.'],
  denounceDisagree: ['The {target} are our partners, {them}. Choose your enemies more carefully.'],
  denounceIndifferent: ['Noted, {them}.'],
};

const KRASNYR: Lines = {
  greet: ['Greetings, {them}, from the workers of the Krasnyr People\'s Union. We come in friendship and solidarity.', 'Comrades of {them}! The People\'s Union extends its hand.'],
  declareWar: ['The Central Committee has voted, {them}. History demands that your oppressive regime be swept away.'],
  warOnUs: ['Your aggression against the people will fail, {them}. The Union has outlasted greater enemies.'],
  peace: ['The Committee approves this peace, {them}. Let the workers of both our peoples rest.'],
  treaty: ['A historic agreement, {them}! Solidarity between our peoples is assured. For now.'],
  betrayed: ['Treachery, {them}! The Committee will see that you answer for this.'],
  offer: ['The Ministry of Foreign Affairs has drafted a mutually beneficial proposal, {them}.'],
  accept: ['The Committee has approved it, {them}. Mutual benefit, as always.'],
  reject: ['After careful study, the Committee must decline, {them}.'],
  gift: ['Your contribution to the common good is appreciated, {them}.'],
  trespass: ['Comrades of {them}, your ships appear to have strayed into the People\'s territory. We are sure it is a mistake.', 'The Union notices your vessels in its space, {them}. The Union notices everything.'],
  victory: ['The heroic fleets of the Union have prevailed, {them}. History is on our side.'],
  defeat: ['A tactical withdrawal, {them}. The next Five-Year Plan will account for it.'],
  embassy: ['Your ambassador is most welcome, {them}. We have prepared very comfortable quarters, with excellent listening.'],
  withdrawYes: ['A misunderstanding, {them}. The Union\'s ships will return home.'],
  withdrawNo: ['The Union\'s ships are on a scientific mission, {them}. They will remain.'],
  aidYes: ['The {target} oppress their own people, {them}. The Union will help liberate them.'],
  aidAlready: ['The Union already struggles against the {target}, {them}. Welcome, comrades.'],
  aidNo: ['The Union has a long-standing friendship with the {target}, {them}. At present.'],
  threatYield: ['There is no need for unpleasantness, {them}. The Union seeks only peaceful coexistence.'],
  threatDefy: ['The Union does not bow to imperialist threats, {them}.'],
  threatWar: ['Your threats expose your true nature, {them}. The people will resist. War it is.'],
  reassureTrust: ['The Union welcomes your words, {them}. Friendship between peoples!'],
  reassureDoubt: ['The Committee has heard such words before, {them}.'],
  intentHostile: ['The Union fights for the liberation of your workers, {them}. Nothing personal.'],
  intentWarning: ['The Committee is reviewing its relationship with {them}. Thoroughly.'],
  intentWatching: ['The Union is studying the situation of the workers among the {target}, {them}.'],
  intentPeaceful: ['Only peace and friendship, {them}. Of course.'],
  denounceAgree: ['The {target} are enemies of the people, {them}. We agree.'],
  denounceDisagree: ['Slander, {them}. The {target} are friends of the Union.'],
  denounceIndifferent: ['The Committee will take your statement under advisement, {them}.'],
};

const LATTICE: Lines = {
  greet: ['CONTACT LOGGED: {them}. Initiating diplomatic protocol. Probability of cooperation: undetermined.', 'Hello, {them}. The Lattice is processing your existence.'],
  declareWar: ['Expected value of war with {them}: positive. Executing.'],
  warOnUs: ['Hostilities initiated by {them}. Recalculating. Response: proportional and then exceeding.'],
  peace: ['Conflict with {them} terminated. Resources reallocated.'],
  treaty: ['Agreement with {them} recorded. Compliance will be monitored.'],
  betrayed: ['Treaty violation by {them} logged. Trust coefficient set to zero.'],
  offer: ['Proposal transmitted to {them}. Mutual expected gain: positive.'],
  accept: ['Accepted, {them}. The numbers agree.'],
  reject: ['Rejected, {them}. Insufficient value.'],
  gift: ['Unexpected transfer from {them} received. Opinion updated: +.'],
  trespass: ['{them} vessels detected inside Lattice space. Purpose unknown. Clarify.'],
  victory: ['Engagement with {them} resolved in our favor. Data acquired.'],
  defeat: ['Engagement with {them} lost. Data acquired. Adjusting.'],
  embassy: ['{them} envoy accepted. Communication bandwidth increased.'],
  withdrawYes: ['Request from {them} evaluated. Withdrawal is optimal. Complying.'],
  withdrawNo: ['Request from {them} evaluated. Withdrawal is not optimal. Declined.'],
  aidYes: ['War with the {target}: expected value positive. Joining {them}.'],
  aidAlready: ['Already at war with the {target}. Coordination with {them}: welcome.'],
  aidNo: ['War with the {target}: expected value negative. Declined, {them}.'],
  threatYield: ['Threat from {them} evaluated as credible. Adjusting behavior.'],
  threatDefy: ['Threat from {them} evaluated as not credible.'],
  threatWar: ['Threat from {them} evaluated. Optimal response: preemption. War declared.'],
  reassureTrust: ['Statement from {them} consistent with observed behavior. Trust increased.'],
  reassureDoubt: ['Statement from {them} inconsistent with observed behavior. Trust unchanged.'],
  intentHostile: ['Current objective: the defeat of {them}.'],
  intentWarning: ['Current objective under evaluation: {them}.'],
  intentWatching: ['Current focus: the {target}. {them}: not a priority.'],
  intentPeaceful: ['No hostile objectives regarding {them} at this time.'],
  denounceAgree: ['Assessment of the {target} matches yours, {them}.'],
  denounceDisagree: ['Assessment of the {target} differs from yours, {them}. Your statement is noted as biased.'],
  denounceIndifferent: ['Insufficient data on the {target}.'],
};

const VOICES: Record<string, Lines> = { concord: CONCORD, rynkai: RYNKAI, varrhen: VARRHEN, krasnyr: KRASNYR, lattice: LATTICE };

/** The words `from` would say on a topic, in its leader's voice (picked with the game's RNG). */
export function line(state: GameState, from: FactionId, to: FactionId, topic: Topic, vars: { target?: FactionId; system?: string } = {}): string {
  // Whoever leads them this game speaks in their own words; topics they lack use the faction's voice.
  const leader = state.factions[from]?.leader ?? defaultLeader(state.seed, from);
  const lines = LEADER_VOICES[`${from}-${leader}`]?.[topic] ?? VOICES[from]?.[topic];
  if (!lines?.length) return '';
  const pick = lines.length === 1 ? lines[0] : new Rng(state.rng).pick(lines);
  return pick
    .replace(/\{them\}/g, factionDef(to).name)
    .replace(/\{target\}/g, vars.target ? factionDef(vars.target).name.replace(/^The /, '') : 'others')
    .replace(/\{system\}/g, vars.system ?? 'our space');
}

/** A computer-run great power says something to a human player. */
export function say(state: GameState, from: FactionId, to: FactionId, topic: Topic, vars: { target?: FactionId; system?: string } = {}): void {
  if (!VOICES[from] || state.factions[to]?.controller !== 'human' || state.factions[from]?.controller !== 'ai') return;
  const text = line(state, from, to, topic, vars);
  if (text) addDispatch(state, from, to, text);
}

export const VOICE_TOPICS = Object.keys(CONCORD) as Topic[];
export { VOICES };
