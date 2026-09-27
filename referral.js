/**
 * Tasknory WhatsApp group referral — PURE HTML/CSS/JS
 *
 * No frameworks. No libraries. No build step. No CDN imports.
 * The only network calls are plain fetch() requests to the Supabase
 * REST API, using the anon key (safe for public pages — the SQL in
 * supabase-setup.sql locks every table down with RLS).
 *
 * Page 1 — get-link.html
 *   Someone already in the group enters their mobile number, ticks the box,
 *   and receives https://tasknory.com/group-referral.html?ref=THEIRNUMBER
 *
 * Page 2 — group-referral.html?ref=THEIRNUMBER
 *   The invitee enters their own number. We store both numbers, then open
 *   the WhatsApp group.
 *
 * Set the group URL in either place (database wins):
 *   1. update public.wa_group_config set whatsapp_url = 'https://chat.whatsapp.com/XXXX' where id = 1;
 *   2. DEFAULT_WHATSAPP_GROUP_URL below
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * CONFIG — the only things you may ever need to edit                  *
   * ------------------------------------------------------------------ */

  var SUPABASE_URL = 'https://kzvjrnxesxvlonrplptz.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dmpybnhlc3h2bG9ucnBscHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDIxMDYsImV4cCI6MjEwMTExODEwNn0.d-OLhS_hWv8PECpnkvvU6cfKVX4MPwZAUk9X0dgRaMo';

  var PRODUCTION_ORIGIN = 'https://tasknory.com';
  var JOIN_PAGE = 'group-referral.html';

  // Paste the real invite here if you are not using wa_group_config yet.
  var DEFAULT_WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/REPLACE_WITH_YOUR_GROUP_CODE';

  var COUNTRIES = [
    { name: 'Nigeria', dial: '234' },
    { name: 'Ghana', dial: '233' },
    { name: 'Kenya', dial: '254' },
    { name: 'South Africa', dial: '27' },
    { name: 'Uganda', dial: '256' },
    { name: 'Tanzania', dial: '255' },
    { name: 'Rwanda', dial: '250' },
    { name: 'Egypt', dial: '20' },
    { name: 'Cameroon', dial: '237' },
    { name: 'Senegal', dial: '221' },
    { name: 'United Kingdom', dial: '44' },
    { name: 'United States', dial: '1' },
  ];

  /* ------------------------------------------------------------------ *
   * Small helpers                                                       *
   * ------------------------------------------------------------------ */

  var API_HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  var $ = function (id) { return document.getElementById(id); };

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizePhone(dial, raw) {
    var cc = digits(dial);
    var national = digits(raw);
    var trimmed = String(raw || '').trim();

    if (!national) return { ok: false, message: 'Enter your mobile number.' };

    if (trimmed.charAt(0) === '+' && national.length >= 10 && national.length <= 15) {
      return { ok: true, phone: national };
    }

    if (cc && national.indexOf(cc) === 0 && national.length >= cc.length + 8 && national.length <= 15) {
      return { ok: true, phone: national };
    }

    national = national.replace(/^0+/, '');
    if (national.length < 7 || national.length > 12) {
      return { ok: false, message: 'Check the number — it looks too short or too long.' };
    }

    var phone = cc + national;
    if (!/^[0-9]{10,15}$/.test(phone)) {
      return { ok: false, message: 'Use a full mobile number, including the country code.' };
    }
    return { ok: true, phone: phone };
  }

  function normalizeRef(raw) {
    var value = digits(raw);
    if (!value) return '';
    if (value.charAt(0) === '0' && value.length === 11) value = '234' + value.slice(1);
    return /^[0-9]{10,15}$/.test(value) ? value : '';
  }

  function formatPhone(phone) {
    if (phone.indexOf('234') === 0 && phone.length === 13) {
      return '+234 ' + phone.slice(3, 6) + ' ' + phone.slice(6, 9) + ' ' + phone.slice(9);
    }
    return '+' + phone;
  }

  function maskPhone(phone) {
    if (!phone || phone.length < 6) return 'a group member';
    return '+' + phone.slice(0, 3) + ' ' + phone.slice(3, 5) + '••• ••' + phone.slice(-2);
  }

  function referralLink(phone) {
    return PRODUCTION_ORIGIN + '/' + JOIN_PAGE + '?ref=' + phone;
  }

  function isDuplicate(error) {
    if (!error) return false;
    return error.code === '23505' || /duplicate key|already exists/i.test(error.message || '');
  }

  function isMissingSetup(error) {
    if (!error) return false;
    var blob = [error.code, error.message, error.details, error.hint].join(' ');
    return /PGRST205|PGRST202|42P01|does not exist|schema cache|permission denied|row-level security|42501/i.test(blob);
  }

  function isSafeGroupUrl(url) {
    try {
      var parsed = new URL(url);
      return parsed.protocol === 'https:' &&
        ['chat.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com', 'wa.me'].indexOf(parsed.hostname) !== -1;
    } catch (err) {
      return false;
    }
  }

  function go(url) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch (err) {
      /* standalone page */
    }
    window.location.href = url;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      area.remove();
      return ok;
    }
  }

  function fillCountries(select) {
    COUNTRIES.forEach(function (country) {
      var option = document.createElement('option');
      option.value = country.dial;
      option.textContent = country.name + ' +' + country.dial;
      if (country.dial === '234') option.selected = true;
      select.appendChild(option);
    });
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function showError(el, error) {
    el.hidden = false;
    if (isMissingSetup(error)) {
      el.innerHTML = 'Supabase is not ready yet. Run <a href="./supabase-setup.sql">supabase-setup.sql</a> in the SQL Editor, then try again.';
      return;
    }
    if (error && error.code === '23514') {
      el.textContent = 'That number was rejected. Use your full mobile number.';
      return;
    }
    el.textContent = 'We could not save that just now. Check your connection and try again.';
  }

  /* ------------------------------------------------------------------ *
   * Supabase REST calls — plain fetch(), no client library              *
   * ------------------------------------------------------------------ */

  async function readError(res) {
    try {
      var body = await res.json();
      return {
        code: body.code,
        message: body.message || body.error,
        details: body.details,
        hint: body.hint,
      };
    } catch (err) {
      return { message: res.statusText };
    }
  }

  async function insertMinimal(table, row) {
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST',
        headers: Object.assign({}, API_HEADERS, { Prefer: 'return=minimal' }),
        body: JSON.stringify(row),
      });
      if (res.ok) return { error: null };
      return { error: await readError(res) };
    } catch (err) {
      return { error: { message: 'network error' } };
    }
  }

  async function probeSetup() {
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/wa_group_config?id=eq.1&select=id', {
        headers: API_HEADERS,
      });
      if (res.ok) return 'ready';
      var error = await readError(res);
      return isMissingSetup(error) || res.status === 404 ? 'missing' : 'unknown';
    } catch (err) {
      return 'unknown';
    }
  }

  async function getGroupUrl() {
    var fromDb = '';
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/wa_group_config?id=eq.1&select=whatsapp_url', {
        headers: API_HEADERS,
      });
      if (res.ok) {
        var rows = await res.json();
        fromDb = String((rows && rows[0] && rows[0].whatsapp_url) || '').trim();
      }
    } catch (err) {
      fromDb = '';
    }

    var candidate = fromDb && fromDb.indexOf('REPLACE_WITH') === -1
      ? fromDb
      : DEFAULT_WHATSAPP_GROUP_URL;
    if (!candidate || candidate.indexOf('REPLACE_WITH') !== -1 || !isSafeGroupUrl(candidate)) return '';
    return candidate;
  }

  async function fetchStats(phone) {
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/referral_stats', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ p_phone: phone }),
      });
      if (!res.ok) return null;
      var data = await res.json();
      return { visits: Number(data.visits || 0), joins: Number(data.joins || 0) };
    } catch (err) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Page 1 — get-link.html (share page)                                 *
   * ------------------------------------------------------------------ */

  function initShare() {
    var form = $('share-form');
    var select = $('country');
    var phoneInput = $('phone');
    var check = $('on-group');
    var errorEl = $('form-error');
    var preview = $('link-preview');
    var success = $('success');
    var formBlock = $('form-block');
    var linkOut = $('referral-link');
    var copyBtn = $('copy-btn');
    var copyLabel = copyBtn.querySelector('.btn-label');
    var waBtn = $('wa-share');
    var previewJoin = $('preview-join');
    var resetBtn = $('reset-btn');
    var submit = $('submit-btn');

    fillCountries(select);

    probeSetup().then(function (state) {
      if (state === 'missing') $('setup-banner').hidden = false;
    });

    var paintPreview = function () {
      var result = normalizePhone(select.value, phoneInput.value);
      if (!result.ok) {
        preview.hidden = true;
        return;
      }
      preview.hidden = false;
      preview.textContent = referralLink(result.phone);
    };

    phoneInput.addEventListener('input', paintPreview);
    select.addEventListener('change', paintPreview);

    async function showSuccess(phone) {
      var link = referralLink(phone);
      sessionStorage.setItem('tn_referrer_phone', phone);
      formBlock.hidden = true;
      success.hidden = false;
      $('saved-as').textContent = formatPhone(phone);
      linkOut.textContent = link;
      linkOut.href = './group-referral.html?ref=' + encodeURIComponent(phone);
      waBtn.href = 'https://wa.me/?text=' + encodeURIComponent('Join the Tasknory WhatsApp group with my link: ' + link);
      previewJoin.href = './group-referral.html?ref=' + encodeURIComponent(phone);
      var stats = await fetchStats(phone);
      if (stats) {
        $('stat-visits').textContent = String(stats.visits);
        $('stat-joins').textContent = String(stats.joins);
        $('stats').hidden = false;
      }
    }

    var saved = sessionStorage.getItem('tn_referrer_phone');
    if (saved && /^[0-9]{10,15}$/.test(saved)) showSuccess(saved);

    resetBtn.addEventListener('click', function () {
      sessionStorage.removeItem('tn_referrer_phone');
      success.hidden = true;
      formBlock.hidden = false;
      errorEl.hidden = true;
      phoneInput.focus();
    });

    copyBtn.addEventListener('click', async function () {
      var ok = await copyText(linkOut.textContent.trim());
      copyLabel.textContent = ok ? 'Copied' : 'Select the link';
      window.setTimeout(function () {
        copyLabel.textContent = 'Copy link';
      }, 1800);
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      errorEl.hidden = true;
      if ($('company').value) return;

      if (!check.checked) {
        errorEl.hidden = false;
        errorEl.textContent = 'Tick the box to confirm you are already on the group link.';
        check.focus();
        return;
      }

      var result = normalizePhone(select.value, phoneInput.value);
      if (!result.ok) {
        errorEl.hidden = false;
        errorEl.textContent = result.message;
        phoneInput.focus();
        return;
      }

      setBusy(submit, true);
      var outcome = await insertMinimal('wa_group_referrers', {
        phone: result.phone,
        on_group: true,
      });
      setBusy(submit, false);

      if (outcome.error && !isDuplicate(outcome.error)) {
        showError(errorEl, outcome.error);
        return;
      }

      await showSuccess(result.phone);
    });
  }

  /* ------------------------------------------------------------------ *
   * Page 2 — group-referral.html (join page)                            *
   * ------------------------------------------------------------------ */

  function initJoin() {
    var params = new URLSearchParams(window.location.search);
    var ref = normalizeRef(params.get('ref'));
    var form = $('join-form');
    var select = $('country');
    var phoneInput = $('phone');
    var errorEl = $('form-error');
    var submit = $('join-btn');
    var status = $('join-status');

    fillCountries(select);

    if (ref) {
      $('inviter-line').hidden = false;
      $('inviter-name').textContent = maskPhone(ref);
      var key = 'tn_visit_' + ref;
      if (!sessionStorage.getItem(key)) {
        insertMinimal('wa_group_visits', {
          referrer_phone: ref,
          user_agent: (navigator.userAgent || '').slice(0, 300),
        }).then(function (outcome) {
          if (!outcome.error) sessionStorage.setItem(key, '1');
        });
      }
    } else {
      $('no-ref').hidden = false;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      errorEl.hidden = true;
      status.hidden = true;
      if ($('company').value) return;

      var result = normalizePhone(select.value, phoneInput.value);
      if (!result.ok) {
        errorEl.hidden = false;
        errorEl.textContent = result.message;
        phoneInput.focus();
        return;
      }

      setBusy(submit, true);
      var outcome = await insertMinimal('wa_group_joins', {
        invitee_phone: result.phone,
        referrer_phone: ref || null,
        user_agent: (navigator.userAgent || '').slice(0, 300),
      });

      if (outcome.error && !isDuplicate(outcome.error)) {
        setBusy(submit, false);
        showError(errorEl, outcome.error);
        return;
      }

      var groupUrl = await getGroupUrl();
      setBusy(submit, false);

      if (!groupUrl) {
        status.hidden = false;
        status.textContent = 'Your number is saved. Add the WhatsApp group link in wa_group_config (or at the top of referral.js), then tap Join group again.';
        return;
      }

      status.hidden = false;
      status.innerHTML = 'Saved. Opening WhatsApp… <a href="' + groupUrl + '" target="_top" rel="noopener">Open the group</a>';
      window.setTimeout(function () { go(groupUrl); }, 650);
    });
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  var page = document.body.getAttribute('data-page');
  if (page === 'share') initShare();
  if (page === 'join') initJoin();
})();
