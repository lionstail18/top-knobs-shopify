/* global debounce */

if (!customElements.get('quick-order-list')) {
  class QuickOrderList extends HTMLElement {
    constructor() {
      super();
      this.init();
    }

    init() {
      this.fetchRequestOpts = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      };

      this.cartDrawer = document.getElementById('cart-drawer');
      this.itemStatus = document.getElementById('qol-line-item-status');
      this.currentItemCount = Array.from(this.querySelectorAll('[name="updates[]"]'))
        .reduce((total, quantityInput) => total + parseInt(quantityInput.value, 10), 0);

      this.addEventListener('click', this.handleClick.bind(this));
      this.addEventListener('change', debounce(this.handleChange.bind(this)));
    }

    /**
     * Handles 'click' events on the cart items element.
     * @param {object} evt - Event object.
     */
    handleClick(evt) {
      if (!evt.target.matches('.js-remove-item')) return;
      evt.preventDefault();
      this.updateQuantity(evt.target.dataset.index, 0, evt.target.dataset.variantId, evt.target);
    }

    /**
     * Handles 'change' events on the cart items element.
     * @param {object} evt - Event object.
     */
    handleChange(evt) {
      if (evt.target.dataset.index) {
        this.updateQuantity(
          evt.target.dataset.index,
          evt.target.value,
          evt.target.dataset.variantId,
          evt.target
        );
      } else {
        this.addToCart(evt.target.dataset.variantId, evt.target.value);
      }
    }

    async addToCart(variantId, quantity) {
      const requestData = {
        items: [
          {
            id: variantId,
            quantity
          }
        ],
        sections_url: window.location.pathname,
        sections: this.getSectionsToRender().map((section) => section.section)
      };

      let data;
      try {
        // Remove old errors
        this.querySelectorAll('.alert').forEach((alert) => alert.remove());
        this.classList.add('pointer-events-none');

        const response = await fetch(`${theme.routes.cartAdd}.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(requestData)
        });

        data = await response.json();
        if (!response.ok) throw new Error(response);

        // Refresh the entire cart if it's currently empty
        if (this.cartDrawer) this.cartDrawer.refreshCartDrawer();

        this.getSectionsToRender().forEach((section) => {
          const sectionEl = document.getElementById(section.id);
          if (!sectionEl) return;

          const el = sectionEl.querySelector(section.selector) || sectionEl;
          el.innerHTML = QuickOrderList
            .getElementHTML(data.sections[section.section], section.selector);
        });

        this.dispatchEvent(new CustomEvent('on:quick-order-list:update', {
          bubbles: true,
          detail: {
            productId: this.dataset.productId
          }
        }));
      } catch (error) {
        console.error(error); // eslint-disable-line

        // Show errors
        const item = this.querySelector(`[data-variant-id="${variantId}"] .cart-item__details`);
        const msg = document.createElement('div');
        msg.classList.add('alert', 'mt-6', 'bg-error-bg', 'text-error-text');
        msg.textContent = data.description ? data.description : error;
        item.appendChild(msg);
      } finally {
        this.classList.remove('pointer-events-none');
      }
    }

    /**
     * Updates the quantity of a line item.
     * @param {number} line - Line item index.
     * @param {number} quantity - Quantity to set.
     * @param {string} variantId - Variant id being updated.
     * @param {object} quantityElem - The quantity input.
     */
    async updateQuantity(line, quantity, variantId, quantityElem) {
      this.enableLoading();

      const sectionsToRender = this.getSectionsToRender();

      if (this.cartDrawer) {
        const cartDrawerId = this.cartDrawer.closest('.shopify-section').id.replace('shopify-section-', '');
        sectionsToRender.push({
          id: 'cart-drawer',
          section: cartDrawerId,
          selector: '#cart-drawer'
        });
      }

      this.fetchRequestOpts.body = JSON.stringify({
        line,
        quantity,
        sections: sectionsToRender.map((section) => section.section),
        sections_url: window.location.pathname
      });

      let data;

      try {
        // Remove old errors
        this.querySelectorAll('.alert').forEach((alert) => alert.remove());

        const response = await fetch(`${theme.routes.cartChange}`, this.fetchRequestOpts);
        data = await response.json();
        if (!response.ok) throw new Error(response);

        sectionsToRender.forEach((section) => {
          const sectionEl = document.getElementById(section.id);
          if (!sectionEl) return;

          const el = sectionEl.querySelector(section.selector) || sectionEl;
          el.innerHTML = QuickOrderList
            .getElementHTML(data.sections[section.section], section.selector);
        });

        this.dispatchEvent(new CustomEvent('on:quick-order-list:update', {
          bubbles: true,
          detail: {
            productId: this.dataset.productId
          }
        }));

        if (!this.closest('quick-add-drawer')) {
          this.disableLoading();
        }
      } catch (error) {
        console.log(error); // eslint-disable-line

        // Show errors
        const item = this.querySelector(`[data-variant-id="${variantId}"] .cart-item__qty`);
        const msg = document.createElement('div');
        msg.classList.add('alert', 'mt-6', 'bg-error-bg', 'text-error-text');
        msg.textContent = data.errors ? data.errors : error;
        item.appendChild(msg);

        // Update the quantity element
        quantityElem.value = quantityElem.dataset.initialValue;
        quantityElem.closest('quantity-input').currentQty = quantityElem.dataset.initialValue;

        this.disableLoading();
      }
    }

    /**
     * Returns an array of objects containing required section details.
     * @returns {Array}
     */
    getSectionsToRender() {
      return [
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section'
        },
        {
          id: `quick-order-list_${this.dataset.section}`,
          section: this.dataset.section,
          selector: `#quick-order-list_${this.dataset.section}`
        },
        {
          id: 'free-shipping-notice',
          section: 'cart-drawer',
          selector: '.free-shipping-notice'
        }
      ];
    }

    /**
     * Gets the innerHTML of an element.
     * @param {string} html - Section HTML.
     * @param {string} selector - CSS selector for the element to get the innerHTML of.
     * @returns {string}
     */
    static getElementHTML(html, selector) {
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html;

      const el = tmpl.content.querySelector(selector);
      return el ? el.innerHTML : '';
    }

    /**
     * Shows a loading icon over a line item.
     */
    enableLoading() {
      this.classList.add('pointer-events-none');
      document.activeElement.blur();
      this.itemStatus.setAttribute('aria-hidden', 'false');
    }

    /**
     * Stops the loading state
     */
    disableLoading() {
      this.classList.remove('pointer-events-none');
    }
  }

  customElements.define('quick-order-list', QuickOrderList);
}
