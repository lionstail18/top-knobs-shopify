/**
 * Loads a script.
 * @param {string} src - Url of script to load.
 * @returns {Promise}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

/* global DetailsDisclosure, trapFocus, removeTrapFocus */

if (!customElements.get('cart-drawer-disclosure')) {
  class CartDrawerDisclosure extends DetailsDisclosure {
    constructor() {
      super();
      this.openBtn = this.querySelector('summary');
      this.closeBtn = this.querySelector('.js-close');
      this.overlay = document.getElementById('cart-drawer').querySelector('.overlay');
    }

    /**
     * Handles 'click' events on the custom element.
     * @param {object} evt - Event object.
     */
    handleClick(evt) {
      if (!evt.target.matches('.js-close')) return;
      this.close();
    }

    /**
     * Opens the details element.
     */
    open() {
      this.overlay.classList.add('is-visible');
      super.open();
      trapFocus(this);

      // Create event handler variables (so the bound event listeners can be removed).
      this.clickHandler = this.clickHandler || this.handleClick.bind(this);
      this.keyupHandler = (evt) => evt.key === 'Escape' && this.close();

      // Add event listeners (for while disclosure is open).
      this.addEventListener('click', this.clickHandler);
      this.addEventListener('keyup', this.keyupHandler);
      this.overlay.addEventListener('click', this.clickHandler);
    }

    /**
     * Closes the details element.
     */
    close() {
      this.overlay.classList.remove('is-visible');
      super.close();
      removeTrapFocus(this.openBtn);

      this.removeEventListener('click', this.clickHandler);
      this.removeEventListener('keyup', this.keyupHandler);
      this.overlay.removeEventListener('click', this.clickHandler);
    }
  }

  customElements.define('cart-drawer-disclosure', CartDrawerDisclosure);
}

/* global DockableSideDrawer */

if (!customElements.get('cart-drawer')) {
  class CartDrawer extends DockableSideDrawer {
    constructor() {
      super();

      this.cartSummary = this.querySelector('.cart-drawer__summary');
      this.init();
      this.bindEvents();
    }

    disconnectedCallback() {
      document.removeEventListener('dispatch:cart-drawer:refresh', this.refreshHandler);
      document.removeEventListener('on:bfcache:load-restore', this.refreshHandler);
      document.removeEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
      document.removeEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);

      if (Shopify.designMode) {
        document.removeEventListener('shopify:section:select', this.sectionSelectHandler);
        document.removeEventListener('shopify:section:deselect', this.sectionDeselectHandler);
      }

      if (this.dcbLoadedHandler) {
        document.removeEventListener('shopify:payment_button:loaded', this.dcbLoadedHandler);
      }
    }

    init() {
      const cartIcon = document.getElementById('cart-icon');
      if (cartIcon) {
        cartIcon.setAttribute('role', 'button');
        cartIcon.setAttribute('aria-haspopup', 'dialog');

        cartIcon.addEventListener('click', (evt) => {
          if (!this.isDocked) {
            evt.preventDefault();
            this.open(cartIcon);
          }
        });

        cartIcon.addEventListener('keydown', (evt) => {
          if (!this.isDocked) {
            if (evt.key !== ' ') return;
            evt.preventDefault();
            this.open(cartIcon);
          }
        });
      }
    }

    bindEvents() {
      if (Shopify.designMode) {
        this.sectionSelectHandler = this.handleSectionSelect.bind(this);
        this.sectionDeselectHandler = this.handleSectionDeselect.bind(this);
        document.addEventListener('shopify:section:select', this.sectionSelectHandler);
        document.addEventListener('shopify:section:deselect', this.sectionDeselectHandler);
      }

      this.openDrawerViaEventHandler = this.handleDrawerOpenViaEvent.bind(this);
      this.closeDrawerViaEventHandler = this.close.bind(this, null);
      this.addEventListener('click', this.handleEmptyCart.bind(this));

      document.addEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
      document.addEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);

      if (this.cartSummary.classList.contains('cart-drawer--checkout--sticky-true')) {
        this.dcbLoadedHandler = this.dcbLoadedHandler || CartDrawer.recalculateCssVarHeights;
        document.addEventListener('shopify:payment_button:loaded', this.dcbLoadedHandler);
      }

      this.refreshHandler = this.refreshCartDrawer.bind(this);
      document.addEventListener('dispatch:cart-drawer:refresh', this.refreshHandler);
      document.addEventListener('on:bfcache:load-restore', this.refreshHandler);
    }

    /**
     * Clears the cart
     * @param {object} evt - Event object.
     */
    handleEmptyCart(evt) {
      if (evt.target.matches('.js-empty-cart')) {
        evt.preventDefault();

        // eslint-disable-next-line no-alert, no-restricted-globals
        if (confirm(theme.strings.confirmEmptyCart)) {
          this.querySelectorAll('.cart-item').forEach((cartItem, index) => {
            setTimeout(() => cartItem.classList.add('cart-item--out'), index * 50);
          });

          try {
            fetch(`${theme.routes.cartClear}.js`, {
              method: 'POST'
            }).then((response) => {
              if (!response.ok) throw new Error(response.status);

              // Broadcast individual events to update product cards
              this.querySelectorAll('.cart-item').forEach((cartItem) => {
                this.dispatchEvent(new CustomEvent('on:line-item:change', {
                  bubbles: true,
                  detail: {
                    variantId: cartItem.dataset.variantId,
                    newQuantity: 0
                  }
                }));
              });

              this.refreshCartDrawer();
            });
          } catch (error) {
            console.log('Error clearing cart:', error); // eslint-disable-line
            window.location.href = evt.target.href;
          }
        }
      }
    }

    /**
     * Handle when the section is selected in the Theme Editor
     * @param {object} evt - Event object.
     */
    handleSectionSelect(evt) {
      if (evt.target === this.closest('.shopify-section')) this.open();
    }

    /**
     * Handle when the section is de-selected in the Theme Editor
     * @param {object} evt - Event object.
     */
    handleSectionDeselect(evt) {
      if (evt.target === this.closest('.shopify-section')) this.close();
    }

    /**
     * Handle when the drawer is opened via an event
     * @param {object} evt - Event object.
     */
    handleDrawerOpenViaEvent(evt) {
      this.open(evt.detail ? evt.detail.opener : null);
    }

    /**
     * Opens the drawer.
     * @param {Element} [opener] - Element that triggered opening of the drawer.
     * @param {Element} [elementToFocus] - Element to focus after drawer opened.
     */
    open(opener, elementToFocus) {
      // Get the quick add drawer web component, if it's currently open and close it
      const quickAddDrawer = document.querySelector('quick-add-drawer[aria-hidden="false"]');
      const overlay = document.querySelector('.js-overlay.is-visible');

      if (quickAddDrawer) {
        if (overlay) overlay.style.transitionDelay = '200ms';
        quickAddDrawer.close();
      }

      // If the cart drawer is open, wait a few ms for a more optimal ux/animation
      setTimeout(() => {
        super.open(opener, elementToFocus, () => {
          if (this.cartSummary.classList.contains('cart-drawer--checkout--sticky-true')) {
            CartDrawer.recalculateCssVarHeights();
          }
        });

        if (this.cartSummary.classList.contains('cart-drawer--checkout--sticky-true')) {
          CartDrawer.recalculateCssVarHeights();
        }

        if (overlay) overlay.style.transitionDelay = '';
      }, quickAddDrawer ? 200 : 0);
      window.initLazyImages();
    }

    /**
     * Attempts to refresh any cart items (if present). Failing that, it refreshes the entire cart
     * drawer
     * @param {boolean} [dontRefreshCartItems=false] - Prevents the refresh of cart items, and does
     * a straight refresh of the whole cart
     */
    async refreshCartDrawer(dontRefreshCartItems) {
      try {
        const cartItems = this.querySelector('cart-items[data-empty="false"]');
        if (cartItems && !dontRefreshCartItems) {
          cartItems.refreshCartItems();
        } else {
          const response = this.getSectionsToRender().map((section) => section.section);
          const cartResponse = await fetch(`?sections=${response.join(',')}`);
          const sections = await cartResponse.json();
          this.renderContents({ sections }, false);
          CartDrawer.recalculateCssVarHeights();
        }
      } catch (error) {
        console.log(error); // eslint-disable-line
        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: this.errorMsg ? this.errorMsg.textContent : null
          }
        }));
      }
    }

    /**
     * Renders the contents of the specified sections to update.
     * @param {object} data - Cart data object.
     * @param {boolean} [openDrawer=true] - Open the cart drawer after rendering sections.
     */
    async renderContents(data, openDrawer = true) {
      if (!this.scriptsLoaded) {
        if (!document.querySelector(`script[src="${theme.scripts.cartItems}"]`)) {
          await loadScript(theme.scripts.cartItems);
        }

        if (!document.querySelector(`script[src="${theme.scripts.shippingCalculator}"]`) && this.dataset.shippingCalculator) {
          await loadScript(theme.scripts.countryProvinceSelector);
          await loadScript(theme.scripts.shippingCalculator);
        }

        this.scriptsLoaded = true;
      }

      this.getSectionsToRender().forEach((section) => {
        const el = document.getElementById(section.id);
        if (el) {
          el.innerHTML = CartDrawer.getElementHTML(
            data.sections[section.section],
            section.selector
          );

          // Update the cart drawer quantity
          if (section.id === 'cart-icon-bubble') {
            const drawerCount = document.getElementById('cart-drawer__count');
            if (drawerCount) {
              const html = CartDrawer.getElementHTML(
                data.sections[section.section],
                `${section.selector} .header__cart-count-number`
              );

              drawerCount.innerHTML = `(${html})`;
            }
          }
        }
      });

      if (openDrawer && this.getAttribute('open') === null) {
        setTimeout(() => this.open());
      }

      window.initLazyImages();
      CartDrawer.recalculateCssVarHeights();
    }

    /**
     * Returns an array of objects containing required section details.
     * @returns {Array}
     */
    getSectionsToRender() {
      const sections = [
        {
          id: 'cart-drawer',
          section: this.closest('.shopify-section').id.replace('shopify-section-', ''),
          selector: 'cart-drawer'
        },
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section'
        }
      ];

      // Append any quick order lists to the sections
      document.querySelectorAll('quick-order-list').forEach((quickOrderList) => {
        const closestSection = quickOrderList.closest('.shopify-section');
        if (closestSection) {
          const sectionId = closestSection.id.replace('shopify-section-', '');
          sections.push({
            id: `quick-order-list_${sectionId}`,
            section: sectionId,
            selector: `#quick-order-list_${sectionId}`
          });
        }
      });

      return sections;
    }

    /**
     * Dispatches an event to recalculate the data-css-var-heights on the page. Useful for
     * updating the height of the sticky cart buttons
     */
    static recalculateCssVarHeights() {
      window.requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('on:css-var-height:update'));
      });
    }

    /**
     * Gets the innerHTML of an element.
     * @param {string} html - Section HTML.
     * @param {string} selector - CSS selector for the element.
     * @returns {string}
     */
    static getElementHTML(html, selector) {
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html;

      return tmpl.content.querySelector(selector).innerHTML;
    }
  }

  customElements.define('cart-drawer', CartDrawer);
}
