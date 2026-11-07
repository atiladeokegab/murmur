// The tile catalogue. Every person, number and shop here is invented (event data rule).
// `start: true` tiles are on the menu from day one; the rest arrive only as proposals.

export const CONTACTS = {
  mum: { name: 'Mum', phone: '+447700900461' },   // Ofcom drama range, never a real line
  sam: { name: 'Sam', phone: '+447700900123' },
};

export const TILES = [
  {
    id: 'notes', title: 'Read my notes', start: true, starter: 'Your notes, read aloud',
    tap: 'Hear them', action: { type: 'notes' },
  },
  {
    id: 'mum', title: 'Message Mum', start: true, starter: 'Read and reply',
    tap: 'Hear her message', action: { type: 'draft', to: 'mum' },
  },
  {
    id: 'bus', title: 'Bus to work', start: true, starter: 'Directions on Google Maps',
    tap: 'Next bus', action: { type: 'link', kind: 'transit', place: 'UCL East, Stratford, London' },
    say: 'Opening directions to work. The 25 leaves from the stop by the library.',
  },
  {
    id: 'ride', title: 'Ride home', start: true, starter: 'Uber, from where you are',
    tap: 'Book a ride', action: { type: 'link', kind: 'uber', place: 'Stratford, London' },
    say: 'Opening Uber with home filled in. You choose the car.',
  },
  {
    id: 'beans', title: 'Order beans', start: true, starter: 'Your usual, from Hill Street Roasters',
    tap: 'Order, I ask first', action: { type: 'pay', item: 'beans' },
  },
  {
    id: 'sam', title: 'Call Sam', start: false, starter: 'Phone call',
    tap: 'Call', action: { type: 'link', kind: 'tel', to: 'sam' },
    say: 'Calling Sam.', habit: 'call Sam',
  },
  {
    id: 'weather', title: 'Weather', start: false, starter: 'Today, in one line',
    tap: 'Hear it', action: { type: 'say' },
    say: 'Dry until two, then light rain. Eleven degrees. Take the thin coat.', habit: 'ask for the weather',
  },
];

export const SHOP = {
  beans: { name: 'your usual beans', detail: 'Hill Street Roasters, 250 grams, whole bean', price: 8.5, arrives: 'Tuesday' },
};

export const MUM_MESSAGE = 'Morning love. Are you still coming for lunch on Sunday? Bring a coat, it might rain.';
export const MUM_DRAFT = "Yes, I'll be there at one on Sunday. I'll bring the cake.";

export const NOTE = {
  title: 'Saturday',
  text: 'Pick up the parcel from the post office before noon. ' +
    'Call the dentist on Tuesday to move the check-up. ' +
    'Lunch with Mum on Sunday at one. ' +
    'Buy oat milk, lemons and coffee beans. ' +
    'Sam is coming over on Friday to fix the shelf. ' +
    'Book the train to Leeds for the twelfth. ' +
    'Water the plants on the balcony. ' +
    'Reply to the book club about next month.',
};

export const byId = (id) => TILES.find((t) => t.id === id);
