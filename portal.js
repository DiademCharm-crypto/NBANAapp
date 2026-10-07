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
  $('sideGrade').textContent = (user.student ? user.student.gradeLevel : 'Student') +
    (user.student && user.student.section ? ' \u2022 ' + user.student.section : '');

  /* ---------------- Helpers ---------------- */
  function saveUser(updated) {
    const accounts = NBANA.getAccounts();
    const i = accounts.findIndex(a => a.id === updated.id);
    if (i > -1) {
      accounts[i] = updated;
      NBANA.store.set(NBANA.KEYS.accounts, accounts);
    }
  }

  function nextDueDate() {
    const now = new Date();
    const day = (user.billing && user.billing.dueDay) || 15;
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

  /* ---------------- Announcements ---------------- */
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
  $('dashNews').innerHTML = NEWS.slice(0, 3).map(newsItemHtml).join('');
  $('newsList').innerHTML = NEWS.map(newsItemHtml).join('');

  /* ---------------- Fees ---------------- */
  function renderFees() {
    const s = NBANA.billingSummary(user);
    const due = nextDueDate();
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

    $('feeYearSub').textContent = 'School year ' + (user.billing.schoolYear || schoolYear);
    $('feeRows').innerHTML = s.items.map(i =>
      '<tr><td><strong>' + i.label + '</strong></td><td>' + (i.note || '') + '</td><td class="num">' + money(i.amount) + '</td></tr>'
    ).join('');
    $('feeTotal').textContent = money(s.assessed);

    const pays = s.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    $('payRows').innerHTML = pays.length
      ? pays.map(p =>
          '<tr><td>' + fmtDate(p.date) + '</td><td>' + (p.ref || '&mdash;') + '</td>' +
          '<td>' + p.method + (p.label ? ' <span class="pill pill-navy">' + p.label + '</span>' : '') + '</td>' +
          '<td class="num">' + money(p.amount) + '</td></tr>'
        ).join('')
      : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">&#128179;</span>No payments recorded yet.</div></td></tr>';
    $('payTotal').textContent = money(s.paid);

    /* Dashboard mirror */
    $('sumBalance').textContent = money(s.balance);
    $('sumBalance').className = 'sc-value ' + (s.balance > 0 ? 'alert' : 'good');
    $('sumBalanceSub').textContent = s.balance > 0 ? s.percent + '% paid \u00b7 due ' + dueStr : 'Account settled';
    $('dashFeeSub').textContent = 'School year ' + (user.billing.schoolYear || schoolYear);
    $('dashFeeBar').style.width = s.percent + '%';
    $('dashFeePaid').textContent = 'Paid: ' + money(s.paid);
    $('dashFeeTotal').textContent = 'Assessed: ' + money(s.assessed);
    $('dashFeeDue').textContent = s.balance > 0
      ? 'Next due date: ' + dueStr + ' \u00b7 Remaining: ' + money(s.balance)
      : 'No remaining balance. Keep it up!';
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

    const s = NBANA.billingSummary(user);
    if (amount > s.balance && s.balance > 0) {
      NBANA.toast('Amount exceeds the remaining balance of ' + money(s.balance) + '.', 'error');
      return;
    }

    user.billing.payments.push({
      id: 'p_' + Date.now().toString(36),
      date: new Date().toISOString().slice(0, 10),
      ref: $('payRef').value.trim() || ('PORTAL-' + Date.now().toString(36).toUpperCase()),
      method: $('payMethod').value,
      amount: amount,
      label: 'Portal payment',
      status: 'Posted'
    });
    saveUser(user);
    $('payForm').reset();
    $('payPanel').hidden = true;
    renderFees();
    NBANA.toast('Payment of ' + money(amount) + ' recorded. Thank you!', 'success');
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

  function row(k, v) {
    return '<div class="info-row"><span class="k">' + k + '</span><span class="v">' + (v || '&mdash;') + '</span></div>';
  }

  /* ---------------- Grades ---------------- */
  function computeGrades() {
    const rng = makeRng(seedOf(user.id + gradeLevel + 'grades'));
    return SUBJECTS.map(name => {
      const q = [0, 0, 0, 0].map(() => 76 + Math.floor(rng() * 23));
      const final = Math.round(q.reduce((a, b) => a + b, 0) / 4);
      const remarks = final >= 90 ? 'With Merit' : final >= 85 ? 'Good' : final >= 75 ? 'Passed' : 'Needs Review';
      const pill = final >= 85 ? 'pill-green' : final >= 75 ? 'pill-navy' : 'pill-red';
      return { name, q, final, remarks, pill };
    });
  }

  function renderGrades() {
    const grades = computeGrades();
    const avg = Math.round(grades.reduce((s, g) => s + g.final, 0) / grades.length);
    const highest = grades.reduce((m, g) => Math.max(m, g.final), 0);
    const standing = avg >= 90 ? 'With Honors' : avg >= 85 ? 'High' : avg >= 75 ? 'Passing' : 'Review';

    $('gAverage').textContent = avg;
    $('gHighest').textContent = highest;
    $('gSubjects').textContent = grades.length;
    $('gStanding').textContent = standing;
    $('gradeSub').textContent = gradeLevel + ' \u2022 ' + section + ' \u2022 ' + schoolYear;
    $('gradeRows').innerHTML = grades.map(g =>
      '<tr><td><strong>' + g.name + '</strong></td>' +
      g.q.map(v => '<td class="num">' + v + '</td>').join('') +
      '<td class="num"><strong>' + g.final + '</strong></td>' +
      '<td><span class="pill ' + g.pill + '">' + g.remarks + '</span></td></tr>'
    ).join('');
    $('gradeFootAvg').textContent = avg;
    $('gradeFootRemarks').textContent = standing;

    $('sumAverage').textContent = avg;
    $('sumAverageSub').textContent = standing + ' \u00b7 adviser: ' + adviser;
    return avg;
  }

  /* ---------------- Attendance ---------------- */
  function computeAttendance() {
    const rng = makeRng(seedOf(user.id + 'attendance'));
    const days = [];
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (days.length < 15) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        const r = rng();
        const status = r < 0.86 ? 'Present' : (r < 0.94 ? 'Late' : 'Absent');
        let time = '&mdash;';
        if (status === 'Present') {
          const m = 18 + Math.floor(rng() * 16);
          time = '7:' + (m < 10 ? '0' + m : m) + ' AM';
        } else if (status === 'Late') {
          const m = 46 + Math.floor(rng() * 13);
          time = m >= 60 ? '8:' + (m - 60 < 10 ? '0' + (m - 60) : m - 60) + ' AM' : '7:' + m + ' AM';
        }
        days.push({ date: new Date(d), status, time });
      }
      d.setDate(d.getDate() - 1);
    }
    return days;
  }

  function renderAttendance() {
    const days = computeAttendance();
    const present = days.filter(x => x.status === 'Present').length;
    const late = days.filter(x => x.status === 'Late').length;
    const absent = days.filter(x => x.status === 'Absent').length;
    const rate = Math.round(((present + late) / days.length) * 100);

    $('attPresent').textContent = present;
    $('attAbsent').textContent = absent;
    $('attLate').textContent = late;
    $('attRate').textContent = rate + '%';

    $('attRows').innerHTML = days.map(x => {
      const pill = x.status === 'Present' ? 'pill-green' : x.status === 'Late' ? 'pill-amber' : 'pill-red';
      return '<tr><td>' + x.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
        '</td><td>' + x.date.toLocaleDateString('en-PH', { weekday: 'long' }) +
        '</td><td><span class="pill ' + pill + '">' + x.status + '</span></td><td>' + x.time + '</td></tr>';
    }).join('');

    $('sumAttendance').textContent = rate + '%';
    $('sumAttendanceSub').textContent = present + late + ' of ' + days.length + ' school days attended';
  }

  /* ---------------- Schedule ---------------- */
  function renderSchedule() {
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
    let si = 0;
    const room = section && section !== 'TBD' ? 'Room ' + section : 'Homeroom';
    $('schedRows').innerHTML = slots.map(s => {
      const subject = s.fixed || SUBJECTS[si++ % SUBJECTS.length];
      const teacher = s.fixed ? '\u2014' : adviser;
      return '<tr><td><strong>' + s.time + '</strong></td><td>' + s.days + '</td><td>' + subject +
        '</td><td>' + teacher + '</td><td>' + (s.fixed ? '\u2014' : room) + '</td></tr>';
    }).join('');
    $('schedSub').textContent = gradeLevel + ' \u2022 ' + section + ' \u2022 adviser: ' + adviser;
  }

  /* ---------------- Assignments ---------------- */
  function renderTasks() {
    const tasks = user.tasks || [];
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
        '<span class="t-body"><span class="t-title">' + t.title + '</span>' +
        '<span class="t-meta"><span class="pill pill-navy">' + t.subject + '</span>' +
        '<span class="pill ' + duePill + '">Due ' + due.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
        (overdue ? ' \u00b7 overdue' : '') + '</span></span></span></label>';
    }).join('') : '<div class="empty-state"><span class="es-icon">&#10003;</span>No assignments right now. Enjoy!</div>';

    document.querySelectorAll('[data-task]').forEach(cb => {
      cb.addEventListener('change', () => {
        const t = (user.tasks || []).find(x => x.id === cb.dataset.task);
        if (t) {
          t.done = cb.checked;
          saveUser(user);
          renderTasks();
          renderSummaryCounts();
          NBANA.toast(cb.checked ? 'Assignment marked as done.' : 'Assignment reopened.', 'success');
        }
      });
    });

    renderSummaryCounts();
  }

  function renderSummaryCounts() {
    const tasks = user.tasks || [];
    const open = tasks.filter(t => !t.done).length;
    $('sumTasks').textContent = open;
    $('sumTasksSub').textContent = open ? 'due soon \u00b7 ' + tasks.length + ' total' : 'all caught up';
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
      row('Member since', fmtDate(user.createdAt)) +
      row('Password', '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') +
      row('Account status', '<span class="pill pill-green">Active</span>');
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


  renderBanner();
  renderFees();
  renderGrades();
  renderAttendance();
  renderSchedule();
  renderTasks();
  renderProfile();
  setView('dashboard');
})();
