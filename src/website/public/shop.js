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

  function addProduct(product, options = {}) {
    if (!product || typeof product.name !== "string") return false;
    const priceValue = options.price !== undefined ? Number(options.price) : Number(product.price_amount);
    if (!Number.isFinite(priceValue) || priceValue < 0) return false;

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
        price: Math.round(priceValue * 100) / 100,
        quantity: 1,
        image: product.image || "",
        category: product.category || ""
      });
    }
    writeCart(items);
    return true;
  }

  function updateQuantity(id, change) {
    const items = readCart();
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    item.quantity = Math.max(0, Math.min(99, item.quantity + change));
    writeCart(items.filter(entry => entry.quantity > 0));
    renderCartPage();
    renderCheckoutSummary();
  }

  function removeItem(id) {
    writeCart(readCart().filter(item => item.id !== id));
    renderCartPage();
    renderCheckoutSummary();
  }

  function applyCoupon(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(COUPONS, normalized)) {
      return { ok: false, message: getLanguage() === "ro"
        ? "Cod invalid. Încearcă ZARAD5, ZARAD10 sau ZARAD15."
        : "Invalid code. Try ZARAD5, ZARAD10 or ZARAD15." };
    }
    if (readCart().length === 0) {
      return { ok: false, message: getLanguage() === "ro"
        ? "Adaugă produse în coș înainte de a aplica un cupon."
        : "Add items to your cart before applying a coupon." };
    }
    writeJson(COUPON_KEY, normalized);
    renderCartPage();
    renderCheckoutSummary();
    return { ok: true, message: getLanguage() === "ro"
      ? "Cupon aplicat: " + normalized + " — reducere de " + COUPONS[normalized] + "%."
      : "Coupon applied: " + normalized + " — " + COUPONS[normalized] + "% off." };
  }

  function clearCoupon() {
    try { localStorage.removeItem(COUPON_KEY); } catch {}
    renderCartPage();
    renderCheckoutSummary();
  }

  function updateCartBadge() {
    const count = totals().count;
    document.querySelectorAll("[data-zarad-cart-count]").forEach(node => {
      node.textContent = String(count);
    });
  }

  function ensureCartLink() {
    const right = document.querySelector(".zarad-right");
    if (right && !right.querySelector(".zarad-cart-link")) {
      const link = document.createElement("a");
      link.className = "zarad-cart-link";
      link.href = "/cart";
      link.setAttribute("aria-label", getLanguage() === "ro" ? "Deschide coșul" : "Open shopping cart");
      const label = document.createElement("span");
      label.dataset.ro = "Coș";
      label.dataset.en = "Cart";
      label.textContent = getLanguage() === "ro" ? "Coș" : "Cart";
      const count = document.createElement("span");
      count.className = "zarad-cart-count";
      count.dataset.zaradCartCount = "";
      count.textContent = String(totals().count);
      link.append(label, count);
      right.prepend(link);
    }

    const footerDetails = document.querySelector(".footer-contact-details");
    if (footerDetails && !footerDetails.querySelector('a[href="/terms"]')) {
      const link = document.createElement("a");
      link.href = "/terms";
      link.dataset.ro = "Termeni și condiții";
      link.dataset.en = "Terms & Conditions";
      link.textContent = getLanguage() === "ro" ? "Termeni și condiții" : "Terms & Conditions";
      footerDetails.appendChild(link);
    }
  }

  function renderCartPage() {
    const container = document.getElementById("cart_items");
    if (!container) return;

    const empty = document.getElementById("cart_empty");
    const checkout = document.getElementById("cart_checkout_link");
    const items = readCart();
    const total = totals();
    container.replaceChildren();

    items.forEach(item => {
      const row = document.createElement("article");
      row.className = "shop-cart-item";

      const details = document.createElement("div");
      details.className = "shop-cart-item-details";
      const title = document.createElement("h2");
      title.textContent = getLanguage() === "en" ? item.name_en : item.name;
      const price = document.createElement("p");
      price.className = "shop-cart-item-price";
      price.textContent = money(item.price) + (getLanguage() === "ro" ? " / buc." : " / item");
      details.append(title, price);

      const controls = document.createElement("div");
      controls.className = "shop-quantity-controls";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", getLanguage() === "ro" ? "Scade cantitatea" : "Decrease quantity");
      minus.addEventListener("click", () => updateQuantity(item.id, -1));
      const quantity = document.createElement("span");
      quantity.textContent = String(item.quantity);
      quantity.setAttribute("aria-live", "polite");
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", getLanguage() === "ro" ? "Crește cantitatea" : "Increase quantity");
      plus.addEventListener("click", () => updateQuantity(item.id, 1));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "shop-remove-item";
      remove.textContent = getLanguage() === "ro" ? "Elimină" : "Remove";
      remove.addEventListener("click", () => removeItem(item.id));
      controls.append(minus, quantity, plus, remove);
      row.append(details, controls);
      container.appendChild(row);
    });

    if (empty) empty.hidden = items.length > 0;
    if (checkout) checkout.hidden = items.length === 0;
    const summary = document.getElementById("cart_summary");
    if (summary) summary.hidden = items.length === 0;

    setText("cart_subtotal", money(total.subtotal));
    setText("cart_discount", "− " + money(total.discount));
    setText("cart_total", money(total.total));

    const coupon = getCoupon();
    setText("cart_active_coupon", coupon
      ? (getLanguage() === "ro" ? coupon + " · " + COUPONS[coupon] + "% reducere" : coupon + " · " + COUPONS[coupon] + "% off")
      : (getLanguage() === "ro" ? "Niciun cupon aplicat" : "No coupon applied"));

    const input = document.getElementById("coupon_code");
    if (input && coupon) input.value = coupon;
    updateCartBadge();
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
    const form = document.getElementById("checkout_form");
    if (form && items.length === 0) form.hidden = true;
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