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
    seeded: 'nbana.seeded.v1'
  };

  /* ---------- Tiny non-reversible hash (demo-grade, not real crypto) ---------- */
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36) + '_' + str.length;
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
    window.location.href = 'index.html';
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
    if (store.get(KEYS.seeded, false)) return;
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
      saveAccounts(accounts);
    }
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

    /* Hamburger button (only where a nav menu exists) */
    let toggle = nav.querySelector('.nav-toggle');
    if (links && !toggle) {
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

    /* Auth slot */
    const slot = nav.querySelector('.nav-auth');
    if (slot) {
      const user = currentUser();
      slot.innerHTML = user
        ? '<a href="portal.html" class="nav-btn nav-btn-solid">Portal</a>' +
          '<button type="button" class="nav-btn nav-btn-ghost" data-logout>Log out</button>'
        : '<a href="login.html" class="nav-btn nav-btn-solid">Sign In</a>';
      const out = slot.querySelector('[data-logout]');
      if (out) out.addEventListener('click', () => {
        store.del(KEYS.session);
        toast('You have been signed out.');
        setTimeout(() => { window.location.href = 'index.html'; }, 400);
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
    });
  }
  init();

  return {
    store, KEYS, hash,
    getAccounts, createAccount, findByLogin, findAccount, authenticate,
    currentUser, logout, setSession,
    defaultBilling, defaultTasks, billingSummary, peso,
    toast, applyTheme, toggleTheme
  };
})();
