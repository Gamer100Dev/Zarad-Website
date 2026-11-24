(() => {
  "use strict";

  const CART_KEY = "zarad-demo-cart-v1";
  const COUPON_KEY = "zarad-demo-coupon-v1";
  const COUPONS = Object.freeze({ ZARAD5: 5, ZARAD10: 10, ZARAD15: 15 });

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function language() {
    return document.documentElement.lang === "en" ? "en" : "ro";
  }

  function formatMoney(value) {
    const number = new Intl.NumberFormat(language() === "ro" ? "ro-RO" : "en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
    return language() === "ro" ? number + " lei" : "RON " + number;
  }

  function descriptor(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function readCart() {
    const data = readJson(CART_KEY, []);
    if (!Array.isArray(data)) return [];
    return data.filter(item =>
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      Number.isFinite(Number(item.price)) &&
      Number(item.price) >= 0 &&
      Number.isInteger(Number(item.quantity)) &&
      Number(item.quantity) > 0
    ).map(item => ({
      id: item.id,
      name: item.name,
      name_en: typeof item.name_en === "string" ? item.name_en : item.name,
      price: Number(item.price),
      quantity: Math.min(99, Number(item.quantity)),
      image: typeof item.image === "string" ? item.image : "",
      category: typeof item.category === "string" ? item.category : ""
    }));
  }

  function getCoupon() {
    const value = String(readJson(COUPON_KEY, "") || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(COUPONS, value) ? value : "";
  }

  function totals() {
    const items = readCart();
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const rate = getCoupon() ? COUPONS[getCoupon()] : 0;
    const discount = Math.round(subtotal * rate) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
      count: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  function updateCartBadge() {
    const count = totals().count;
    document.querySelectorAll("[data-zarad-cart-count]").forEach(element => {
      element.textContent = String(count);
    });
  }

  function writeCart(items) {
    const saved = writeJson(CART_KEY, items);
    updateCartBadge();
    return saved;
  }

  function addProduct(product, options = {}) {
    if (!product || typeof product.name !== "string") return false;
    const price = options.price !== undefined ? Number(options.price) : Number(product.price_amount);
    if (!Number.isFinite(price) || price < 0) return false;

    const id = descriptor(product.name) + (options.variant ? "-" + descriptor(options.variant) : "");
    const items = readCart();
    const existing = items.find(item => item.id === id);

    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1);
    } else {
      items.push({
        id,
        name: product.name,
        name_en: product.name_en || product.name,
        price: Math.round(price * 100) / 100,
        quantity: 1,
        image: product.image || "",
        category: product.category || ""
      });
    }

    if (!writeCart(items)) return false;
    renderCartPage();
    return true;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function updateQuantity(id, delta) {
    const items = readCart();
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    item.quantity = Math.max(0, Math.min(99, item.quantity + delta));
    writeCart(items.filter(entry => entry.quantity > 0));
    renderCartPage();
    renderCheckoutSummary();
  }

  function removeItem(id) {
    writeCart(readCart().filter(item => item.id !== id));
    renderCartPage();
    renderCheckoutSummary();
  }

  function applyCoupon(input) {
    const code = String(input || "").trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(COUPONS, code)) {
      return {
        ok: false,
        message: language() === "ro"
          ? "Cod invalid. Încearcă ZARAD5, ZARAD10 sau ZARAD15."
          : "Invalid code. Try ZARAD5, ZARAD10 or ZARAD15."
      };
    }
    if (readCart().length === 0) {
      return {
        ok: false,
        message: language() === "ro"
          ? "Adaugă produse în coș înainte de a aplica un cupon."
          : "Add items to your basket before applying a coupon."
      };
    }
    if (!writeJson(COUPON_KEY, code)) {
      return {
        ok: false,
        message: language() === "ro"
          ? "Browserul nu a putut salva cuponul. Verifică setările de stocare."
          : "Your browser could not save the coupon. Check storage settings."
      };
    }
    renderCartPage();
    renderCheckoutSummary();
    return {
      ok: true,
      message: language() === "ro"
        ? "Cupon aplicat: " + code + " — reducere de " + COUPONS[code] + "%."
        : "Coupon applied: " + code + " — " + COUPONS[code] + "% off."
    };
  }

  function clearCoupon() {
    try { localStorage.removeItem(COUPON_KEY); } catch {}
    renderCartPage();
    renderCheckoutSummary();
  }

  function ensureCartLink() {
    const right = document.querySelector(".zarad-right");
    if (right && !right.querySelector(".zarad-cart-link")) {
      const link = document.createElement("a");
      link.className = "zarad-cart-link";
      link.href = "/cart";
      link.setAttribute("aria-label", language() === "ro" ? "Deschide coșul" : "Open basket");

      const label = document.createElement("span");
      label.dataset.ro = "Coș";
      label.dataset.en = "Cart";
      label.textContent = language() === "ro" ? "Coș" : "Cart";

      const count = document.createElement("span");
      count.className = "zarad-cart-count";
      count.dataset.zaradCartCount = "";
      count.textContent = String(totals().count);
      link.append(label, count);
      right.prepend(link);
    }

    const footer = document.querySelector(".footer-contact-details");
    if (footer && !footer.querySelector('a[href="/terms"]')) {
      const link = document.createElement("a");
      link.href = "/terms";
      link.dataset.ro = "Termeni și condiții";
      link.dataset.en = "Terms & Conditions";
      link.textContent = language() === "ro" ? "Termeni și condiții" : "Terms & Conditions";
      footer.appendChild(link);
    }
  }

  function renderCartPage() {
    const container = document.getElementById("cart_items");
    if (!container) return;

    const items = readCart();
    const total = totals();
    container.replaceChildren();

    items.forEach(item => {
      const row = document.createElement("article");
      row.className = "shop-cart-item";

      const details = document.createElement("div");
      details.className = "shop-cart-item-details";
      const heading = document.createElement("h2");
      heading.textContent = language() === "en" ? item.name_en : item.name;
      const price = document.createElement("p");
      price.className = "shop-cart-item-price";
      price.textContent = formatMoney(item.price) + (language() === "ro" ? " / buc." : " / item");
      details.append(heading, price);

      const controls = document.createElement("div");
      controls.className = "shop-quantity-controls";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", language() === "ro" ? "Scade cantitatea" : "Decrease quantity");
      minus.addEventListener("click", () => updateQuantity(item.id, -1));

      const quantity = document.createElement("span");
      quantity.textContent = String(item.quantity);
      quantity.setAttribute("aria-live", "polite");

      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", language() === "ro" ? "Crește cantitatea" : "Increase quantity");
      plus.addEventListener("click", () => updateQuantity(item.id, 1));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "shop-remove-item";
      remove.textContent = language() === "ro" ? "Elimină" : "Remove";
      remove.addEventListener("click", () => removeItem(item.id));

      controls.append(minus, quantity, plus, remove);
      row.append(details, controls);
      container.appendChild(row);
    });

    const empty = document.getElementById("cart_empty");
    const checkoutLink = document.getElementById("cart_checkout_link");
    const summary = document.getElementById("cart_summary");
    const emptyButton = document.getElementById("cart_empty_button");
    if (empty) empty.hidden = items.length > 0;
    if (checkoutLink) checkoutLink.hidden = items.length === 0;
    if (summary) summary.hidden = items.length === 0;
    if (emptyButton) emptyButton.hidden = items.length === 0;

    setText("cart_subtotal", formatMoney(total.subtotal));
    setText("cart_discount", "− " + formatMoney(total.discount));
    setText("cart_total", formatMoney(total.total));

    const coupon = getCoupon();
    setText("cart_active_coupon", coupon
      ? (language() === "ro" ? coupon + " · " + COUPONS[coupon] + "% reducere" : coupon + " · " + COUPONS[coupon] + "% off")
      : (language() === "ro" ? "Niciun cupon aplicat" : "No coupon applied"));
    const couponInput = document.getElementById("coupon_code");
    if (couponInput && coupon) couponInput.value = coupon;
    updateCartBadge();
  }

  function renderCheckoutSummary() {
    const container = document.getElementById("checkout_summary_items");
    if (!container) return;

    const items = readCart();
    const total = totals();
    container.replaceChildren();

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "checkout-summary-row";
      const label = document.createElement("span");
      label.textContent = (language() === "en" ? item.name_en : item.name) + " × " + item.quantity;
      const amount = document.createElement("strong");
      amount.textContent = formatMoney(item.price * item.quantity);
      row.append(label, amount);
      container.appendChild(row);
    });

    setText("checkout_subtotal", formatMoney(total.subtotal));
    setText("checkout_discount", "− " + formatMoney(total.discount));
    setText("checkout_total", formatMoney(total.total));
    const coupon = getCoupon();
    setText("checkout_coupon_note", coupon
      ? (language() === "ro" ? "Cupon activ: " + coupon : "Active coupon: " + coupon)
      : (language() === "ro" ? "Fără cupon" : "No coupon"));

    const empty = document.getElementById("checkout_empty");
    const area = document.getElementById("checkout_form_area");
    if (empty) empty.hidden = items.length > 0;
    if (area) area.hidden = items.length === 0;
  }

  function initCartPage() {
    if (!document.getElementById("cart_items")) return;
    renderCartPage();

    const couponForm = document.getElementById("coupon_form");
    if (couponForm) {
      couponForm.addEventListener("submit", event => {
        event.preventDefault();
        const input = document.getElementById("coupon_code");
        const result = applyCoupon(input ? input.value : "");
        const feedback = document.getElementById("coupon_feedback");
        if (feedback) {
          feedback.textContent = result.message;
          feedback.className = result.ok ? "shop-feedback is-success" : "shop-feedback is-error";
        }
      });
    }

    const clear = document.getElementById("coupon_clear");
    if (clear) clear.addEventListener("click", clearCoupon);

    const emptyButton = document.getElementById("cart_empty_button");
    if (emptyButton) {
      emptyButton.addEventListener("click", () => {
        writeCart([]);
        clearCoupon();
        renderCartPage();
      });
    }
  }

  function initCheckout() {
    const form = document.getElementById("checkout_form");
    if (!form) return;
    renderCheckoutSummary();

    const cardPanel = document.getElementById("card-details");
    const paymentChoices = form.querySelectorAll('input[name="payment"]');
    const syncCardPanel = () => {
      const selected = form.querySelector('input[name="payment"]:checked');
      if (cardPanel) cardPanel.hidden = !selected || selected.value !== "bank-card";
    };
    paymentChoices.forEach(choice => choice.addEventListener("change", syncCardPanel));
    syncCardPanel();

    form.addEventListener("submit", event => {
      event.preventDefault();
      if (readCart().length === 0) {
        renderCheckoutSummary();
        return;
      }
      if (!form.reportValidity()) return;

      // Payment preview fields are never read, stored, or transmitted.
      // Keep the basket intact and continue to the order-status page.
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      window.location.assign("/order-status.html");
    });
  }

  const languageObserver = new MutationObserver(() => {
    ensureCartLink();
    updateCartBadge();
    renderCartPage();
    renderCheckoutSummary();
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  ensureCartLink();
  updateCartBadge();
  initCartPage();
  initCheckout();

  window.addEventListener("storage", event => {
    if (event.key === CART_KEY || event.key === COUPON_KEY) {
      updateCartBadge();
      renderCartPage();
      renderCheckoutSummary();
    }
  });

  window.ZaradShop = Object.freeze({
    addProduct,
    formatMoney,
    getCart: readCart,
    getTotals: totals,
    applyCoupon,
    clearCoupon
  });
})();