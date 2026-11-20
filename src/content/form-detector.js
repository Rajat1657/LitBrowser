module.exports = `(function() {
  'use strict';

  // 1. Initialize window.__litBrowser object
  if (!window.__litBrowser) {
    window.__litBrowser = {};
  }
  if (window.__litBrowser.pendingCredentials === undefined) {
    window.__litBrowser.pendingCredentials = null;
  }
  if (!window.__litBrowser.formFields) {
    window.__litBrowser.formFields = [];
  }

  // Helper: check if element is visible
  function isVisible(el) {
    if (!el) return false;
    if (el.type === 'hidden') return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 2. Identify username field associated with a password input
  function findUsernameField(form, passwordInput) {
    var userKeywords = ['username', 'user', 'email', 'login', 'account', 'signin', 'id'];
    var scope = form || (passwordInput ? passwordInput.closest('form') || document : document);

    // Check autocomplete attribute
    var acUser = scope.querySelector('input[autocomplete="username"], input[autocomplete="email"]');
    if (acUser && isVisible(acUser) && acUser !== passwordInput) {
      return acUser;
    }

    // Check type="email"
    var emailInput = scope.querySelector('input[type="email"]');
    if (emailInput && isVisible(emailInput) && emailInput !== passwordInput) {
      return emailInput;
    }

    // Scan inputs for matching name, id, or placeholder
    var allInputs = Array.prototype.slice.call(
      scope.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="reset"]):not([type="image"])')
    );

    for (var i = 0; i < allInputs.length; i++) {
      var inp = allInputs[i];
      if (!isVisible(inp) || inp === passwordInput) continue;
      var idVal = (inp.id || '').toLowerCase();
      var nameVal = (inp.name || '').toLowerCase();
      var phVal = (inp.placeholder || '').toLowerCase();
      var ariaVal = (inp.getAttribute('aria-label') || '').toLowerCase();

      for (var j = 0; j < userKeywords.length; j++) {
        var kw = userKeywords[j];
        if (idVal.indexOf(kw) !== -1 || nameVal.indexOf(kw) !== -1 || phVal.indexOf(kw) !== -1 || ariaVal.indexOf(kw) !== -1) {
          return inp;
        }
      }
    }

    // If password input is in a list of inputs, look for text input appearing near/before it
    if (passwordInput) {
      var formInputs = Array.prototype.slice.call(scope.querySelectorAll('input'));
      var pwIndex = formInputs.indexOf(passwordInput);
      if (pwIndex > 0) {
        for (var k = pwIndex - 1; k >= 0; k--) {
          var prevInp = formInputs[k];
          var prevType = (prevInp.type || 'text').toLowerCase();
          if ((prevType === 'text' || prevType === 'email' || prevType === 'tel') && isVisible(prevInp)) {
            return prevInp;
          }
        }
      }
    }

    return null;
  }

  // Handle capturing credentials from a form or password field
  function captureCredentials(form, passwordField) {
    var pw = passwordField || (form ? form.querySelector('input[type="password"]') : null);
    if (!pw) return;

    var pwVal = pw.value || '';
    if (!pwVal) return;

    var userField = findUsernameField(form, pw);
    var userVal = userField ? userField.value : '';

    window.__litBrowser.pendingCredentials = {
      url: window.location.href,
      username: userVal,
      password: pwVal
    };
  }

  // Attach submit listeners to forms with password fields
  function attachLoginFormListeners(root) {
    var container = root || document;
    var forms = container.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (f.__litSubmitAttached) continue;
      var hasPw = f.querySelector('input[type="password"]');
      if (hasPw) {
        f.__litSubmitAttached = true;
        f.addEventListener('submit', function(e) {
          captureCredentials(this);
        });
      }
    }
  }

  // Global capture for submit and Enter key on password fields
  if (!window.__litSubmitCaptureAttached) {
    window.__litSubmitCaptureAttached = true;

    document.addEventListener('submit', function(e) {
      var target = e.target;
      if (target && target.tagName && target.tagName.toLowerCase() === 'form') {
        captureCredentials(target);
      }
    }, true);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'input') {
        if (e.target.type === 'password') {
          var form = e.target.closest('form');
          captureCredentials(form, e.target);
        }
      }
    }, true);

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('button, input[type="submit"], input[type="button"]');
      if (btn) {
        var form = btn.closest('form');
        if (form && form.querySelector('input[type="password"]')) {
          captureCredentials(form);
        }
      }
    }, true);
  }

  // 3. Detect AUTOFILL fields
  // Categories: name, email, phone, address, city, state, zip, country, card-number, card-name, card-expiry, card-cvv
  function classifyField(input) {
    if (!input) return null;
    var ac = (input.getAttribute('autocomplete') || '').toLowerCase().trim();
    var type = (input.getAttribute('type') || input.type || 'text').toLowerCase().trim();
    var id = (input.id || '').toLowerCase();
    var name = (input.name || '').toLowerCase();
    var placeholder = (input.placeholder || '').toLowerCase();
    var aria = (input.getAttribute('aria-label') || '').toLowerCase();
    var labelText = '';
    if (input.labels && input.labels.length > 0) {
      labelText = (input.labels[0].textContent || '').toLowerCase();
    }
    var combined = [name, id, placeholder, aria, labelText].join(' ');

    // 1. Credit card CVV / CVC
    if (ac === 'cc-csc' || /cvv|cvc|csc|security[-_ ]?code|card[-_ ]?verification/i.test(combined)) {
      return 'card-cvv';
    }

    // 2. Credit card Expiry
    if (ac === 'cc-exp' || ac === 'cc-exp-month' || ac === 'cc-exp-year' ||
        /cc[-_ ]?exp|expiry|expiration|exp[-_ ]?date|exp[-_ ]?month|exp[-_ ]?year/i.test(combined)) {
      return 'card-expiry';
    }

    // 3. Credit card Number
    if (ac === 'cc-number' || /cc[-_ ]?num|card[-_ ]?num|card[-_ ]?number|credit[-_ ]?card|pan/i.test(combined)) {
      return 'card-number';
    }

    // 4. Credit card Name
    if (ac === 'cc-name' || /cc[-_ ]?name|card[-_ ]?holder|card[-_ ]?name|name[-_ ]?on[-_ ]?card/i.test(combined)) {
      return 'card-name';
    }

    // 5. Email
    if (ac === 'email' || type === 'email' || /email|e[-_ ]?mail/i.test(combined)) {
      return 'email';
    }

    // 6. Phone
    if (ac === 'tel' || type === 'tel' || /phone|tel|mobile|cell/i.test(combined)) {
      return 'phone';
    }

    // 7. Zip / Postal code
    if (ac === 'postal-code' || /zip|postal|post[-_ ]?code/i.test(combined)) {
      return 'zip';
    }

    // 8. City
    if (ac === 'address-level2' || /city|town|locality/i.test(combined)) {
      return 'city';
    }

    // 9. State / Province / Region
    if (ac === 'address-level1' || /state|province|region/i.test(combined)) {
      return 'state';
    }

    // 10. Country
    if (ac === 'country' || ac === 'country-name' || /country/i.test(combined)) {
      return 'country';
    }

    // 11. Street Address
    if (ac === 'street-address' || ac === 'address-line1' || ac === 'address-line2' ||
        /address|addr|street/i.test(combined)) {
      return 'address';
    }

    // 12. Name
    if (ac === 'name' || ac === 'given-name' || ac === 'family-name' || ac === 'additional-name' ||
        /full[-_ ]?name|first[-_ ]?name|last[-_ ]?name|fname|lname|surname|contact[-_ ]?name/i.test(combined)) {
      return 'name';
    }

    return null;
  }

  // Scan visible inputs and store in window.__litBrowser.formFields (no DOM references)
  function scanAutofillFields() {
    var inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
    );
    var fields = [];
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (!isVisible(inp)) continue;
      var fType = classifyField(inp);
      if (fType) {
        fields.push({
          id: inp.id || '',
          name: inp.name || '',
          fieldType: fType
        });
      }
    }
    window.__litBrowser.formFields = fields;
  }

  // 4. MutationObserver for dynamically added forms
  var mutationTimer = null;
  function scheduleRescan() {
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(function() {
      attachLoginFormListeners(document);
      scanAutofillFields();
    }, 150);
  }

  var observer = new MutationObserver(function(mutations) {
    var shouldRescan = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.addedNodes && m.addedNodes.length > 0) {
        shouldRescan = true;
        break;
      }
    }
    if (shouldRescan) {
      scheduleRescan();
    }
  });

  function startObserver() {
    var target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      attachLoginFormListeners(document);
      scanAutofillFields();
      startObserver();
    });
  } else {
    attachLoginFormListeners(document);
    scanAutofillFields();
    startObserver();
  }

  // 5. window.__litBrowser.autofill = function(fieldValues)
  // fill fields and dispatch input/change/blur events
  window.__litBrowser.autofill = function(fieldValues) {
    if (!fieldValues) return;

    function setFieldValue(el, val) {
      if (!el || val === undefined || val === null) return;
      try {
        el.focus();
        var proto = Object.getPrototypeOf(el);
        var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      } catch (err) {
        el.value = val;
      }
    }

    var allInputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
    );

    // Support array of { id, name, fieldType, value }
    if (Array.isArray(fieldValues)) {
      for (var a = 0; a < fieldValues.length; a++) {
        var item = fieldValues[a];
        if (!item) continue;
        var handled = false;
        if (item.id) {
          var elById = document.getElementById(item.id);
          if (elById) {
            setFieldValue(elById, item.value);
            handled = true;
          }
        }
        if (!handled && item.name) {
          var elByName = document.querySelector('input[name="' + item.name + '"]');
          if (elByName) {
            setFieldValue(elByName, item.value);
            handled = true;
          }
        }
        if (!handled && item.fieldType) {
          for (var b = 0; b < allInputs.length; b++) {
            if (classifyField(allInputs[b]) === item.fieldType) {
              setFieldValue(allInputs[b], item.value);
            }
          }
        }
      }
    } else if (typeof fieldValues === 'object') {
      // Support object of key-value pairs e.g. { name: 'John', email: 'john@example.com', 'card-number': '1234...' }
      for (var i = 0; i < allInputs.length; i++) {
        var inputEl = allInputs[i];
        var detectedType = classifyField(inputEl);
        var matched = false;

        if (inputEl.id && fieldValues[inputEl.id] !== undefined) {
          setFieldValue(inputEl, fieldValues[inputEl.id]);
          matched = true;
        }
        if (!matched && inputEl.name && fieldValues[inputEl.name] !== undefined) {
          setFieldValue(inputEl, fieldValues[inputEl.name]);
          matched = true;
        }
        if (!matched && detectedType && fieldValues[detectedType] !== undefined) {
          setFieldValue(inputEl, fieldValues[detectedType]);
          matched = true;
        }
      }
    }
  };
})();`;
