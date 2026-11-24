(() => {
  "use strict";

  const CART_KEY = "zarad-demo-cart-v1";
  const COUPON_KEY = "zarad-demo-coupon-v1";
  const COUPONS = Object.freeze({ ZARAD5: 5, ZARAD10: 10, ZARAD15: 15 });

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
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

  function readCart() {
    const value = readJson(CART_KEY, []);
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
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

  function writeCart(items) {
    writeJson(CART_KEY, items);
    updateCartBadge();
  }

  function getLanguage() {
    return document.documentElement.lang === "en" ? "en" : "ro";
  }

  function money(value) {
    const language = getLanguage();
    const number = new Intl.NumberFormat(language === "ro" ? "ro-RO" : "en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
    return language === "ro" ? number + " lei" : "RON " + number;
  }

  function getCoupon() {
    const code = String(readJson(COUPON_KEY, "") || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(COUPONS, code) ? code : "";
  }

  function couponRate() {
    const code = getCoupon();
    return code ? COUPONS[code] : 0;
  }

  function totals() {
    const items = readCart();
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = Math.round(subtotal * couponRate()) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
      count: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  function descriptor(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
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
      label.textContent = (getLanguage() === "en" ? item.name_en : item.name) + " × " + item.quantity;
      const amount = document.createElement("strong");
      amount.textContent = money(item.price * item.quantity);
      row.append(label, amount);
      container.appendChild(row);
    });

    setText("checkout_subtotal", money(total.subtotal));
    setText("checkout_discount", "− " + money(total.discount));
    setText("checkout_total", money(total.total));
    const coupon = getCoupon();
    setText("checkout_coupon_note", coupon
      ? (getLanguage() === "ro" ? "Cupon activ: " + coupon : "Active coupon: " + coupon)
      : (getLanguage() === "ro" ? "Fără cupon" : "No coupon"));
    const empty = document.getElementById("checkout_empty");
    if (empty) empty.hidden = items.length > 0;
    const area = document.getElementById("checkout_form_area");
    if (area) area.hidden = items.length === 0;
  }

  function initCartPage() {
    const container = document.getElementById("cart_items");
    if (!container) return;
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
        if (result.ok && input) input.value = getCoupon();
      });
    }
    const clear = document.getElementById("coupon_clear");
    if (clear) clear.addEventListener("click", clearCoupon);
    const emptyButton = document.getElementById("cart_empty_button");
    if (emptyButton) emptyButton.addEventListener("click", () => {
      writeCart([]);
      clearCoupon();
      renderCartPage();
    });
  }

  function initCheckout() {
    const form = document.getElementById("checkout_form");
    if (!form) return;
    renderCheckoutSummary();
    form.addEventListener("submit", event => {
      event.preventDefault();
      const items = readCart();
      if (!items.length) {
        renderCheckoutSummary();
        return;
      }
      if (!form.reportValidity()) return;

      const language = getLanguage();
      const name = String(new FormData(form).get("customer_name") || "").trim();
      const confirmation = document.getElementById("checkout_confirmation");
      const message = document.getElementById("checkout_confirmation_message");
      const formArea = document.getElementById("checkout_form_area");
      if (message) {
        message.textContent = language === "ro"
          ? "Îți mulțumim pentru cumpărăturile de astăzi, " + name + "! Aceasta este o confirmare demonstrativă: nu s-a încasat nicio plată, comanda nu a fost transmisă către Zarad, iar datele completate nu au fost salvate sau trimise."
          : "Thank you for shopping with us today, " + name + "! This is a demo confirmation: no payment was taken, the order was not sent to Zarad, and the details you entered were not saved or transmitted.";
      }
      if (formArea) formArea.hidden = true;
      if (confirmation) confirmation.hidden = false;
      writeCart([]);
      clearCoupon();
      updateCartBadge();
    });
  }

  function addProduct(product, options = {}) {
    const ok = addProductInternal(product, options);
    return ok;
  }

  function addProductInternal(product, options) {
    if (!product || typeof product.name !== "string") return false;
    const price = options.price !== undefined ? Number(options.price) : Number(product.price_amount);
    if (!Number.isFinite(price) || price < 0) return false;
    const id = descriptor(product.name) + (options.variant ? "-" + descriptor(options.variant) : "");
    const items = readCart();
    const existing = items.find(item => item.id === id);
    if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
    else items.push({
      id,
      name: product.name,
      name_en: product.name_en || product.name,
      price: Math.round(price * 100) / 100,
      quantity: 1,
      image: product.image || "",
      category: product.category || ""
    });
    writeCart(items);
    renderCartPage();
    return true;
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
    formatMoney: money,
    getCart: readCart,
    getTotals: totals,
    applyCoupon,
    clearCoupon
  });
})();