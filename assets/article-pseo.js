(function () {
  function init() {
    var content = document.querySelector("[data-pseo-content]");
    var tocEl = document.querySelector("[data-pseo-toc]");
    if (content && tocEl) initToc(content, tocEl);
    initStickyCta();
  }
  function initToc(content, tocEl) {
    var headings = content.querySelectorAll("h2");
    if (headings.length < 2) {
      var sidebar = tocEl.closest(".pseo-sidebar");
      if (sidebar) sidebar.style.display = "none";
      return;
    }
    var items = [];
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (!h.id) {
        var slug = (h.textContent || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 60);
        h.id = slug || "section-" + i;
      }
      items.push({ id: h.id, text: (h.textContent || "").trim(), el: h });
    }
    var html = '<p class="pseo-toc-title">In this article</p><ul class="pseo-toc-list">';
    for (var j = 0; j < items.length; j++) {
      html += '<li><a class="pseo-toc-link" href="#' + items[j].id + '">' + escapeHtml(items[j].text) + "</a></li>";
    }
    html += "</ul>";
    tocEl.innerHTML = html;
    var links = tocEl.querySelectorAll(".pseo-toc-link");
    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          for (var k = 0; k < links.length; k++) {
            links[k].classList.remove("is-active");
          }
          var active = tocEl.querySelector('[href="#' + id + '"]');
          if (active) active.classList.add("is-active");
        });
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    items.forEach(function (item) { observer.observe(item.el); });
  }
  function initStickyCta() {
    var cta = document.querySelector("[data-pseo-sticky]");
    if (!cta) return;
    function onScroll() {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      var pct = window.scrollY / docHeight;
      if (pct > 0.3) cta.classList.add("is-visible");
      else cta.classList.remove("is-visible");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
