// The invented person this phone belongs to: one seed, read by "who am I", the greeting and the planner's context.
// Matches the other seeds (Mum, Sam, Thursday book club, Pasta Corner, the My morning tile). Invented addresses.
// Health: the sight line only, never a symptom or diagnosis.
export const PROFILE = {
  name: 'Joy Adeyemi', first: 'Joy',
  area: 'Stratford, London', sight: 'partly sighted',
  people: ['Mum', 'Sam', 'Priya'],
  likes: ['audiobooks', 'the Thursday book club', 'her usual from Pasta Corner'],
  usual: 'her usual from Pasta Corner',
  morning: ["hear what's on today", "read Mum's message", 'carry on her audiobook'],
  home: '12 Larkspur Mews, Stratford, London E15',
  work: 'Unit 4, Harbour Yard, Canning Town, London E16',
};

const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '');

/** "Who am I?": what the phone knows about you, in one breath. */
export const whoAmI = (p = PROFILE) =>
  `You're ${p.name}, in ${p.area}, and you're ${p.sight}. You talk most with ${list(p.people)}. ` +
  `You like ${list(p.likes.map((x) => x.replace(/\bher\b/g, 'your')))}. Most mornings you ${list(p.morning.map((x) => x.replace(/\bher\b/g, 'your')))}.`;

/** What the planner may know: a name and two places, nothing else. */
export const meContext = (p = PROFILE) => ({ name: p.name, home: p.home, work: p.work, usual: p.usual.replace(/\bher\b/, 'your') });
