/* eslint-disable max-len */
/**
 * Dependencies:
 * - Custom select component
 * - Fetch cache (theme.fetchCache)
 * - Quickbuy content transformer (theme.quickBuy.convertToQuickBuyContent)
 *
 * Required translation strings:
 * - noStock
 * - noVariant
 */

if (!customElements.get('variant-picker')) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
      this.quickBuyContainer = this.closest('.js-quickbuy');
      this.featuredProductContainer = this.closest('.cc-featured-product');
      this.section = this.quickBuyContainer
                     || this.featuredProductContainer
                     || this.closest('.shopify-section');
      this.optionSelectors = this.querySelectorAll('.option-selector:not(.option-selector--custom)');
      this.productAvailable = this.classList.contains('variant-picker--product-available');
      this.variant = this.getVariantData();
      this.variantRequestId = 0;

      this.addListeners();
      this.updateVariantContent();
      if (!this.quickBuyContainer && !this.featuredProductContainer) {
        setTimeout(this.applySearchParams.bind(this), 0);
      }
      this.setAttribute('loaded', '');
    }

    addListeners() {
      this.boundHandleVariantChange = this.handleVariantChange.bind(this);
      this.addEventListener('change', this.boundHandleVariantChange);

      this.boundHandleLabelMouseEnter = this.handleLabelMouseEnter.bind(this);
      this.querySelectorAll('.opt-label, .custom-select__option').forEach((el) => {
        el.addEventListener('mouseenter', this.boundHandleLabelMouseEnter);
        el.addEventListener('touchstart', this.boundHandleLabelMouseEnter, { passive: true, once: true });
        el.addEventListener('mouseleave', VariantPicker.handleLabelMouseLeave);
      });
    }

    removeListeners() {
      this.removeEventListener('change', this.boundHandleVariantChange);
      this.querySelectorAll('.opt-label, .custom-select__option').forEach((el) => {
        el.removeEventListener('mouseenter', this.boundHandleLabelMouseEnter);
        el.removeEventListener('touchstart', this.boundHandleLabelMouseEnter);
        el.removeEventListener('mouseleave', VariantPicker.handleLabelMouseLeave);
      });
    }

    /**
     * Update parts of this component that require JS to display correctly.
     */
    updateVariantContent() {
      this.updateStatusClasses();
      this.updateAddToCartButton();
      this.updateSwatchLabel();
      this.updateAvailability();
    }

    getProductForm() {
      return this.section.querySelector('.js-product-form');
    }

    /**
     * Handles 'mouseenter' events on option labels. Preloads links.
     * @param {object} evt - Event object.
     */
    handleLabelMouseEnter(evt) {
      const label = evt.currentTarget;
      if (label.dataset.preloaded) return; // Preload completed
      if (label.dataset.preloadTimeout) return; // Preload waiting
      if (label.matches('.opt-btn:checked + .opt-label, [aria-selected="true"]')) return; // Already selected

      // Build option array if clicked
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : label;
      const optionIds = this.getSelectedOptionIds();
      const inputOptionIndex = Array.from(this.optionSelectors).indexOf(input.closest('.option-selector'));
      optionIds[inputOptionIndex] = input.dataset.valueId;

      // If all options are selected
      if (optionIds.indexOf(null) === -1) {
        // Wait to predict click-intent and preload link
        label.dataset.preloadTimeout = setTimeout(() => {
          label.dataset.preloaded = true;
          label.removeAttribute('data-preload-timeout');
          const combinedProductUrl = input.dataset.productUrl;
          const url = this.constructVariantUrl(
            combinedProductUrl,
            optionIds,
            input.dataset.variantId
          );
          theme.fetchCache.preload(url.toString());
        }, 250);
      }
    }

    /**
     * Handles 'mouseleave' events on option labels. Cancels link preload if in/out fast.
     * @param {object} evt - Event object.
     */
    static handleLabelMouseLeave(evt) {
      const label = evt.currentTarget;
      clearTimeout(label.dataset.preloadTimeout);
      label.removeAttribute('data-preload-timeout');
    }

    /**
     * Create a URL for fetching a product or variant.
     * @param {string} combinedProductUrl - URL for a combined product. Optional.
     * @param {Array} optionIds - Selected option IDs to include in the URL. Optional.
     * @param {string} variantId - Variant ID to use if not a combined product. Optional.
     * @returns {URL} Variant URL
     */
    constructVariantUrl(combinedProductUrl, optionIds, variantId) {
      let url = null;
      if (combinedProductUrl) {
        url = new URL(combinedProductUrl, window.location.origin);
        url.searchParams.set('option_values', optionIds.join(','));
      } else {
        url = new URL(this.dataset.url, window.location.origin);
      }
      const sectionIds = [this.dataset.sectionId];
      if (!this.quickBuyContainer && !this.featuredProductContainer) {
        document.querySelectorAll('.cc-variant-dependent-section [data-section-id]').forEach((e) => {
          if (e.closest('.rte')) return;
          sectionIds.push(e.dataset.sectionId);
        });
      }
      url.searchParams.set('sections', sectionIds.join(','));
      if (combinedProductUrl || !variantId || optionIds.includes(null)) {
        url.searchParams.set('option_values', optionIds.join(','));
      } else {
        url.searchParams.set('variant', variantId);
      }
      return url;
    }

    /**
     * Handles 'change' events on the variant picker element.
     * @param {object} evt - Event object.
     */
    handleVariantChange(evt) {
      const selectedOptionIds = this.getSelectedOptionIds();

      // Immediately update swatch label
      this.updateSwatchLabel();

      // Construct new variant URL and fetch it, using theme cache
      const combinedProductUrl = evt.target.dataset.productUrl || evt.detail?.productUrl;
      const variantId = evt.target.dataset.variantId || evt.detail?.variantId;
      const url = this.constructVariantUrl(combinedProductUrl, selectedOptionIds, variantId);
      this.variantRequestId += 1;
      const currentRequestId = this.variantRequestId;

      theme.fetchCache.fetch(url.toString())
        .then((responseText) => {
          if (currentRequestId !== this.variantRequestId) return;

          const responseData = JSON.parse(responseText);

          // Update content
          Object.entries(responseData).forEach(([section, htmlStr]) => {
            const html = new DOMParser().parseFromString(htmlStr, 'text/html');
            const sectionId = `shopify-section-${section}`;
            let target = this.section;
            let newContent = html.getElementById(sectionId);

            if (this.section.id !== sectionId) {
              if (!this.quickBuyContainer) {
                target = document.getElementById(sectionId);
              } else {
                const quickBuyTemplate = html.getElementById('quick-buy-template')?.content.querySelector('.js-product');
                if (quickBuyTemplate) newContent = quickBuyTemplate;
              }
            }

            this.updateContent(target, newContent, combinedProductUrl);
          });

          // Restore focus
          if (!evt.detail?.noFocus) {
            document.querySelector(`#${evt.target.id}-button, input#${evt.target.id}`)?.focus();
          }

          // Update URL and announce changes
          const newVariantPicker = this.section.querySelector('variant-picker');
          setTimeout(() => newVariantPicker.announceChange(), 10);
        });
    }

    /**
     * Announces the current variant after a variant change.
     */
    announceChange() {
      const selectedOptionIds = this.getSelectedOptionIds();
      if (!selectedOptionIds.includes(null)) {
        this.updateUrl();
      }

      this.dispatchEvent(new CustomEvent('on:variant:change', {
        bubbles: true,
        detail: {
          form: this.getProductForm(),
          variant: this.variant,
          selectedOptions: this.getSelectedOptions()
        }
      }));
    }

    /**
     * Replace content when the variant or product changes.
     * @param {Element} target - Target container for replacing content within.
     * @param {document} newContent - New content containing elements to use.
     * @param {boolean} productChange - Product is changing.
     */
    updateContent(target, newContent, productChange) {
      // If something's not right, do nothing
      if (!target || !newContent) return;

      // Preselection - only update certain option value attributes
      if (this.getSelectedOptions().indexOf(null) !== -1 && !productChange) {
        target.querySelectorAll('.js-option[data-value-id]').forEach((input) => {
          const newInput = newContent.querySelector(`.js-option[data-value-id="${input.dataset.valueId}"]`);
          input.className = newInput.className;
          if (newInput.dataset.variantId) {
            input.dataset.variantId = newInput.dataset.variantId;
          } else {
            delete input.dataset.variantId;
          }
          if (input.classList.contains('custom-select__option')) {
            input.innerHTML = newInput.innerHTML;
          }
        });
        this.updateStatusClasses();
        return;
      }

      let replaceSelector = '[data-dynamic-variant-content]';
      if (productChange) {
        replaceSelector += ', [data-dynamic-product-content]';
      }
      const toReplaceList = target.querySelectorAll(replaceSelector);

      toReplaceList.forEach((toReplace) => {
        const replaceWith = toReplace.dataset.dynamicVariantContent
          ? newContent.querySelector(`[data-dynamic-variant-content="${CSS.escape(toReplace.dataset.dynamicVariantContent)}"]`)
          : newContent.querySelector(`[data-dynamic-product-content="${CSS.escape(toReplace.dataset.dynamicProductContent)}"]`);
        if (!replaceWith) return;

        // Dispatch 'on:variant:before-replace-element' event before replacing element
        document.dispatchEvent(new CustomEvent('on:variant:before-replace-element', {
          bubbles: true,
          detail: {
            toReplace,
            replaceWith
          }
        }));

        // If in quick buy, content needs mutating
        if (this.quickBuyContainer && theme.quickBuy) {
          theme.quickBuy.convertToQuickBuyContent(
            replaceWith,
            this.quickBuyContainer.dataset.productUrl
          );
        }

        // Transfer basic input values
        toReplace.querySelectorAll('input[id]:not([type="hidden"]), select[id]').forEach((sourceInput) => {
          if (sourceInput.matches('.custom-select__native')) {
            const customSelectId = sourceInput.id.replace('-native', '');
            const targetInput = replaceWith.querySelector(`#${CSS.escape(customSelectId)}`);
            const option = targetInput.querySelector(`.js-option[data-value="${CSS.escape(sourceInput.value)}"]`);
            setTimeout(() => {
              targetInput.selectOption(option);
            }, 0);
          } else {
            const targetInput = replaceWith.querySelector(`#${CSS.escape(sourceInput.id)}`);
            if (!targetInput) return;
            if (sourceInput.type === 'radio' || sourceInput.type === 'checkbox') {
              targetInput.toggleAttribute('checked', sourceInput.checked);
            } else {
              targetInput.value = sourceInput.value;
            }
          }
        });

        // Replace content
        const isIdInput = replaceWith.matches('input[name="id"]');
        if (isIdInput) {
          // Update ID input - preserving listeners
          [...replaceWith.attributes].forEach(
            (attr) => toReplace.setAttribute(attr.name, attr.value)
          );
          toReplace.value = replaceWith.value;
          // Defer change event until all forms are accurate
          setTimeout(() => {
            toReplace.dispatchEvent(new Event('change', { bubbles: true }));
          }, 0);
        } else {
          // Remember toReplace becomes detached
          toReplace.replaceWith(replaceWith);
        }

        // Do not mistake input value changes for variant changes - remove listeners
        replaceWith.querySelectorAll('variant-picker').forEach((el) => el.removeListeners());

        // Set values of any unselected <custom-select> elements again
        // A fetched variant may not appear selected
        const selectedOptionIds = this.getSelectedOptionIds();
        selectedOptionIds.forEach((optionId) => {
          const toSelect = replaceWith.querySelector(`.option-selector .custom-select__option[data-value-id="${optionId}"]:not([aria-selected="true"])`);
          if (toSelect) {
            setTimeout(() => {
              toSelect.closest('custom-select').selectOption(toSelect);
            }, 0);
          }
        });

        // Update variant picker after potential changes are applied
        setTimeout(() => {
          replaceWith.querySelectorAll('variant-picker').forEach((el) => {
            el.addListeners();
            el.updateVariantContent();
          });
        }, 10);
      });
    }

    /**
     * Set status classes to help with styling.
     */
    updateStatusClasses() {
      const selectedOpts = this.getSelectedOptionIds();
      const nullCount = selectedOpts.filter((x) => x === null).length;
      const isSingleNullAtEnd = nullCount === 1 && selectedOpts[selectedOpts.length - 1] === null;
      this.classList.toggle('variant-picker--preselection', nullCount > 0);
      this.classList.toggle('variant-picker--pre-last-selection', nullCount > 0 && !isSingleNullAtEnd);
    }

    /**
     * Copies the selected value into a swatch label. (Required for pre-selection.)
     */
    updateSwatchLabel() {
      this.querySelectorAll('.option-selector:has(.js-color-text)').forEach((option) => {
        const label = option.querySelector('.js-color-text');
        const input = option.querySelector('.js-option:is(:checked, [aria-selected="true"])');
        label.textContent = input ? input.value : '';
      });
    }

    /**
     * Updates the availability status in option selectors.
     */
    updateAvailability() {
      if (this.dataset.availability === 'prune') {
        const toChange = this.querySelectorAll('.js-option.is-unavailable:is(:checked, [aria-selected="true"])');
        toChange.forEach((selected) => {
          const toSelect = selected.closest('.option-selector').querySelector('.js-option:not(.is-unavailable, [data-value=""])');
          if (toSelect) {
            setTimeout(() => {
              if (toSelect.closest('custom-select')) {
                toSelect.closest('custom-select').selectOption(toSelect);
              } else {
                toSelect.click();
              }
            }, 20); // Trigger after any updateContent logic has occurred
          }
        });
      }
    }

    /**
     * Updates the "Add to Cart" button label and disabled state.
     */
    updateAddToCartButton() {
      const productForm = this.getProductForm();
      if (!productForm) return;

      this.addBtn = productForm.querySelector('[name="add"]');

      // Product not available
      if (!this.productAvailable) {
        this.addBtn.disabled = true;
        this.addBtn.textContent = theme.strings.noStock;
        return;
      }

      // Preselection
      if (this.getSelectedOptions().indexOf(null) !== -1) {
        if (this.addBtn.dataset.preselectionDisabled === 'true') {
          this.addBtn.disabled = true;
          this.addBtn.textContent = this.addBtn.dataset.preselectionText;
        } else {
          this.addBtn.disabled = false;
          this.addBtn.textContent = this.addBtn.dataset.addToCartText;
        }
        return;
      }

      // No variant
      if (!this.variant) {
        this.addBtn.disabled = true;
        this.addBtn.textContent = theme.strings.noVariant;
        return;
      }

      // Sold out
      if (!this.variant.available) {
        this.addBtn.disabled = true;
        this.addBtn.textContent = theme.strings.noStock;
        return;
      }

      // Add to cart
      this.addBtn.disabled = false;
      this.addBtn.textContent = this.addBtn.dataset.addToCartText;
    }

    /**
     * Updates the url with the selected variant id.
     */
    updateUrl() {
      if (this.dataset.updateUrl === 'false') return;
      const url = this.variant ? `${this.dataset.url}?variant=${this.variant.id}` : this.dataset.url;
      window.history.replaceState({ }, '', url);
    }

    /**
     * Gets the variant data for a product.
     * @returns {?object}
     */
    getVariantData() {
      const dataEl = this.section.querySelector('variant-picker [type="application/json"]');
      return dataEl ? JSON.parse(dataEl.textContent) : null;
    }

    /**
     * Get the selected values from a list of variant options.
     * @returns {Array} Array of selected option values, value is null if not selected.
     */
    getSelectedOptions() {
      const selectedOptions = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          selectedOptions.push(selected && selected.dataset.value !== '' ? selected.dataset.value : null);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptions.push(selected ? selected.value : null);
        }
      });

      return selectedOptions;
    }

    /**
     * Get the selected option value ids from a list of variant options.
     * @returns {Array} Array of selected option value ids, value is null if not selected.
     */
    getSelectedOptionIds() {
      const selectedOptionIds = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          selectedOptionIds.push(selected && selected.dataset.value !== '' ? selected.dataset.valueId : null);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptionIds.push(selected ? selected.dataset.valueId : null);
        }
      });

      return selectedOptionIds;
    }

    /**
     * Apply search parameters (set by product card swatches).
     */
    applySearchParams() {
      const searchParams = new URLSearchParams(window.location.search);

      Array.from(searchParams.keys()).forEach((key) => {
        const value = searchParams.get(key);
        const optionSelectors = Array.from(this.optionSelectors);
        const matchingOptionSelector = optionSelectors.find((x) => x.dataset.option === key);
        if (!matchingOptionSelector) return;

        if (matchingOptionSelector.dataset.selectorType === 'dropdown') {
          const colorOptionDropdown = matchingOptionSelector.querySelector(`.custom-select__option[data-value="${CSS.escape(value)}"]:not([aria-selected="true"])`);
          if (colorOptionDropdown) {
            const customSelect = colorOptionDropdown.closest('custom-select');
            const convertEvent = (evt) => {
              evt.detail.noFocus = true;
              customSelect.dispatchEvent(
                new CustomEvent('change', { bubbles: true, cancelable: false, detail: evt.detail })
              );
            };
            customSelect.addEventListener('change', convertEvent, { once: true });
            customSelect.selectOption(colorOptionDropdown);
          }
        } else {
          const matchingInput = matchingOptionSelector.querySelector(`input[value="${CSS.escape(value)}"]:not(:checked)`);
          if (matchingInput) {
            const matchingOptionValue = matchingOptionSelector.querySelector('.option-selector__label-value');
            if (matchingOptionValue) {
              matchingOptionSelector.querySelector('.option-selector__label-value').textContent = value;
            }
            matchingInput.checked = true;
            matchingInput.dispatchEvent(
              new CustomEvent('change', { bubbles: true, cancelable: false, detail: { noFocus: true } })
            );
          }
        }
      });
    }
  }

  customElements.define('variant-picker', VariantPicker);
}
