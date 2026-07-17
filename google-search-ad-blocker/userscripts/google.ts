// Hides sponsored results on Google search pages.
//
// Two layers:
//  1. CSS injected at document_start for Google's known ad containers — ads
//     never paint at all.
//  2. A debounced DOM sweep that finds localized "Sponsored" labels and hides
//     the enclosing ad block — catches markup Google ships without the known
//     ids/attributes.

const STYLE_ID = 'agr-hide-style';
const HIDDEN_ATTR = 'data-agr-hidden';

// Top-of-page ads. [data-text-ad] marks individual text-ad results anywhere.
const TOP_SELECTORS = ['#tads', '[data-text-ad]'];
const BOTTOM_SELECTORS = ['#bottomads', '#tadsb'];
const SHOPPING_SELECTORS = [
  '.commercial-unit-desktop-top',
  '.commercial-unit-desktop-rhs',
  '.cu-container',
  '.pla-unit-container',
];

// Exact text of the ad label across Google locales.
const SPONSOR_LABELS = new Set([
  'Sponsored', 'Ad', 'Ads',
  'Реклама', 'Спонсируемые',
  'Anzeige', 'Gesponsert',
  'Sponsorisé', 'Annonce',
  'Patrocinado', 'Anuncio', 'Anúncio',
  'Sponsorizzato', 'Annuncio',
  'Gesponsord', 'Advertentie',
  'Sponsorlu', 'Reklam',
  'スポンサー', '広告', '스폰서', '광고', '赞助商', '广告',
]);

// Ancestors at which the label climb stops; the block to hide is the child of
// one of these, never the boundary itself.
const BLOCK_BOUNDARIES = ['#rso', '#taw', '#tads', '#bottomads', '#center_col', '#rhs'];

function injectCss(selectors: string[]): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.head ?? document.documentElement).appendChild(style);
  }
  style.textContent = selectors.length
    ? `${selectors.join(',')}{display:none !important;}`
    : '';
}

const seenLabels = new WeakSet<Element>();
let hiddenByLabel = 0;

function labelSweep(): void {
  for (const span of document.querySelectorAll('span')) {
    if (seenLabels.has(span)) continue;
    const text = span.textContent?.trim();
    if (!text || text.length > 16 || !SPONSOR_LABELS.has(text)) continue;
    seenLabels.add(span);

    // Climb to the direct child of a known boundary container.
    let block: HTMLElement | null = span;
    while (block && block.parentElement) {
      const parent: HTMLElement = block.parentElement;
      if (BLOCK_BOUNDARIES.some((sel) => parent.matches(sel))) break;
      if (parent === document.body || parent === document.documentElement) {
        block = null;
        break;
      }
      block = parent;
    }
    if (!block || block.hasAttribute(HIDDEN_ATTR)) continue;
    // Never hide anything that contains the organic results.
    if (block.querySelector('#rso, #res, #search')) continue;

    block.setAttribute(HIDDEN_ATTR, '1');
    block.style.setProperty('display', 'none', 'important');
    hiddenByLabel++;
  }
}

let sweepTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSweep(): void {
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(labelSweep, 250);
}

async function main(): Promise<void> {
  // Known containers hide immediately; top ads are the app's purpose and are
  // not configurable.
  injectCss(TOP_SELECTORS);

  const [hideBottom, hideShopping] = await Promise.all([
    airglow.storage.get<boolean>('hideBottom'),
    airglow.storage.get<boolean>('hideShopping'),
  ]);
  injectCss([
    ...TOP_SELECTORS,
    ...(hideBottom !== false ? BOTTOM_SELECTORS : []),
    ...(hideShopping !== false ? SHOPPING_SELECTORS : []),
  ]);

  const start = () => {
    labelSweep();
    new MutationObserver(scheduleSweep).observe(document.body, {
      childList: true,
      subtree: true,
    });
    // One late pass, then report.
    setTimeout(() => {
      labelSweep();
      if (hiddenByLabel > 0) {
        airglow.log.info(`label sweep hid ${hiddenByLabel} sponsored block(s)`, {
          url: location.pathname + location.search,
        });
      }
    }, 2000);
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}

main().catch((e) => airglow.log.error('google-search-ad-blocker failed', { message: String(e) }));
