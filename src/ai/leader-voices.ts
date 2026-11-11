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

/** First Speaker Mateo Lindqvist: a negotiator. Blunt, unsentimental, unmovable on principle. */
const LINDQVIST: Lines = {
  greet: [
    'Mateo Lindqvist, First Speaker of the Concord. I don’t waste words, {them}, so here it is: we want peace and fair dealing. Do you?',
    '{them}. The Concord is listening. Say what you want plainly and you’ll get a plain answer.',
  ],
  declareWar: ['I gave you every chance to settle this at the table, {them}. You refused. The Concord is at war with you.'],
  warOnUs: ['You chose war, {them}. Fine. We will defend ourselves, and the table stays open when you’ve had enough.'],
  peace: ['Peace, {them}. Keep to it.'],
  treaty: ['Signed, {them}. I expect it honoured to the letter. So will you.'],
  betrayed: ['You broke your word, {them}. I don’t negotiate twice with people who do that.'],
  offer: ['Proposal sent, {them}. It’s fair. Read it, then answer.'],
  accept: ['Accepted, {them}. That’s a good deal.'],
  reject: ['No, {them}. It isn’t fair, and I don’t sign unfair deals.'],
  gift: ['Noted and appreciated, {them}.'],
  trespass: ['Your ships are in Concord space, {them}. Explain, or move them.'],
  victory: ['We held, {them}. Now come to the table.'],
  defeat: ['You won that battle, {them}. It changes nothing about what’s right.'],
  embassy: ['Ambassador. Welcome. Be honest with me and we’ll get along.'],
  withdrawYes: ['Done, {them}. We’ll pull back.'],
  withdrawNo: ['No, {them}. Those ships are within their rights. They stay.'],
  aidYes: ['You’re right about the {target}, {them}. We’ll stand with you.'],
  aidAlready: ['We’re already at war with the {target}, {them}. Let’s coordinate.'],
  aidNo: ['No, {them}. I won’t send Concord crews to die over the {target} until talking has failed.'],
  threatYield: ['Understood, {them}. We’ll keep our distance.'],
  threatDefy: ['Threats don’t move me, {them}. The answer is no.'],
  threatWar: ['Then it’s war, {them}. You’ll find us ready.'],
  reassureTrust: ['Good. Likewise, {them}.'],
  reassureDoubt: ['I’ll believe it when I see it, {them}.'],
  intentHostile: ['We’re at war, {them}. Make peace and that ends.'],
  intentWarning: ['Your recent moves worry me, {them}. Stop them.'],
  intentWatching: ['The {target} concern me, {them}. You don’t. Yet.'],
  intentPeaceful: ['Peace and fair trade, {them}. Nothing more, nothing less.'],
  denounceAgree: ['Agreed, {them}. The {target} can’t be trusted.'],
  denounceDisagree: ['No, {them}. The {target} have dealt fairly with us.'],
  denounceIndifferent: ['Noted, {them}. I’ll judge the {target} on what they do.'],
};

/** First Speaker Sean Sutton: a former fleet engineer. Warm and funny, and still the most hawkish First Speaker in a century. */
const SUTTON: Lines = {
  greet: [
    'Hello, {them}! Sean Sutton, First Speaker of the Concord. Former fleet engineer, current optimist. Let’s build something together.',
    'Welcome, {them}! Pull up a chair at the Long Table. Mind the coffee; I made it.',
  ],
  declareWar: ['I’ve fixed reactors, hull breaches and one very angry shuttle, {them}, but I couldn’t fix this. The Concord is at war with you. I’m sorry it came to this.'],
  warOnUs: ['Well, that’s disappointing, {them}. I spent twenty years building those ships hoping nobody would ever need them. Turns out somebody does.'],
  peace: ['Peace! Thank you, {them}. I’d hug you if I knew where your arms were.'],
  treaty: ['Signed and sealed, {them}. A treaty is like a hull seal: boring, vital, and best checked twice.'],
  betrayed: ['That hurts, {them}. I don’t hold grudges, as a rule, but I’m making an exception for you.'],
  offer: ['I’ve sent you an offer, {them}. If it’s not quite right, counter it. That’s half the fun.'],
  accept: ['Done, {them}! Everybody wins. I love it when that happens.'],
  reject: ['Not quite, {them}. Close, though. Tighten a few bolts and try again.'],
  gift: ['A gift? {them}, you’ll make me blush. Thank you.'],
  trespass: ['{them}, your ships seem to have wandered into our space. I’m sure there’s a good reason and I’d love to hear it. Or we could sign an open-borders deal and never have this awkward chat again.'],
  victory: ['Our ships held, {them}. I did warn you they were well built. Can we talk now?'],
  defeat: ['You won that one, {them}. Fine. I’ll be in the shipyards, taking notes.'],
  embassy: ['Welcome, ambassador! Make yourself at home. The coffee is terrible; the company is excellent.'],
  withdrawYes: ['Fair enough, {them}. We’ll move them. No hard feelings.'],
  withdrawNo: ['Sorry, {them}, those ships are staying put. Lovely view from there, apparently.'],
  aidYes: ['The {target} have gone too far, {them}. Count us in. I’ll warm up the engines.'],
  aidAlready: ['Ahead of you, {them}: we’re already at war with the {target}. Let’s coordinate.'],
  aidNo: ['I like you, {them}, but I’m not taking the Concord to war against the {target}. Not yet.'],
  threatYield: ['Easy, {them}, easy. We’ll keep out of your way.'],
  threatDefy: ['Was that a threat, {them}? Adorable. The answer is no, and my door is still open.'],
  threatWar: ['If it’s war you want, {them}, you’ll get one. I’ll be sad about it. You’ll be sadder.'],
  reassureTrust: ['That’s lovely to hear, {them}. Likewise.'],
  reassureDoubt: ['I’d like to believe you, {them}. Help me out with a little evidence.'],
  intentHostile: ['We’re at war, {them}. I’d rather we weren’t. Make me an offer.'],
  intentWarning: ['Friendly warning, {them}: you’re making people nervous. Including me, and I’m hard to rattle.'],
  intentWatching: ['It’s the {target} I’m watching, {them}. You and I are fine.'],
  intentPeaceful: ['Trade, treaties, and a well-built fleet nobody ever has to use, {them}. That’s the dream.'],
  denounceAgree: ['Between us, {them}? I agree about the {target}.'],
  denounceDisagree: ['I can’t agree with you about the {target}, {them}. They’ve been straight with us.'],
  denounceIndifferent: ['Hm. Noted, {them}. I’ll ask the {target} for their side.'],
};

export const LEADER_VOICES: Record<string, Lines> = {
  'concord-halvorsen-okafor': HALVORSEN_OKAFOR,
  'concord-lindqvist': LINDQVIST,
  'concord-sutton': SUTTON,
};
