if (!customElements.get('article-read-indicator')) {
  class ArticleReadIndicator extends HTMLElement {
    constructor() {
      super();

      this.article = this.closest('.js-article');

      this.init();
      this.addListeners();
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.scrollHandler);
    }

    init() {
      this.handleScroll();
    }

    addListeners() {
      this.scrollHandler = this.scrollHandler || this.handleScroll.bind(this);
      window.addEventListener('scroll', this.scrollHandler);
    }

    /**
     * Tracks scroll progress through the article
     */
    handleScroll() {
      const pos = this.article.getBoundingClientRect();
      // 200px after the end of the article
      const targetY = pos.height + this.article.offsetTop - window.innerHeight + 200;
      const percentScrolled = parseInt((100 / targetY) * window.scrollY, 10);
      this.style.setProperty('--pagination-percent', `${percentScrolled}%`);
      // Scrolled 300px past the end of the article
      this.classList.toggle('is-visible', window.scrollY - targetY < 300);
    }
  }

  customElements.define('article-read-indicator', ArticleReadIndicator);
}
