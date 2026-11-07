// Popular apps Murmur does not carry yet: it acts them out, with one spoken line and the steps shown on /stage.
// Names are text only (no logos or colours); every person is invented; nothing is ever sent, paid, called or deleted.
export const PHONE_APPS = [
  { name: 'Spotify', also: [], does: 'music', line: 'Opening Spotify. Playing your liked songs.', steps: ['Opening Your Library', 'Opening Liked Songs', 'Pressing Play'] },
  { name: 'WhatsApp', also: ['whats app'], does: 'chat', line: 'Opening WhatsApp. Two new messages, from Priya and Tomas.', steps: ['Opening Chats', 'Finding the unread chats', 'Reading the newest'] },
  { name: 'Instagram', also: ['insta'], does: 'photos', line: 'Opening Instagram. Three new photos from Priya, from her walk by the sea.', steps: ['Opening the feed', 'Scrolling to the newest', 'Reading the captions'] },
  { name: 'Netflix', also: [], does: 'shows', line: 'Opening Netflix. Playing the next episode of Harbour Lights.', steps: ['Opening Continue watching', 'Choosing Harbour Lights', 'Pressing Play'] },
  { name: 'YouTube', also: ['you tube'], does: 'videos', line: 'Opening YouTube. Playing the newest video from your subscriptions.', steps: ['Opening Subscriptions', 'Choosing the newest', 'Pressing Play'] },
  { name: 'Podcasts', also: ['podcast'], does: 'podcasts', line: 'Opening Podcasts. Playing the newest episode of Slow News.', steps: ['Opening Your shows', 'Choosing Slow News', 'Pressing Play'] },
  { name: 'Audible', also: ['audiobook', 'audiobooks'], does: 'audiobooks', line: 'Opening Audible. Carrying on with The Long Road, chapter seven.', steps: ['Opening Library', 'Choosing The Long Road', 'Pressing Play'] },
  { name: 'BBC Sounds', also: ['radio'], does: 'radio', line: 'Opening BBC Sounds. Playing the radio.', steps: ['Opening Live', 'Choosing a station', 'Pressing Play'] },
];
// Words that would send, pay, call or delete: an acted-out app never does those, only the phone's own gated apps do.
const GATED = /\b(send|text|message|reply|pay|buy|order|book|call|ring|phone|delete|remove|post|share|transfer)\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The popular app a request names, if any: { app, gated } where gated means only open it, never act. */
export function phoneApp(text) {
  const t = String(text || '').toLowerCase();
  const app = PHONE_APPS.find((a) => [a.name.toLowerCase(), ...a.also].some((n) => new RegExp(`\\b${esc(n)}\\b`).test(t)));
  if (!app) return null;
  const gated = GATED.test(t.replace(new RegExp(`\\b(${[app.name.toLowerCase(), ...app.also].map(esc).join('|')})\\b`, 'g'), ''));
  return gated ? { ...app, line: `Opening ${app.name}. I can look in it, but I won't send, pay, call or delete from it.`, steps: [app.steps[0]] } : app;
}
