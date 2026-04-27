/* global debounce */

if (!customElements.get('product-form')) {
  class ProductForm extends HTMLElement {
    constructor() {
      super();
      if (this.hasChildNodes()) this.init();
    }

    init() {
      this.form = this.querySelector('.js-product-form');
      if (this.form) {
        this.cartDrawer = document.querySelector('cart-drawer');
        this.form.addEventListener('submit', this.handleSubmit.bind(this));

        if (this.dataset.showQuantitySelector) {
          this.quantitySelector = this.querySelector('quantity-input');

          if (this.quantitySelector) {
            this.quantityInput = this.quantitySelector.querySelector('.qty-input__input');
            this.quantitySelector.addEventListener('change', debounce(this.handleChange.bind(this)));
            this.lineItemChangeListener = this.lineItemChangeListener
              || this.handleLineItemChange.bind(this);
            document.addEventListener('on:line-item:change', (evt) => {
              this.lineItemChangeListener(evt);
            });
          }
        }

        this.setMaximumInputQuantity();
        this.handleQuantityButtonState();
        document.addEventListener('on:variant:change', this.setMaximumInputQuantity.bind(this));
      }
    }

    disconnectedCallback() {
      document.removeEventListener('on:line-item:change', this.lineItemChangeListener);
    }

    /**
     * Sets the max attribute of the quantity input
     */
    setMaximumInputQuantity() {
      const productInfo = this.closest('.product-info') || this.closest('quick-add-drawer');
      if (productInfo) {
        const quantitySelector = this.querySelector('quantity-input');
        if (quantitySelector) {
          const quantityInput = quantitySelector.querySelector('.qty-input__input');
          const dataEl = productInfo.querySelector('.js-inventory-data');
          if (dataEl) {
            const inventory = JSON.parse(dataEl.textContent);

            if (inventory) {
              if (inventory.inventory_management && inventory.inventory_quantity > 0 && inventory.inventory_policy !== 'continue') {
                quantityInput.max = inventory.inventory_quantity;

                const currentQuantity = Number(quantityInput.value);
                if (currentQuantity > 1 && currentQuantity > inventory.inventory_quantity) {
                  quantityInput.value = quantityInput.max;
                }
              }
            }
          }

          const minusButton = quantitySelector.querySelector('.btn--minus');
          const plusButton = quantitySelector.querySelector('.btn--plus');
          ProductForm.setQuantityButtonState(null, quantityInput, minusButton, plusButton);
        }
      }
    }

    /**
     * Sets the max attribute of the quantity input
     */
    handleQuantityButtonState() {
      const productInfo = this.closest('.product-info') || this.closest('quick-add-drawer');
      if (productInfo) {
        const quantitySelector = this.querySelector('quantity-input');
        if (quantitySelector) {
          const quantityInput = quantitySelector.querySelector('.qty-input__input');
          const minusButton = quantitySelector.querySelector('.btn--minus');
          const plusButton = quantitySelector.querySelector('.btn--plus');

          plusButton.addEventListener('click', () => {
            ProductForm.setQuantityButtonState('up', quantityInput, minusButton, plusButton);
          });

          minusButton.addEventListener('click', () => {
            ProductForm.setQuantityButtonState('down', quantityInput, minusButton, plusButton);
          });

          ProductForm.setQuantityButtonState(null, quantityInput, minusButton, plusButton);
        }
      }
    }

    static setQuantityButtonState(direction, quantityInput, minusButton, plusButton) {
      const currentQuantity = Number(quantityInput.value);
      const max = Number(quantityInput.max);
      const min = Number(quantityInput.min);

      let newQuantity = currentQuantity;

      if (direction === 'up') {
        newQuantity = currentQuantity + 1;
      } else if (direction === 'down') {
        newQuantity = currentQuantity - 1;
      }

      // Enable or disable buttons based on the newQuantity relative to max and min
      minusButton.disabled = newQuantity <= min;
      plusButton.disabled = max > 0 && newQuantity >= max;
    }

    /**
     * Handles 'change' events on the line item (dispatched by the theme).
     * @param {object} evt - Event object.
     */
    handleLineItemChange(evt) {
      if (evt.detail.variantId.toString() === this.dataset.variantId) {
        debounce(this.updateQuantityState(evt.detail.newQuantity));
      }
    }

    /**
     * Handles 'change' events on the quantity-input element.
     * @param {object} evt - Event object.
     */
    handleChange(evt) {
      this.updateQuantity(evt.target.value);
    }

    /**
     * Handles submission of the product form.
     * @param {object} evt - Event object.
     */
    async handleSubmit(evt) {
      if (evt.target.id === 'product-signup_form') return;

      evt.preventDefault();

      this.submitBtn = this.querySelector('[name="add"]');

      if (this.submitBtn.getAttribute('aria-disabled') === 'true') return;

      if (theme.settings.vibrateOnATC && window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      this.errorMsg = null;
      this.setErrorMsgState();

      // Disable "Add to Cart" button until submission is complete.
      this.submitBtn.setAttribute('aria-disabled', 'true');
      this.submitBtn.classList.add('is-loading');

      const formData = new FormData(this.form);
      let sections = 'cart-icon-bubble';
      if (this.cartDrawer) {
        sections += `,${this.cartDrawer.closest('.shopify-section').id.replace('shopify-section-', '')}`;
      }

      // Get all quick order lists on the page
      const quickOrderSections = [];
      document.querySelectorAll('quick-order-list').forEach((quickOrderList) => {
        const closestSection = quickOrderList.closest('.shopify-section');
        if (closestSection) {
          const sectionId = closestSection.id.replace('shopify-section-', '');
          // sections.push({
          //   id: `quick-order-list_${sectionId}`,
          //   section: sectionId,
          //   selector: `#quick-order-list_${sectionId}`
          // });
          sections += `,${sectionId}`;
        }
      });

      formData.append('sections_url', window.location.pathname);
      formData.append('sections', sections);

      const fetchRequestOpts = {
        method: 'POST',
        headers: {
          Accept: 'application/javascript',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      };

      try {
        const oldCartResponse = await fetch(`${theme.routes.cart}.js`);
        if (!oldCartResponse.ok) throw new Error(oldCartResponse.status);
        const oldCartData = await oldCartResponse.json();

        const response = await fetch(theme.routes.cartAdd, fetchRequestOpts);
        const data = await response.json();
        let error = typeof data.description === 'string' ? data.description : data.message;
        if (data.errors && typeof data.errors === 'object') {
          error = Object.entries(data.errors).map((item) => item[1].join(', '));
        }

        if (data.status) this.setErrorMsgState(error);

        if (!response.ok) throw new Error(response.status);

        if (theme.settings.afterAtc === 'page') {
          // Allow the tick animation to complete
          setTimeout(() => {
            window.location.href = theme.routes.cart;
          }, 300);
        } else {
          // Update cart icon count.
          ProductForm.updateCartIcon(data);

          // If item was added from Quick Add drawer, show "Added to cart" message.
          const quickAddDrawer = this.closest('quick-add-drawer');
          if (quickAddDrawer) quickAddDrawer.addedToCart();

          setTimeout(() => {
            // Update cart drawer contents.
            if (this.cartDrawer) {
              this.cartDrawer.renderContents(
                data,
                !quickAddDrawer && ((theme.settings.afterAtc === 'drawer_desktop' && theme.mediaMatches.md)
                  || theme.settings.afterAtc === 'drawer')
              );

              // Update the quick order lists on the page
              if (quickOrderSections.length) {
                quickOrderSections.forEach((quickOrderSection) => {
                  const sectionEl = document.getElementById(quickOrderSection.id);
                  if (!sectionEl) return;

                  const el = sectionEl.querySelector(quickOrderSection.selector) || sectionEl;
                  el.innerHTML = ProductForm.getElementHTML(
                    data.sections[quickOrderSection.section],
                    quickOrderSection.selector
                  );
                });
              }
            } else if (window.location.pathname === theme.routes.cart) {
              const cartItems = document.querySelector('cart-items');
              if (cartItems) {
                if (cartItems.dataset.empty === 'true') {
                  window.location.reload();
                } else {
                  cartItems.refreshCartItems();
                }
              }
            }
          }, 700);
        }

        const itemInOldCart = oldCartData.items.filter(
          (item) => item.variant_id === data.variant_id
        )[0];

        let newQuantity = 1;

        // Check if product was already in the cart
        if (itemInOldCart) {
          newQuantity = (itemInOldCart.quantity === data.quantity)
            ? itemInOldCart.quantity : data.quantity;
          this.dispatchEvent(new CustomEvent('on:line-item:change', {
            bubbles: true,
            detail: {
              variantId: data.variant_id,
              oldQuantity: itemInOldCart.quantity,
              newQuantity
            }
          }));
        } else {
          this.dispatchEvent(new CustomEvent('on:cart:add', {
            bubbles: true,
            detail: {
              variantId: data.variant_id
            }
          }));

          // Update the quantity selectors if needed
          if (this.quantitySelector) {
            this.setAttribute('data-show-quantity-selector', 'true');
            this.quantityInput.value = newQuantity;
            this.quantitySelector.currentQty = this.quantityInput.dataset.initialValue;
          }
        }
      } catch (error) {
        console.log(error); // eslint-disable-line
        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: this.errorMsg.textContent
          }
        }));

        if (this.cartDrawer) this.cartDrawer.refreshCartDrawer();
      } finally {
        // Re-enable 'Add to Cart' button.
        this.submitBtn.classList.add('is-success');
        this.submitBtn.removeAttribute('aria-disabled');
        setTimeout(() => {
          this.submitBtn.classList.remove('is-loading');
          this.submitBtn.classList.remove('is-success');
        }, 1400);
      }
    }

    /**
     * Updates the cart icon count in the header.
     * @param {object} response - Response JSON.
     */
    static updateCartIcon(response) {
      const cartIconBubble = document.getElementById('cart-icon-bubble');
      if (cartIconBubble) {
        cartIconBubble.innerHTML = response.sections['cart-icon-bubble'];
      }
    }

    updateQuantityState(newQuantity) {
      this.quantityInput.value = newQuantity;
      this.quantitySelector.currentQty = newQuantity;
      this.setAttribute('data-show-quantity-selector', newQuantity > 0 ? 'true' : 'false');
    }

    async updateQuantity(quantity) {
      this.quantitySelector.setAttribute('aria-disabled', 'true');
      const lineErrors = this.querySelector('.js-product-form-errors');

      const fetchRequestOpts = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      };

      fetchRequestOpts.body = JSON.stringify({
        id: this.dataset.variantId,
        quantity
      });

      try {
        const response = await fetch(theme.routes.cartChange, fetchRequestOpts);
        const data = await response.json();

        if (!response.ok) throw new Error(data.errors || response.status);

        lineErrors.innerHTML = '';
        lineErrors.hidden = true;
      } catch (error) {
        if (/^[0-9]+$/.test(error.message)) {
          lineErrors.textContent = theme.strings.cartError;
        } else {
          lineErrors.textContent = error.message;
        }
        lineErrors.hidden = false;
        console.log(error); // eslint-disable-line

        const oldQuantity = parseInt(this.quantityInput.dataset.initialValue, 10);
        this.updateQuantityState(oldQuantity);
      } finally {
        this.updateQuantityState(parseInt(quantity, 10));
        this.quantitySelector.removeAttribute('aria-disabled');
        if (this.cartDrawer) this.cartDrawer.refreshCartDrawer();
      }
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
     * Shows/hides an error message.
     * @param {string} [error=false] - Error to show a message for.
     */
    setErrorMsgState(error = false) {
      this.errorMsg = this.errorMsg || this.querySelector('.js-form-error');
      if (!this.errorMsg) return;

      this.errorMsg.hidden = !error;
      if (error) {
        this.errorMsg.innerHTML = '';
        const errorArray = Array.isArray(error) ? error : [error];
        errorArray.forEach((err, index) => {
          if (index > 0) this.errorMsg.insertAdjacentHTML('beforeend', '<br>');
          this.errorMsg.insertAdjacentText('beforeend', err);
        });
      }
    }
  }

  customElements.define('product-form', ProductForm);
}
