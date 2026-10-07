/* ============================================================
   NBANA School Portal - dashboard logic
   ============================================================ */
(function () {
  'use strict';

  const user = NBANA.currentUser();
  if (!user) {
    NBANA.toast('Please sign in to open the school portal.', 'error');
    window.location.replace('login.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const money = NBANA.peso;

  /* ---------------- Roles & scope ---------------- */
  const role = user.role || 'student';
  const isPrincipal = role === 'principal';
  const isTeacher = role === 'teacher';
  const isAdmin = isPrincipal || isTeacher;
  const teacherGrade = user.assignedGrade || 'Grade 5';
  const GRADES = ['Kinder 1', 'Kinder 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

  const K = {
    grades: 'nbana.grades.v1',
    attendance: 'nbana.attendance.v1',
    schedule: 'nbana.schedules.v1',
    feed: 'nbana.feed.v1',
    assignments: 'nbana.assignments.v1'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Students visible to the signed-in admin */
  function studentsInScope() {
    return NBANA.getAccounts().filter(a =>
      (a.role || 'student') === 'student' &&
      (!isTeacher || (a.student && a.student.gradeLevel) === teacherGrade)
    );
  }
  function allStudents() {
    return NBANA.getAccounts().filter(a => (a.role || 'student') === 'student');
  }

  /* ---------------- View routing ---------------- */
  const VIEWS = {
    dashboard: ['Dashboard', 'Your school day at a glance'],
    students: ['Students', 'Manage every student account'],
    fees: ['Tuition & Fees', 'Assessed fees, payments, and balance'],
    grades: ['Grades', 'Report card and class standing'],
    attendance: ['Attendance', 'Daily record for this term'],
    schedule: ['Class Schedule', 'Weekly timetable'],
    tasks: ['Assignments', 'Tasks and due dates'],
    news: ['Announcements', 'Latest from the school'],
    profile: ['My Profile', 'Your registration survey answers']
  };

  /* Which sections each role may open. Teachers never see tuition. */
  const ALLOWED = {
    student: ['dashboard', 'fees', 'grades', 'attendance', 'schedule', 'tasks', 'news', 'profile'],
    teacher: ['dashboard', 'grades', 'attendance', 'schedule', 'tasks', 'news', 'profile'],
    principal: ['dashboard', 'students', 'fees', 'grades', 'attendance', 'schedule', 'news', 'profile']
  };

  function setView(name) {
    if (!VIEWS[name] || ALLOWED[role].indexOf(name) === -1) name = 'dashboard';
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('#sideNav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('viewTitle').textContent = VIEWS[name][0];
    $('viewSub').textContent = VIEWS[name][1];
    $('portalShell').classList.remove('side-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('#sideNav button').forEach(b => {
    b.hidden = ALLOWED[role].indexOf(b.dataset.view) === -1;
    b.addEventListener('click', () => setView(b.dataset.view));
  });
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.addEventListener('click', () => setView(b.dataset.goto));
  });

  /* Sidebar toggle (mobile) */
  const shell = $('portalShell');
  $('sideToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    shell.classList.toggle('side-open');
  });
  shell.addEventListener('click', (e) => {
    if (shell.classList.contains('side-open') && !e.target.closest('.portal-side')) {
      shell.classList.remove('side-open');
    }
  });

  /* Logout */
  $('logoutBtn').addEventListener('click', () => {
    NBANA.store.del(NBANA.KEYS.session);
    NBANA.toast('You have been signed out.');
    setTimeout(() => { window.location.href = 'index.html'; }, 400);
  });

  /* ---------------- Header chips ---------------- */
  $('chipDate').textContent = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const schoolYear = (user.student && user.student.schoolYear) || '2026-2027';
  $('chipYear').textContent = 'SY ' + schoolYear;

  /* Sidebar identity */
  const fullName = user.fullName || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ');
  const initials = (user.firstName || '?').charAt(0) + (user.lastName || '').charAt(0);
  $('sideAvatar').textContent = initials.toUpperCase() || '?';
  $('sideName').textContent = fullName;
  if (isAdmin) {
    $('sideGrade').textContent = isPrincipal ? 'Full Admin \u00b7 Principal' : 'Teacher \u00b7 ' + teacherGrade;
    $('sideAvatar').classList.add('admin');
  } else {
    $('sideGrade').textContent = (user.student ? user.student.gradeLevel : 'Student') +
      (user.student && user.student.section ? ' \u2022 ' + user.student.section : '');
  }

  /* ---------------- Helpers ---------------- */
  function saveUser(updated) {
    const accounts = NBANA.getAccounts();
    const i = accounts.findIndex(a => a.id === updated.id);
    if (i > -1) {
      accounts[i] = updated;
      NBANA.store.set(NBANA.KEYS.accounts, accounts);
    }
  }

  /* ---------------- Shared stores ---------------- */
  function loadMap(key) { return NBANA.store.get(key, {}) || {}; }
  function saveMap(key, map) { NBANA.store.set(key, map); }
  function loadFeed() { return NBANA.store.get(K.feed, []) || []; }
  function saveFeed(list) { NBANA.store.set(K.feed, list); }

  /* A post is visible when: everyone (scope 'all'), or it targets my grade.
     Principal announcements use scope 'all' so even teachers see them. */
  function visibleFeed() {
    const myGrade = isTeacher ? teacherGrade : (user.student && user.student.gradeLevel);
    return loadFeed().filter(p =>
      isPrincipal || p.scope === 'all' || (myGrade && p.scope === myGrade)
    );
  }

  /* Compress an image to a data URL (keeps localStorage small) */
  function readImage(file, cb) {
    if (!file) { cb(null); return; }
    if (!/^image\//.test(file.type)) { NBANA.toast('Please choose an image file.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          const k = Math.min(max / w, max / h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => NBANA.toast('Could not read that image.', 'error');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function nowStamp() { return new Date().toISOString(); }
  function fmtStamp(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' \u00b7 ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  }

  function nextDueDate(t) {
    const now = new Date();
    const day = ((t || user).billing && (t || user).billing.dueDay) || 15;
    const due = new Date(now.getFullYear(), now.getMonth(), day);
    if (now.getDate() > day) due.setMonth(due.getMonth() + 1);
    return due;
  }
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  /* Deterministic pseudo-random from a string seed */
  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeRng(seed) {
    let x = seed || 12345;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) % 100000) / 100000;
    };
  }

  /* ---------------- Announcements & posts (shared feed) ---------------- */
  const NEWS = [
    { tag: 'Enrollment', date: 'Ongoing', title: 'School Year Enrollment Open', body: 'Enrollment for the upcoming school year is now ongoing. Visit the administration office for requirements and inquiries.' },
    { tag: 'Event', date: 'Coming soon', title: 'Spiritual Emphasis Week', body: 'A week of worship, activities, and family night gathering. Watch this space for the final schedule.' },
    { tag: 'Billing', date: 'Every 15th', title: 'Tuition installments are due every 15th', body: 'Pay at the treasurer\u2019s office or record your payment reference in the portal to keep your account in good standing.' },
    { tag: 'Advisory', date: 'Daily', title: 'Please bring your school ID every day', body: 'Students are asked to wear their official school ID inside the campus at all times for safety and security.' }
  ];

  function newsItemHtml(n) {
    return '<div class="news-item"><span class="date">' + n.date.toUpperCase() + '</span>' +
      '<span class="tag" style="margin-left:8px">' + n.tag + '</span>' +
      '<h4>' + n.title + '</h4><p>' + n.body + '</p></div>';
  }

  function postHtml(p) {
    const who = (p.author || '?').split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
    const roleCls = p.role === 'principal' ? 'pill-navy' : (p.role === 'teacher' ? 'pill-green' : 'pill-amber');
    const roleTxt = p.role === 'principal' ? 'Principal' : (p.role === 'teacher' ? 'Teacher' : 'Student');
    const audience = p.scope === 'all' ? 'Everyone' : p.scope;
    const canDelete = isAdmin && (isPrincipal || p.authorId === user.id || p.scope === teacherGrade);
    return '<article class="feed-post">' +
      '<div class="fp-head">' +
        '<span class="fp-avatar">' + esc(who) + '</span>' +
        '<div class="fp-who"><strong>' + esc(p.author) + '</strong>' +
          '<span class="fp-meta"><span class="pill ' + roleCls + '">' + roleTxt + '</span> ' +
          '<span class="pill pill-navy">' + esc(audience) + '</span> \u00b7 ' + fmtStamp(p.date) + '</span></div>' +
        (canDelete ? '<button type="button" class="btn-del" data-del-post="' + esc(p.id) + '" title="Delete post">&times;</button>' : '') +
      '</div>' +
      (p.title ? '<h4 class="fp-title">' + esc(p.title) + '</h4>' : '') +
      (p.tag ? '<span class="pill pill-amber fp-tag">' + esc(p.tag) + '</span>' : '') +
      (p.body ? '<p class="fp-body">' + esc(p.body).replace(/\n/g, '<br>') + '</p>' : '') +
      (p.photo ? '<img class="fp-photo" src="' + p.photo + '" alt="Post photo">' : '') +
    '</article>';
  }

  function renderFeed() {
    const list = visibleFeed();
    const html = list.length
      ? list.map(postHtml).join('')
      : NEWS.map(newsItemHtml).join('');
    $('newsList').innerHTML = html;
    $('newsFeedSub').textContent = isAdmin
      ? (list.length + ' post' + (list.length === 1 ? '' : 's') + ' \u00b7 ' +
         (isPrincipal ? 'your announcements reach every portal user' : 'you see all-school posts and posts for ' + teacherGrade))
      : 'Posted by the administration and your teachers';
    $('dashNews').innerHTML = (list.length ? list : NEWS).slice(0, 3).map(p =>
      p.date && p.scope !== undefined ? postHtml(p) : newsItemHtml(p)).join('');

    document.querySelectorAll('[data-del-post]').forEach(b => {
      b.addEventListener('click', () => {
        saveFeed(loadFeed().filter(x => x.id !== b.dataset.delPost));
        renderFeed();
        if (typeof renderAdminDash === 'function') renderAdminDash();
        NBANA.toast('Post deleted.', 'success');
      });
    });
  }

  /* ---------------- Composer (principal: all users, teacher: own grade) ---------------- */
  let pendingPhoto = null;

  function composerSetup() {
    if (!isAdmin) return;
    $('btnCompose').hidden = false;
    $('composerPanel').hidden = true;
    $('composerTitle').textContent = isPrincipal ? 'New announcement' : 'New post for ' + teacherGrade;
    $('composerAudience').textContent = 'Audience: ' +
      (isPrincipal ? 'all users \u2014 students, teachers, and admins' : teacherGrade + ' students only');
    $('composerHint').textContent = isPrincipal
      ? 'Everyone will see this, including teacher accounts.'
      : 'Only students enrolled in ' + teacherGrade + ' will see this post.';

    $('btnCompose').addEventListener('click', () => {
      $('composerPanel').hidden = !$('composerPanel').hidden;
      if (!$('composerPanel').hidden) $('postBody').focus();
    });

    $('postPhoto').addEventListener('change', (e) => {
      readImage(e.target.files[0], (data) => {
        pendingPhoto = data;
        $('photoPreview').hidden = !data;
        if (data) $('photoImg').src = data;
      });
    });
    $('photoRemove').addEventListener('click', () => {
      pendingPhoto = null;
      $('postPhoto').value = '';
      $('photoPreview').hidden = true;
    });

    $('composerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const bodyEl = $('postBody');
      const ok = bodyEl.value.trim() !== '';
      bodyEl.classList.toggle('invalid', !ok);
      bodyEl.parentElement.querySelector('.error').classList.toggle('show', !ok);
      if (!ok) { NBANA.toast('Please write a message before posting.', 'error'); return; }

      const feed = loadFeed();
      feed.unshift({
        id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        authorId: user.id,
        author: user.fullName || user.firstName,
        role: role,
        scope: isPrincipal ? 'all' : teacherGrade,
        title: $('postTitle').value.trim(),
        body: bodyEl.value.trim(),
        photo: pendingPhoto,
        date: nowStamp()
      });
      saveFeed(feed);
      $('composerForm').reset();
      pendingPhoto = null;
      $('photoPreview').hidden = true;
      $('composerPanel').hidden = true;
      renderFeed();
      renderAdminDash();
      NBANA.toast(isPrincipal ? 'Announcement posted to all users.' : 'Post shared with ' + teacherGrade + ' students.', 'success');
    });
  }

  /* ---------------- Fees ---------------- */
  let feesTargetId = null;
  let feeEditing = false;
  let feeDraft = null;

  function nameOf(a) {
    return a.fullName || [a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ');
  }

  function feeTarget() {
    if (!isPrincipal) return user;
    const list = allStudents();
    const t = list.find(a => a.id === feesTargetId) || list[0] || null;
    if (t) feesTargetId = t.id;
    return t;
  }

  function renderFeeRows(t) {
    const s = NBANA.billingSummary(t);
    if (feeEditing && feeDraft) {
      $('feeRows').innerHTML = feeDraft.map((it, i) =>
        '<tr><td><input class="input input-sm" data-fi="label" data-i="' + i + '" value="' + esc(it.label) + '"></td>' +
        '<td><input class="input input-sm" data-fi="note" data-i="' + i + '" value="' + esc(it.note || '') + '"></td>' +
        '<td class="num"><input class="input input-sm num-in" type="number" min="0" step="1" data-fi="amount" data-i="' + i + '" value="' + Number(it.amount) + '"> ' +
        '<button type="button" class="btn-del" data-fdel="' + i + '" title="Remove fee">&times;</button></td></tr>'
      ).join('') +
      '<tr><td colspan="3"><button type="button" class="btn-sm" id="btnFeeAdd">+ Add fee item</button></td></tr>';

      document.querySelectorAll('[data-fi]').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = Number(inp.dataset.i);
          if (inp.dataset.fi === 'amount') feeDraft[i].amount = Math.max(0, parseFloat(inp.value) || 0);
          else feeDraft[i][inp.dataset.fi] = inp.value;
          $('feeTotal').textContent = money(feeDraft.reduce((sum, x) => sum + (Number(x.amount) || 0), 0));
        });
      });
      document.querySelectorAll('[data-fdel]').forEach(b => {
        b.addEventListener('click', () => {
          feeDraft.splice(Number(b.dataset.fdel), 1);
          renderFeeRows(t);
        });
      });
      const addBtn = $('btnFeeAdd');
      if (addBtn) addBtn.addEventListener('click', () => {
        feeDraft.push({ label: 'New fee', note: '', amount: 0 });
        renderFeeRows(t);
      });
      $('feeTotal').textContent = money(feeDraft.reduce((sum, x) => sum + (Number(x.amount) || 0), 0));
      return;
    }

    $('feeRows').innerHTML = s.items.map(i =>
      '<tr><td><strong>' + esc(i.label) + '</strong></td><td>' + esc(i.note || '') + '</td><td class="num">' + money(i.amount) +
      (isPrincipal ? ' <button type="button" class="btn-del" data-fdel-view="' + esc(i.label) + '" title="Remove fee">&times;</button>' : '') +
      '</td></tr>'
    ).join('');
    $('feeTotal').textContent = money(s.assessed);

    if (isPrincipal) {
      document.querySelectorAll('[data-fdel-view]').forEach(b => {
        b.addEventListener('click', () => {
          t.billing.items = t.billing.items.filter(x => x.label !== b.dataset.fdelView);
          saveUser(t);
          renderFees();
          NBANA.toast('Fee removed from ' + nameOf(t) + '\u2019s assessment.', 'success');
        });
      });
    }
  }

  function renderFees() {
    const t = feeTarget() || user;
    const s = NBANA.billingSummary(t);
    const due = nextDueDate(t);
    const dueStr = due.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    const hero = $('balanceHero');

    $('bhAmount').textContent = money(s.balance);
    $('bhBar').style.width = s.percent + '%';
    $('bhAssessed').textContent = money(s.assessed);
    $('bhPaid').textContent = money(s.paid);
    $('bhDue').textContent = dueStr;

    if (s.balance === 0 && s.assessed > 0) {
      hero.classList.add('paid');
      $('bhStatus').textContent = 'Fully paid \u2014 thank you! No outstanding balance.';
    } else {
      hero.classList.remove('paid');
      $('bhStatus').textContent = 'Partially paid \u2014 ' + s.percent + '% of assessed fees settled.';
    }

    $('feeYearSub').textContent = 'School year ' + ((t.billing && t.billing.schoolYear) || schoolYear) +
      (isPrincipal ? ' \u00b7 ' + esc(nameOf(t)) : '');
    renderFeeRows(t);

    const pays = s.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    $('payRows').innerHTML = pays.length
      ? pays.map(p =>
          '<tr><td>' + fmtDate(p.date) + '</td><td>' + (p.ref || '&mdash;') + '</td>' +
          '<td>' + p.method + (p.label ? ' <span class="pill pill-navy">' + esc(p.label) + '</span>' : '') + '</td>' +
          '<td class="num">' + money(p.amount) +
          (isPrincipal ? ' <button type="button" class="btn-del" data-pdel="' + esc(p.id) + '" title="Remove payment">&times;</button>' : '') +
          '</td></tr>'
        ).join('')
      : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">&#128179;</span>No payments recorded yet.</div></td></tr>';
    $('payTotal').textContent = money(s.paid);

    if (isPrincipal) {
      document.querySelectorAll('[data-pdel]').forEach(b => {
        b.addEventListener('click', () => {
          t.billing.payments = (t.billing.payments || []).filter(x => x.id !== b.dataset.pdel);
          saveUser(t);
          renderFees();
          NBANA.toast('Payment removed.', 'success');
        });
      });
      $('feesStudentSel').value = t.id;
    }

    /* Dashboard mirror (student view only) */
    if (!isAdmin) {
      $('sumBalance').textContent = money(s.balance);
      $('sumBalance').className = 'sc-value ' + (s.balance > 0 ? 'alert' : 'good');
      $('sumBalanceSub').textContent = s.balance > 0 ? s.percent + '% paid \u00b7 due ' + dueStr : 'Account settled';
      $('dashFeeSub').textContent = 'School year ' + ((t.billing && t.billing.schoolYear) || schoolYear);
      $('dashFeeBar').style.width = s.percent + '%';
      $('dashFeePaid').textContent = 'Paid: ' + money(s.paid);
      $('dashFeeTotal').textContent = 'Assessed: ' + money(s.assessed);
      $('dashFeeDue').textContent = s.balance > 0
        ? 'Next due date: ' + dueStr + ' \u00b7 Remaining: ' + money(s.balance)
        : 'No remaining balance. Keep it up!';
    }
  }

  function feesInit() {
    if (!isPrincipal) return;
    $('feesAdmin').hidden = false;
    const list = allStudents();
    $('feesStudentSel').innerHTML = list.map(a =>
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.gradeLevel) || 'No grade') + '</option>'
    ).join('') || '<option>No students yet</option>';
    $('btnFeeEdit').hidden = false;
    $('feesStudentSel').addEventListener('change', (e) => {
      feesTargetId = e.target.value;
      feeEditing = false; feeDraft = null;
      $('btnFeeEdit').textContent = 'Edit fees';
      renderFees();
    });
    $('btnFeeEdit').addEventListener('click', () => {
      const t = feeTarget();
      if (!t) return;
      if (!feeEditing) {
        feeEditing = true;
        feeDraft = JSON.parse(JSON.stringify((t.billing && t.billing.items) || []));
        $('btnFeeEdit').textContent = 'Save fees';
        $('btnFeeEdit').classList.add('solid');
      } else {
        t.billing.items = feeDraft;
        saveUser(t);
        feeEditing = false; feeDraft = null;
        $('btnFeeEdit').textContent = 'Edit fees';
        $('btnFeeEdit').classList.remove('solid');
        NBANA.toast('Fee assessment updated for ' + nameOf(t) + '.', 'success');
      }
      renderFees();
    });
  }

  /* Payment form */
  $('btnPayToggle').addEventListener('click', () => {
    const p = $('payPanel');
    p.hidden = !p.hidden;
    if (!p.hidden) $('payAmount').focus();
  });
  $('btnPayCancel').addEventListener('click', () => { $('payPanel').hidden = true; });
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnPrintGrades').addEventListener('click', () => window.print());

  $('payForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amountEl = $('payAmount');
    const amount = parseFloat(amountEl.value);
    const ok = !isNaN(amount) && amount > 0;
    amountEl.classList.toggle('invalid', !ok);
    amountEl.parentElement.querySelector('.error').classList.toggle('show', !ok);
    if (!ok) { NBANA.toast('Please enter a valid payment amount.', 'error'); return; }

    const t = feeTarget() || user;
    const s = NBANA.billingSummary(t);
    if (amount > s.balance && s.balance > 0) {
      NBANA.toast('Amount exceeds the remaining balance of ' + money(s.balance) + '.', 'error');
      return;
    }

    t.billing.payments.push({
      id: 'p_' + Date.now().toString(36),
      date: new Date().toISOString().slice(0, 10),
      ref: $('payRef').value.trim() || ('PORTAL-' + Date.now().toString(36).toUpperCase()),
      method: $('payMethod').value,
      amount: amount,
      label: isPrincipal ? 'Posted by admin' : 'Portal payment',
      status: 'Posted'
    });
    saveUser(t);
    $('payForm').reset();
    $('payPanel').hidden = true;
    renderFees();
    NBANA.toast('Payment of ' + money(amount) + ' recorded' + (isPrincipal ? ' for ' + nameOf(t) : '') + '. Thank you!', 'success');
  });

  /* ---------------- Student data (deterministic demo records) ---------------- */
  const gradeLevel = (user.student && user.student.gradeLevel) || 'Grade 1';
  const section = (user.student && user.student.section) || 'Classroom';
  const isKinder = /^Kinder/i.test(gradeLevel);

  const TEACHERS = {
    'Kinder 1': 'Loven R. Nano',
    'Kinder 2': 'Janice G. Baldicantos',
    'Grade 1': 'Estephanie V. Perolino',
    'Grade 2': 'Adelfa B. Quilat',
    'Grade 3': 'Sunshine Rose A. Anggot',
    'Grade 4': 'Rotchel D. Alozo',
    'Grade 5': 'Joy E. Lomongo',
    'Grade 6': 'Sandra E. Argod'
  };
  const adviser = TEACHERS[gradeLevel] || 'Class Adviser';

  const SUBJECTS = isKinder
    ? ['Language', 'Arithmetic', 'Motor Skills', 'Spiritual Life', 'Art & Music', 'Physical Education']
    : (['Grade 4', 'Grade 5', 'Grade 6'].indexOf(gradeLevel) > -1
        ? ['English', 'Mathematics', 'Science', 'Filipino', 'Social Studies', 'Spiritual Life', 'MAPEH', 'Computer Skills']
        : ['English', 'Mathematics', 'Science', 'Filipino', 'Social Studies', 'Spiritual Life', 'MAPEH']);

  /* Subject / adviser lookups for any grade (used when admins edit others) */
  function subjectsFor(gl) {
    if (/^Kinder/i.test(gl || '')) return ['Language', 'Arithmetic', 'Motor Skills', 'Spiritual Life', 'Art & Music', 'Physical Education'];
    return (['Grade 4', 'Grade 5', 'Grade 6'].indexOf(gl) > -1
      ? ['English', 'Mathematics', 'Science', 'Filipino', 'Social Studies', 'Spiritual Life', 'MAPEH', 'Computer Skills']
      : ['English', 'Mathematics', 'Science', 'Filipino', 'Social Studies', 'Spiritual Life', 'MAPEH']);
  }
  function adviserFor(gl) { return TEACHERS[gl] || 'Class Adviser'; }

  function row(k, v) {
    return '<div class="info-row"><span class="k">' + k + '</span><span class="v">' + (v || '&mdash;') + '</span></div>';
  }

  /* ---------------- Grades ---------------- */
  let gradesTargetId = null;
  let gradeEditing = false;

  function gradeTarget() {
    if (!isAdmin) return user;
    const list = studentsInScope();
    const t = list.find(a => a.id === gradesTargetId) || list[0] || null;
    if (t) gradesTargetId = t.id;
    return t;
  }

  function computeGrades(acct) {
    const gl = (acct.student && acct.student.gradeLevel) || gradeLevel;
    const subs = subjectsFor(gl);
    const stored = loadMap(K.grades)[acct.id] || null;
    const rng = makeRng(seedOf(acct.id + gl + 'grades'));
    return subs.map(name => {
      let q = [0, 0, 0, 0].map(() => 76 + Math.floor(rng() * 23));
      if (stored && stored[name]) q = stored[name].slice(0, 4).map(v => Number(v) || 0);
      const final = Math.round(q.reduce((a, b) => a + b, 0) / 4);
      const remarks = final >= 90 ? 'With Merit' : final >= 85 ? 'Good' : final >= 75 ? 'Passed' : 'Needs Review';
      const pill = final >= 85 ? 'pill-green' : final >= 75 ? 'pill-navy' : 'pill-red';
      return { name, q, final, remarks, pill };
    });
  }

  function renderGrades() {
    const t = gradeTarget();
    if (!t) {
      $('gradeRows').innerHTML = '<tr><td colspan="7"><div class="empty-state">No students to display.</div></td></tr>';
      return 0;
    }
    const grades = computeGrades(t);
    const avg = Math.round(grades.reduce((s, g) => s + g.final, 0) / grades.length);
    const highest = grades.reduce((m, g) => Math.max(m, g.final), 0);
    const standing = avg >= 90 ? 'With Honors' : avg >= 85 ? 'High' : avg >= 75 ? 'Passing' : 'Review';

    $('gAverage').textContent = avg;
    $('gHighest').textContent = highest;
    $('gSubjects').textContent = grades.length;
    $('gStanding').textContent = standing;
    const tGl = (t.student && t.student.gradeLevel) || gradeLevel;
    const tSec = (t.student && t.student.section) || section;
    $('gradeSub').textContent = (isAdmin ? esc(nameOf(t)) + ' \u00b7 ' : '') +
      tGl + ' \u00b7 ' + tSec + ' \u00b7 ' + schoolYear;
    $('gradeRows').innerHTML = grades.map(g =>
      '<tr><td><strong>' + esc(g.name) + '</strong></td>' +
      (gradeEditing
        ? g.q.map((v, qi) => '<td class="num"><input class="input input-sm num-in" type="number" min="0" max="100" data-gsub="' + esc(g.name) + '" data-gq="' + qi + '" value="' + v + '"></td>').join('')
        : g.q.map(v => '<td class="num">' + v + '</td>').join('')) +
      '<td class="num"><strong>' + g.final + '</strong></td>' +
      '<td><span class="pill ' + g.pill + '">' + g.remarks + '</span></td></tr>'
    ).join('');
    $('gradeFootAvg').textContent = avg;
    $('gradeFootRemarks').textContent = standing;

    if (!isAdmin) {
      $('sumAverage').textContent = avg;
      $('sumAverageSub').textContent = standing + ' \u00b7 adviser: ' + adviser;
    }
    return avg;
  }

  function gradeEditButtons() {
    $('btnGradeEdit').hidden = gradeEditing;
    $('btnGradeSave').hidden = !gradeEditing;
    $('btnGradeCancel').hidden = !gradeEditing;
  }

  function gradesInit() {
    if (!isAdmin) return;
    $('gradesAdmin').hidden = false;
    const list = studentsInScope();
    $('gradesStudentSel').innerHTML = list.map(a =>
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || 'Section') + '</option>'
    ).join('') || '<option>No students in this class</option>';
    $('gradesStudentSel').addEventListener('change', (e) => {
      gradesTargetId = e.target.value;
      gradeEditing = false; gradeEditButtons();
      renderGrades();
    });
    $('btnGradeEdit').addEventListener('click', () => {
      if (!gradeTarget()) return;
      gradeEditing = true; gradeEditButtons(); renderGrades();
    });
    $('btnGradeCancel').addEventListener('click', () => {
      gradeEditing = false; gradeEditButtons(); renderGrades();
    });
    $('btnGradeSave').addEventListener('click', () => {
      const t = gradeTarget();
      if (!t) return;
      const map = loadMap(K.grades);
      const record = map[t.id] || {};
      let ok = true;
      document.querySelectorAll('[data-gsub]').forEach(inp => {
        const v = parseFloat(inp.value);
        const bad = isNaN(v) || v < 0 || v > 100;
        inp.classList.toggle('invalid', bad);
        if (bad) ok = false;
        else {
          if (!record[inp.dataset.gsub]) record[inp.dataset.gsub] = [0, 0, 0, 0];
          record[inp.dataset.gsub][Number(inp.dataset.gq)] = v;
        }
      });
      if (!ok) { NBANA.toast('Grades must be numbers from 0 to 100.', 'error'); return; }
      map[t.id] = record;
      saveMap(K.grades, map);
      gradeEditing = false; gradeEditButtons();
      renderGrades();
      renderAdminDash();
      NBANA.toast('Grades saved for ' + nameOf(t) + '.', 'success');
    });
  }

  /* ---------------- Attendance ---------------- */
  let attTargetId = null;
  let attEditing = false;

  function localISO(d) {
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function attTarget() {
    if (!isAdmin) return user;
    const list = studentsInScope();
    const t = list.find(a => a.id === attTargetId) || list[0] || null;
    if (t) attTargetId = t.id;
    return t;
  }

  function computeAttendance(acct) {
    const stored = loadMap(K.attendance)[acct.id];
    if (stored) {
      return stored.map(d => ({
        date: new Date(d.date + 'T00:00:00'), iso: d.date, status: d.status, time: d.time || '\u2014'
      }));
    }
    const rng = makeRng(seedOf(acct.id + 'attendance'));
    const days = [];
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (days.length < 15) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        const r = rng();
        const status = r < 0.86 ? 'Present' : (r < 0.94 ? 'Late' : 'Absent');
        let time = '\u2014';
        if (status === 'Present') {
          const m = 18 + Math.floor(rng() * 16);
          time = '7:' + (m < 10 ? '0' + m : m) + ' AM';
        } else if (status === 'Late') {
          const m = 46 + Math.floor(rng() * 13);
          time = m >= 60 ? '8:' + (m - 60 < 10 ? '0' + (m - 60) : m - 60) + ' AM' : '7:' + m + ' AM';
        }
        days.push({ date: new Date(d), iso: localISO(d), status, time });
      }
      d.setDate(d.getDate() - 1);
    }
    return days;
  }

  const ATT_STATUSES = ['Present', 'Late', 'Absent'];

  function renderAttendance() {
    const t = attTarget();
    if (!t) {
      $('attRows').innerHTML = '<tr><td colspan="4"><div class="empty-state">No students to display.</div></td></tr>';
      return;
    }
    const days = computeAttendance(t);
    const present = days.filter(x => x.status === 'Present').length;
    const late = days.filter(x => x.status === 'Late').length;
    const absent = days.filter(x => x.status === 'Absent').length;
    const rate = Math.round(((present + late) / days.length) * 100);

    $('attPresent').textContent = present;
    $('attAbsent').textContent = absent;
    $('attLate').textContent = late;
    $('attRate').textContent = rate + '%';

    const rowsHtml = days.map(x => {
      const dateStr = x.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
      const dayStr = x.date.toLocaleDateString('en-PH', { weekday: 'long' });
      if (attEditing) {
        return '<tr><td>' + dateStr + '</td><td>' + dayStr + '</td>' +
          '<td><select class="input input-sm" data-ats="' + x.iso + '">' +
          ATT_STATUSES.map(s => '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>').join('') +
          '</select></td>' +
          '<td><input class="input input-sm" data-attime="' + x.iso + '" value="' + esc(x.time === '\u2014' ? '' : x.time) + '" placeholder="e.g. 7:20 AM"> ' +
          '<button type="button" class="btn-del" data-atdel="' + x.iso + '" title="Remove day">&times;</button></td></tr>';
      }
      const pill = x.status === 'Present' ? 'pill-green' : x.status === 'Late' ? 'pill-amber' : 'pill-red';
      return '<tr><td>' + dateStr + '</td><td>' + dayStr + '</td>' +
        '<td><span class="pill ' + pill + '">' + x.status + '</span></td><td>' + esc(x.time) + '</td></tr>';
    }).join('');

    const addRow = attEditing
      ? '<tr class="att-add"><td><input class="input input-sm" type="date" id="attNewDate" value="' + localISO(new Date()) + '"></td>' +
        '<td><select class="input input-sm" id="attNewStatus">' +
        ATT_STATUSES.map(s => '<option>' + s + '</option>').join('') + '</select></td>' +
        '<td colspan="2"><button type="button" class="btn-sm solid" id="btnAttAdd">+ Add school day</button></td></tr>'
      : '';
    $('attRows').innerHTML = rowsHtml + addRow;

    if (attEditing) {
      document.querySelectorAll('[data-atdel]').forEach(b => {
        b.addEventListener('click', () => {
          const map = loadMap(K.attendance);
          map[t.id] = computeAttendance(t)
            .filter(x => x.iso !== b.dataset.atdel)
            .map(x => ({ date: x.iso, status: x.status, time: x.time }));
          saveMap(K.attendance, map);
          renderAttendance();
        });
      });
      const addBtn = $('btnAttAdd');
      if (addBtn) addBtn.addEventListener('click', () => {
        const iso = $('attNewDate').value;
        if (!iso) { NBANA.toast('Pick a date first.', 'error'); return; }
        const map = loadMap(K.attendance);
        const cur = computeAttendance(t).map(x => ({ date: x.iso, status: x.status, time: x.time }));
        if (cur.some(x => x.date === iso)) { NBANA.toast('That date is already recorded.', 'error'); return; }
        cur.push({ date: iso, status: $('attNewStatus').value, time: '\u2014' });
        map[t.id] = cur;
        saveMap(K.attendance, map);
        renderAttendance();
        NBANA.toast('School day added.', 'success');
      });
    }

    if (!isAdmin) {
      $('sumAttendance').textContent = rate + '%';
      $('sumAttendanceSub').textContent = present + late + ' of ' + days.length + ' school days attended';
    }
  }

  function attEditButtons() {
    $('btnAttEdit').hidden = attEditing;
    $('btnAttSave').hidden = !attEditing;
    $('btnAttCancel').hidden = !attEditing;
  }

  function attInit() {
    if (!isAdmin) return;
    $('attAdmin').hidden = false;
    const list = studentsInScope();
    $('attStudentSel').innerHTML = list.map(a =>
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || 'Section') + '</option>'
    ).join('') || '<option>No students in this class</option>';
    $('attStudentSel').addEventListener('change', (e) => {
      attTargetId = e.target.value;
      attEditing = false; attEditButtons();
      renderAttendance();
    });
    $('btnAttEdit').addEventListener('click', () => {
      if (!attTarget()) return;
      attEditing = true; attEditButtons(); renderAttendance();
    });
    $('btnAttCancel').addEventListener('click', () => {
      attEditing = false; attEditButtons(); renderAttendance();
    });
    $('btnAttSave').addEventListener('click', () => {
      const t = attTarget();
      if (!t) return;
      const map = loadMap(K.attendance);
      const rows = computeAttendance(t).map(x => {
        const sel = document.querySelector('[data-ats="' + x.iso + '"]');
        const timeIn = document.querySelector('[data-attime="' + x.iso + '"]');
        return {
          date: x.iso,
          status: sel ? sel.value : x.status,
          time: timeIn ? (timeIn.value.trim() || '\u2014') : x.time
        };
      });
      const newDate = $('attNewDate') && $('attNewDate').value;
      if (newDate && !rows.some(r => r.date === newDate)) {
        rows.push({ date: newDate, status: $('attNewStatus').value, time: '\u2014' });
      }
      map[t.id] = rows;
      saveMap(K.attendance, map);
      attEditing = false; attEditButtons();
      renderAttendance();
      NBANA.toast('Attendance saved for ' + nameOf(t) + '.', 'success');
    });
  }

  /* ---------------- Schedule ---------------- */
  let schedGrade = null;
  let schedEditing = false;
  let schedDraft = null;

  function currentSchedGrade() {
    if (isTeacher) return teacherGrade;
    if (isPrincipal) return schedGrade || GRADES[0];
    return gradeLevel;
  }

  function defaultSlots(gl, room) {
    const slots = [
      { time: '7:45 \u2013 8:30 AM', days: 'Mon \u2013 Fri' },
      { time: '8:30 \u2013 9:15 AM', days: 'Mon \u2013 Fri' },
      { time: '9:15 \u2013 10:00 AM', days: 'Mon, Wed, Fri' },
      { time: '10:00 \u2013 10:20 AM', days: 'Daily', fixed: 'Recess' },
      { time: '10:20 \u2013 11:05 AM', days: 'Mon \u2013 Fri' },
      { time: '11:05 \u2013 11:50 AM', days: 'Tue, Thu' },
      { time: '11:50 \u2013 12:30 PM', days: 'Daily', fixed: 'Lunch' },
      { time: '12:30 \u2013 1:15 PM', days: 'Mon \u2013 Fri' },
      { time: '1:15 \u2013 2:00 PM', days: 'Mon, Wed, Fri' },
      { time: '2:00 \u2013 2:45 PM', days: 'Daily', fixed: 'Clean-up & devotion' }
    ];
    const subs = subjectsFor(gl);
    const adv = adviserFor(gl);
    let si = 0;
    return slots.map(s => ({
      time: s.time,
      days: s.days,
      subject: s.fixed || subs[si++ % subs.length],
      teacher: s.fixed ? '\u2014' : adv,
      room: s.fixed ? '\u2014' : room
    }));
  }

  function scheduleRows(gl, room) {
    const stored = loadMap(K.schedule)[gl];
    return (stored && stored.length) ? stored : defaultSlots(gl, room);
  }

  function renderSchedule() {
    const gl = currentSchedGrade();
    const room = isAdmin ? 'Homeroom' : (section && section !== 'TBD' ? 'Room ' + section : 'Homeroom');
    const rows = (schedEditing && schedDraft) ? schedDraft : scheduleRows(gl, room);
    const FIELDS = ['time', 'days', 'subject', 'teacher', 'room'];

    $('schedRows').innerHTML = rows.map((s, i) => {
      if (schedEditing) {
        const cells = FIELDS.map(f =>
          '<td><input class="input input-sm" data-sf="' + f + '" data-i="' + i + '" value="' + esc(s[f]) + '"></td>'
        ).join('');
        return '<tr>' + cells.replace(/<\/td>$/, ' <button type="button" class="btn-del" data-sdel="' + i + '" title="Remove period">&times;</button></td>') + '</tr>';
      }
      return '<tr><td><strong>' + esc(s.time) + '</strong></td><td>' + esc(s.days) + '</td><td>' + esc(s.subject) +
        '</td><td>' + esc(s.teacher) + '</td><td>' + esc(s.room) + '</td></tr>';
    }).join('') + (schedEditing
      ? '<tr><td colspan="5"><button type="button" class="btn-sm" id="btnSchedAdd">+ Add period</button></td></tr>'
      : '');

    if (schedEditing) {
      document.querySelectorAll('[data-sf]').forEach(inp => {
        inp.addEventListener('input', () => {
          schedDraft[Number(inp.dataset.i)][inp.dataset.sf] = inp.value;
        });
      });
      document.querySelectorAll('[data-sdel]').forEach(b => {
        b.addEventListener('click', () => {
          schedDraft.splice(Number(b.dataset.sdel), 1);
          renderSchedule();
        });
      });
      const addBtn = $('btnSchedAdd');
      if (addBtn) addBtn.addEventListener('click', () => {
        schedDraft.push({ time: 'New period', days: 'Mon \u2013 Fri', subject: subjectsFor(gl)[0], teacher: adviserFor(gl), room: 'Homeroom' });
        renderSchedule();
      });
    }

    $('schedSub').textContent = isAdmin
      ? gl + ' \u00b7 adviser: ' + adviserFor(gl)
      : gradeLevel + ' \u00b7 ' + section + ' \u00b7 adviser: ' + adviser;
  }

  function schedEditButtons() {
    $('btnSchedEdit').hidden = schedEditing;
    $('btnSchedSave').hidden = !schedEditing;
    $('btnSchedCancel').hidden = !schedEditing;
  }

  function schedInit() {
    if (!isAdmin) return;
    $('schedAdmin').hidden = false;
    const opts = isTeacher ? [teacherGrade] : GRADES;
    $('schedGradeSel').innerHTML = opts.map(g => '<option>' + g + '</option>').join('');
    if (isTeacher) $('schedGradeSel').disabled = true;
    $('schedGradeSel').addEventListener('change', (e) => {
      schedGrade = e.target.value;
      schedEditing = false; schedDraft = null; schedEditButtons();
      renderSchedule();
    });
    $('btnSchedEdit').addEventListener('click', () => {
      schedEditing = true;
      schedDraft = JSON.parse(JSON.stringify(scheduleRows(currentSchedGrade(), 'Homeroom')));
      schedEditButtons(); renderSchedule();
    });
    $('btnSchedCancel').addEventListener('click', () => {
      schedEditing = false; schedDraft = null; schedEditButtons(); renderSchedule();
    });
    $('btnSchedSave').addEventListener('click', () => {
      const gl = currentSchedGrade();
      if (!schedDraft.length) { NBANA.toast('A schedule needs at least one period.', 'error'); return; }
      const bad = schedDraft.some(r => !r.time.trim() || !r.subject.trim());
      if (bad) { NBANA.toast('Time and subject are required for every period.', 'error'); return; }
      const map = loadMap(K.schedule);
      map[gl] = schedDraft;
      saveMap(K.schedule, map);
      schedEditing = false; schedDraft = null; schedEditButtons();
      renderSchedule();
      NBANA.toast('Schedule updated for ' + gl + '.', 'success');
    });
  }

  /* ---------------- Assignments ---------------- */
  function gradeAssignments(grade) { return loadMap(K.assignments)[grade] || []; }

  /* A student sees their own tasks plus assignments posted by their adviser */
  function studentTasks() {
    const personal = (user.tasks || []).map(t => Object.assign({}, t, { personal: true }));
    const doneIds = user.doneAssignments || [];
    const ga = gradeAssignments(gradeLevel).map(a => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      due: a.due,
      details: a.details || '',
      done: doneIds.indexOf(a.id) > -1,
      gradeTask: true
    }));
    return personal.concat(ga);
  }

  function renderTasks() {
    if (isAdmin) { renderAssignManage(); return; }
    const tasks = studentTasks();
    const done = tasks.filter(t => t.done).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    $('taskSub').textContent = done + ' of ' + tasks.length + ' done';
    $('taskBar').style.width = pct + '%';
    $('taskPct').textContent = pct + '%';

    $('taskList').innerHTML = tasks.length ? tasks.map(t => {
      const due = new Date(t.due + 'T00:00:00');
      const overdue = !t.done && due < new Date();
      const duePill = overdue ? 'pill-red' : (t.done ? 'pill-green' : 'pill-amber');
      return '<label class="todo-item' + (t.done ? ' done' : '') + '">' +
        '<input type="checkbox" data-task="' + t.id + '"' + (t.done ? ' checked' : '') + '>' +
        '<span class="t-body"><span class="t-title">' + esc(t.title) + '</span>' +
        '<span class="t-meta"><span class="pill pill-navy">' + esc(t.subject) + '</span>' +
        (t.gradeTask ? '<span class="pill pill-green">From your teacher</span>' : '') +
        '<span class="pill ' + duePill + '">Due ' + due.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
        (overdue ? ' \u00b7 overdue' : '') + '</span></span></span></label>';
    }).join('') : '<div class="empty-state"><span class="es-icon">&#10003;</span>No assignments right now. Enjoy!</div>';

    document.querySelectorAll('[data-task]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.task;
        const own = (user.tasks || []).find(x => x.id === id);
        if (own) {
          own.done = cb.checked;
        } else {
          let ids = user.doneAssignments || [];
          if (cb.checked && ids.indexOf(id) === -1) ids.push(id);
          if (!cb.checked) ids = ids.filter(x => x !== id);
          user.doneAssignments = ids;
        }
        saveUser(user);
        renderTasks();
        renderSummaryCounts();
        NBANA.toast(cb.checked ? 'Assignment marked as done.' : 'Assignment reopened.', 'success');
      });
    });

    renderSummaryCounts();
  }

  function renderSummaryCounts() {
    if (isAdmin) {
      $('sumTasks').textContent = gradeAssignments(teacherGrade).length;
      $('sumTasksSub').textContent = 'assignments posted for ' + teacherGrade;
      return;
    }
    const tasks = studentTasks();
    const open = tasks.filter(t => !t.done).length;
    $('sumTasks').textContent = open;
    $('sumTasksSub').textContent = open ? 'due soon \u00b7 ' + tasks.length + ' total' : 'all caught up';
  }

  /* ---------------- Teacher: manage class assignments ---------------- */
  let assignEditingId = null;
  let assignPhoto = null;

  function assignCardHtml(a) {
    const who = (user.fullName || user.firstName || 'T').split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
    const due = new Date(a.due + 'T00:00:00');
    const overdue = due < new Date();
    return '<article class="feed-post">' +
      '<div class="fp-head">' +
        '<span class="fp-avatar">' + esc(who) + '</span>' +
        '<div class="fp-who"><strong>' + esc(user.fullName || user.firstName) + '</strong>' +
        '<span class="fp-meta"><span class="pill pill-green">Teacher</span> ' +
        '<span class="pill pill-navy">' + esc(teacherGrade) + '</span> \u00b7 ' + fmtStamp(a.date || nowStamp()) + '</span></div>' +
        '<span class="fp-actions">' +
          '<button type="button" class="btn-sm" data-asedit="' + esc(a.id) + '">Edit</button>' +
          '<button type="button" class="btn-del" data-asdel="' + esc(a.id) + '" title="Delete">&times;</button>' +
        '</span>' +
      '</div>' +
      '<h4 class="fp-title">' + esc(a.title) + '</h4>' +
      '<span class="pill ' + (overdue ? 'pill-red' : 'pill-amber') + ' fp-tag">' +
        esc(a.subject) + ' \u00b7 Due ' + due.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>' +
      (a.details ? '<p class="fp-body">' + esc(a.details).replace(/\n/g, '<br>') + '</p>' : '') +
      (a.photo ? '<img class="fp-photo" src="' + a.photo + '" alt="Assignment photo">' : '') +
    '</article>';
  }

  function renderAssignManage() {
    const list = gradeAssignments(teacherGrade);
    $('assignSub').textContent = list.length + ' assignment' + (list.length === 1 ? '' : 's') +
      ' posted for ' + teacherGrade + ' \u00b7 students see them in their portal';
    $('assignList').innerHTML = list.length
      ? list.map(assignCardHtml).join('')
      : '<div class="empty-state"><span class="es-icon">&#9998;</span>No assignments yet. Post your first one!</div>';

    document.querySelectorAll('[data-asdel]').forEach(b => {
      b.addEventListener('click', () => {
        const map = loadMap(K.assignments);
        map[teacherGrade] = (map[teacherGrade] || []).filter(x => x.id !== b.dataset.asdel);
        saveMap(K.assignments, map);
        saveFeed(loadFeed().filter(p => p.ref !== b.dataset.asdel));
        renderAssignManage();
        renderFeed();
        NBANA.toast('Assignment removed.', 'success');
      });
    });
    document.querySelectorAll('[data-asedit]').forEach(b => {
      b.addEventListener('click', () => {
        const a = gradeAssignments(teacherGrade).find(x => x.id === b.dataset.asedit);
        if (!a) return;
        assignEditingId = a.id;
        assignPhoto = a.photo || null;
        $('asTitle').value = a.title;
        $('asSubject').value = a.subject;
        $('asDue').value = a.due;
        $('asDetails').value = a.details || '';
        $('asPhotoPreview').hidden = !assignPhoto;
        if (assignPhoto) $('asPhotoImg').src = assignPhoto;
        $('btnAssignSubmit').textContent = 'Save changes';
        $('assignFormWrap').hidden = false;
        $('asTitle').focus();
      });
    });
  }

  function tasksInit() {
    if (!isTeacher) return;
    $('assignManagePanel').hidden = false;
    $('taskPanel').hidden = true;
    $('asSubject').innerHTML = subjectsFor(teacherGrade).map(s => '<option>' + esc(s) + '</option>').join('');

    $('btnAssignNew').addEventListener('click', () => {
      assignEditingId = null; assignPhoto = null;
      $('assignForm').reset();
      $('asPhotoPreview').hidden = true;
      $('btnAssignSubmit').textContent = 'Post assignment';
      $('assignFormWrap').hidden = false;
      $('asTitle').focus();
    });
    $('btnAssignCancel').addEventListener('click', () => { $('assignFormWrap').hidden = true; });
    $('asPhoto').addEventListener('change', (e) => {
      readImage(e.target.files[0], (data) => {
        assignPhoto = data;
        $('asPhotoPreview').hidden = !data;
        if (data) $('asPhotoImg').src = data;
      });
    });
    $('asPhotoRemove').addEventListener('click', () => {
      assignPhoto = null; $('asPhoto').value = ''; $('asPhotoPreview').hidden = true;
    });

    $('assignForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const titleEl = $('asTitle');
      const dueEl = $('asDue');
      let ok = titleEl.value.trim() !== '';
      titleEl.classList.toggle('invalid', !ok);
      titleEl.parentElement.querySelector('.error').classList.toggle('show', !ok);
      const dueOk = dueEl.value !== '';
      dueEl.classList.toggle('invalid', !dueOk);
      dueEl.parentElement.querySelector('.error').classList.toggle('show', !dueOk);
      if (!ok || !dueOk) { NBANA.toast('Please fill in the title and due date.', 'error'); return; }

      const map = loadMap(K.assignments);
      const list = map[teacherGrade] || [];
      const data = {
        title: titleEl.value.trim(),
        subject: $('asSubject').value,
        due: dueEl.value,
        details: $('asDetails').value.trim(),
        photo: assignPhoto
      };
      let id = assignEditingId;
      if (id) {
        const a = list.find(x => x.id === id);
        Object.assign(a, data);
      } else {
        id = 'as_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        list.push(Object.assign({ id: id, date: nowStamp(), by: user.fullName || user.firstName }, data));
      }
      map[teacherGrade] = list;
      saveMap(K.assignments, map);

      /* Mirror the assignment into the shared feed so students see the post */
      const feed = loadFeed();
      const existing = feed.find(p => p.ref === id);
      const post = {
        ref: id,
        authorId: user.id,
        author: user.fullName || user.firstName,
        role: 'teacher',
        scope: teacherGrade,
        title: data.title,
        body: data.details,
        photo: data.photo,
        tag: data.subject + ' \u00b7 Due ' + new Date(data.due + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        date: existing ? existing.date : nowStamp()
      };
      if (existing) Object.assign(existing, post);
      else feed.unshift(Object.assign({ id: 'p_' + id }, post));
      saveFeed(feed);

      $('assignForm').reset();
      assignPhoto = null; assignEditingId = null;
      $('asPhotoPreview').hidden = true;
      $('assignFormWrap').hidden = true;
      renderAssignManage();
      renderFeed();
      renderSummaryCounts();
      NBANA.toast('Assignment posted to ' + teacherGrade + ' students.', 'success');
    });
  }

  /* ---------------- Profile ---------------- */
  function renderProfile() {
    const a = user.address || {};
    const g = user.guardian || {};
    const st = user.student || {};
    const addr = [a.house, a.barangay, a.city, a.province, a.zip].filter(Boolean).join(', ');

    $('profPersonal').innerHTML =
      row('Full name', fullName) +
      row('Date of birth', user.birthdate ? fmtDate(user.birthdate) : '') +
      row('Age', user.age ? user.age + ' years old' : '') +
      row('Sex', user.gender) +
      row('Civil status', user.civilStatus) +
      row('Religion', user.religion) +
      row('Nationality', user.nationality);

    $('profAddress').innerHTML =
      row('House no. / street', a.house) +
      row('Barangay', a.barangay) +
      row('City / Municipality', a.city) +
      row('Province', a.province) +
      row('ZIP code', a.zip) +
      row('Contact number', user.phone) +
      row('Complete address', addr);

    $('profStudent').innerHTML =
      row('Learner Reference No.', st.lrn) +
      row('Grade level', st.gradeLevel) +
      row('Section', st.section) +
      row('School year', st.schoolYear) +
      row('Semester', st.semester) +
      row('Adviser', adviser);

    $('profGuardian').innerHTML =
      row('Name', g.name) +
      row('Relationship', g.relationship) +
      row('Contact number', g.phone);

    $('profAccount').innerHTML =
      row('Login email', user.email) +
      row('Portal role', isPrincipal ? '<span class="pill pill-navy">Full Admin \u00b7 Principal</span>' :
        (isTeacher ? '<span class="pill pill-green">Teacher \u00b7 ' + esc(teacherGrade) + '</span>' :
          '<span class="pill pill-amber">Student</span>')) +
      row('Member since', fmtDate(user.createdAt)) +
      row('Password', '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') +
      row('Account status', '<span class="pill pill-green">Active</span>');
  }

  function profileInit() {
    if (!isAdmin) return;
    $('btnProfEdit').hidden = false;
    /* Admins have no enrollment record of their own */
    const stuPanel = $('profStudent').closest('.panel');
    if (stuPanel) stuPanel.hidden = true;

    $('btnProfEdit').addEventListener('click', () => {
      const a = user.address || {};
      const g = user.guardian || {};
      $('pfFirst').value = user.firstName || '';
      $('pfMiddle').value = user.middleName || '';
      $('pfLast').value = user.lastName || '';
      $('pfEmail').value = user.email || '';
      $('pfPhone').value = user.phone || '';
      $('pfHouse').value = a.house || '';
      $('pfBrgy').value = a.barangay || '';
      $('pfCity').value = a.city || '';
      $('pfProv').value = a.province || '';
      $('pfZip').value = a.zip || '';
      $('pfGName').value = g.name || '';
      $('pfGRel').value = g.relationship || '';
      $('pfGPhone').value = g.phone || '';
      $('profEditor').hidden = false;
      $('profEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('btnProfCancel').addEventListener('click', () => { $('profEditor').hidden = true; });
    $('btnProfSave').addEventListener('click', () => {
      const first = $('pfFirst').value.trim();
      const last = $('pfLast').value.trim();
      if (!first || !last) { NBANA.toast('First and last name are required.', 'error'); return; }
      const email = $('pfEmail').value.trim();
      const clash = email ? NBANA.findByLogin(email) : null;
      if (clash && clash.id !== user.id) {
        NBANA.toast('That email is already used by another account.', 'error');
        return;
      }
      const mid = $('pfMiddle').value.trim();
      user.firstName = first;
      user.middleName = mid;
      user.lastName = last;
      user.fullName = [first, mid, last].filter(Boolean).join(' ');
      if (email) { user.email = email; user.username = email.toLowerCase(); }
      user.phone = $('pfPhone').value.trim();
      user.address = {
        house: $('pfHouse').value.trim(), barangay: $('pfBrgy').value.trim(),
        city: $('pfCity').value.trim(), province: $('pfProv').value.trim(), zip: $('pfZip').value.trim()
      };
      user.guardian = {
        name: $('pfGName').value.trim(), relationship: $('pfGRel').value.trim(), phone: $('pfGPhone').value.trim()
      };
      saveUser(user);
      $('profEditor').hidden = true;
      $('sideName').textContent = user.fullName;
      renderProfile();
      NBANA.toast('Profile updated.', 'success');
    });
  }

  /* ---------------- Dashboard banner ---------------- */
  function renderBanner() {
    const hour = new Date().getHours();
    const kicker = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    const s = NBANA.billingSummary(user);
    const open = (user.tasks || []).filter(t => !t.done).length;
    $('wbKicker').textContent = kicker;
    $('wbName').textContent = fullName;
    $('wbText').textContent = gradeLevel + (section && section !== 'TBD' ? ' \u2022 Section ' + section : '') +
      ' \u2022 School year ' + schoolYear + '. You have ' + open + ' open ' + (open === 1 ? 'task' : 'tasks') +
      ' and your tuition balance is ' + money(s.balance) + '.';
  }


  /* ---------------- Students management (principal) ---------------- */
  let stuEditingId = null;

  function gradeOptionsHtml() {
    return GRADES.map(g => '<option>' + g + '</option>').join('');
  }

  function fillStudentSelects() {
    const scoped = studentsInScope();
    const scopedOpts = scoped.map(a =>
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || 'Section') + '</option>'
    ).join('') || '<option>No students in this class</option>';
    $('gradesStudentSel').innerHTML = scopedOpts;
    $('attStudentSel').innerHTML = scopedOpts;
    if (isPrincipal) {
      const all = allStudents();
      $('feesStudentSel').innerHTML = all.map(a =>
        '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.gradeLevel) || 'No grade') + '</option>'
      ).join('') || '<option>No students yet</option>';
      if (gradesTargetId) $('gradesStudentSel').value = gradesTargetId;
      if (attTargetId) $('attStudentSel').value = attTargetId;
      if (feesTargetId) $('feesStudentSel').value = feesTargetId;
    }
  }

  function renderStudents() {
    const list = allStudents();
    $('stuCount').textContent = list.length + ' student account' + (list.length === 1 ? '' : 's') + ' \u00b7 editable records';
    $('stuRows').innerHTML = list.length ? list.map(a => {
      const s = NBANA.billingSummary(a);
      const st = a.student || {};
      return '<tr><td><strong>' + esc(nameOf(a)) + '</strong><br><span class="sc-sub">' + esc(a.email) + '</span></td>' +
        '<td>' + esc(st.gradeLevel || '\u2014') + '</td>' +
        '<td>' + esc(st.section || '\u2014') + '</td>' +
        '<td>' + esc(st.lrn || '\u2014') + '</td>' +
        '<td class="num">' + money(s.balance) + '</td>' +
        '<td><button type="button" class="btn-sm" data-stuedit="' + esc(a.id) + '">Edit</button></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty-state">No student accounts yet.</div></td></tr>';

    document.querySelectorAll('[data-stuedit]').forEach(b => {
      b.addEventListener('click', () => openStuEditor(b.dataset.stuedit));
    });
  }

  function toggleRoleFields() {
    const asTeacher = $('sfRole').value === 'teacher';
    $('sfTGradeField').hidden = !asTeacher;
    $('sfGradeField').hidden = asTeacher;
    $('sfSectionField').hidden = asTeacher;
    $('sfLrnField').hidden = asTeacher;
  }

  function openStuEditor(id) {
    stuEditingId = id || 'new';
    const a = id ? NBANA.findAccount(id) : null;
    $('stuEditorTitle').textContent = a ? 'Edit record \u00b7 ' + nameOf(a) : 'Create a new portal account';
    $('sfPwField').hidden = !!a;
    const st = (a && a.student) || {};
    const ad = (a && a.address) || {};
    const gd = (a && a.guardian) || {};
    $('sfFirst').value = (a && a.firstName) || '';
    $('sfMiddle').value = (a && a.middleName) || '';
    $('sfLast').value = (a && a.lastName) || '';
    $('sfEmail').value = (a && a.email) || '';
    $('sfPhone').value = (a && a.phone) || '';
    $('sfRole').value = (a && a.role === 'teacher') ? 'teacher' : 'student';
    $('sfGrade').value = st.gradeLevel || GRADES[4];
    $('sfSection').value = st.section || '';
    $('sfLrn').value = st.lrn || '';
    $('sfTGrade').value = (a && a.assignedGrade) || teacherGrade;
    $('sfHouse').value = ad.house || '';
    $('sfBrgy').value = ad.barangay || '';
    $('sfCity').value = ad.city || '';
    $('sfProv').value = ad.province || '';
    $('sfGName').value = gd.name || '';
    $('sfGRel').value = gd.relationship || '';
    $('sfGPhone').value = gd.phone || '';
    $('sfPw').value = '';
    toggleRoleFields();
    $('stuEditor').hidden = false;
    $('stuEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function studentsInit() {
    if (!isPrincipal) return;
    $('sfGrade').innerHTML = gradeOptionsHtml();
    $('sfTGrade').innerHTML = gradeOptionsHtml();
    fillStudentSelects();
    renderStudents();

    $('btnStuNew').addEventListener('click', () => openStuEditor(null));
    $('sfRole').addEventListener('change', toggleRoleFields);
    const close = () => { $('stuEditor').hidden = true; stuEditingId = null; };
    $('btnStuClose').addEventListener('click', close);
    $('btnStuCancel').addEventListener('click', close);

    $('stuForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const first = $('sfFirst').value.trim();
      const last = $('sfLast').value.trim();
      const email = $('sfEmail').value.trim();
      let ok = first !== '';
      $('sfFirst').classList.toggle('invalid', !ok);
      $('sfFirst').parentElement.querySelector('.error').classList.toggle('show', !ok);
      const lastOk = last !== '';
      $('sfLast').classList.toggle('invalid', !lastOk);
      $('sfLast').parentElement.querySelector('.error').classList.toggle('show', !lastOk);
      const emailOk = EMAIL_RE.test(email);
      $('sfEmail').classList.toggle('invalid', !emailOk);
      $('sfEmail').parentElement.querySelector('.error').classList.toggle('show', !emailOk);
      if (!ok || !lastOk || !emailOk) { NBANA.toast('Please fill in name and a valid email.', 'error'); return; }

      const isNew = stuEditingId === 'new';
      const existing = NBANA.findByLogin(email);
      if (existing && (isNew || existing.id !== stuEditingId)) {
        NBANA.toast('Another account already uses that email.', 'error');
        return;
      }
      const asTeacher = $('sfRole').value === 'teacher';
      let pw = '';
      if (isNew) {
        pw = $('sfPw').value;
        const pwOk = pw.length >= 6;
        $('sfPw').classList.toggle('invalid', !pwOk);
        $('sfPw').parentElement.querySelector('.error').classList.toggle('show', !pwOk);
        if (!pwOk) { NBANA.toast('Initial password must be at least 6 characters.', 'error'); return; }
      }

      const profile = {
        firstName: first,
        middleName: $('sfMiddle').value.trim(),
        lastName: last,
        fullName: [first, $('sfMiddle').value.trim(), last].filter(Boolean).join(' '),
        email: email,
        phone: $('sfPhone').value.trim(),
        role: asTeacher ? 'teacher' : 'student',
        address: {
          house: $('sfHouse').value.trim(), barangay: $('sfBrgy').value.trim(),
          city: $('sfCity').value.trim(), province: $('sfProv').value.trim(), zip: ''
        },
        guardian: {
          name: $('sfGName').value.trim(), relationship: $('sfGRel').value.trim(), phone: $('sfGPhone').value.trim()
        }
      };

      if (isNew) {
        if (asTeacher) profile.assignedGrade = $('sfTGrade').value;
        else profile.student = {
          lrn: $('sfLrn').value.trim(),
          gradeLevel: $('sfGrade').value,
          section: $('sfSection').value.trim() || 'TBD',
          schoolYear: '2026\u20132027',
          semester: 'First Semester'
        };
        const created = NBANA.createAccount(profile, pw);
        NBANA.toast('Account created for ' + created.fullName + '.', 'success');
      } else {
        const a = NBANA.findAccount(stuEditingId);
        if (!a) { NBANA.toast('Account not found.', 'error'); return; }
        Object.assign(a, profile);
        if (asTeacher) {
          a.assignedGrade = $('sfTGrade').value;
        } else {
          a.student = Object.assign({}, a.student, {
            lrn: $('sfLrn').value.trim(),
            gradeLevel: $('sfGrade').value,
            section: $('sfSection').value.trim() || 'TBD'
          });
        }
        saveUser(a);
        NBANA.toast('Record updated for ' + a.fullName + '.', 'success');
      }

      $('stuForm').reset();
      close();
      fillStudentSelects();
      renderStudents();
      renderGrades();
      renderAttendance();
      renderFees();
    });
  }

  /* ---------------- Admin dashboard ---------------- */
  function renderAdminDash() {
    if (!isAdmin) return;
    const dash = $('view-dashboard');
    let box = $('adminDash');
    if (!box) {
      Array.from(dash.children).forEach(el => { el.hidden = true; });
      box = document.createElement('div');
      box.id = 'adminDash';
      dash.appendChild(box);
    }

    const students = allStudents();
    const teachers = NBANA.getAccounts().filter(a => a.role === 'teacher');
    const feed = visibleFeed();
    const hour = new Date().getHours();
    const kicker = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

    let cards, actions, bannerText;
    if (isPrincipal) {
      const receivable = students.reduce((sum, a) => sum + NBANA.billingSummary(a).balance, 0);
      cards = [
        { icon: '&#10003;', label: 'Students', value: students.length, sub: 'enrolled portal accounts' },
        { icon: '&#9733;', label: 'Teachers', value: teachers.length, sub: 'faculty with portal access' },
        { icon: '&#8369;', label: 'Tuition receivable', value: money(Math.round(receivable)), sub: 'unpaid balances, all grades' },
        { icon: '&#9993;', label: 'Announcements', value: feed.length, sub: 'posts on the school feed' }
      ];
      actions = [
        ['news', '+ Post an announcement'],
        ['students', 'Manage student records'],
        ['fees', 'Edit tuition & payments'],
        ['grades', 'Enter or edit grades']
      ];
      bannerText = 'Full admin access \u00b7 You can edit tuition, grades, attendance, schedules, announcements, and every student record.';
    } else {
      const mine = studentsInScope();
      const avgs = mine.map(a => {
        const g = computeGrades(a);
        return Math.round(g.reduce((s, x) => s + x.final, 0) / g.length);
      });
      const classAvg = avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : 0;
      cards = [
        { icon: '&#10003;', label: 'My students', value: mine.length, sub: teacherGrade + ' class' },
        { icon: '&#9733;', label: 'Class average', value: avgs.length ? classAvg : '\u2014', sub: 'general average, all subjects' },
        { icon: '&#9776;', label: 'Assignments', value: gradeAssignments(teacherGrade).length, sub: 'posted to your class' },
        { icon: '&#9993;', label: 'Feed posts', value: feed.length, sub: 'visible to you' }
      ];
      actions = [
        ['tasks', '+ New assignment'],
        ['grades', 'Enter grades'],
        ['attendance', 'Mark attendance'],
        ['news', 'Share a post with ' + teacherGrade]
      ];
      bannerText = 'Teacher account \u00b7 ' + teacherGrade + ' \u00b7 You can edit grades, attendance, schedule, and assignments for your class only. Tuition is managed by the administration.';
    }

    box.innerHTML =
      '<div class="welcome-banner">' +
        '<span class="wb-kicker">' + kicker + '</span>' +
        '<h2>' + esc(fullName) + '</h2>' +
        '<p>' + bannerText + '</p>' +
      '</div>' +
      '<div class="summary-grid">' + cards.map(c =>
        '<div class="summary-card"><span class="sc-icon">' + c.icon + '</span>' +
        '<span class="sc-label">' + c.label + '</span>' +
        '<div class="sc-value">' + c.value + '</div>' +
        '<div class="sc-sub">' + c.sub + '</div></div>'
      ).join('') + '</div>' +
      '<div class="panel-grid">' +
        '<div class="panel"><div class="panel-head"><div><h3>Quick actions</h3><span class="sub">Admin tools</span></div></div>' +
        '<div class="panel-body" style="display:flex;flex-direction:column;gap:10px">' +
        actions.map((a, i) => '<button type="button" class="btn-sm' + (i === 0 ? ' solid' : '') + '" data-goto="' + a[0] + '">' + a[1] + '</button>').join('') +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><div><h3>Latest announcements</h3><span class="sub">School feed</span></div>' +
        '<button type="button" class="btn-sm" data-goto="news">See all</button></div>' +
        '<div class="panel-body flush feed">' +
        (feed.length ? feed.slice(0, 3).map(postHtml).join('') : NEWS.slice(0, 2).map(newsItemHtml).join('')) +
        '</div></div>' +
      '</div>';

    box.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => setView(b.dataset.goto));
    });
  }

  /* ---------------- Boot ---------------- */
  renderFeed();
  composerSetup();

  if (isAdmin) {
    renderAdminDash();
    feesInit();
    gradesInit();
    attInit();
    schedInit();
    tasksInit();
    profileInit();
    studentsInit();
  }

  renderBanner();
  renderFees();
  renderGrades();
  renderAttendance();
  renderSchedule();
  renderTasks();
  renderProfile();
  setView('dashboard');
})();
