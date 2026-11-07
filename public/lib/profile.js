// The phone's owner: an invented person, seeded like Mum's chat and the book club. Nothing here is real.
// No health detail beyond the sight line.
export const PROFILE = {
  name: 'Joy Adeyemi', first: 'Joy',
  area: 'Stratford, London',
  sight: 'blind since birth',
  people: ['Mum', 'Sam', 'Priya'],          // who Joy talks to most (Tomas messages now and then)
  likes: ['audiobooks', 'the book club on Thursdays', 'pasta from Pasta Corner'],
  morning: 'a coffee, the weather, then Mum\'s messages',
  home: '14 Larkspur Mews, Stratford, E15 4QX',  // invented
  work: '3 Canal Yard, Hackney Wick, E9 5EN',    // invented
};

/** "Good afternoon, Joy" for the hour of `date`. */
export function greeting(date = new Date(), p = PROFILE) {
  const h = date.getHours();
  return `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}, ${p.first}`;
}

/** "Who am I?": the person, from what the phone holds; never what Murmur did. */
export function whoAmI(p = PROFILE) {
  return `You're ${p.name}, in ${p.area}, ${p.sight}. You talk most with ${p.people.slice(0, -1).join(', ')} and ${p.people.at(-1)}. `
    + `You love ${p.likes.slice(0, -1).join(', ')} and ${p.likes.at(-1)}. Your mornings are ${p.morning}.`;
}

/** One line for the model planner: the name and where home and work are. */
export const profileLine = (p = PROFILE) => `The person is ${p.name}. Home: ${p.home}. Work: ${p.work}.`;
