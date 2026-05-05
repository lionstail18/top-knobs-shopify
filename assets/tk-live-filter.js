/* ============================================================
   Top Knobs — Live filter pattern.
   Hooks into either tk-search-with-filters.liquid or tk-collection.liquid
   and refreshes the sidebar + main grid in place via Shopify's Section
   Rendering API. No page reload, no Apply button click.

   Behavior:
   • Checkbox change → fire immediately
   • Price slider release ('change' event) → fire (debounced 200ms)
   • Sort dropdown change → fire
   • Active chip × click (and "Clear all") → fire (intercept link)
   • Pagination link click → fire (intercept link, scroll to top)
   • Browser back/forward → re-fetch the URL state
   • If JS fails or is disabled, the original Apply Filters button
     still works as a fallback (form submit → page reload).

   Race conditions: each request gets a token; only the latest
   response is applied. AbortController cancels in-flight requests.
   ============================================================ */

(function () {
  'use strict';

  // Tell the inline section scripts to skip their own DOMContentLoaded init —
  // we own sort, filter-more toggling, and the price slider from here.
  // Set early (before DOMContentLoaded fires) so the inline guard sees it.
  window.tkLiveFilterLoaded = true;

  // Configure each section by namespace
  const SECTIONS = [
    {
      formId: 'tk-srch-filter-form',
      sortId: 'tk-srch-sort',
      sidebarSelector: '.tk-srch__sidebar',
      mainSelector: '.tk-srch__main',
      sectionWrapperSelector: '.tk-search-with-filters-section',
      chipSelectors: '.tk-srch__chip, .tk-srch__chip-clear',
      pageBtnSelector: 'a.tk-srch__page-btn',
      sliderSelector: '.tk-srch__price-slider',
      sliderLowThumb: '.tk-srch__price-thumb--low',
      sliderHighThumb: '.tk-srch__price-thumb--high',
      sliderFill: '.tk-srch__price-fill',
      sliderLowDisplay: '.tk-srch__price-display-low',
      sliderHighDisplay: '.tk-srch__price-display-high',
      filterMoreSelector: '.tk-srch__filter-more',
      filterBodySelector: '.tk-srch__filter-body'
    },
    {
      formId: 'tk-coll-filter-form',
      sortId: 'tk-coll-sort',
      sidebarSelector: '.tk-coll__sidebar',
      mainSelector: '.tk-coll__main',
      sectionWrapperSelector: '.tk-collection-section',
      chipSelectors: '.tk-coll__chip, .tk-coll__chip-clear',
      pageBtnSelector: 'a.tk-coll__page-btn',
      sliderSelector: '.tk-coll__price-slider',
      sliderLowThumb: '.tk-coll__price-thumb--low',
      sliderHighThumb: '.tk-coll__price-thumb--high',
      sliderFill: '.tk-coll__price-fill',
      sliderLowDisplay: '.tk-coll__price-display-low',
      sliderHighDisplay: '.tk-coll__price-display-high',
      filterMoreSelector: '.tk-coll__filter-more',
      filterBodySelector: '.tk-coll__filter-body'
    }
  ];

  // Find the section that's actually on this page
  let cfg = null;
  for (const s of SECTIONS) {
    if (document.getElementById(s.formId)) { cfg = s; break; }
  }
  if (!cfg) return;

  // On /search, tk-algolia-search.js owns everything — back off so we don't
  // double-bind events. Check via property defined on window by that script.
  if (cfg.formId === 'tk-srch-filter-form' && window.tkAlgoliaActive) return;

  // Resolve Shopify section ID from the wrapper element
  const sectionWrapper = document.querySelector(cfg.sectionWrapperSelector)
    ?.closest('[id^="shopify-section-"]');
  const sectionId = sectionWrapper?.id?.replace('shopify-section-', '');
  if (!sectionId) return;

  let currentToken = 0;
  let currentAbort = null;

  function buildUrlFromForm() {
    const form = document.getElementById(cfg.formId);
    if (!form) return location.href;
    const formData = new FormData(form);
    const sortSelect = document.getElementById(cfg.sortId);
    const params = new URLSearchParams();
    for (const [k, v] of formData.entries()) {
      if (v !== '' && v !== null && v !== undefined) params.append(k, v);
    }
    if (sortSelect && sortSelect.value) {
      params.set('sort_by', sortSelect.value);
    }
    const qs = params.toString();
    return location.pathname + (qs ? '?' + qs : '');
  }

  async function applyUrl(url, focusEl) {
    const myToken = ++currentToken;
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();

    const fetchUrl = url + (url.includes('?') ? '&' : '?')
      + 'section_id=' + encodeURIComponent(sectionId);

    const mainEl = document.querySelector(cfg.mainSelector);
    if (mainEl) mainEl.classList.add('is-loading');

    try {
      const res = await fetch(fetchUrl, { signal: currentAbort.signal });
      if (!res.ok) throw new Error('Fetch failed: ' + res.status);
      const html = await res.text();
      if (myToken !== currentToken) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newSidebar = doc.querySelector(cfg.sidebarSelector);
      const newMain = doc.querySelector(cfg.mainSelector);
      const currentSidebar = document.querySelector(cfg.sidebarSelector);
      const currentMain = document.querySelector(cfg.mainSelector);

      if (newSidebar && currentSidebar) currentSidebar.replaceWith(newSidebar);
      if (newMain && currentMain) currentMain.replaceWith(newMain);

      reinitSliders();
      reinitFilterMoreButtons();

      const newForm = document.getElementById(cfg.formId);
      if (newForm) newForm.dataset.liveEnabled = 'true';

      // Restore focus to the same control if possible
      if (focusEl && focusEl.name) {
        const valuePart = focusEl.value
          ? `[value="${CSS.escape(focusEl.value)}"]`
          : '';
        const newEl = document.querySelector(
          `[name="${CSS.escape(focusEl.name)}"]${valuePart}`
        );
        if (newEl && typeof newEl.focus === 'function') {
          newEl.focus({ preventScroll: true });
        }
      }

      history.pushState({}, '', url);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('[tk-live-filter] apply failed', e);
    } finally {
      const m = document.querySelector(cfg.mainSelector);
      if (m) m.classList.remove('is-loading');
    }
  }

  // Re-bind dual-thumb price slider behavior after DOM replacement
  function reinitSliders() {
    document.querySelectorAll(cfg.sliderSelector).forEach(slider => {
      if (slider.dataset.tkSliderBound === 'true') return;
      slider.dataset.tkSliderBound = 'true';

      const min = parseFloat(slider.dataset.min);
      const max = parseFloat(slider.dataset.max);
      const lowThumb = slider.querySelector(cfg.sliderLowThumb);
      const highThumb = slider.querySelector(cfg.sliderHighThumb);
      const fill = slider.querySelector(cfg.sliderFill);
      const lowDisplay = slider.querySelector(cfg.sliderLowDisplay);
      const highDisplay = slider.querySelector(cfg.sliderHighDisplay);
      const lowInput = slider.querySelector('[data-price-min-input]');
      const highInput = slider.querySelector('[data-price-max-input]');
      if (!lowThumb || !highThumb) return;

      function update(activeThumb) {
        let lo = parseFloat(lowThumb.value);
        let hi = parseFloat(highThumb.value);
        if (lo >= hi) {
          if (activeThumb === 'low') { lo = hi - 1; lowThumb.value = lo; }
          else { hi = lo + 1; highThumb.value = hi; }
        }
        const range = max - min;
        const lowPct = range ? ((lo - min) / range) * 100 : 0;
        const highPct = range ? ((hi - min) / range) * 100 : 100;
        if (fill) {
          fill.style.left = lowPct + '%';
          fill.style.right = (100 - highPct) + '%';
        }
        if (lowDisplay) lowDisplay.textContent = '$' + lo;
        if (highDisplay) highDisplay.textContent = '$' + hi;
        if (lowInput) lowInput.value = lo === min ? '' : Math.round(lo);
        if (highInput) highInput.value = hi === max ? '' : Math.round(hi);
      }

      lowThumb.addEventListener('input', () => update('low'));
      highThumb.addEventListener('input', () => update('high'));
      update();
    });
  }

  function reinitFilterMoreButtons() {
    document.querySelectorAll(cfg.filterMoreSelector).forEach(btn => {
      if (btn.dataset.tkMoreBound === 'true') return;
      btn.dataset.tkMoreBound = 'true';
      btn.addEventListener('click', e => {
        e.preventDefault();
        const body = btn.closest(cfg.filterBodySelector);
        if (!body) return;
        const expanded = body.classList.toggle('is-expanded');
        btn.textContent = expanded ? btn.dataset.lessLabel : btn.dataset.moreLabel;
      });
    });
  }

  // ───── Event delegation: survives DOM replacement ─────

  // Filter form changes
  document.addEventListener('change', (e) => {
    const form = e.target.closest('#' + cfg.formId);
    if (!form) return;
    // Sort dropdown is OUTSIDE the form, so handled separately below
    applyUrl(buildUrlFromForm(), e.target);
  });

  // Sort dropdown
  document.addEventListener('change', (e) => {
    if (e.target.id !== cfg.sortId) return;
    applyUrl(buildUrlFromForm(), e.target);
  });

  // Active chip × removal + Clear all (both have href URLs)
  document.addEventListener('click', (e) => {
    const chip = e.target.closest(cfg.chipSelectors);
    if (!chip || !chip.href) return;
    e.preventDefault();
    applyUrl(chip.href);
  });

  // Pagination
  document.addEventListener('click', (e) => {
    const pageBtn = e.target.closest(cfg.pageBtnSelector);
    if (!pageBtn || !pageBtn.href) return;
    e.preventDefault();
    applyUrl(pageBtn.href).then(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Browser back / forward navigation
  window.addEventListener('popstate', () => {
    applyUrl(location.pathname + location.search);
  });

  // Init: mark form as live-enabled so CSS can hide Apply button
  function markLiveEnabled() {
    const form = document.getElementById(cfg.formId);
    if (form) form.dataset.liveEnabled = 'true';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markLiveEnabled);
  } else {
    markLiveEnabled();
  }
})();
