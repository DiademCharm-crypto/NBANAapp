/* ============================================================
   NBANA APP - Shared script (auth, session, theme, nav, utils)
   ============================================================ */

const NBANA = (() => {
  'use strict';

  /* ---------- Safe storage (works even if localStorage is blocked) ---------- */
  const memory = {};
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return key in memory ? memory[key] : fallback;
      }
    },
    set(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* fallback to memory */ }
    },
    del(key) {
      delete memory[key];
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  const KEYS = {
    accounts: 'nbana.accounts.v1',
    session: 'nbana.session.v1',
    theme: 'nbana.theme.v1',
    seeded: 'nbana.seeded.v1',
    schoolYear: 'nbana.schoolyear.v1'
  };

  /* ---------- Roles & the staff secret code ----------
     Student accounts are open to everyone. Teacher and Administrator
     accounts need the school's staff secret code (issued by the principal).
     Change STAFF_CODE here to rotate it for the whole site. */
  const STAFF_CODE = 'NBANA-STAFF-2026';
  const DEFAULT_SCHOOL_YEAR = '2026-2027';

  const ROLES = {
    student: { label: 'Student', pill: 'pill-amber' },
    teacher: { label: 'Teacher', pill: 'pill-green' },
    admin: { label: 'Administrator', pill: 'pill-navy' },
    principal: { label: 'Principal', pill: 'pill-navy' }
  };

  function isAdminRole(r) { return r === 'principal' || r === 'admin'; }
  function roleLabel(r) { return (ROLES[r] || ROLES.student).label; }

  /* Is this the code the school hands out for teacher / admin accounts? */
  function checkStaffCode(input) {
    return String(input || '').trim().toUpperCase() === STAFF_CODE;
  }

  /* ---------- School year (shared across every grade level) ---------- */
  function getSchoolYear() {
    const y = store.get(KEYS.schoolYear, DEFAULT_SCHOOL_YEAR);
    return (typeof y === 'string' && y.trim()) ? y.trim() : DEFAULT_SCHOOL_YEAR;
  }
  function setSchoolYear(year) { store.set(KEYS.schoolYear, String(year).trim()); }

  /* '2026-2027' -> '2027-2028' (keeps whatever separator was used) */
  function nextSchoolYear(year, from, to) {
    const m = /(\d{4})\s*([-\u2013\u2014])\s*(\d{4})/.exec(String(year || ''));
    if (m) return (Number(m[1]) + 1) + m[2] + (Number(m[3]) + 1);
    if (from && to) return String(from) + '-' + String(to);
    return year;
  }

  /* ---------- Tiny non-reversible hash (demo-grade, not real crypto) ---------- */
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36) + '_' + str.length;
  }

  /* ---------- Password assist (school office can read back a forgotten password) ----------
     Demo-grade like the rest of this build: the password is kept lightly obfuscated so
     the office can give it back to its owner after checking their identity. It is
     captured at every successful sign-in and whenever the password is changed. */
  function encPw(s) { try { return btoa(unescape(encodeURIComponent(String(s)))); } catch (e) { return ''; } }
  function decPw(code) { try { return decodeURIComponent(escape(atob(String(code || '')))); } catch (e) { return ''; } }
  function rememberPw(account, password) {
    const code = encPw(password);
    if (!code || !account) return;
    const list = getAccounts();
    const i = list.findIndex((a) => a.id === account.id);
    if (i < 0) return;
    list[i].pwCode = code;
    saveAccounts(list);
    if (currentUser() && currentUser().id === account.id) account.pwCode = code;
  }

  /* ---------- Accounts ---------- */
  function getAccounts() { return store.get(KEYS.accounts, []) || []; }
  function saveAccounts(list) { store.set(KEYS.accounts, list); }
  function findAccount(id) { return getAccounts().find(a => a.id === id) || null; }
  function findByLogin(login) {
    const key = String(login || '').trim().toLowerCase();
    return getAccounts().find(a =>
      a.email.toLowerCase() === key || (a.username || '').toLowerCase() === key
    ) || null;
  }

  function createAccount(profile, password) {
    const accounts = getAccounts();
    const account = Object.assign({
      id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString()
    }, profile);
    account.passwordHash = hash(password);
    account.username = (profile.email || '').trim().toLowerCase();
    account.role = profile.role || 'student';
    if (account.role === 'teacher') account.assignedGrade = profile.assignedGrade || '';
    account.billing = defaultBilling();
    account.tasks = defaultTasks();
    accounts.push(account);
    saveAccounts(accounts);
    return account;
  }

  function authenticate(login, password) {
    const account = findByLogin(login);
    if (!account) return { ok: false, error: 'No account matches that email or username.' };
    if (account.passwordHash !== hash(password)) return { ok: false, error: 'Incorrect password. Please try again.' };
    setSession(account.id);
    rememberPw(account, password);
    return { ok: true, account };
  }

  /* ---------- Session ---------- */
  function setSession(id) { store.set(KEYS.session, id); }
  function currentUser() {
    const id = store.get(KEYS.session, null);
    if (!id) return null;
    const account = findAccount(id);
    if (!account) { store.del(KEYS.session); return null; }
    return account;
  }
  function logout() {
    store.del(KEYS.session);
    window.location.href = appUrl('login.html');
  }

  /* ---------- Demo seed ---------- */
  function defaultBilling() {
    return {
      schoolYear: '2026–2027',
      items: [
        { label: 'Tuition Fee', note: '10 months', amount: 9000 },
        { label: 'Miscellaneous', note: 'Books, forms, tests', amount: 2400 },
        { label: 'Registration / Enrollment', note: 'One-time', amount: 800 },
        { label: 'School Activities', note: 'Field trips, programs', amount: 600 }
      ],
      payments: [],
      dueDay: 15
    };
  }

  function defaultTasks() {
    return [
      { id: 't1', title: 'Book report: "The Great Controversy" Ch. 1–4', subject: 'Reading', due: '2026-10-09', done: false },
      { id: 't2', title: 'Math worksheet: Fractions & Decimals', subject: 'Mathematics', due: '2026-10-12', done: false },
      { id: 't3', title: 'Science fair group outline', subject: 'Science', due: '2026-10-16', done: false },
      { id: 't4', title: 'Memory verse: Philippians 4:13', subject: 'Spiritual Life', due: '2026-10-11', done: true }
    ];
  }

  function seedDemo() {
    const accounts = getAccounts();
    if (!accounts.some(a => a.email === 'juan.delacruz@nbana.edu.ph')) {
      const demo = {
        id: 'acc_demo0001',
        firstName: 'Juan D.',
        middleName: '',
        lastName: 'Dela Cruz',
        fullName: 'Juan D. Dela Cruz',
        age: '11',
        birthdate: '2015-06-12',
        gender: 'Male',
        civilStatus: 'Single',
        religion: 'Seventh-day Adventist',
        nationality: 'Filipino',
        email: 'juan.delacruz@nbana.edu.ph',
        phone: '0917 000 0000',
        address: {
          house: '123 Mabini St.',
          barangay: 'San Jose',
          city: 'Zamboanga City',
          province: 'Zamboanga Peninsula',
          zip: '7000'
        },
        guardian: { name: 'Rosa M. Dela Cruz', relationship: 'Mother', phone: '0918 000 0000', occupation: 'Home Maker' },
        student: { lrn: '1234567890123', gradeLevel: 'Grade 5', section: 'Mabini', schoolYear: '2026–2027', semester: 'First Semester' },
        username: 'juan.delacruz@nbana.edu.ph',
        passwordHash: hash('nbana123'),
        createdAt: new Date().toISOString(),
        billing: defaultBilling(),
        tasks: defaultTasks()
      };
      demo.billing.payments = [
        { id: 'p1', date: '2026-06-15', ref: 'ENR-2026-0001', method: 'Cash', amount: 2000, label: 'Enrollment fee', status: 'Posted' },
        { id: 'p2', date: '2026-08-10', ref: 'GC-8842101', method: 'GCash', amount: 4000, label: '1st installment', status: 'Posted' },
        { id: 'p3', date: '2026-09-10', ref: 'CASH-091026', method: 'Cash', amount: 3300, label: '2nd installment', status: 'Posted' }
      ];
      accounts.push(demo);
    }

    /* Demo admins: principal (full admin) + teacher (Grade 5 adviser) */
    if (!accounts.some(a => a.email === 'principal@nbana.edu.ph')) {
      accounts.push({
        id: 'acc_prin0001',
        firstName: 'Janice Rose B.',
        middleName: '',
        lastName: 'Beronas',
        fullName: 'Janice Rose B. Beronas',
        role: 'principal',
        email: 'principal@nbana.edu.ph',
        phone: '0917 000 0001',
        address: {
          house: 'Administration Office',
          barangay: 'San Jose',
          city: 'Zamboanga City',
          province: 'Zamboanga Peninsula',
          zip: '7000'
        },
        username: 'principal@nbana.edu.ph',
        passwordHash: hash('nbana123'),
        createdAt: new Date().toISOString(),
        billing: defaultBilling(),
        tasks: []
      });
    }
    if (!accounts.some(a => a.email === 'joy.lomongo@nbana.edu.ph')) {
      accounts.push({
        id: 'acc_tchr0001',
        firstName: 'Joy E.',
        middleName: '',
        lastName: 'Lomongo',
        fullName: 'Joy E. Lomongo',
        role: 'teacher',
        assignedGrade: 'Grade 5',
        email: 'joy.lomongo@nbana.edu.ph',
        phone: '0917 000 0002',
        address: {
          house: 'Faculty House',
          barangay: 'San Jose',
          city: 'Zamboanga City',
          province: 'Zamboanga Peninsula',
          zip: '7000'
        },
        username: 'joy.lomongo@nbana.edu.ph',
        passwordHash: hash('nbana123'),
        createdAt: new Date().toISOString(),
        billing: defaultBilling(),
        tasks: []
      });
    }
    saveAccounts(accounts);
    store.set(KEYS.seeded, true);
  }

  /* ---------- Billing helpers ---------- */
  function billingSummary(account) {
    const b = account.billing || defaultBilling();
    const assessed = b.items.reduce((s, i) => s + i.amount, 0);
    const paid = (b.payments || []).reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, assessed - paid);
    return { assessed, paid, balance, percent: assessed ? Math.round((paid / assessed) * 100) : 0, items: b.items, payments: b.payments || [] };
  }

  /* ---------- Currency ---------- */
  function peso(n) {
    return '\u20b1' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  function initTheme() {
    applyTheme(store.get(KEYS.theme, 'light'));
  }
  function toggleTheme() {
    const next = store.get(KEYS.theme, 'light') === 'dark' ? 'light' : 'dark';
    store.set(KEYS.theme, next);
    applyTheme(next);
  }

  /* ---------- Toast ---------- */
  function toast(message, type) {
    let el = document.getElementById('nbanaToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nbanaToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  /* ---------- Navbar (auth slot + hamburger + theme toggle) ---------- */
  function enhanceNav() {
    const nav = document.querySelector('.navbar') || document.querySelector('.top-bar');
    if (!nav) return;

    const links = nav.querySelector('.nav-links');

    /* Hamburger button (only where a nav menu exists — never on the portal,
       where the sidebar / bottom nav already handle navigation) */
    const isPortal = !!document.getElementById('portalShell');
    let toggle = nav.querySelector('.nav-toggle');
    if (links && !toggle && !isPortal) {
      toggle = document.createElement('button');
      toggle.className = 'nav-toggle';
      toggle.setAttribute('aria-label', 'Toggle menu');
      toggle.innerHTML = '<span></span><span></span><span></span>';
      nav.appendChild(toggle);
    }
    if (toggle) toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav-open');
      toggle.classList.toggle('is-open', open);
      if (links) links.classList.toggle('is-open', open);
    });

    /* Theme toggle */
    if (!nav.querySelector('.theme-toggle')) {
      const themeBtn = document.createElement('button');
      themeBtn.className = 'theme-toggle';
      themeBtn.type = 'button';
      themeBtn.title = 'Toggle dark mode';
      themeBtn.innerHTML = '&#9789;';
      themeBtn.addEventListener('click', toggleTheme);
      nav.appendChild(themeBtn);
    }

    /* Auth slot (skipped on the portal — it has its own Log out in the
       sidebar and in the More drawer) */
    const slot = nav.querySelector('.nav-auth');
    if (slot && isPortal) { slot.remove(); }
    if (slot && !isPortal) {
      const user = currentUser();
      slot.innerHTML = user
        ? '<a href="portal.html" class="nav-btn nav-btn-solid">Portal</a>' +
          '<button type="button" class="nav-btn nav-btn-ghost" data-logout>Log out</button>'
        : '<a href="login.html" class="nav-btn nav-btn-solid">Sign In</a>';
      const out = slot.querySelector('[data-logout]');
      if (out) out.addEventListener('click', () => {
        store.del(KEYS.session);
        toast('You have been signed out.');
        setTimeout(() => { window.location.href = appUrl('login.html'); }, 400);
      });
    }

    /* Close mobile menu when a link is chosen */
    if (links && toggle) links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('nav-open');
      toggle.classList.remove('is-open');
      links.classList.remove('is-open');
    }));
  }

  /* ---------- Landing niceties ---------- */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(el => io.observe(el));
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;
    const animate = (el) => {
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      const duration = 1100;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { counters.forEach(animate); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    counters.forEach(el => io.observe(el));
  }

  function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '&uarr;';
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
      btn.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function initFaq() {
    document.querySelectorAll('.faq-item button').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if (!open) item.classList.add('open');
      });
    });
  }

  function stampYear() {
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  /* ---------- App mode ----------
     True on a phone-sized screen, in the installed app, or when the URL
     asks for it (?app=1 — handy for trying the app look on a computer).
     Pages style themselves differently with this on. */
  function forceAppMode() { return /[?&](app|standalone)=1/.test(location.search); }
  function standaloneApp() {
    return forceAppMode() ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) ||
      window.navigator.standalone === true ||
      /* A WebView APK that is not a TWA cannot report standalone display mode,
         so app.html tells the builder to set this user-agent token. */
      /\bNBANAApp\b/i.test(navigator.userAgent || '');
  }
  function appModeOn() { return standaloneApp() || window.innerWidth <= 860; }

  /* Keep the app look while moving between pages: a redirect that drops ?app=1
     would drop the user back into the website layout. */
  function appUrl(page) {
    if (!forceAppMode()) return page;
    return page + (page.indexOf('?') === -1 ? '?' : '&') + 'app=1';
  }

  function initAppMode() {
    const apply = () => document.body.classList.toggle('app-mode', appModeOn());
    apply();
    window.addEventListener('resize', apply);
  }

  /* ---------- Launch splash (app mode only) ---------- */
  function initSplash() {
    const el = document.getElementById('splash');
    if (!el || !appModeOn()) return;
    el.hidden = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.classList.add('done');
      setTimeout(() => { el.hidden = true; }, 500);
    };
    const seen = new Promise((resolve) => setTimeout(resolve, 1100));
    const loaded = new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, { once: true });
    });
    Promise.all([seen, loaded]).then(finish);
    setTimeout(finish, 4000);   /* never hold the app hostage */
  }

  /* ---------- First-run setup for the installed app ----------
     A sideloaded Android app needs "install unknown apps" switched on so it
     can update itself later. A web page cannot read that Android setting, so
     the app asks the user to confirm it once and blocks use until they do. */
  const SETUP_KEY = 'nbana.setup.v1';

  function setupGateHtml() {
    return '<div class="gate-card" role="dialog" aria-modal="true" aria-label="One-time app setup">' +
      '<h3>One-time setup: allow app updates</h3>' +
      '<p>So this app can update itself later, Android needs permission to install apps from this source. Please turn it on once \u2014 after that, updates install on their own.</p>' +
      '<ol class="gate-steps">' +
        '<li>Open <b>Settings</b> on your phone.</li>' +
        '<li>Go to <b>Apps</b> \u2192 <b>Special access</b> \u2192 <b>Install unknown apps</b>.</li>' +
        '<li>Find <b>NBANA Portal</b> \u2014 or the browser you downloaded it with (for example Chrome).</li>' +
        '<li>Turn <b>Allow from this source</b> on.</li>' +
        '<li>Come back here and tap the button below.</li>' +
      '</ol>' +
      '<p class="gate-note">This is the standard Android step for apps installed outside the Play Store. It is safe, and you can turn it off anytime.</p>' +
      '<div class="gate-actions"><button type="button" class="btn-sm solid" id="gateDone">I have turned it on</button></div>' +
      '</div>';
  }

  function initSetupGate() {
    if (!standaloneApp()) return;                 /* only inside the installed app */
    if (store.get(SETUP_KEY, false) === true) return;
    const gate = document.createElement('div');
    gate.id = 'setupGate';
    gate.innerHTML = setupGateHtml();
    document.body.appendChild(gate);
    const done = document.getElementById('gateDone');
    if (done) done.addEventListener('click', () => {
      store.set(SETUP_KEY, true);
      gate.remove();
      toast('Setup complete. This app can now update itself.', 'success');
    });
  }

  /* ---------- Boot ---------- */
  function init() {
    seedDemo();
    initTheme();
    document.addEventListener('DOMContentLoaded', () => {
      enhanceNav();
      initReveal();
      initCounters();
      initBackToTop();
      initFaq();
      stampYear();
      initAppMode();
      initSplash();
      initSetupGate();
    });
  }
  init();

  /* ---------- Progressive Web App: register the service worker so the portal
     opens like an installed app (standalone window, instant loads) ---------- */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__nbanaInstall = e;
  });

  return {
    store, KEYS, hash,
    getAccounts, createAccount, findByLogin, findAccount, authenticate,
    currentUser, logout, setSession,
    defaultBilling, defaultTasks, billingSummary, peso,
    toast, applyTheme, toggleTheme,
    STAFF_CODE, DEFAULT_SCHOOL_YEAR, ROLES,
    isAdminRole, roleLabel, checkStaffCode,
    getSchoolYear, setSchoolYear, nextSchoolYear,
    rememberPw, decPw,
    appUrl, appModeOn, standaloneApp, forceAppMode
  };
})();
