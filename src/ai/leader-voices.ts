/**
 * Each leader's own words (§9.8): a computer-run power speaks in the voice of whoever leads it this game
 * (docs/LORE.md). Keyed "faction-leader"; any topic a leader lacks falls back to the faction's voice in
 * voice.ts. Placeholders as there: {them} the listener's empire, {target} a third empire, {system} a system.
 */
import type { Topic } from './voice';

type Lines = Partial<Record<Topic, string[]>>;

/** First Speaker Ingrid Halvorsen-Okafor: an archaeologist. Curious, patient, sees every meeting as a dig site. */
const HALVORSEN_OKAFOR: Lines = {
  greet: [
    'Hello, {them}. I’m Ingrid Halvorsen-Okafor. I’ve spent my life reading the ruins of peoples who never met each other in time. I’d like us to do better.',
    'Welcome, {them}. Forgive me if I ask too many questions. It’s an old habit from the dig sites.',
  ],
  declareWar: ['I have dug up the end of enough empires to know how this goes, {them}. You have left us no other choice. The Concord is at war with you.'],
  warOnUs: ['So you chose war, {them}. Every ruin I have walked was once someone’s certainty. Think about that while we defend ourselves.'],
  peace: ['Peace, {them}. Let’s leave something better than rubble for whoever comes after us.'],
  treaty: ['Signed, {them}. Agreements are like foundations: nobody admires them, but everything stands on them.'],
  betrayed: ['We trusted you, {them}. I will record this carefully, the way I record everything. The Concord will remember.'],
  offer: ['We have sent you a proposal, {them}. Read it closely. I think you’ll find it fair to both of us.'],
  accept: ['Agreed, {them}. Good. That’s one more layer of trust laid down.'],
  reject: ['Not this time, {them}. The balance isn’t right yet. Try us again.'],
  gift: ['That’s very generous, {them}. Thank you. Gifts like this are what historians remember.'],
  trespass: ['Your ships are in Concord space, {them}. I’m curious what brings them here, and I would rather hear it from you than guess.'],
  victory: ['Our fleet held, {them}. I take no pleasure in it. Shall we talk now?'],
  defeat: ['You won that battle, {them}. We will both be counting what it cost for years.'],
  embassy: ['Welcome, ambassador. My door is open, and so are our archives, within reason.'],
  withdrawYes: ['Of course, {them}. We’ll pull back. We meant no offence; we were only looking.'],
  withdrawNo: ['Our ships are surveying, {them}, nothing more. They stay until the work is done.'],
  aidYes: ['You’re right about the {target}, {them}. The Concord will stand with you.'],
  aidAlready: ['We are already at war with the {target}, {them}. Let’s compare notes and act together.'],
  aidNo: ['I’m not ready to send people to die over the {target}, {them}. Not yet. Let me try talking to them first.'],
  threatYield: ['There’s no need for that tone, {them}. We will keep our distance.'],
  threatDefy: ['Threats don’t work on archaeologists, {them}. We are used to things that look frightening and turn out to be dust.'],
  threatWar: ['If you want war, {them}, you’ll find the Concord ready, and very well documented.'],
  reassureTrust: ['I’m glad to hear it, {them}. I feel the same.'],
  reassureDoubt: ['Words are easy, {them}. I have read too many treaties carved into ruins. Show me.'],
  intentHostile: ['Honestly, {them}? We are at war, and we will defend ourselves until you make peace.'],
  intentWarning: ['I’ll be frank, {them}: your recent moves worry me. I hope I am misreading them.'],
  intentWatching: ['My worry is the {target}, {them}, not you.'],
  intentPeaceful: ['Discovery, trade and peace, {them}. And perhaps, one day, the truth about the Cryx.'],
  denounceAgree: ['I share your concerns about the {target}, {them}.'],
  denounceDisagree: ['The {target} have treated us decently, {them}. I don’t see what you see.'],
  denounceIndifferent: ['Noted, {them}. I’ll keep an eye on the {target}.'],
};

/** First Speaker Mateo Lindqvist: a negotiator. Warm, funny, and unmovable on principle. */
const LINDQVIST: Lines = {
  greet: [
    'Hello, {them}! Mateo Lindqvist, First Speaker of the Concord. I’m told I talk too much, so I’ll keep it short: welcome. Let’s be friends.',
    'Greetings, {them}. Pull up a chair. There is always room at the Long Table.',
  ],
  declareWar: ['I have ended strikes, feuds and one very bad wedding without a shot fired, {them}. You are the first I couldn’t talk down. The Concord is at war.'],
  warOnUs: ['Well. That is not how I hoped this conversation would go, {them}. We will defend ourselves, and the offer to talk stays open.'],
  peace: ['Peace! Thank you, {them}. I would hug you if I knew where your arms were.'],
  treaty: ['Signed and sealed, {them}. My favourite kind of paperwork.'],
  betrayed: ['I’m a patient man, {them}, but you broke your word. The Concord doesn’t forget, and neither do I.'],
  offer: ['I’ve sent you an offer, {them}. If it’s not quite right, counter it. That’s half the fun.'],
  accept: ['Done, {them}! Everybody wins. I love it when that happens.'],
  reject: ['Not quite, {them}. Close, though. Sweeten it a little.'],
  gift: ['A gift? {them}, you’ll make me blush. Thank you.'],
  trespass: ['{them}, your ships are in our space. I’m sure there’s a reasonable explanation and I’d love to hear it. Or we could sign an open-borders deal and never have this talk again.'],
  victory: ['We held, {them}. Can we stop now? I would much rather argue across a table.'],
  defeat: ['You won that one, {them}. I hope it was worth it. The offer to talk is still open.'],
  embassy: ['Welcome, ambassador! Make yourself at home. The coffee is terrible; the company is excellent.'],
  withdrawYes: ['Fair enough, {them}. We’ll move them. No hard feelings.'],
  withdrawNo: ['I’m afraid not, {them}. Those ships have every right to be there, and on that I don’t budge.'],
  aidYes: ['The {target} have gone too far, {them}. Count us in.'],
  aidAlready: ['Ahead of you, {them}: we are already at war with the {target}. Let’s coordinate.'],
  aidNo: ['I won’t take the Concord to war against the {target}, {them}. Not until every other door is closed.'],
  threatYield: ['Easy, {them}, easy. We’ll keep out of your way.'],
  threatDefy: ['I’ve been threatened by better negotiators than you, {them}. My answer is still no, and my door is still open.'],
  threatWar: ['If it’s war you want, {them}, you’ll get one. I will be sad about it. You will be sadder.'],
  reassureTrust: ['That’s lovely to hear, {them}. Likewise.'],
  reassureDoubt: ['I’d like to believe you, {them}. Help me out with a little evidence.'],
  intentHostile: ['We’re at war, {them}. I’d rather we weren’t. Make me an offer.'],
  intentWarning: ['Friendly warning, {them}: you are making people nervous. Including me.'],
  intentWatching: ['It’s the {target} I’m watching, {them}. You and I are fine.'],
  intentPeaceful: ['Trade, treaties and a good argument now and then, {them}. That’s all we want.'],
  denounceAgree: ['Between us, {them}? I agree about the {target}.'],
  denounceDisagree: ['I can’t agree with you about the {target}, {them}. They’ve been straight with us.'],
  denounceIndifferent: ['Hm. Noted, {them}. I’ll ask the {target} for their side.'],
};

/** First Speaker Sean Sutton: a former fleet engineer, the most hawkish First Speaker in a century. Blunt, careful. */
const SUTTON: Lines = {
  greet: [
    'First Speaker Sean Sutton, {them}. I’ll be straight with you: the Concord wants peace, and builds its ships to keep it.',
    '{them}. Sutton here. Let’s find out what we can build together, and what we can’t.',
  ],
  declareWar: ['We’ve tried everything else, {them}. Now we try the fleet. The Concord is at war with you.'],
  warOnUs: ['You picked the wrong people to test, {them}. I built half the ships you’re about to meet.'],
  peace: ['Agreed, {them}. Peace. We’ll keep the shields up a while longer, out of habit.'],
  treaty: ['Signed, {them}. A treaty is like a hull seal: it holds as long as nobody gets careless.'],
  betrayed: ['You broke it, {them}. I don’t forget a structural failure, and I don’t forget who caused it.'],
  offer: ['Proposal sent, {them}. No padding. Take it or counter it.'],
  accept: ['Accepted, {them}. Sound engineering on both sides.'],
  reject: ['Rejected, {them}. The numbers don’t hold up.'],
  gift: ['Appreciated, {them}. It will be put to good use.'],
  trespass: ['Your ships are inside Concord space, {them}. Explain, or move them. I’d prefer both.'],
  victory: ['Our line held, {them}. It was built to. Shall we stop here?'],
  defeat: ['You won that round, {them}. We’ll repair, refit and remember.'],
  embassy: ['Ambassador. Welcome. You will find us easy to deal with and hard to fool.'],
  withdrawYes: ['Fine, {them}. We’ll pull them back. Don’t read anything into it.'],
  withdrawNo: ['No, {them}. Those ships stay. They’re within their rights, and within range.'],
  aidYes: ['The {target} have pushed too far, {them}. The Concord fleet is moving.'],
  aidAlready: ['We’re already fighting the {target}, {them}. Send me your fleet positions.'],
  aidNo: ['Not yet, {them}. I won’t commit the fleet against the {target} without a cause I can defend at home.'],
  threatYield: ['Understood, {them}. We’ll stand off. For now.'],
  threatDefy: ['Is that a threat, {them}? I’ve stress-tested worse. The answer is no.'],
  threatWar: ['Then come, {them}. We’ve been ready for a while.'],
  reassureTrust: ['Good to hear, {them}. Likewise.'],
  reassureDoubt: ['Words don’t carry load, {them}. Actions do.'],
  intentHostile: ['We’re at war, {them}. That stays true until you sign a peace.'],
  intentWarning: ['Your recent moves have my attention, {them}. That is not a compliment.'],
  intentWatching: ['It’s the {target} I’m watching, {them}. Keep it that way.'],
  intentPeaceful: ['Peace, trade, and a fleet strong enough to keep both, {them}.'],
  denounceAgree: ['Agreed, {them}. The {target} need watching.'],
  denounceDisagree: ['I don’t see it, {them}. The {target} have kept their word with us.'],
  denounceIndifferent: ['Noted, {them}. I’ll have the {target} watched.'],
};

export const LEADER_VOICES: Record<string, Lines> = {
  'concord-halvorsen-okafor': HALVORSEN_OKAFOR,
  'concord-lindqvist': LINDQVIST,
  'concord-sutton': SUTTON,
};
