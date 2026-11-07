// The Writer: a book with chapters, read and written by voice. Pure; tested in test/apps-writer.test.js.
import { sentences, replaceWord, whereAmI } from '../../lib/notes.js';

export const PAGE = 20; // sentences on a page; "the last page" is the last PAGE sentences of the last chapter

const CH1 = [
  'We moved in on the first warm day of the year.',
  'The flat was above a launderette, and the floor was always faintly warm.',
  'I learned the stairs by counting them: fourteen, then a turn, then six.',
  'The kettle was the first thing I found and the last thing I packed.',
  'Next door played the cello badly every evening at seven.',
  'By the second week I liked it.',
  'A letter came for the person who lived here before me.',
  'I put it on the shelf by the door and forgot about it.',
].join(' ');

const CH2 = [
  // the rain: sentences 1 to 10
  'The rain started before I reached the corner.', 'It came sideways, the way it does in March.',
  'I pulled my collar up and kept walking.', 'The bakery was shut, its blinds half down.',
  'A bus went past and soaked my shoes.', 'I counted the lamp posts to keep my mind still.',
  'Eleven, twelve, thirteen.', 'My phone buzzed twice and I ignored it.',
  'By the bridge, the rain had settled into a drizzle.', 'I could hear the trains before I could see them.',
  // the station: 11 to 20
  'The station smelled of wet coats and coffee.', 'A board above the gates clicked through the departures.',
  'The nine forty to Leeds was on time, for once.', 'I stood under the clock and looked for her.',
  'A man with a guide dog asked me which platform was four.', 'I walked him there, and the dog led the way.',
  'People moved around us like water round a stone.', 'The announcer said our train in a voice like gravel.',
  'I still could not see her anywhere.', 'Then someone touched my arm.',
  // the letter: 21 to 30
  'It was not her, but her brother.', 'He held out an envelope with my name on it.',
  'The handwriting was hers, small and slanted.', 'I did not open it on the platform.',
  'I sat on the train and held it on my knee.', 'The fields went past, green and grey.',
  'Somewhere after Peterborough, I opened it.', 'There was one line inside.',
  'It said, "Read this out loud."', 'So I did.',
].join(' ');

export const fresh = () => ({
  title: 'Platform Four',
  chapters: [
    { title: 'The flat', text: CH1, parts: [{ from: 0, about: 'moving in' }, { from: 6, about: 'the letter for someone else' }] },
    { title: 'Platform Four', text: CH2, parts: [{ from: 0, about: 'the rain' }, { from: 10, about: 'the station' }, { from: 20, about: 'the envelope' }] },
  ],
  chapter: 1,      // index of the open chapter
  sentence: 0,     // index of the current sentence in it
  readFrom: null,  // where the last read started
  changed: null,   // { chapter, sentence, to } after "change X to Y"
  lastSaid: '',
});

export const current = (s) => s.chapters[s.chapter];
export const count = (s, ch = s.chapter) => sentences(s.chapters[ch].text).length;
export const lastPageStart = (s) => Math.max(0, count(s, s.chapters.length - 1) - PAGE);

/** "Chapter 2, sentence 14 of 30, the part about the station." */
export function where(s) {
  const ch = current(s), n = count(s);
  const head = `Chapter ${s.chapter + 1}`;
  if (!n) return `${head}, ${ch.title}. It's empty so far.`;
  const i = Math.min(s.sentence, n - 1);
  const part = (ch.parts || []).filter((p) => p.from <= i).at(-1);
  if (part) return `${head}, sentence ${i + 1} of ${n}, the part about ${part.about}.`;
  return `${head}, ${whereAmI(ch.text, i).replace(/^S/, 's')}`;
}

export function openChapter(s, n) {
  if (n < 1 || n > s.chapters.length) return false;
  s.chapter = n - 1; s.sentence = 0; s.readFrom = null;
  return true;
}

/** Moves to the start of the last page; the caller reads from s.sentence on. Returns the sentences to read. */
export function startLastPage(s) {
  s.chapter = s.chapters.length - 1;
  s.sentence = s.readFrom = lastPageStart(s);
  return sentences(current(s).text);
}

export function startCarryOn(s) {
  s.readFrom = Math.min(s.sentence, Math.max(0, count(s) - 1));
  return sentences(current(s).text);
}

export function dictate(s, text) {
  const t = String(text).trim();
  if (!t) return false;
  const ch = current(s);
  keep(s);
  ch.text = ch.text ? `${ch.text} ${t}` : t;
  s.sentence = count(s) - 1;
  s.changed = null;
  return true;
}

export function change(s, from, to) {
  const ch = current(s);
  const r = replaceWord(ch.text, from, to, s.sentence);
  if (!r.changed) return false;
  keep(s);
  ch.text = r.text;
  s.sentence = r.index;
  s.changed = { chapter: s.chapter, sentence: r.index, to };
  return true;
}

export function newChapter(s, title) {
  s.chapters.push({ title: String(title || '').trim() || `Chapter ${s.chapters.length + 1}`, text: '', parts: [] });
  s.chapter = s.chapters.length - 1; s.sentence = 0; s.readFrom = null; s.changed = null;
}

export function read(s) {
  const ch = current(s);
  return `The Writer: ${s.title}. ${s.chapters.length} chapters. Open: chapter ${s.chapter + 1}, ${ch.title}, ${count(s)} sentences.`;
}

export function place(s) {
  return { where: `Chapter ${s.chapter + 1}, ${current(s).title}`, item: 'sentence', n: Math.min(s.sentence + 1, count(s)), of: count(s), next: 'carryOn', say: where(s) };
}

// One step back for the last dictate or change: the chapter text and place as they were.
function keep(s) { s.undo = { chapter: s.chapter, text: current(s).text, sentence: s.sentence }; }
export function undo(s) {
  const u = s.undo;
  if (!u || !s.chapters[u.chapter]) return false;
  s.chapters[u.chapter].text = u.text;
  s.chapter = u.chapter; s.sentence = u.sentence; s.changed = null; s.undo = null;
  return true;
}
