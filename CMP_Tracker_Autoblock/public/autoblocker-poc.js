/*
 * Controlled POC blocker, not production CMP code.
 * It demonstrates the useful runtime controls and deliberately leaves parser
 * and preload-scanner races visible in the test results.
 */
(function () {
  'use strict';

  const audit = window.__pocAudit = [];
  const held = new WeakMap();
  const xhrUrls = new WeakMap();
  const native = {
    setAttribute: Element.prototype.setAttribute,
    removeAttribute: Element.prototype.removeAttribute,
    appendChild: Node.prototype.appendChild,
    insertBefore: Node.prototype.insertBefore,
    replaceChild: Node.prototype.replaceChild,
    fetch: window.fetch.bind(window),
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
    beacon: navigator.sendBeacon?.bind(navigator)
  };

  function patternFrom(value) {
    try { return new URL(value instanceof Request ? value.url : String(value), location.href).searchParams.get('pattern'); }
    catch (_) { return null; }
  }
  function isTracker(value, node) {
    return Boolean(node?.dataset?.pocTracker || patternFrom(value));
  }
  function note(message) { audit.push(message); }
  function remember(node, attribute, value) {
    let saved = held.get(node);
    if (!saved) { saved = {}; held.set(node, saved); }
    if (!(attribute in saved)) saved[attribute] = String(value);
    native.setAttribute.call(node, `data-poc-${attribute}`, String(value));
  }
  function holdScript(node, value) {
    // Only labelled inline snippets are tracker candidates. The page bootstrap
    // also contains test URLs and must never be classified as a tracker.
    if (!node.getAttribute('src') && !node.dataset.pocTracker) return false;
    if (!isTracker(value, node) || node.type === 'text/poc-blocked') return false;
    remember(node, 'type', node.getAttribute('type') || 'application/javascript');
    if (node.getAttribute('src')) remember(node, 'src', node.getAttribute('src'));
    native.setAttribute.call(node, 'type', 'text/poc-blocked');
    if (node.getAttribute('src')) native.removeAttribute.call(node, 'src');
    note(`held script: ${node.dataset.pocTracker || patternFrom(value)}`);
    return true;
  }
  function holdResource(node, attribute, value) {
    if (!isTracker(value, node)) return false;
    remember(node, attribute, value);
    native.removeAttribute.call(node, attribute);
    if (node.tagName === 'IFRAME') native.setAttribute.call(node, 'srcdoc', '<p>Blocked until consent.</p>');
    note(`held ${node.tagName.toLowerCase()}: ${node.dataset.pocTracker || patternFrom(value)}`);
    return true;
  }
  function inspect(node) {
    if (!(node instanceof Element)) return;
    if (node.tagName === 'SCRIPT') holdScript(node, node.getAttribute('src') || node.textContent);
    if (['IMG', 'IFRAME', 'LINK'].includes(node.tagName)) {
      const attribute = node.tagName === 'LINK' ? 'href' : 'src';
      const value = node.getAttribute(attribute);
      if (value) holdResource(node, attribute, value);
    }
    node.querySelectorAll?.('script,img,iframe,link').forEach(inspect);
  }

  Element.prototype.setAttribute = function (name, value) {
    const attribute = String(name).toLowerCase();
    if (this.tagName === 'SCRIPT' && attribute === 'src' && holdScript(this, value)) return;
    if (['IMG', 'IFRAME'].includes(this.tagName) && attribute === 'src' && holdResource(this, attribute, value)) return;
    if (this.tagName === 'LINK' && attribute === 'href' && holdResource(this, attribute, value)) return;
    return native.setAttribute.call(this, name, value);
  };
  for (const [Constructor, properties] of [[HTMLScriptElement, ['src']], [HTMLImageElement, ['src']], [HTMLIFrameElement, ['src']], [HTMLLinkElement, ['href']]]) {
    for (const property of properties) {
      const descriptor = Object.getOwnPropertyDescriptor(Constructor.prototype, property);
      if (!descriptor?.configurable || !descriptor.set) continue;
      Object.defineProperty(Constructor.prototype, property, {
        ...descriptor,
        set(value) {
          if (this.tagName === 'SCRIPT' && holdScript(this, value)) return;
          if (this.tagName === 'LINK' && holdResource(this, 'href', value)) return;
          if (['IMG', 'IFRAME'].includes(this.tagName) && holdResource(this, 'src', value)) return;
          return descriptor.set.call(this, value);
        }
      });
    }
  }
  for (const method of ['appendChild', 'insertBefore', 'replaceChild']) {
    Node.prototype[method] = function (node, ...rest) {
      if (node instanceof DocumentFragment) node.childNodes.forEach(inspect); else inspect(node);
      return native[method].call(this, node, ...rest);
    };
  }
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(inspect)))
    .observe(document.documentElement, { childList: true, subtree: true });

  window.fetch = function (input, options) {
    if (isTracker(input)) { note(`blocked fetch: ${patternFrom(input)}`); return Promise.reject(new TypeError('Blocked by POC')); }
    return native.fetch(input, options);
  };
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrUrls.set(this, url); return native.xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (isTracker(xhrUrls.get(this))) { note(`blocked XHR: ${patternFrom(xhrUrls.get(this))}`); throw new DOMException('Blocked by POC', 'SecurityError'); }
    return native.xhrSend.apply(this, args);
  };
  if (native.beacon) navigator.sendBeacon = function (url, data) {
    if (isTracker(url)) { note(`blocked beacon: ${patternFrom(url)}`); return false; }
    return native.beacon(url, data);
  };

  inspect(document.documentElement);
  note('candidate autoblocker active');
})();
