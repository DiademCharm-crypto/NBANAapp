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
    /* No tuition is attached to a new account: the office assigns fees
       from the Tuition & Fees page when they are ready to. */
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

  /* ---------- Enrolled students (SF1 roster) ----------
     students-roster.js carries the school's School Form 1 roster (Grades 1-6,
     one class per grade, no sections). Each learner becomes a portal account
     the first time the app runs on a device. The merge is idempotent and keyed
     on the account id and email, so office edits are never overwritten and the
     roster never duplicates itself. */
  function accountFromRoster(s) {
    return {
      id: s.id,
      role: 'student',
      firstName: s.first,
      middleName: s.middle,
      lastName: s.last,
      fullName: [s.first, s.middle, s.last].filter(Boolean).join(' '),
      age: s.age,
      birthdate: s.birth,
      gender: s.sex,
      civilStatus: 'Single',
      religion: s.religion,
      nationality: 'Filipino',
      email: s.email,
      phone: '',
      address: {
        house: (s.address && s.address.house) || '',
        barangay: (s.address && s.address.barangay) || '',
        city: (s.address && s.address.city) || '',
        province: (s.address && s.address.province) || '',
        zip: ''
      },
      guardian: {
        name: (s.guardian && s.guardian.name) || '',
        relationship: (s.guardian && s.guardian.relationship) || '',
        phone: '',
        occupation: ''
      },
      /* No section: every grade in this school runs as a single class */
      student: {
        lrn: s.lrn,
        gradeLevel: s.grade,
        schoolYear: DEFAULT_SCHOOL_YEAR,
        semester: 'First Semester'
      },
      username: s.email,
      passwordHash: s.passwordHash,
      createdAt: new Date().toISOString(),
      /* Tuition is deliberately not set: the school assesses fees later */
      tasks: []
    };
  }

  function seedRoster() {
    const roster = (typeof window !== 'undefined' && Array.isArray(window.NBANA_ROSTER))
      ? window.NBANA_ROSTER : [];
    if (!roster.length) return 0;
    const accounts = getAccounts();
    const ids = new Set(accounts.map(a => a.id));
    const mails = new Set(accounts.map(a => String(a.email || '').toLowerCase()));
    let added = 0;
    roster.forEach(s => {
      if (!s || !s.id || !s.email) return;
      const mail = String(s.email).toLowerCase();
      if (ids.has(s.id) || mails.has(mail)) return;
      accounts.push(accountFromRoster(s));
      ids.add(s.id);
      mails.add(mail);
      added++;
    });
    if (added) saveAccounts(accounts);
    return added;
  }

  /* ---------- Faculty & staff (the school's Teachers & Staff listing) ----------
     faculty-roster.js carries the listing about.html shows: the school
     administration and the eight class advisers. A full admin can edit the
     list inside the portal. Their copy lives in FACULTY_KEY and is what every
     page (portal and the public Teachers & Staff page) renders. */
  const FACULTY_KEY = 'nbana.faculty.v1';

  function defaultFaculty() {
    const def = (typeof window !== 'undefined' && Array.isArray(window.NBANA_FACULTY)) ? window.NBANA_FACULTY : [];
    return def.map(f => Object.assign({}, f));
  }

  function facultyList() {
    const saved = store.get(FACULTY_KEY, null);
    const list = Array.isArray(saved) ? saved : defaultFaculty();
    return list.slice().sort((a, b) =>
      (Number(a.order) || 0) - (Number(b.order) || 0) ||
      String(a.name || '').localeCompare(String(b.name || '')));
  }

  function saveFaculty(list) { store.set(FACULTY_KEY, list || []); }
  function facultyAdmins() { return facultyList().filter(f => f.group !== 'teacher'); }
  function facultyTeachers() { return facultyList().filter(f => f.group === 'teacher'); }
  function facultyAdviser(grade) {
    const t = facultyTeachers().find(f => f.grade === grade);
    return t ? t.name : '';
  }

  /* ---------- Teacher accounts (one for every class adviser) ----------
     Every adviser in the listing gets a portal account the first time a device
     runs the app. The merge is keyed on the account id and the email, so
     office edits survive and nothing duplicates itself. When the principal
     moves a teacher to another grade in Faculty & Staff, the account follows
     on every device, and teachers never carry tuition. */
  const DEFAULT_TEACHER_PW = 'nbana123';

  function firstWord(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function lastWord(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }
  /* 'Sunshine Rose A. Anggot' -> 'sunshine.anggot@nbana.edu.ph' */
  function emailFor(name) {
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const last = slug(lastWord(name));
    return slug(firstWord(name)) + (last ? '.' + last : '') + '@nbana.edu.ph';
  }
  function freeEmail(email) {
    const taken = new Set(getAccounts().map(a => String(a.email || '').toLowerCase()));
    if (!taken.has(email)) return email;
    const parts = email.split('@');
    let n = 2;
    while (taken.has(parts[0] + n + '@' + parts[1])) n++;
    return parts[0] + n + '@' + parts[1];
  }

  function seedFaculty() {
    const seeds = (typeof window !== 'undefined' && Array.isArray(window.NBANA_TEACHER_SEEDS))
      ? window.NBANA_TEACHER_SEEDS : [];
    const teachers = facultyTeachers();
    if (!teachers.length) return { added: 0, updated: 0 };
    const accounts = getAccounts();
    const byId = new Map(accounts.map(a => [a.id, a]));
    const byMail = new Map(accounts.map(a => [String(a.email || '').toLowerCase(), a]));
    let added = 0;
    let updated = 0;

    teachers.forEach(t => {
      if (!t || !t.id) return;
      const seed = seeds.find(s => s.facultyId === t.id) || null;
      const wanted = String(t.email || (seed && seed.email) || emailFor(t.name)).toLowerCase();
      const acc = (seed && byId.get(seed.id)) || byMail.get(wanted) || null;

      if (!acc) {
        const mail = freeEmail(wanted);
        const fresh = {
          /* Seeded accounts keep their fixed id so every device agrees on it */
          id: (seed && seed.id) || ('acc_' + t.id),
          role: 'teacher',
          facultyId: t.id,
          firstName: firstWord(t.name),
          middleName: '',
          lastName: lastWord(t.name),
          fullName: t.name,
          assignedGrade: t.grade || '',
          email: mail,
          phone: '',
          address: { house: '', barangay: '', city: '', province: '', zip: '' },
          photo: t.photo || '',
          username: mail,
          passwordHash: (seed && seed.passwordHash) || hash(DEFAULT_TEACHER_PW),
          createdAt: new Date().toISOString(),
          tasks: []
        };
        accounts.push(fresh);
        byId.set(fresh.id, fresh);
        byMail.set(mail, fresh);
        added++;
        return;
      }

      /* Never touch a student or office account that shares the address */
      if (acc.role !== 'teacher') return;
      let dirty = false;
      if (acc.facultyId !== t.id) { acc.facultyId = t.id; dirty = true; }
      if (acc.fullName !== t.name) {
        acc.fullName = t.name;
        acc.firstName = firstWord(t.name);
        acc.lastName = lastWord(t.name);
        dirty = true;
      }
      if ((acc.assignedGrade || '') !== (t.grade || '')) { acc.assignedGrade = t.grade || ''; dirty = true; }
      if (t.photo && acc.photo !== t.photo) { acc.photo = t.photo; dirty = true; }
      if (acc.billing) { delete acc.billing; dirty = true; }
      if (dirty) updated++;
    });

    if (added || updated) saveAccounts(accounts);
    return { added, updated };
  }

  /* ---------- Public Teachers & Staff page (about.html) ----------
     The page ships the listing as plain HTML so it also works without
     JavaScript; here the two card grids are refreshed from the shared faculty
     data, and when the cloud is configured the principal's latest edits are
     picked up so the live website matches the portal. */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function facultyCard(f) {
    return '<div class="card ' + (f.group === 'teacher' ? 'card-teacher' : 'card-admin') + '">' +
      '<div class="img-wrapper"><img src="' + escHtml(f.photo || 'logo.png') + '" alt="' + escHtml(f.name) + '" loading="lazy"></div>' +
      '<h3>' + escHtml(f.name) + '</h3>' +
      '<p class="role">' + escHtml(f.role || '') + '</p></div>';
  }

  function renderFacultyPage() {
    const admins = document.getElementById('facAdmins');
    const teachers = document.getElementById('facTeachers');
    if (!admins && !teachers) return;
    const list = facultyList();
    if (admins) admins.innerHTML = list.filter(f => f.group !== 'teacher').map(facultyCard).join('');
    if (teachers) teachers.innerHTML = list.filter(f => f.group === 'teacher').map(facultyCard).join('');
  }

  /* One small read: only the faculty rows, never the whole school dataset. */
  async function refreshFacultyFromCloud() {
    const cfg = (typeof window !== 'undefined' && window.NBANA_CLOUD) || {};
    if (!cfg.url || !cfg.key || cfg.enabled === false) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const rest = String(cfg.url).replace(/\/+$/, '') + '/rest/v1/nbana_records';
    let rows;
    try {
      const res = await fetch(rest + '?kind=eq.faculty&select=payload', {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }
      });
      if (!res.ok) return false;
      rows = await res.json();
    } catch (e) {
      return false;
    }
    const items = (rows || []).map(r => r && r.payload).filter(x => x && x.id);
    if (!items.length) return false;
    store.set(FACULTY_KEY, items);
    return true;
  }

  /* ---------- One-time tuition cleanup ----------
     Older builds stamped the demo tuition (the ₱12,800 default) onto every
     account. The school has not assessed tuition yet, so drop any assessment
     that still exactly matches that demo default. Real fees the office assigns
     are never touched, and each device only ever runs this once. */
  const NOTUITION_KEY = 'nbana.notuition.v1';
  function stripDemoTuition() {
    if (store.get(NOTUITION_KEY, false) === true) return 0;
    const accounts = getAccounts();
    let cleared = 0;
    accounts.forEach(a => {
      if (a.billing && isDemoBilling(a.billing)) { delete a.billing; cleared++; }
    });
    if (cleared) saveAccounts(accounts);
    store.set(NOTUITION_KEY, true);
    return cleared;
  }

  /* ---------- Billing helpers ---------- */
  /* An account still carrying the untouched demo assessment - same line items,
     never any payment - counts as "no tuition yet". Key order changes when
     records travel through the cloud, so compare content, not strings. */
  function isDemoBilling(b) {
    if (!b) return false;
    if ((b.payments || []).length) return false;
    const d = defaultBilling();
    const items = b.items || [];
    if (items.length !== d.items.length) return false;
    return items.every((it, i) =>
      it.label === d.items[i].label &&
      Number(it.amount) === Number(d.items[i].amount) &&
      String(it.note || '') === String(d.items[i].note || ''));
  }

  function billingSummary(account) {
    const b = account && account.billing;
    const items = (b && b.items) || [];
    const payments = (b && b.payments) || [];
    /* "No tuition yet" means: no assessment at all, the untouched demo
       default, or an emptied-out assessment. Never invent fees - the office
       assigns them from the Tuition & Fees page. */
    if (!b || isDemoBilling(b) || (!items.length && !payments.length)) {
      return { assessed: 0, paid: 0, balance: 0, percent: 0, items: [], payments: [], unset: true };
    }
    const assessed = items.reduce((s, i) => s + i.amount, 0);
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, assessed - paid);
    return { assessed, paid, balance, percent: assessed ? Math.round((paid / assessed) * 100) : 0, items: items, payments: payments };
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

  /* ---------- Confirmation dialog ----------
     Public pages do not load the portal stylesheet, so this one carries its own
     small inline look. Used for signing out from the site header. */
  function confirmDialog(opts) {
    const old = document.getElementById('nbanaConfirm');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'nbanaConfirm';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:4000;display:grid;place-items:center;padding:20px';
    wrap.innerHTML =
      '<div data-cf-back style="position:absolute;inset:0;background:rgba(5,10,25,.55)"></div>' +
      '<div style="position:relative;width:min(400px,100%);background:#ffffff;color:#1f2937;border-radius:14px;' +
        'padding:22px;box-shadow:0 20px 45px rgba(0,0,0,.25)">' +
        '<h4 style="margin:0 0 8px;font-size:1.05rem"></h4>' +
        '<p style="margin:0;font-size:.88rem;line-height:1.5;color:#4b5563"></p>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">' +
          '<button type="button" data-cf-cancel style="padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;' +
            'background:#ffffff;font:inherit;font-weight:600;color:#374151;cursor:pointer">Cancel</button>' +
          '<button type="button" data-cf-ok style="padding:8px 14px;border-radius:8px;border:none;background:#0d2c54;' +
            'color:#ffffff;font:inherit;font-weight:700;cursor:pointer"></button>' +
        '</div>' +
      '</div>';
    wrap.querySelector('h4').textContent = opts.title || 'Are you sure?';
    wrap.querySelector('p').textContent = opts.body || '';
    const ok = wrap.querySelector('[data-cf-ok]');
    ok.textContent = opts.okLabel || 'Continue';
    const close = () => wrap.remove();
    ok.addEventListener('click', () => { close(); if (opts.onOk) opts.onOk(); });
    wrap.querySelector('[data-cf-cancel]').addEventListener('click', close);
    wrap.querySelector('[data-cf-back]').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    document.body.appendChild(wrap);
    ok.focus();
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
        confirmDialog({
          title: 'Log out?',
          body: 'You will need your email address and password to sign in again.',
          okLabel: 'Log out',
          onOk: () => {
            store.del(KEYS.session);
            toast('You have been signed out.');
            setTimeout(() => { window.location.href = appUrl('login.html'); }, 400);
          }
        });
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
    /* Only the first page of a browsing session gets the launch splash.
       Moving from one page to another must never flash a loading screen. */
    try {
      if (sessionStorage.getItem('nbana.splash.seen')) return;
      sessionStorage.setItem('nbana.splash.seen', '1');
    } catch (e) { /* storage blocked (private mode): show it as before */ }
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
    seedFaculty();
    seedRoster();
    stripDemoTuition();
    initTheme();
    document.addEventListener('DOMContentLoaded', () => {
      renderFacultyPage();
      if (document.getElementById('facAdmins') || document.getElementById('facTeachers')) {
        refreshFacultyFromCloud().then((fresh) => { if (fresh) renderFacultyPage(); });
      }
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
    seedRoster, seedFaculty,
    FACULTY_KEY, facultyList, saveFaculty, facultyAdmins, facultyTeachers, facultyAdviser,
    renderFacultyPage,
    escHtml,
    appUrl, appModeOn, standaloneApp, forceAppMode
  };
})();
