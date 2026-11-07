// Your look: text, colours, voice. The toolkit's ability profile is the source of truth:
// each change is written as a need, read back through getAbilityModel and renderMobileSettings, then applied.
import { renderMobileSettings } from './vendor/toolkit/surfaces/mobile.js';

export const SIZES = [100, 150, 200, 300, 400];
export const THEMES = { dark: 'Dark', yellow: 'Yellow on black', light: 'Light' };

/** Mobile settings -> what the page needs. */
export function fromSettings(m) {
  return {
    size: m.text.scalePercent,
    theme: m.display.highContrast ? 'yellow' : m.display.darkMode ? 'dark' : 'light',
    rate: m.speech.rate,
  };
}

/** What the page shows -> toolkit needs (explicit edits, so no consent gate). */
export function toNeeds({ size, theme, rate }) {
  const need = (dimension, value) => ({ dimension, value, strength: 'preference', source: 'explicit' });
  return [need('textSize', size / 100), need('darkTheme', theme !== 'light'), need('contrast', theme === 'yellow'), need('readAloudRate', rate)];
}

export async function readLook(librarian) {
  return fromSettings(renderMobileSettings(await librarian.getAbilityModel()));
}

export async function writeLook(librarian, look) {
  await librarian.setProfileFields({ supportAreas: ['vision'], 'fields.needs': toNeeds(look) });
  return readLook(librarian);
}

export function applyLook(look) {
  const root = document.documentElement;
  root.style.fontSize = look.size === 100 ? '' : `${look.size}%`;
  if (look.theme === 'dark') delete root.dataset.theme; else root.dataset.theme = look.theme;
}
