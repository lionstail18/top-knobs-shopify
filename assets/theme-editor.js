const ccThemeRole = Shopify.theme.role ?? 'unknown';
const ccLSCheckKey = `cc-settings-loaded-${theme.info?.name ?? ''}`;
if (!localStorage.getItem(ccLSCheckKey) || localStorage.getItem(ccLSCheckKey) !== ccThemeRole) {
  const decode = (t) => new DOMParser().parseFromString(t, 'text/html').documentElement.textContent.trim();

  const getStoreName = () => {
    const ogContent = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (ogContent) return decode(ogContent);

    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of scripts) {
      try {
        const data = [].concat(JSON.parse(script.textContent));
        const name = data.find((obj) => obj?.['@type']?.toLowerCase() === 'organization')?.name;
        if (name) return decode(String(name));
      } catch (e) { /* Skip */ }
    }

    return document.title?.split(/\s[–—\-|]\s/).pop()?.trim() || '';
  };

  fetch('https://check.cleancanvas.co.uk/', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    mode: 'cors',
    body: new URLSearchParams({
      shop: Shopify.shop,
      theme: theme.info?.name ?? '',
      version: theme.info?.version ?? '',
      role: ccThemeRole,
      storeName: getStoreName(),
      country: Shopify.country,
      contact: document.querySelector('script[src*=theme-editor][data-contact]')?.dataset.contact
    })
  })
    .then((response) => {
      if (response.ok) {
        localStorage.setItem(ccLSCheckKey, ccThemeRole);
      }
    });
}

document.addEventListener('shopify:section:load', (evt) => {
  window.initLazyImages();

  // Load and evaluate section specific scripts immediately.
  evt.target.querySelectorAll('script[src]').forEach((script) => {
    const s = document.createElement('script');
    s.src = script.src;
    document.body.appendChild(s);
  });

  // If loaded section is a pop-up, open it.
  if (evt.target.matches('.cc-pop-up')) {
    customElements.whenDefined('pop-up').then(() => {
      evt.target.querySelector('pop-up').open();
    });
  }

  theme.fetchCache.clear();
});

document.addEventListener('shopify:block:select', (evt) => {
  // If selected block is a slideshow slide, show it and pause autoplay (if enabled).
  if (evt.target.matches('.slideshow__slide')) {
    const slideshow = evt.target.closest('slide-show');

    setTimeout(() => {
      slideshow.setActiveSlide(Number(evt.target.dataset.index));
      slideshow.pauseAutoplay();
    }, 200);
  }

  // If selected block is a slider item, scroll to it.
  if (evt.target.matches('.slider__item')) {
    const carousel = evt.target.closest('carousel-slider');
    if (!carousel.slider) return;

    carousel.slider.scrollTo({
      left: carousel.slides[Array.from(carousel.slides).indexOf(evt.target)].offsetLeft,
      behavior: 'smooth'
    });
  }
});

document.addEventListener('shopify:block:deselect', (evt) => {
  // If deselected block is a slideshow slide, resume autoplay (if enabled).
  if (evt.target.matches('.slideshow__slide')) {
    const slideshow = evt.target.closest('slide-show');

    setTimeout(() => {
      slideshow.resumeAutoplay();
    }, 200);
  }
});

// Debug out custom events
const customEvents = [
  'on:cart:add',
  'on:variant:change',
  'on:line-item:change',
  'on:cart:error',
  'on:cart-drawer:before-open',
  'on:cart-drawer:after-open',
  'on:cart-drawer:after-close',
  'on:quickbuy:before-open',
  'on:quickbuy:after-open',
  'on:quickbuy:after-close',
  'dispatch:cart-drawer:open',
  'dispatch:cart-drawer:refresh',
  'dispatch:cart-drawer:close'
];
customEvents.forEach((event) => {
  document.addEventListener(event, (evt) => {
    if (event.includes('dispatch:cart-drawer') && theme.settings.cartType !== 'drawer') {
      // eslint-disable-next-line
      console.warn(
        'Canopy Theme: The Cart Drawer is not enabled. To enable it, change Theme Settings > Cart > Cart type.'
      );
    } else {
      // eslint-disable-next-line
      console.info(
        '%cTheme event triggered',
        'background: #000; color: #bada55',
        event,
        evt.detail
      );
    }
  });
});
