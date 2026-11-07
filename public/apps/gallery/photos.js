// The phone's photos: invented scenes, drawn in CSS (gallery/index.js), never real people or images. Newest first.
export const PHOTOS = [
  { id: 'beach', short: 'beach', words: ['beach', 'brighton', 'sea', 'seaside'], day: 'Saturday', caption: 'you and Sam on the beach at Brighton' },
  { id: 'pasta', short: 'pasta', words: ['pasta', 'dinner', 'food', 'pasta corner'], day: 'Friday', caption: 'your usual from Pasta Corner, with extra basil' },
  { id: 'bookclub', short: 'book club', words: ['book club', 'books', 'library'], day: 'Thursday', caption: 'the book club round the big table at Quayside Library' },
  { id: 'park', short: 'park', words: ['park', 'frost', 'morning', 'walk'], day: 'Wednesday', caption: 'the park first thing, frost on the grass' },
  { id: 'canal', short: 'sunset', words: ['sunset', 'canal', 'evening'], day: 'Tuesday', caption: 'the sunset over the canal in Stratford' },
  { id: 'garden', short: 'garden', words: ['garden', 'mum', 'sunflowers', 'flowers'], day: 'last Sunday', caption: 'Mum in her garden with the sunflowers' },
  { id: 'cake', short: 'birthday cake', words: ['cake', 'birthday', 'priya'], day: 'last Saturday', caption: "Priya's birthday cake with seven candles" },
];
/** "the beach", "my last photo", "the one from Brighton", "" -> a photo; the newest when nothing matches a word. */
export function photoOf(q) {
  const n = String(q || '').toLowerCase().replace(/[^a-z ]+/g, ' ');
  return PHOTOS.find((p) => p.words.some((w) => n.includes(w))) || PHOTOS[0];
}
export const lineOf = (p) => `Your photo from ${p.day}: ${p.caption}.`;
