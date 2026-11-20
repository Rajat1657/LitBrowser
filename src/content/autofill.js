// Lit Browser - Autofill Detector Content Script
(() => {
  if (window.__lit_autofill_detector_installed__) return;
  window.__lit_autofill_detector_installed__ = true;

  function isAutofillableInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const type = (el.type || '').toLowerCase();
    if (['password', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) return false;
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    
    return ['name', 'email', 'phone', 'tel', 'address', 'city', 'state', 'zip'].some(
      (k) => name.includes(k) || id.includes(k) || auto.includes(k)
    );
  }

  function handleFocus(e) {
    const el = e.target;
    if (isAutofillableInput(el)) {
      const rect = el.getBoundingClientRect();
      const payload = {
        fieldName: el.name || el.id,
        x: Math.round(rect.left),
        y: Math.round(rect.bottom),
        width: Math.round(rect.width)
      };
      console.log('__LIT_AUTOFILL_SUGGESTION__:' + JSON.stringify(payload));
    }
  }

  document.addEventListener('focusin', handleFocus, true);
})();
