if (!customElements.get('product-inventory')) {
  class ProductInventory extends HTMLElement {
    constructor() {
      super();
      window.initLazyScript(this, this.initLazySection.bind(this));
    }

    initLazySection() {
      this.section = this.closest('.js-product');
      this.inventoryNotice = this.querySelector('.js-inventory-notice');
      this.urgencyMessage = this.querySelector('.js-inventory-urgency');

      // Bind to on:variant:change event for this product
      this.section.addEventListener('on:variant:change', this.handleVariantChange.bind(this));

      // Init
      this.updateInventory(
        parseInt(this.dataset.inventoryQuantity, 10),
        this.dataset.variantAvailable === 'true',
        this.dataset.inventoryPolicy
      );
    }

    /**
     * Gets the inventory data for all product variants
     * @returns {?object}
     */
    getVariantInventory() {
      const dataEl = this.closest('.product-info').querySelector('.js-inventory-data');
      return JSON.parse(dataEl.textContent);
    }

    /**
     * Handles a 'change' event on the variant picker element
     * @param {object} evt - Event object
     */
    handleVariantChange(evt) {
      if (evt.detail.variant) {
        const inventory = this.getVariantInventory();
        this.updateInventory(
          inventory.inventory_quantity,
          inventory.available,
          inventory.inventory_policy
        );
      } else {
        this.updateInventory(0, false);
        this.hidden = true;
      }
    }

    /**
     *
     * Updates the inventory notice
     * @param {number} count - the inventory quantity available
     * @param {boolean} available - whether current variant is available
     * @param {string} inventoryPolicy - whether product continues selling when out of stock
     */
    updateInventory(count, available, inventoryPolicy) {
      let inventoryLevel;

      if (count <= 0) {
        if (inventoryPolicy === 'continue') {
          inventoryLevel = 'backordered';
        } else if (available) {
          inventoryLevel = 'in_stock';
        } else {
          inventoryLevel = 'none';
        }
      } else if (count <= parseInt(this.dataset.thresholdVeryLow, 10)) {
        inventoryLevel = 'very_low';
      } else if (count <= parseInt(this.dataset.thresholdLow, 10)) {
        inventoryLevel = 'low';
      } else {
        inventoryLevel = 'normal';
      }

      if (((this.dataset.showNotice === 'always'
        || (this.dataset.showNotice === 'low' && inventoryLevel.includes('low')))
        && !(inventoryLevel === 'backordered' && this.dataset.showNoStockBackordered === 'false'))) {
        this.hidden = false;

        // Set the inventory level data attribute
        this.setAttribute('data-inventory-level', inventoryLevel);

        // Determine whether to show the count or not
        if (inventoryLevel === 'backordered') {
          this.inventoryNotice.innerText = theme.strings.backordered;
        } else if (inventoryLevel !== 'in_stock' && (this.dataset.showCount === 'always' || (this.dataset.showCount === 'low' && inventoryLevel.includes('low')))) {
          this.inventoryNotice.innerText = theme.strings.onlyXLeft.replace('[quantity]', count);
        } else if (inventoryLevel === 'very_low') {
          this.inventoryNotice.innerText = theme.strings.veryLowStock;
        } else if (inventoryLevel === 'low') {
          this.inventoryNotice.innerText = theme.strings.lowStock;
        } else if (inventoryLevel === 'normal' || inventoryLevel === 'in_stock') {
          this.inventoryNotice.innerText = theme.strings.inStock;
        } else if (inventoryLevel === 'none') {
          this.inventoryNotice.innerText = theme.strings.noStock;
        }

        // Update urgency message if needed
        if (this.urgencyMessage) {
          if (inventoryLevel === 'very_low') {
            this.urgencyMessage.innerHTML = this.dataset.textVeryLow;
          } else if (inventoryLevel === 'low') {
            this.urgencyMessage.innerHTML = this.dataset.textLow;
          } else if (inventoryLevel === 'backordered') {
            this.urgencyMessage.innerHTML = this.dataset.textNoStockBackordered;
          } else if (inventoryLevel === 'normal' || inventoryLevel === 'in_stock') {
            this.urgencyMessage.innerHTML = this.dataset.textNormal;
          } else if (inventoryLevel === 'none') {
            this.urgencyMessage.innerHTML = this.dataset.textNoStock;
          }
        }
      } else {
        this.hidden = true;
      }
    }
  }

  customElements.define('product-inventory', ProductInventory);
}
