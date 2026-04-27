/* global SideDrawer */

if (!customElements.get('quick-add-drawer')) {
  class QuickAddDrawer extends SideDrawer {
    constructor() {
      super();
      this.content = this.querySelector('.js-product-details');
      this.footer = this.querySelector('.drawer__footer');
      this.footerContent = this.querySelector('.js-footer-content');
      this.notification = this.querySelector('.js-added-to-cart');
      this.backBtn = this.querySelector('.drawer__back-btn');
      this.openCartDrawerLinks = this.querySelectorAll('.js-open-cart-drawer');
      this.cartDrawer = document.querySelector('cart-drawer');
      this.fetch = null;
      this.fetchedUrls = [];
      this.quickAddButtonMouseEnterHandler = this.handleQuickAddButtonMouseEnter.bind(this);
      this.documentClickHandler = this.handleDocumentClick.bind(this);

      document.addEventListener('click', this.documentClickHandler);
      this.addEventListener('on:variant:change', this.handleVariantChange.bind(this));

      this.openCartDrawerLinks.forEach((link) => {
        link.addEventListener('click', this.handleOpenCartClick.bind(this));
      });

      if (theme.device.hasHover && theme.mediaMatches.md) {
        document.querySelectorAll('.js-quick-add').forEach((button) => {
          this.bindQuickAddButtonMouseEnter(button);
        });

        if ('MutationObserver' in window) {
          this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              // Add event listener to new buttons
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  node.querySelectorAll('.js-quick-add').forEach((button) => {
                    this.bindQuickAddButtonMouseEnter(button);
                  });
                }
              });

              // Remove event listener from removed buttons
              mutation.removedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  node.querySelectorAll('.js-quick-add').forEach((button) => {
                    button.removeEventListener('mouseenter', this.quickAddButtonMouseEnterHandler);
                  });
                }
              });
            });
          });

          // Start observing changes to the DOM
          this.observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.documentClickHandler);
      document.querySelectorAll('.js-quick-add').forEach((button) => {
        button.removeEventListener('mouseenter', this.quickAddButtonMouseEnterHandler);
      });
      if (this.observer) this.observer.disconnect();
    }

    /**
     * Bind a mouseenter event to a given quick add button if it's not already bound
     * @param {Element} button - The button element to bind the mouseenter event to.
     */
    bindQuickAddButtonMouseEnter(button) {
      if (!button.dataset.quickAddListenerAdded) {
        button.dataset.quickAddListenerAdded = 'true';
        button.addEventListener('mouseenter', this.quickAddButtonMouseEnterHandler);
      }
    }

    /**
     * Start the fetch on hover of a quick add button for perceived performance gains
     * @param {object} evt - Event object.
     */
    handleQuickAddButtonMouseEnter(evt) {
      if (!this.fetchedUrls.includes(evt.target.dataset.productUrl)) {
        this.fetch = {
          url: evt.target.dataset.productUrl,
          promise: fetch(evt.target.dataset.productUrl)
        };
        this.fetchedUrls.push(evt.target.dataset.productUrl);
      }
    }

    /**
     * Handles 'click' events on success notification's 'View cart' link
     * @param {object} evt - Event object.
     */
    handleOpenCartClick(evt) {
      // Open the cart drawer if available on the page
      if (this.cartDrawer) {
        evt.preventDefault();
        this.cartDrawer.open();
      } else if (window.location.pathname === theme.routes.cart) {
        evt.preventDefault();
        this.close();
      }
    }

    /**
     * Handles 'click' events on the document.
     * @param {object} evt - Event object.
     */
    handleDocumentClick(evt) {
      if (!evt.target.matches('.js-quick-add')) return;

      // Close the cart drawer if it's open
      if (this.cartDrawer && this.cartDrawer.ariaHidden === 'false') {
        const overlay = document.querySelector('.js-overlay.is-visible');
        if (overlay) overlay.style.transitionDelay = '200ms';

        this.cartDrawer.close();

        // Wait a few ms for a more optimal ux/animation
        setTimeout(() => {
          this.backBtn.hidden = false;
          this.open(evt.target);
          if (overlay) overlay.style.transitionDelay = '';
        }, 200);
      } else {
        this.open(evt.target);
      }
    }

    /**
     * Handles 'on:variant:change' events on the Quick Add drawer.
     * @param {object} evt - Event object.
     */
    handleVariantChange(evt) {
      let url = this.productUrl;

      if (evt.detail.variant) {
        const separator = this.productUrl.split('?').length > 1 ? '&' : '?';
        url += `${separator}variant=${evt.detail.variant.id}`;
      }

      this.querySelectorAll('.js-prod-link').forEach((link) => {
        link.href = url;
      });

      if (evt.detail.variant && evt.detail.variant.featured_media) {
        this.updateMedia(evt.detail.variant.featured_media);
      }
    }

    /**
     * Opens the drawer and fetches the product details.
     * @param {Element} opener - Element that triggered opening of the drawer.
     */
    async open(opener) {
      opener.setAttribute('aria-disabled', 'true');

      if (this.notification) this.notification.hidden = true;

      // If it's the same product as previously shown, there's no need to re-fetch the details.
      if (this.productUrl && this.productUrl === opener.dataset.productUrl) {
        super.open(opener);
        if (opener.dataset.selectedColor) this.setActiveVariant(opener);
        opener.removeAttribute('aria-disabled');
        return;
      }

      this.productUrl = opener.dataset.productUrl;
      this.content.innerHTML = '';
      this.classList.add('is-loading');
      this.content.classList.add('drawer__content--out');
      this.footer.classList.add('drawer__footer--out');

      super.open(opener);

      if (!this.fetch || this.fetch.url !== opener.dataset.productUrl) {
        this.fetch = {
          url: opener.dataset.productUrl,
          promise: fetch(opener.dataset.productUrl)
        };
      }

      const response = await this.fetch.promise;
      if (response.ok) {
        const tmpl = document.createElement('template');
        tmpl.innerHTML = await response.text();
        this.productEl = tmpl.content.getElementById('quick-buy-template').content.querySelector('.js-product');
        this.renderProduct(opener);
      }

      this.fetch = null;

      opener.removeAttribute('aria-disabled');
    }

    /**
     * Closes the cart drawer.
     */
    close() {
      super.close(() => {
        this.backBtn.hidden = true;
      });
    }

    /**
     * Renders the product details.
     * @param {Element} opener - Element that triggered opening of the drawer.
     */
    renderProduct(opener) {
      QuickAddDrawer.convertToQuickBuyContent(this.productEl, this.productUrl);

      this.updateFooter();
      this.updateContent();

      if (opener.dataset.selectedColor) {
        // Timeout to allow the VariantPicker to initialize
        setTimeout(this.setActiveVariant.bind(this, opener), 10);
      }
      window.initLazyImages();
    }

    /**
     * Set color variant to match the one selected in the card.
     * @param {Element} opener - Element that triggered opening of the drawer.
     */
    setActiveVariant(opener) {
      const colorOptionBox = this.querySelector(`.opt-btn[value="${opener.dataset.selectedColor}"]`);
      if (colorOptionBox) {
        this.querySelector(`.opt-btn[value="${opener.dataset.selectedColor}"]`)
          .click();
      } else {
        const colorOptionDropdown = this.querySelector(
          `.custom-select__option[data-value="${opener.dataset.selectedColor}"]`
        );
        if (colorOptionDropdown) {
          const customSelect = colorOptionDropdown.closest('custom-select');
          customSelect.selectOption(colorOptionDropdown);
        }
      }
    }

    /**
     * Updates the product media.
     * @param {string} media - Variant featured media object.
     */
    updateMedia(media) {
      if (!media) return;

      const { src } = media.preview_image;
      const container = this.querySelector('.quick-add-info__media');
      const width = container.offsetWidth;
      const aspectRatio = media.preview_image.aspect_ratio;

      const existingId = container.dataset.mediaId;
      const existingImg = container.querySelector('img');

      if (!existingImg || existingId !== `${media.id}`) {
        container.innerHTML = `
          <img src="${src}&width=${width}" srcset="${src}&width=${width}, ${src}&width=${width * 2} 2x" width="${width * 2}" height="${(width * 2) / aspectRatio}" alt="${media.alt || ''}">
        `;
        container.dataset.mediaId = media.id;
      }
    }

    /**
     * Renders the markup for the drawer content element.
     */
    updateContent() {
      const productContent = this.productEl.querySelector('.js-product-details');
      if (productContent) {
        this.content.innerHTML = productContent.innerHTML;
      }

      this.classList.remove('is-loading');
      this.content.classList.remove('drawer__content--out');
    }

    /**
     * Renders the markup for the drawer footer element.
     */
    updateFooter() {
      const footerContent = this.productEl.querySelector('.js-footer-content');
      this.footer.classList.remove('quick-add__footer-message');

      if (footerContent && footerContent.hasChildNodes()) {
        this.footerContent.innerHTML = footerContent.innerHTML;
      } else {
        this.footer.classList.add('quick-add__footer-message');
        this.footerContent.innerHTML = `
          <div class="alert quick-add__alert bg-info-bg text-info-text">
            <div class="flex">
              <div>
                <svg class="icon icon--price_tag" width="32" height="32" viewBox="0 0 16 16" aria-hidden="true" focusable="false" role="presentation">
                  <path fill="currentColor" d="M7.59 1.34a1 1 0 01.7-.29h5.66a1 1 0 011 1v5.66a1 1 0 01-.3.7L7.6 15.5a1 1 0 01-1.42 0L.52 9.83a1 1 0 010-1.42l7.07-7.07zm6.36 6.37l-7.07 7.07-5.66-5.66L8.3 2.05h5.66v5.66z" fill-rule="evenodd"/>
                  <path fill="currentColor" d="M9.7 6.3a1 1 0 101.42-1.42 1 1 0 00-1.41 1.41zM9 7a2 2 0 102.83-2.83A2 2 0 009 7z" fill-rule="evenodd"/>
                </svg>
              </div>
              <div>
                <p class="text-h6 font-bold mb-2">${theme.strings.awaitingSale}</p>
                <a class="link js-prod-link" href="${this.productUrl}">${theme.strings.viewDetails}</a>
              </div>
            </div>
          </div>`;
      }

      this.footer.classList.remove('drawer__footer--out');
    }

    /**
     * Shows an "Added to cart" message in the drawer.
     */
    addedToCart() {
      if (this.notification) {
        setTimeout(() => {
          this.notification.hidden = false;
        }, 300);

        setTimeout(() => {
          this.notification.hidden = true;
        }, this.notification.dataset.visibleFor);
      }
    }

    /**
     * Convert product template content to quick buy content.
     * @param {Element} container - Container element containing new content to use.
     */
    static convertToQuickBuyContent(container) {
      // Prevent variant picker from updating the URL on change.
      const variantPicker = container.querySelector('variant-picker');
      if (variantPicker) {
        variantPicker.dataset.updateUrl = 'false';
      }

      // Remove size chart modal and link (if they exist).
      const sizeChartModal = container.querySelector('[data-modal="size-chart"]');
      if (sizeChartModal) {
        sizeChartModal.remove();
      }
    }
  }

  customElements.define('quick-add-drawer', QuickAddDrawer);

  window.theme = window.theme || {};
  window.theme.quickBuy = window.theme.quickBuy || {};
  window.theme.quickBuy.convertToQuickBuyContent = QuickAddDrawer.convertToQuickBuyContent;
}
