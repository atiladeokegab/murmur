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

/** 'auto' (no colours chosen) follows the phone's light or dark setting; any other theme is what was chosen. */
export const PHONE_LIGHT = '(prefers-color-scheme: light)';
export const shownTheme = (theme) => (theme === 'auto' ? (globalThis.matchMedia?.(PHONE_LIGHT).matches ? 'light' : 'dark') : theme);

/** What the page shows -> toolkit needs (explicit edits, so no consent gate). */
export function toNeeds({ size, theme, rate }) {
  theme = shownTheme(theme);
  const need = (dimension, value) => ({ dimension, value, strength: 'preference', source: 'explicit' });
  return [need('textSize', size / 100), need('darkTheme', theme !== 'light'), need('contrast', theme === 'yellow'), need('readAloudRate', rate)];
}

export async function readLook(librarian) {
  return fromSettings(renderMobileSettings(await librarian.getAbilityModel()));
}

/** Read the profile into look, but keep 'auto': the profile holds what is shown, not that no colours were chosen. */
export async function loadLook(librarian, look) {
  const auto = look.theme === 'auto';
  Object.assign(look, await readLook(librarian));
  if (auto) look.theme = 'auto';
  return look;
}

export async function writeLook(librarian, look) {
  await librarian.setProfileFields({ supportAreas: ['vision'], 'fields.needs': toNeeds(look) });
  return readLook(librarian);
}

export function applyLook(look) {
  const root = document.documentElement;
  root.style.fontSize = look.size === 100 ? '' : `${look.size}%`;
  const theme = shownTheme(look.theme);
  if (theme === 'dark') delete root.dataset.theme; else root.dataset.theme = theme;
}
