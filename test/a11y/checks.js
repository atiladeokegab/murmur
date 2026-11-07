export async function audit(page, axePath) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // Murmur requires 7:1 even for large text, above axe's default AA threshold.
    axe.configure({ checks: [{ id: 'color-contrast', options: {
      contrastRatio: { normal: { expected: 7 }, large: { expected: 7 } },
    } }] });
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    const brief = (rule) => ({ id: rule.id, nodes: rule.nodes.map((n) => ({
      target: n.target, summary: n.failureSummary,
    })) });
    return { violations: result.violations.map(brief), manual: result.incomplete.map(brief) };
  });
}

export async function smallTargets(page) {
  return page.locator('button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"]').evaluateAll((nodes) =>
    nodes.filter((el) => el.checkVisibility() && !el.closest('[inert]')).flatMap((el) => {
      const { width, height } = el.getBoundingClientRect();
      return width < 64 || height < 64 ? [{
        element: el.outerHTML.slice(0, 250), width, height,
      }] : [];
    }));
}

export async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const bad = [...document.body.querySelectorAll('*')].filter((el) => {
      if (!el.checkVisibility() || el.closest('[inert]')) return false;
      // A screen-reader-only ancestor also hides its descendants visually.
      for (let parent = el; parent; parent = parent.parentElement) {
        const rect = parent.getBoundingClientRect();
        if (rect.width <= 1 && rect.height <= 1 && getComputedStyle(parent).clipPath !== 'none') return false;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0) return false;
      return rect.right > width + 1 || rect.left < -1 ||
        (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1);
    }).map((el) => el.outerHTML.slice(0, 250));
    return { viewport: width, document: document.documentElement.scrollWidth, elements: bad };
  });
}
