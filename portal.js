/* ============================================================
   NBANA School Portal - dashboard logic
   ============================================================ */
(function () {
  'use strict';

  const user = NBANA.currentUser();
  if (!user) {
    NBANA.toast('Please sign in to open the school portal.', 'error');
    window.location.replace(NBANA.appUrl('login.html'));
    return;
  }

  const $ = (id) => document.getElementById(id);
  const money = NBANA.peso;

  /* ---------------- Roles & scope ---------------- */
  const role = user.role || 'student';
  /* 'principal' is the school head; 'admin' is a full administrator. Both get every tool. */
  const isPrincipal = NBANA.isAdminRole(role);
  const isTeacher = role === 'teacher';
  const isAdmin = isPrincipal || isTeacher;
  const adminTitle = role === 'principal' ? 'Full Admin \u00b7 Principal' : 'Full Admin \u00b7 Administrator';
  const teacherGrade = user.assignedGrade || 'Grade 5';
  const GRADES = ['Kinder 1', 'Kinder 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
  const GRADUATED = 'Graduated';

  const K = {
    grades: 'nbana.grades.v1',
    attendance: 'nbana.attendance.v1',
    schedule: 'nbana.schedules.v1',
    feed: 'nbana.feed.v1',
    assignments: 'nbana.assignments.v1',
    concerns: 'nbana.concerns.v1',
    threads: 'nbana.threads.v1',
    notices: 'nbana.notices.v1',
    /* Where the user was last time, so a refresh keeps the same page open */
    view: 'nbana.view.v1',
    thread: 'nbana.thread.v1',
    chatMode: 'nbana.chatmode.v1'
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v == null ? '' : String(v)); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Avatars: a profile picture when the account has one, initials otherwise */
  function initialsOf(name) {
    return String(name || '?').split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
  }
  function photoOf(accountId) {
    const a = accountId ? NBANA.findAccount(accountId) : null;
    return (a && a.photo) || '';
  }
  function avatarSpan(cls, name, photo) {
    return '<span class="' + cls + (photo ? ' has-photo' : '') + '">' +
      (photo ? '<img src="' + photo + '" alt="">' : esc(initialsOf(name))) + '</span>';
  }

  /* Students visible to the signed-in admin */
  function studentsInScope() {
    return NBANA.getAccounts().filter(a =>
      (a.role || 'student') === 'student' &&
      (!isTeacher || (a.student && a.student.gradeLevel) === teacherGrade)
    ).sort(byClassOrder);
  }
  function allStudents() {
    return NBANA.getAccounts().filter(a => (a.role || 'student') === 'student').sort(byClassOrder);
  }
  /* Class order for every list of students: Grade 1 upward, then surname */
  function gradeRank(g) { const m = String(g || '').match(/\d+/); return m ? Number(m[0]) : 0; }
  function byClassOrder(a, b) {
    return gradeRank((a.student || {}).gradeLevel) - gradeRank((b.student || {}).gradeLevel) ||
      nameOf(a).localeCompare(nameOf(b));
  }
  /* Students still enrolled this school year (Grade 6 leavers drop out of the roster) */
  function isGraduated(a) { return !!(a.student && a.student.status === GRADUATED); }
  function activeStudents() { return allStudents().filter(a => !isGraduated(a)); }

  /* ---------------- View routing ---------------- */
  const VIEWS = {
    dashboard: ['Dashboard', 'Your school day at a glance'],
    students: ['Students', 'Manage every student account'],
    approvals: ['Approvals', 'Teacher posts waiting for your approval'],
    fees: ['Tuition & Fees', 'Assessed fees, payments, and balance'],
    grades: ['Grades', 'Report card and class standing'],
    attendance: ['Attendance', 'Daily record for this term'],
    schedule: ['Class Schedule', 'Weekly timetable'],
    tasks: ['Assignments', 'Tasks and due dates'],
    news: ['Feed', 'School posts, announcements & event memories'],
    faculty: ['Faculty & Staff', 'Teachers and school staff'],
    messages: ['Messages', 'Chat with your teacher'],
    contact: ['Contact School', 'Send a concern to the school office'],
    pwreq: ['Password help', 'Send users the password they forgot'],
    profile: ['My Profile', 'Your registration survey answers']
  };

  /* Some sections read differently depending on who is signed in */
  const VIEW_ROLE = {
    messages: {
      teacher: ['Messages', 'Chat with the students in your class'],
      principal: ['Message monitoring', 'See which student is messaging which teacher']
    },
    contact: {
      principal: ['School Concerns', 'Concerns students sent to the school office']
    }
  };
  function viewMeta(name) { return (VIEW_ROLE[name] && VIEW_ROLE[name][role]) || VIEWS[name]; }

  /* Which sections each role may open. Teachers never see tuition or school concerns. */
  const ALLOWED = {
    student: ['dashboard', 'fees', 'grades', 'attendance', 'schedule', 'tasks', 'news', 'faculty', 'messages', 'contact', 'profile'],
    teacher: ['dashboard', 'grades', 'attendance', 'schedule', 'tasks', 'news', 'faculty', 'messages', 'profile'],
    principal: ['dashboard', 'students', 'approvals', 'fees', 'grades', 'attendance', 'schedule', 'news', 'faculty', 'messages', 'contact', 'pwreq', 'profile']
  };
  ALLOWED.admin = ALLOWED.principal;
  /* Teachers never carry tuition, so the fees page is closed to them entirely */
  const canSeeFees = ALLOWED[role].indexOf('fees') > -1;

  /* Refreshing used to drop the user back on the feed - now the open page is remembered */
  function savedView() {
    const v = lsGet(K.view);
    return v && VIEWS[v] && ALLOWED[role].indexOf(v) > -1 ? v : null;
  }

  function setView(name) {
    if (!VIEWS[name] || ALLOWED[role].indexOf(name) === -1) name = 'dashboard';
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('#sideNav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    const meta = viewMeta(name);
    $('viewTitle').textContent = meta[0];
    $('viewSub').textContent = meta[1];
    if (name === 'messages') renderMessages();
    if (name === 'contact') { renderConcerns(); renderNotices(); markConcernsSeen(); markNoticesRead(); }
    if (name === 'pwreq') renderPwReqs();
    if (name === 'faculty') renderFaculty();
    $('portalShell').classList.remove('side-open');
    closeDrawer();
    syncBottomNav(name);
    lsSet(K.view, name);
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
    setTimeout(() => { window.location.href = NBANA.appUrl('login.html'); }, 400);
  });

  /* ---------------- Header chips ---------------- */
  $('chipDate').textContent = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const schoolYear = NBANA.getSchoolYear();
  $('chipYear').textContent = 'SY ' + schoolYear;

  /* Sidebar identity */
  const fullName = user.fullName || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ');
  const initials = (user.firstName || '?').charAt(0) + (user.lastName || '').charAt(0);
  function paintAvatar() {
    const el = $('sideAvatar');
    if (!el) return;
    if (user.photo) el.innerHTML = '<img src="' + user.photo + '" alt="">';
    else el.textContent = initials.toUpperCase() || '?';
  }
  paintAvatar();
  $('sideName').textContent = fullName;
  if (isAdmin) {
    $('sideGrade').textContent = isPrincipal ? adminTitle : 'Teacher \u00b7 ' + teacherGrade;
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

  /* Teacher posts wait for the principal's approval before anyone sees them */
  function postStatus(p) { return p.status || 'approved'; }
  function pendingPosts() { return loadFeed().filter(p => postStatus(p) === 'pending'); }

  /* A post is visible when: everyone (scope 'all'), or it targets my grade.
     Principal announcements use scope 'all' so even teachers see them.
     A teacher always sees their own posts so they can follow the approval status. */
  function visibleFeed() {
    const myGrade = isTeacher ? teacherGrade : (user.student && user.student.gradeLevel);
    return loadFeed().filter(p => {
      if (postStatus(p) !== 'approved') return p.authorId === user.id;
      return isPrincipal || p.scope === 'all' || (myGrade && p.scope === myGrade);
    });
  }

  /* Compress an image to a data URL (keeps localStorage small) */
  function readImage(file, cb, maxSize) {
    if (!file) { cb(null); return; }
    if (!/^image\//.test(file.type)) { NBANA.toast('Please choose an image file.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = maxSize || 1280;
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

  /* -------- Post media: photos & short videos, Facebook-style. --------
     Media is too big for localStorage, so each file goes into a small
     in-browser database (IndexedDB) as a { key, dataUrl } record — the same
     record shape Supabase storage will use, so nothing here is throwaway. */
  function mediaDB() {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.open('nbana-media', 1);
      rq.onupgradeneeded = () => {
        const dx = rq.result;
        if (!dx.objectStoreNames.contains('files')) dx.createObjectStore('files', { keyPath: 'key' });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  function mediaIDB(op, fn) {
    return mediaDB().then((dx) => new Promise((resolve, reject) => {
      const tx = dx.transaction('files', op);
      const rq = fn(tx.objectStore('files'));
      rq.onsuccess = () => { dx.close(); resolve(rq.result); };
      rq.onerror = () => { dx.close(); reject(rq.error); };
    }));
  }
  function mediaPut(key, dataUrl) { return mediaIDB('readwrite', (s) => s.put({ key, dataUrl })); }
  function mediaGet(key) { return mediaIDB('readonly', (s) => s.get(key)).then((rec) => (rec && rec.dataUrl) || null); }
  function mediaDelete(key) { return mediaIDB('readwrite', (s) => s.delete(key)); }

  const blobUrlCache = {};
  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(parts[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }
  /* Object-URL per media key, cached so scrolling the feed doesn't re-decode */
  function mediaUrl(key, cb) {
    if (blobUrlCache[key]) { cb(blobUrlCache[key]); return; }
    mediaGet(key).then((dataUrl) => {
      if (!dataUrl) { cb(null); return; }
      blobUrlCache[key] = URL.createObjectURL(dataUrlToBlob(dataUrl));
      cb(blobUrlCache[key]);
    });
  }
  /* Fill in the real source of every <img>/<video> that points at the media store.
     Cloud URL first (works on any device), local copy as the fallback. */
  function mediaHydrate(root) {
    const nodes = root && root.querySelectorAll ? root.querySelectorAll('img[data-media-key], video[data-media-key], img[data-media-url], video[data-media-url]') : [];
    nodes.forEach((n) => {
      if (n.dataset.mediaUrl) { n.src = n.dataset.mediaUrl; return; }
      if (n.dataset.mediaKey) mediaUrl(n.dataset.mediaKey, (u) => { if (u) n.src = u; });
    });
  }

  /* A media node carries both sources: the uploaded URL (any device) and the
     local IndexedDB key (this device, so a post still opens offline). */
  function mediaAttrs(m) {
    let out = '';
    if (m && m.url) out += ' data-media-url="' + esc(m.url) + '"';
    if (m && m.key && !m.legacy) out += ' data-media-key="' + esc(m.key) + '"';
    return out;
  }

  /* Grab a frame from a video file to use as its cover photo */
  function pickVideoPoster(file) {
    return new Promise((resolve) => {
      try {
        const dom = document.createElement('video');
        dom.preload = 'metadata';
        dom.muted = true;
        const url = URL.createObjectURL(file);
        dom.src = url;
        let settled = false;
        const done = (p) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(p); };
        dom.onloadeddata = () => {
          dom.currentTime = Math.min(1, (dom.duration || 2) / 3);
          dom.onseeked = () => {
            try {
              const c = document.createElement('canvas');
              c.width = dom.videoWidth || 1280; c.height = dom.videoHeight || 720;
              c.getContext('2d').drawImage(dom, 0, 0, c.width, c.height);
              done(c.toDataURL('image/jpeg', 0.6));
            } catch (err) { done(null); }
          };
        };
        dom.onerror = () => done(null);
        setTimeout(() => done(null), 6000);
      } catch (err) { resolve(null); }
    });
  }

  function renderMediaHtml(p) {
    const list = p.media || (p.photo ? [{ key: 'legacy-' + p.id, kind: 'photo', legacy: true }] : []);
    if (!list.length) return '';
    /* A lone video plays inline, Facebook-style; everything else is a tappable grid */
    if (list.length === 1 && list[0].kind === 'video') {
      return '<video class="fp-video" controls preload="metadata"' + mediaAttrs(list[0]) + '></video>';
    }
    /* Four tiles at most, like Facebook — the last one shows how many more
       photos are waiting, and tapping it opens the full viewer. */
    const shown = list.slice(0, 4);
    const extra = list.length - shown.length;
    const cell = (m, i) =>
      '<figure class="fp-media" data-idx="' + i + '">' +
        '<div class="fp-thumb" data-open="' + esc(p.id) + '|' + i + '">' +
          (m.kind === 'video'
            ? ((m.posterKey || m.posterUrl)
                ? '<img' + mediaAttrs({ url: m.posterUrl, key: m.posterKey }) + ' alt="Video cover">'
                : '') + '<span class="fp-play">&#9654;</span>'
            : (m.legacy
                ? '<img src="' + p.photo + '" alt="School event photo">'
                : '<img' + mediaAttrs(m) + ' alt="School event photo">')) +
          (extra > 0 && i === shown.length - 1 ? '<span class="fp-more">+' + extra + '</span>' : '') +
        '</div>' +
      '</figure>';
    return '<div class="fp-grid n' + Math.min(shown.length, 4) + '">' + shown.map(cell).join('') + '</div>';
  }

  function migrateFeedPhotos() {
    const toMove = loadFeed().filter((p) => p.photo && (!p.media || !p.media.length));
    if (!toMove.length) return Promise.resolve();
    return Promise.all(toMove.map((p) => mediaPut('media_' + p.id, p.photo)))
      .then(() => {
        toMove.forEach((p) => {
          p.media = [{ key: 'media_' + p.id, kind: 'photo' }];
          delete p.photo;
        });
        saveFeed(loadFeed());
      })
      .catch(() => {});
  }

  /* Post media viewer, Facebook-style: opens on the photo you tapped and
     pages through every photo/video in that post (arrows, keyboard, swipe). */
  let lbPost = null;
  let lbIdx = 0;

  function lbList(post) {
    return post.media || (post.photo ? [{ key: 'legacy-' + post.id, kind: 'photo', legacy: true }] : []);
  }

  function lbRender() {
    const lb = $('lightbox'), stage = $('lbStage');
    if (!lb || !stage || !lbPost) return;
    const list = lbList(lbPost);
    const m = list[lbIdx];
    if (!m) return;
    const many = list.length > 1;
    if ($('lbPrev')) $('lbPrev').hidden = !many;
    if ($('lbNext')) $('lbNext').hidden = !many;
    const getUrl = (item) => item.url ? Promise.resolve(item.url)
      : (item.legacy ? Promise.resolve(lbPost.photo) : new Promise((res) => mediaUrl(item.key, res)));
    getUrl(m).then((u) => {
      if (!u || lb.hidden) return;
      stage.innerHTML = m.kind === 'video'
        ? '<video src="' + u + '" controls autoplay playsinline></video>'
        : '<img src="' + u + '" alt="School event photo">' +
          (many ? '<span class="lb-count">' + (lbIdx + 1) + ' / ' + list.length + '</span>' : '');
    });
  }

  function lbStep(delta) {
    if (!lbPost) return;
    const total = lbList(lbPost).length;
    if (total < 2) return;
    lbIdx = (lbIdx + delta + total) % total;
    lbRender();
  }

  function closeLightbox() {
    const lb = $('lightbox'), stage = $('lbStage');
    if (stage) stage.innerHTML = '';
    if (lb) lb.hidden = true;
    lbPost = null;
  }

  function openLightbox(postId, idx) {
    const p = loadFeed().find((x) => x.id === postId);
    const lb = $('lightbox');
    if (!p || !lb) return;
    const list = lbList(p);
    if (!list.length) return;
    lbPost = p;
    lbIdx = Math.min(Math.max(0, Number(idx) || 0), list.length - 1);
    lb.hidden = false;
    lbRender();
  }

  /* Viewer controls are wired once — the lightbox markup never changes */
  (function lightboxInit() {
    const lb = $('lightbox');
    if (!lb) return;
    const close = $('lbClose');
    if (close) close.addEventListener('click', closeLightbox);
    lb.addEventListener('click', (ev) => { if (ev.target === lb) closeLightbox(); });
    if ($('lbPrev')) $('lbPrev').addEventListener('click', () => lbStep(-1));
    if ($('lbNext')) $('lbNext').addEventListener('click', () => lbStep(1));
    const stage = $('lbStage');
    let touchX = null;
    if (stage) {
      stage.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
      stage.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 45) lbStep(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
  })();
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-open]') : null;
    if (t) openLightboxTap(t);
  });
  function openLightboxTap(t) {
    const parts = t.dataset.open.split('|');
    openLightbox(parts[0], Number(parts[1] || 0));
  }
  document.addEventListener('keydown', (e) => {
    const lb = $('lightbox');
    if (!lb || lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lbStep(-1);
    else if (e.key === 'ArrowRight') lbStep(1);
  });

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

  /* ---------------- Past school events (shown under the announcements) ---------------- */
  const PAST_EVENTS = [
    { date: '2026-09-26', tag: 'Event', title: 'Nutrition Month Culmination', body: 'Students presented healthy snacks, joined the feeding program, and crowned this year\u2019s Nutrition Ambassadors.' },
    { date: '2026-09-08', tag: 'Program', title: 'Buwan ng Wika Celebration', body: 'A morning of folk dances, tula, and kundiman. Parents joined the salo-salo after the program.' },
    { date: '2026-08-22', tag: 'Sports', title: 'Intramurals 2026', body: 'Four teams competed in athletics, basketball, and parlor games. Team Lakandula took the overall championship.' },
    { date: '2026-07-30', tag: 'Outreach', title: 'Community Outreach & Gift Giving', body: 'Learners and teachers shared school supplies and food packs with families in Barangay San Jose.' },
    { date: '2026-07-18', tag: 'Spiritual', title: 'Week of Prayer', body: 'A week of reflection, songs, and a family night program led by the campus chaplaincy.' },
    { date: '2026-06-16', tag: 'Opening', title: 'First Day of Classes, SY 2026-2027', body: 'Welcome assembly for Kinder to Grade 6, classroom orientation, and the distribution of class schedules.' },
    { date: '2026-05-28', tag: 'Graduation', title: 'Moving-Up & Recognition Day', body: 'Our Grade 6 completers marched with their families, followed by the awarding of honors and certificates.' }
  ];

  function pastEventHtml(e) {
    return '<div class="news-item past-event"><span class="date">' + esc(fmtDate(e.date)) + '</span>' +
      '<span class="tag" style="margin-left:8px">' + esc(e.tag) + '</span>' +
      '<h4>' + esc(e.title) + '</h4><p>' + esc(e.body) + '</p></div>';
  }

  /* ---------------- Greeting & positive motivation ---------------- */
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }
  function greetEmoji() {
    const h = new Date().getHours();
    if (h < 12) return '\u{1F31E}';
    if (h < 18) return '\u{1F308}';
    return '\u{1F319}';
  }

  /* Motivational verses for the whole school - one lands on the dashboard per day */
  const VERSES = [
    { t: 'I can do all things through Christ who strengthens me.', r: 'Philippians 4:13' },
    { t: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.', r: 'Jeremiah 29:11' },
    { t: 'The Lord is my shepherd; I shall not want.', r: 'Psalm 23:1' },
    { t: 'Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.', r: 'Joshua 1:9' },
    { t: 'Trust in the Lord with all your heart and lean not on your own understanding.', r: 'Proverbs 3:5' },
    { t: 'I am the light of the world. Whoever follows me will never walk in darkness.', r: 'John 8:12' },
    { t: 'With God all things are possible.', r: 'Matthew 19:26' },
    { t: 'Let all that you do be done in love.', r: '1 Corinthians 16:14' },
    { t: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.', r: 'Philippians 4:6' },
    { t: 'Whatever you do, work at it with all your heart, as working for the Lord.', r: 'Colossians 3:23' },
    { t: 'The joy of the Lord is your strength.', r: 'Nehemiah 8:10' },
    { t: 'Children, obey your parents in the Lord, for this is right.', r: 'Ephesians 6:1' },
    { t: 'Thy word is a lamp unto my feet, and a light unto my path.', r: 'Psalm 119:105' },
    { t: 'Cast all your anxiety on him because he cares for you.', r: '1 Peter 5:7' },
    { t: 'Be kind and compassionate to one another, forgiving each other.', r: 'Ephesians 4:32' }
  ];
  /* The verse rotates on its own - one verse per calendar day, so there is no button */
  function verseOfTheDay() {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    return VERSES[((dayOfYear % VERSES.length) + VERSES.length) % VERSES.length];
  }

  function renderVerse() {
    const v = verseOfTheDay();
    const el = $('wbVerse');
    if (!el) return;
    el.innerHTML = '"' + esc(v.t) + '" <span class="wb-verse-ref">\u2014 ' + esc(v.r) + '</span>';
    const tag = $('wbVerseTag');
    if (tag) {
      tag.textContent = 'Verse of the day \u00b7 ' +
        new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric' });
    }
  }

  /* Principal announcements are published right away; teacher posts are queued for approval */
  function statusPill(p) {
    if (p.role !== 'teacher') return '';
    const st = postStatus(p);
    if (st === 'pending') return '<span class="pill pill-amber">Waiting for approval</span> ';
    if (st === 'rejected') return '<span class="pill pill-red">Not approved</span> ';
    return p.authorId === user.id || isPrincipal ? '<span class="pill pill-green">Published</span> ' : '';
  }

  function postHtml(p, actions) {
    const roleCls = NBANA.isAdminRole(p.role) ? 'pill-navy' : (p.role === 'teacher' ? 'pill-green' : 'pill-amber');
    const roleTxt = NBANA.roleLabel(p.role);
    const audience = p.scope === 'all' ? 'Everyone' : p.scope;
    const canDelete = isAdmin && (isPrincipal || p.authorId === user.id || p.scope === teacherGrade);
    return '<article class="feed-post">' +
      '<div class="fp-head">' +
        avatarSpan('fp-avatar', p.author, photoOf(p.authorId)) +
        '<div class="fp-who"><strong>' + esc(p.author) + '</strong>' +
          '<span class="fp-meta"><span class="pill ' + roleCls + '">' + roleTxt + '</span> ' +
          '<span class="pill pill-navy">' + esc(audience) + '</span> ' + statusPill(p) + '\u00b7 ' + fmtStamp(p.date) + '</span></div>' +
        (canDelete ? '<button type="button" class="btn-del" data-del-post="' + esc(p.id) + '" title="Delete post">&times;</button>' : '') +
        (actions || '') +
      '</div>' +
      (p.title ? '<h4 class="fp-title">' + esc(p.title) + '</h4>' : '') +
      (p.tag ? '<span class="pill pill-amber fp-tag">' + esc(p.tag) + '</span>' : '') +
      (p.body ? '<p class="fp-body">' + esc(p.body).replace(/\n/g, '<br>') + '</p>' : '') +
      renderMediaHtml(p) +
    '</article>';
  }

  function renderFeed() {
    const list = visibleFeed();
    $('newsList').innerHTML =
      (list.length ? list.map(p => postHtml(p)).join('') : NEWS.map(newsItemHtml).join('')) +
      '<div class="feed-divider"><span>Past events &amp; school memories</span></div>' +
      PAST_EVENTS.map(e => pastEventHtml(e)).join('');
    mediaHydrate($('newsList'));

    const minePending = loadFeed().filter(p => p.authorId === user.id && postStatus(p) === 'pending').length;
    $('newsFeedSub').textContent = isAdmin
      ? (list.length + ' post' + (list.length === 1 ? '' : 's') + ' \u00b7 ' +
         (isPrincipal ? 'your announcements reach every portal user'
           : (minePending ? minePending + ' waiting for the principal\u2019s approval'
                          : 'approved posts for ' + teacherGrade)))
      : 'Posted by the school and your teachers';

    renderDashFeed();

  }

  /* Deleting works wherever a post appears (feed, approvals list, dashboards) */
  document.addEventListener('click', (e) => {
    const del = e.target && e.target.closest ? e.target.closest('[data-del-post]') : null;
    if (!del) return;
    const gone = loadFeed().find(x => x.id === del.dataset.delPost);
    if (gone && gone.media) gone.media.forEach((m) => {
      mediaDelete(m.key);
      if (m.posterKey) mediaDelete(m.posterKey);
    });
    saveFeed(loadFeed().filter(x => x.id !== del.dataset.delPost));
    renderFeed();
    renderApprovals();
    refreshNotifs();
    if (typeof renderAdminDash === 'function') renderAdminDash();
    NBANA.toast('Post deleted.', 'success');
  });

  /* The dashboard carries official school announcements only \u2014 teacher and class
     posts, and the past-events archive, stay on the Feed page. */
  function announcementPosts() {
    return visibleFeed()
      .filter(p => NBANA.isAdminRole(p.role))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function renderDashFeed() {
    const wrap = $('dashFeed');
    if (!wrap) return;
    const list = announcementPosts();
    wrap.innerHTML = list.length
      ? list.map(p => postHtml(p)).join('')
      : NEWS.map(newsItemHtml).join('');
    mediaHydrate(wrap);
    $('dashFeedSub').textContent = list.length
      ? list.length + ' announcement' + (list.length === 1 ? '' : 's') + ' from the school'
      : 'Official announcements from the school';
  }

  /* ---------------- Student performance (dashboard panel) ---------------- */
  function perfBar(pct) {
    const w = Math.max(0, Math.min(100, Math.round(pct)));
    return '<span class="bar light perf-bar"><span style="width:' + w + '%"></span></span>';
  }
  function perfPill(v) { return v >= 85 ? 'pill-green' : v >= 75 ? 'pill-navy' : 'pill-red'; }

  /* A student sees their own subject marks and attendance */
  function renderStudentPerf(box) {
    const grades = computeGrades(user);
    const days = computeAttendance(user);
    const graded = grades.filter(g => g.final !== null);
    const attended = days.filter(d => d.status !== 'Absent').length;
    const rate = days.length ? Math.round((attended / days.length) * 100) : null;
    const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.final, 0) / graded.length) : null;
    const standing = avg == null ? 'Not yet posted'
      : (avg >= 90 ? 'With Honors' : avg >= 85 ? 'High' : avg >= 75 ? 'Passing' : 'Needs review');

    const sub = $('dashPerfSub');
    if (sub) sub.textContent = gradeLevel + ' \u00b7 ' + schoolYear + ' \u00b7 ' + grades.length + ' subjects';

    box.innerHTML =
      '<div class="perf-kpis">' +
        '<span class="perf-kpi"><strong>' + (avg == null ? '\u2014' : avg) + '</strong>General average</span>' +
        '<span class="perf-kpi"><strong>' + (rate == null ? '\u2014' : rate + '%') + '</strong>Attendance rate</span>' +
        '<span class="perf-kpi"><strong>' + (days.length ? attended + '/' + days.length : '\u2014') + '</strong>Days present</span>' +
        '<span class="perf-kpi"><strong' + (avg == null ? '' : ' class="pill ' + perfPill(avg) + '"') + '>' + standing + '</strong>Standing</span>' +
      '</div>' +
      '<div class="perf-list">' + grades.map(g =>
        '<div class="perf-row">' +
          '<span class="perf-name">' + esc(g.name) + '</span>' + perfBar(g.final) +
          '<span class="perf-val">' + (g.final == null ? '\u2014' : g.final) + '</span>' +
          (g.pill ? '<span class="pill ' + g.pill + '">' + esc(g.remarks) + '</span>'
                  : '<span class="sc-sub">not posted</span>') +
        '</div>').join('') + '</div>' +
      '<p class="sc-sub" style="margin-top:14px">' +
      (graded.length
        ? 'Marks follow the term breakdown: written work, performance task, and quarterly exam.'
        : 'Grades are not posted yet \u2014 marks appear here once your teacher or the school office encodes them.') +
      '</p>';
  }

  /* A teacher sees their class; the principal sees the whole school */
  function renderAdminPerf(box) {
    const students = isPrincipal ? activeStudents() : studentsInScope();
    const rows = students.map(a => {
      const g = computeGrades(a);
      const graded = g.filter(x => x.final !== null);
      const avg = graded.length ? Math.round(graded.reduce((s, x) => s + x.final, 0) / graded.length) : null;
      const days = computeAttendance(a);
      const attended = days.filter(d => d.status !== 'Absent').length;
      const rate = days.length ? Math.round((attended / days.length) * 100) : null;
      const st = a.student || {};
      let tag;
      if (avg != null && rate != null) tag = '<span class="pill ' + perfPill(avg) + '">' + rate + '% att.</span>';
      else if (avg == null && rate == null) tag = '<span class="sc-sub">not posted yet</span>';
      else if (rate == null) tag = '<span class="sc-sub">no attendance yet</span>';
      else tag = '<span class="sc-sub">' + rate + '% att. \u00b7 no grades</span>';
      return { a, avg, rate, tag, grade: st.gradeLevel || '', section: st.section || '' };
    }).sort((x, y) => (y.avg == null ? -1 : y.avg) - (x.avg == null ? -1 : x.avg));

    const posted = rows.filter(r => r.avg != null).length;
    const needHelp = rows.filter(r => r.avg != null && r.avg < 75).length;
    const sub = $('adminPerfSub');
    if (sub) {
      sub.textContent = (isPrincipal ? 'All grades \u00b7 ' : teacherGrade + ' \u00b7 ') +
        rows.length + ' student' + (rows.length === 1 ? '' : 's') +
        (!posted ? ' \u00b7 grades not posted yet'
          : needHelp ? ' \u00b7 ' + needHelp + ' below passing' : ' \u00b7 everyone is passing');
    }

    box.innerHTML = rows.length
      ? '<div class="perf-list">' + rows.map(r =>
          '<div class="perf-row">' +
            '<span class="perf-who">' + avatarSpan('perf-avatar', nameOf(r.a), r.a.photo) +
              '<span class="perf-who-txt"><strong>' + esc(nameOf(r.a)) + '</strong>' +
              '<em>' + esc(r.grade || 'No grade') + (r.section ? ' \u00b7 ' + esc(r.section) : '') + '</em></span></span>' +
            perfBar(r.avg) +
            '<span class="perf-val">' + (r.avg == null ? '\u2014' : r.avg) + '</span>' +
            r.tag +
          '</div>').join('') + '</div>'
      : '<div class="empty-state">No student accounts yet.</div>';
  }

  function renderDashPerf() {
    if (isAdmin) {
      const abox = $('adminPerf');
      if (abox) renderAdminPerf(abox);
      return;
    }
    const box = $('dashPerf');
    if (box) renderStudentPerf(box);
  }

  /* ---------------- Approvals (principal / admin) ---------------- */
  function approveCardHtml(p) {
    return postHtml(p,
      '<span class="fp-actions">' +
        '<button type="button" class="btn-sm solid" data-approve="' + esc(p.id) + '">Approve</button>' +
        '<button type="button" class="btn-sm" data-reject="' + esc(p.id) + '">Reject</button>' +
      '</span>');
  }

  function renderApprovals() {
    if (!isPrincipal || !$('apprList')) return;
    const list = pendingPosts().sort((a, b) => new Date(b.date) - new Date(a.date));
    $('apprSub').textContent = list.length
      ? list.length + ' teacher post' + (list.length === 1 ? '' : 's') + ' waiting \u00b7 students cannot see them yet'
      : 'Nothing waiting \u00b7 every teacher post has been reviewed';
    $('apprList').innerHTML = list.length
      ? list.map(p => approveCardHtml(p)).join('')
      : '<div class="empty-state"><span class="es-icon">&#10003;</span>No posts waiting for approval.</div>';
    mediaHydrate($('apprList'));

    document.querySelectorAll('[data-approve]').forEach(b =>
      b.addEventListener('click', () => reviewPost(b.dataset.approve, 'approved')));
    document.querySelectorAll('[data-reject]').forEach(b =>
      b.addEventListener('click', () => reviewPost(b.dataset.reject, 'rejected')));
  }

  function reviewPost(id, status) {
    const feed = loadFeed();
    const p = feed.find(x => x.id === id);
    if (!p) return;
    p.status = status;
    p.reviewedBy = fullName;
    p.reviewedAt = nowStamp();
    saveFeed(feed);
    renderApprovals();
    renderFeed();
    if (typeof renderAdminDash === 'function') renderAdminDash();
    refreshNotifs();
    NBANA.toast(status === 'approved'
      ? 'Approved \u2014 ' + (p.scope === 'all' ? 'everyone' : p.scope + ' students') + ' can see this post now.'
      : 'Post rejected. ' + p.author + ' will see that it was not approved.',
      status === 'approved' ? 'success' : 'error');
  }

  /* ---------------- Password help (admins): users who forgot their password ---------------- */
  const PWREQ_KEY = 'nbana.pwreq.v1';
  function loadPwReqs() { return NBANA.store.get(PWREQ_KEY, []) || []; }
  function savePwReqs(list) { NBANA.store.set(PWREQ_KEY, list); }
  function pwOf(reqId) {
    const r = loadPwReqs().find((x) => x.id === reqId);
    if (!r) return '';
    const acc = NBANA.getAccounts().find((a) => String(a.email).toLowerCase() === String(r.email).toLowerCase());
    return (acc && acc.pwCode) ? NBANA.decPw(acc.pwCode) : (r.tempPw || '');
  }
  function setAccountPassword(email, newPw) {
    const list = NBANA.getAccounts();
    const i = list.findIndex((a) => String(a.email).toLowerCase() === String(email).toLowerCase());
    if (i < 0) return;
    list[i].passwordHash = NBANA.hash(newPw);
    NBANA.store.set(NBANA.KEYS.accounts, list);
    NBANA.rememberPw(list[i], newPw);
  }
  function renderPwReqs() {
    if (!isPrincipal || !$('pwList')) return;
    const reqs = loadPwReqs();
    const waiting = reqs.filter((r) => r.status === 'waiting').length;
    $('pwSub').textContent = waiting
      ? waiting + ' user' + (waiting === 1 ? '' : 's') + ' waiting \u00b7 respond within 2\u20133 minutes'
      : 'No open requests \u00b7 forgotten-password requests land here';
    setBadge('navPwCount', waiting);
    $('pwList').innerHTML = reqs.length ? reqs.map((r) => {
      const pw = pwOf(r.id);
      return '<div class="pw-req">' +
        '<div class="pwr-info"><strong>' + esc(r.name || r.email) + '</strong>' +
        '<span class="sub">' + esc(r.email) + ' \u00b7 asked ' + relTime(r.at) + ' ago</span></div>' +
        (r.status === 'sent'
          ? '<div class="pwr-row"><span class="pill pill-green">Sent</span>' +
            (pw ? '<span class="pwr-pw">' + esc(pw) + '</span>' : '') + '</div>'
          : '<div class="pwr-row">' +
            (pw ? '<button type="button" class="btn-sm" data-pwreveal="' + esc(r.id) + '">Show password</button>' : '') +
            '<button type="button" class="btn-sm" data-pwtemp="' + esc(r.id) + '">Set temporary password</button>' +
            '<button type="button" class="btn-sm solid" data-pwsend="' + esc(r.id) + '">Mark as sent</button>' +
          '</div>' +
          '<span class="sub">' + (pw
            ? 'Check the user\u2019s identity, then tap <b>Mark as sent</b> so they can see it on the sign-in page.'
            : 'No stored password on file \u2014 set a temporary one, then mark it sent.') + '</span>') +
      '</div>';
    }).join('') : '<div class="empty-state"><span class="es-icon">&#128273;</span>No forgot-password requests.</div>';

    $('pwList').querySelectorAll('[data-pwreveal]').forEach((b) =>
      b.addEventListener('click', () => {
        b.outerHTML = '<span class="pwr-pw">' + esc(pwOf(b.dataset.pwreveal)) + '</span>';
      }));
    $('pwList').querySelectorAll('[data-pwtemp]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = loadPwReqs().find((x) => x.id === b.dataset.pwtemp);
        if (!r) return;
        const t = (window.prompt('Type a temporary password (6+ characters) for ' + r.email) || '').trim();
        if (!t) return;
        if (t.length < 6) { NBANA.toast('Temporary password must be at least 6 characters.', 'error'); return; }
        setAccountPassword(r.email, t);
        const reqs2 = loadPwReqs();
        const rr = reqs2.find((x) => x.id === r.id);
        if (rr) { rr.tempPw = t; savePwReqs(reqs2); }
        NBANA.toast('Temporary password set for ' + r.email + '.', 'success');
        renderPwReqs();
      }));
    $('pwList').querySelectorAll('[data-pwsend]').forEach((b) =>
      b.addEventListener('click', () => {
        const reqs2 = loadPwReqs();
        const r = reqs2.find((x) => x.id === b.dataset.pwsend);
        if (!r) return;
        r.status = 'sent';
        r.sentAt = nowStamp();
        savePwReqs(reqs2);
        renderPwReqs();
        refreshNotifs();
        NBANA.toast('Password sent \u2014 ' + r.email + ' can now see it on the sign-in page.', 'success');
      }));
  }

  /* ---------------- Composer (principal: all users, teacher: own grade) ---------------- */
  /* Facebook-style attachments: up to 6 photos, or photos plus one short video */
  const MAX_MEDIA = 6;
  const MEDIA_VIDEO_LIMIT = 60 * 1024 * 1024;   // ~60 MB: a few minutes of phone video
  const POST_PHOTO_MAX = 1140;                  // px cap so event photos stay light
  let pendingMedia = [];

  function mediaCountByKind(kind) { return pendingMedia.filter(m => m.kind === kind).length; }

  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }

  function clearComposerMedia() {
    pendingMedia.forEach((m) => {
      if (m.preview && m.preview.slice(0, 5) === 'blob:') URL.revokeObjectURL(m.preview);
    });
    pendingMedia = [];
    refreshComposerMedia();
  }

  function refreshComposerMedia() {
    const chips = $('mediaChips');
    if (chips) {
      chips.innerHTML = pendingMedia.map((m, i) =>
        '<span class="chip">' +
          (m.kind === 'video'
            ? (m.poster ? '<img src="' + m.poster + '" alt="">'
                        : '<video src="' + m.preview + '" muted></video>') + '<span class="chip-tag">Video</span>'
            : '<img src="' + m.preview + '" alt="">') +
          '<button type="button" data-chip-x="' + i + '" title="Remove">&times;</button>' +
        '</span>').join('');
      chips.querySelectorAll('[data-chip-x]').forEach((b) =>
        b.addEventListener('click', () => { pendingMedia.splice(Number(b.dataset.chipX), 1); refreshComposerMedia(); }));
    }
    const add = $('mediaAddBtn');
    if (add) add.hidden = pendingMedia.length >= MAX_MEDIA;
    const hint = $('mediaHint');
    if (hint) hint.textContent = pendingMedia.length
      ? pendingMedia.length + ' attached \u00b7 photos + 1 short video (under 60 MB)'
      : 'Up to 6 photos, or photos plus one short video';
  }

  function addComposerFiles(fileList) {
    const files = Array.from(fileList || []);
    let queue = Promise.resolve();
    files.forEach((file) => {
      queue = queue.then(() => new Promise((done) => {
        if (pendingMedia.length >= MAX_MEDIA) {
          NBANA.toast('Up to ' + MAX_MEDIA + ' photos/videos per post.', 'error');
          done(); return;
        }
        if (/^video\//.test(file.type)) {
          if (mediaCountByKind('video')) { NBANA.toast('Only one video per post \u2014 the rest can be photos.', 'error'); done(); return; }
          if (file.size > MEDIA_VIDEO_LIMIT) {
            NBANA.toast('That video is too large (over 60 MB). Please trim it or pick a shorter clip.', 'error');
            done(); return;
          }
          const preview = URL.createObjectURL(file);
          pickVideoPoster(file).then((poster) => {
            pendingMedia.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'video', file, poster, preview });
            refreshComposerMedia();
            done();
          });
        } else if (/^image\//.test(file.type)) {
          readImage(file, (data) => {
            if (!data) { done(); return; }
            pendingMedia.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'photo', file, preview: data });
            refreshComposerMedia();
            done();
          }, POST_PHOTO_MAX);
        } else {
          NBANA.toast('Please pick photos (JPG/PNG) or MP4 videos only.', 'error');
          done();
        }
      }));
    });
  }

  function composerSetup() {
    if (!isAdmin) return;
    $('btnCompose').hidden = false;
    $('composerPanel').hidden = true;
    $('composerTitle').textContent = isPrincipal ? 'New post' : 'New post for ' + teacherGrade;
    $('composerAudience').textContent = 'Audience: ' +
      (isPrincipal ? 'all users \u2014 students, teachers, and admins' : teacherGrade + ' students only');
    $('composerHint').textContent = isPrincipal
      ? 'Everyone will see this immediately, including teacher accounts.'
      : 'Your post goes to the principal for approval before ' + teacherGrade + ' students see it.';

    $('btnCompose').addEventListener('click', () => {
      $('composerPanel').hidden = !$('composerPanel').hidden;
      if (!$('composerPanel').hidden) $('postBody').focus();
    });

    $('postMedia').addEventListener('change', (e) => {
      addComposerFiles(e.target.files);
      e.target.value = '';
    });
    $('mediaAddBtn').addEventListener('click', () => $('postMedia').click());

    $('composerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const bodyEl = $('postBody');
      const ok = bodyEl.value.trim() !== '';
      bodyEl.classList.toggle('invalid', !ok);
      bodyEl.parentElement.querySelector('.error').classList.toggle('show', !ok);
      if (!ok) { NBANA.toast('Please write a message before posting.', 'error'); return; }

      const submitBtn = e.target.querySelector('button[type="submit"]');
      const finish = (media) => {
        const feed = loadFeed();
        feed.unshift({
          id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          authorId: user.id,
          author: user.fullName || user.firstName,
          role: role,
          scope: isPrincipal ? 'all' : teacherGrade,
          status: isPrincipal ? 'approved' : 'pending',
          title: $('postTitle').value.trim(),
          body: bodyEl.value.trim(),
          media: media,
          date: nowStamp()
        });
        saveFeed(feed);
        $('composerForm').reset();
        clearComposerMedia();
        $('composerPanel').hidden = true;
        renderFeed();
        renderApprovals();
        refreshNotifs();
        renderAdminDash();
        NBANA.toast(isPrincipal
          ? 'Announcement posted to all users.'
          : 'Post sent \u2014 the principal will approve it before ' + teacherGrade + ' students see it.',
          'success');
      };

      if (!pendingMedia.length) { finish(null); return; }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading\u2026'; }
      const media = pendingMedia.map((m) => ({
        key: 'feed_' + m.id,
        kind: m.kind,
        posterKey: m.kind === 'video' ? 'poster_feed_' + m.id : null
      }));
      const saves = pendingMedia.map((m) =>
        (m.kind === 'video' ? fileToDataURL(m.file) : Promise.resolve(m.preview))
          .then((data) => data ? mediaPut('feed_' + m.id, data) : null)
          .then(() => (m.kind === 'video' && m.poster ? mediaPut('poster_feed_' + m.id, m.poster) : null)));
      Promise.all(saves)
        .catch(() => {})
        .then(() => {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post'; }
          finish(media);
        });
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

  /* Tuition is never assumed: a student with no billing record only gets one
     when the office edits fees or records a payment. */
  function ensureBilling(a) {
    if (a && !a.billing) a.billing = { schoolYear: schoolYear, items: [], payments: [], dueDay: 15 };
    return a.billing;
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

    $('feeRows').innerHTML = s.items.length
      ? s.items.map(i =>
          '<tr><td><strong>' + esc(i.label) + '</strong></td><td>' + esc(i.note || '') + '</td><td class="num">' + money(i.amount) +
          (isPrincipal ? ' <button type="button" class="btn-del" data-fdel-view="' + esc(i.label) + '" title="Remove fee">&times;</button>' : '') +
          '</td></tr>'
        ).join('')
      : '<tr><td colspan="3"><div class="empty-state">No tuition assigned yet ' +
        (isPrincipal ? '\u2014 use Edit fees to assess fees for this student.' : '\u2014 the school office will assign fees later.') +
        '</div></td></tr>';
    $('feeTotal').textContent = money(s.assessed);

    if (isPrincipal) {
      document.querySelectorAll('[data-fdel-view]').forEach(b => {
        b.addEventListener('click', () => {
          const bill = ensureBilling(t);
          bill.items = bill.items.filter(x => x.label !== b.dataset.fdelView);
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

    $('bhAmount').textContent = s.unset ? '\u2014' : money(s.balance);
    $('bhBar').style.width = s.unset ? '0%' : s.percent + '%';
    $('bhAssessed').textContent = s.unset ? '\u2014' : money(s.assessed);
    $('bhPaid').textContent = s.unset ? '\u2014' : money(s.paid);
    $('bhDue').textContent = s.unset ? 'Not assigned yet' : dueStr;

    if (s.unset) {
      hero.classList.remove('paid');
      $('bhStatus').textContent = 'No tuition assigned yet \u2014 the school office will assess fees for this student.';
    } else if (s.balance === 0 && s.assessed > 0) {
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
          const delId = b.dataset.pdel;
          const bill = ensureBilling(t);
          bill.payments = (t.billing.payments || []).filter(x => x.id !== delId);
          saveUser(t);
          renderFees();
          NBANA.toast('Payment removed.', 'success');
        });
      });
      $('feesStudentSel').value = t.id;
    }

    /* Dashboard mirror (student view only) */
    if (!isAdmin) {
      if (s.unset) {
        $('sumBalance').textContent = '\u2014';
        $('sumBalance').className = 'sc-value';
        $('sumBalanceSub').textContent = 'no tuition assigned yet';
        $('dashFeeSub').textContent = 'School year ' + schoolYear;
        $('dashFeeBar').style.width = '0%';
        $('dashFeePaid').textContent = 'Paid: \u2014';
        $('dashFeeTotal').textContent = 'Assessed: \u2014';
        $('dashFeeDue').textContent = 'Tuition has not been assigned to this account yet.';
      } else {
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
        feeDraft = JSON.parse(JSON.stringify(NBANA.billingSummary(t).items || []));
        $('btnFeeEdit').textContent = 'Save fees';
        $('btnFeeEdit').classList.add('solid');
      } else {
        if (!feeDraft.length) delete t.billing;   /* an empty assessment means no tuition */
        else ensureBilling(t).items = feeDraft;
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
    if (s.unset) {
      NBANA.toast('No tuition has been assigned to this account yet.', 'error');
      return;
    }
    if (amount > s.balance && s.balance > 0) {
      NBANA.toast('Amount exceeds the remaining balance of ' + money(s.balance) + '.', 'error');
      return;
    }

    ensureBilling(t).payments.push({
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
  /* No section on any record: every grade here runs as a single class, so an
     empty value must stay empty instead of inventing a room name. */
  const section = (user.student && user.student.section) || '';
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
  /* Adviser names come from the faculty list the principal maintains, so a
     teacher moved to another grade shows up on that grade right away. */
  const adviser = NBANA.facultyAdviser(gradeLevel) || TEACHERS[gradeLevel] || 'Class Adviser';

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
  function adviserFor(gl) { return NBANA.facultyAdviser(gl) || TEACHERS[gl] || 'Class Adviser'; }

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

  /* Grades are never invented: subjects come back with null marks until a
     teacher or the admin types real numbers into the report card. */
  function computeGrades(acct) {
    const gl = (acct.student && acct.student.gradeLevel) || gradeLevel;
    const subs = subjectsFor(gl);
    const stored = loadMap(K.grades)[acct.id] || null;
    return subs.map(name => {
      const src = (stored && stored[name]) ? stored[name].slice(0, 4) : [];
      const q = [0, 1, 2, 3].map(i => {
        const v = src[i];
        return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
      });
      const done = q.filter(v => v !== null);
      const final = done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null;
      const remarks = final == null ? ''
        : (final >= 90 ? 'With Merit' : final >= 85 ? 'Good' : final >= 75 ? 'Passed' : 'Needs Review');
      const pill = final == null ? ''
        : (final >= 85 ? 'pill-green' : final >= 75 ? 'pill-navy' : 'pill-red');
      return { name, q, final, remarks, pill, entered: done.length };
    });
  }

  function renderGrades() {
    const t = gradeTarget();
    if (!t) {
      $('gradeRows').innerHTML = '<tr><td colspan="7"><div class="empty-state">No students to display.</div></td></tr>';
      return 0;
    }
    const grades = computeGrades(t);
    const done = grades.filter(g => g.final !== null);
    const avg = done.length ? Math.round(done.reduce((s, g) => s + g.final, 0) / done.length) : null;
    const highest = done.length ? done.reduce((m, g) => Math.max(m, g.final), 0) : null;
    const standing = avg == null ? 'Not yet posted'
      : (avg >= 90 ? 'With Honors' : avg >= 85 ? 'High' : avg >= 75 ? 'Passing' : 'Review');

    $('gAverage').textContent = avg == null ? '\u2014' : avg;
    $('gHighest').textContent = highest == null ? '\u2014' : highest;
    $('gSubjects').textContent = grades.length;
    $('gStanding').textContent = standing;
    const tGl = (t.student && t.student.gradeLevel) || gradeLevel;
    /* Sections are optional on every record, so empty parts drop out of the line */
    const tSec = (t.student && t.student.section) || section;
    $('gradeSub').textContent = (isAdmin ? esc(nameOf(t)) + ' \u00b7 ' : '') +
      [tGl, tSec, schoolYear].filter(Boolean).join(' \u00b7 ');
    $('gradeRows').innerHTML = grades.map(g =>
      '<tr><td><strong>' + esc(g.name) + '</strong></td>' +
      (gradeEditing
        ? g.q.map((v, qi) => '<td class="num"><input class="input input-sm num-in" type="number" min="0" max="100" data-gsub="' + esc(g.name) +                '" data-gq="' + qi + '" value="' + (v == null ? '' : v) + '" placeholder="-"></td>').join('')
        : g.q.map(v => '<td class="num">' + (v == null ? '\u2014' : v) + '</td>').join('')) +
      '<td class="num"><strong>' + (g.final == null ? '\u2014' : g.final) + '</strong></td>' +
      '<td>' + (g.pill ? '<span class="pill ' + g.pill + '">' + esc(g.remarks) + '</span>' : '\u2014') + '</td></tr>'
    ).join('');
    $('gradeFootAvg').textContent = avg == null ? '\u2014' : avg;
    $('gradeFootRemarks').textContent = standing;

    if (!isAdmin) {
      $('sumAverage').textContent = avg == null ? '\u2014' : avg;
      $('sumAverageSub').textContent = (avg == null ? 'grades not posted yet' : standing) + ' \u00b7 adviser: ' + adviser;
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
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || (a.student && a.student.gradeLevel) || 'Student') + '</option>'
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
        const raw = String(inp.value).trim();
        const blank = raw === '';
        const v = parseFloat(raw);
        const bad = !blank && (isNaN(v) || v < 0 || v > 100);
        inp.classList.toggle('invalid', bad);
        if (bad) { ok = false; return; }
        const subj = inp.dataset.gsub;
        if (!record[subj]) record[subj] = [null, null, null, null];
        record[subj][Number(inp.dataset.gq)] = blank ? null : v;
      });
      if (!ok) { NBANA.toast('Marks must be blank or numbers from 0 to 100.', 'error'); return; }
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
    /* Attendance is never invented either: nothing shows until the adviser
       or the admin records school days. */
    const stored = loadMap(K.attendance)[acct.id];
    if (!stored || !stored.length) return [];
    return stored.map(d => ({
      date: new Date(d.date + 'T00:00:00'), iso: d.date, status: d.status, time: d.time || '\u2014'
    }));
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
    const rate = days.length ? Math.round(((present + late) / days.length) * 100) : null;
    const noRecord = days.length === 0;

    $('attPresent').textContent = noRecord ? '\u2014' : present;
    $('attAbsent').textContent = noRecord ? '\u2014' : absent;
    $('attLate').textContent = noRecord ? '\u2014' : late;
    $('attRate').textContent = rate == null ? '\u2014' : rate + '%';

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
    $('attRows').innerHTML =
      (noRecord && !attEditing
        ? '<tr><td colspan="4"><div class="empty-state">No attendance recorded yet. ' +
          (isAdmin ? 'Use \u201cMark attendance\u201d to add school days.' : 'Your adviser has not recorded school days yet.') +
          '</div></td></tr>'
        : '') + rowsHtml + addRow;

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
      $('sumAttendance').textContent = rate == null ? '\u2014' : rate + '%';
      $('sumAttendanceSub').textContent = rate == null
        ? 'no attendance recorded yet'
        : present + late + ' of ' + days.length + ' school days attended';
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
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || (a.student && a.student.gradeLevel) || 'Student') + '</option>'
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
      : [gradeLevel, section, 'adviser: ' + adviser].filter(Boolean).join(' \u00b7 ');
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

    const pp = $('profPhoto');
    if (pp) pp.innerHTML = user.photo
      ? '<img src="' + user.photo + '" alt="Profile picture">'
      : '<span class="pp-empty">No photo yet</span>';
    const pe = $('peAvatar');
    if (pe) pe.innerHTML = user.photo
      ? '<img src="' + user.photo + '" alt="Profile picture">'
      : '<span class="pp-empty">' + esc(initialsOf(fullName)) + '</span>';

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
      row('School year', st.schoolYear) +
      row('Semester', st.semester) +
      row('Adviser', adviser);

    $('profGuardian').innerHTML =
      row('Name', g.name) +
      row('Relationship', g.relationship) +
      row('Contact number', g.phone);

    $('profAccount').innerHTML =
      row('Login email', user.email) +
      row('Portal role', isPrincipal ? '<span class="pill pill-navy">' + adminTitle + '</span>' :
        (isTeacher ? '<span class="pill pill-green">Teacher \u00b7 ' + esc(teacherGrade) + '</span>' :
          '<span class="pill pill-amber">Student</span>')) +
      row('Member since', fmtDate(user.createdAt)) +
      row('Password', '<span id="pwShown" data-open="">\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</span> ' +
        '<button type="button" class="pw-eye" id="pwEye" title="Show / hide password">&#128065;</button> ' +
        '<button type="button" class="btn-sm" id="btnPwChange">Change</button>') +
      row('Account status', '<span class="pill pill-green">Active</span>');
  }

  /* ---------------- Profile picture cropper -------------
     Facebook-style: adjust the chosen photo inside a square (drag to move,
     slide or scroll to zoom). The saved picture is a square image, and every
     avatar in the portal displays it as a circle. */
  const CROP_SIZE = 512;
  const cropState = { img: null, zoom: 1, x: 0, y: 0, base: 1, stageW: 0, stageH: 0, drag: null, onSave: null };

  function cropDraw() {
    const stage = $('cropStage'), canvas = $('cropCanvas'), s = cropState;
    if (!stage || !canvas || !s.img) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(s.stageW));
    const h = Math.max(1, Math.round(s.stageH));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(s.img, s.x, s.y, s.img.naturalWidth * s.base * s.zoom, s.img.naturalHeight * s.base * s.zoom);
  }

  /* Keep the picture covering the square, then paint the preview */
  function cropRender() {
    const s = cropState;
    if (!s.img) return;
    const scale = s.base * s.zoom;
    const w = s.img.naturalWidth * scale;
    const h = s.img.naturalHeight * scale;
    s.x = Math.max(Math.min(0, s.stageW - w), Math.min(0, s.x));
    s.y = Math.max(Math.min(0, s.stageH - h), Math.min(0, s.y));
    cropDraw();
  }

  /* Zoom around the middle of the square so the subject stays put */
  function cropSetZoom(next) {
    const s = cropState;
    if (!s.img) return;
    const z = Math.max(1, Math.min(3, next));
    const prev = s.base * s.zoom;
    const cx = (s.stageW / 2 - s.x) / prev;
    const cy = (s.stageH / 2 - s.y) / prev;
    s.zoom = z;
    const now = s.base * s.zoom;
    s.x = s.stageW / 2 - cx * now;
    s.y = s.stageH / 2 - cy * now;
    if ($('cropZoom')) $('cropZoom').value = String(Math.round(z * 100));
    cropRender();
  }

  function cropClose() {
    const wrap = $('cropWrap'), stage = $('cropStage');
    if (wrap) wrap.hidden = true;
    if (stage) stage.classList.remove('dragging');
    cropState.img = null;
    cropState.drag = null;
  }

  function cropOpen(dataUrl, onSave) {
    const wrap = $('cropWrap'), stage = $('cropStage');
    if (!wrap || !stage) return;
    const img = new Image();
    img.onload = () => {
      cropState.img = img;
      cropState.zoom = 1;
      cropState.drag = null;
      cropState.onSave = onSave;
      wrap.hidden = false;
      const rect = stage.getBoundingClientRect();
      cropState.stageW = rect.width || 320;
      cropState.stageH = rect.height || 320;
      cropState.base = Math.max(cropState.stageW / img.naturalWidth, cropState.stageH / img.naturalHeight);
      cropState.x = (cropState.stageW - img.naturalWidth * cropState.base) / 2;
      cropState.y = (cropState.stageH - img.naturalHeight * cropState.base) / 2;
      if ($('cropZoom')) $('cropZoom').value = '100';
      cropRender();
    };
    img.onerror = () => NBANA.toast('Could not read that image.', 'error');
    img.src = dataUrl;
  }

  /* Save exactly the square that is framed, at CROP_SIZE by CROP_SIZE */
  function cropApply() {
    const s = cropState;
    if (!s.img) { cropClose(); return; }
    const out = document.createElement('canvas');
    out.width = CROP_SIZE;
    out.height = CROP_SIZE;
    const ctx = out.getContext('2d');
    const scale = s.base * s.zoom;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(s.img, -s.x / scale, -s.y / scale, s.stageW / scale, s.stageH / scale, 0, 0, CROP_SIZE, CROP_SIZE);
    const data = out.toDataURL('image/jpeg', 0.88);
    const cb = s.onSave;
    cropClose();
    if (cb) cb(data);
  }

  function cropInit() {
    const stage = $('cropStage'), wrap = $('cropWrap');
    if (!stage || !wrap) return;
    $('cropClose').addEventListener('click', cropClose);
    $('cropCancel').addEventListener('click', cropClose);
    $('cropApply').addEventListener('click', cropApply);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) cropClose(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wrap.hidden) cropClose(); });
    if ($('cropZoom')) $('cropZoom').addEventListener('input', () => cropSetZoom(Number($('cropZoom').value) / 100));
    stage.addEventListener('wheel', (e) => {
      if (!cropState.img) return;
      e.preventDefault();
      cropSetZoom(cropState.zoom + (e.deltaY < 0 ? 0.08 : -0.08));
    }, { passive: false });
    stage.addEventListener('pointerdown', (e) => {
      if (!cropState.img) return;
      cropState.drag = { cx: e.clientX, cy: e.clientY, ox: cropState.x, oy: cropState.y };
      stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    stage.addEventListener('pointermove', (e) => {
      const d = cropState.drag;
      if (!d) return;
      cropState.x = d.ox + (e.clientX - d.cx);
      cropState.y = d.oy + (e.clientY - d.cy);
      cropRender();
    });
    const endDrag = (e) => {
      if (!cropState.drag) return;
      cropState.drag = null;
      stage.classList.remove('dragging');
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  }

  function profileInit() {
    /* Every portal user - students included - may edit their own information */
    $('btnProfEdit').hidden = false;
    /* Admins have no enrollment record of their own */
    if (isAdmin) {
      const stuPanel = $('profStudent').closest('.panel');
      if (stuPanel) stuPanel.hidden = true;
    }

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

    /* Profile picture: crop it inside a square, then show it as a circle
       everywhere (Facebook-style). See the cropper helpers below. */
    cropInit();
    $('pfPhoto').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';   /* so picking the same file again reopens the cropper */
      if (!file) return;
      readImage(file, (data) => {
        if (!data) return;
        cropOpen(data, (cropped) => {
          user.photo = cropped;
          saveUser(user);
          paintAvatar();
          renderProfile();
          renderFeed();
          NBANA.toast('Profile picture updated.', 'success');
        });
      }, 1600);
    });

    $('btnPhotoRemove').addEventListener('click', () => {
      if (!user.photo) { NBANA.toast('You have no photo to remove.', 'error'); return; }
      user.photo = '';
      saveUser(user);
      paintAvatar();
      renderProfile();
      renderFeed();
      NBANA.toast('Profile picture removed.', 'success');
    });

    if ($('btnPhotoAdd')) $('btnPhotoAdd').addEventListener('click', () => {
      $('profEditor').hidden = false;
      $('profEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('pfPhoto').click();
    });

    /* Password change box (built once, lives inside the Account panel) */
    const accBody = $('profAccount') && $('profAccount').closest('.panel-body');
    if (accBody && !$('pwChangeBox')) {
      const div = document.createElement('div');
      div.id = 'pwChangeBox';
      div.hidden = true;
      div.innerHTML = '<div class="form-field"><label>Current password</label><input class="input" type="password" id="pwCur" autocomplete="current-password"></div>' +
        '<div class="form-field"><label>New password (6+ characters)</label><input class="input" type="password" id="pwNew" autocomplete="new-password"></div>' +
        '<div class="form-field"><label>Repeat new password</label><input class="input" type="password" id="pwNew2" autocomplete="new-password"></div>' +
        '<div class="pw-actions"><button type="button" class="btn-sm solid" id="btnPwSave">Save password</button>' +
        '<button type="button" class="btn-sm" id="btnPwCancel">Cancel</button></div>';
      accBody.appendChild(div);
    }
  }

  /* Password eye + change-password (delegated: the profile re-renders often) */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'pwEye') {
      const span = $('pwShown');
      if (!span) return;
      if (span.dataset.open === '1') { span.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'; span.dataset.open = ''; return; }
      if (!user.pwCode) { NBANA.toast('Not stored on this device yet \u2014 it appears after your next sign-in, or change your password now.', 'error'); return; }
      span.textContent = NBANA.decPw(user.pwCode);
      span.dataset.open = '1';
    }
    if (t.id === 'btnPwChange') {
      const box = $('pwChangeBox');
      if (!box) return;
      box.hidden = !box.hidden;
      if (!box.hidden) { $('pwCur').value = ''; $('pwNew').value = ''; $('pwNew2').value = ''; $('pwCur').focus(); }
    }
    if (t.id === 'btnPwCancel') { const box = $('pwChangeBox'); if (box) box.hidden = true; }
    if (t.id === 'btnPwSave') {
      const cur = $('pwCur').value, nw = $('pwNew').value, n2 = $('pwNew2').value;
      if (NBANA.hash(cur) !== user.passwordHash) { NBANA.toast('Current password is incorrect.', 'error'); return; }
      if (nw.length < 6) { NBANA.toast('New password must be at least 6 characters.', 'error'); return; }
      if (nw !== n2) { NBANA.toast('New passwords do not match.', 'error'); return; }
      const list = NBANA.getAccounts();
      const i = list.findIndex((a) => a.id === user.id);
      if (i > -1) {
        list[i].passwordHash = NBANA.hash(nw);
        NBANA.store.set(NBANA.KEYS.accounts, list);
        user.passwordHash = list[i].passwordHash;
      }
      NBANA.rememberPw(user, nw);
      $('pwChangeBox').hidden = true;
      $('pwShown').textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      $('pwShown').dataset.open = '';
      NBANA.toast('Password changed. Use it on your next sign-in.', 'success');
    }
  });

  /* ---------------- Dashboard banner: greeting + a happy quote ---------------- */
  function renderBanner() {
    const hello = greeting();
    $('wbKicker').textContent = hello;
    if ($('wbEmoji')) $('wbEmoji').textContent = greetEmoji();

    if (isAdmin) {
      $('wbName').textContent = fullName;
      $('wbText').textContent = 'School year ' + schoolYear + ' \u00b7 everything you need is in the sidebar.';
    } else {
      $('wbName').textContent = 'Hi, ' + (user.firstName || 'friend') + '!';
      $('wbText').textContent =
        gradeLevel + (section && section !== 'TBD' ? ' \u2022 Section ' + section : '') +
        ' \u2022 School year ' + schoolYear + '. Have a happy day of learning!';
    }
    renderVerse();
  }


  /* ---------------- Students management (principal) ---------------- */
  let stuEditingId = null;

  function gradeOptionsHtml() {
    return GRADES.map(g => '<option>' + g + '</option>').join('');
  }

  function fillStudentSelects() {
    const scoped = studentsInScope();
    const scopedOpts = scoped.map(a =>
      '<option value="' + esc(a.id) + '">' + esc(nameOf(a)) + ' \u2014 ' + esc((a.student && a.student.section) || (a.student && a.student.gradeLevel) || 'Student') + '</option>'
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

  /* ---------------- Class list: pick a grade, boys and girls in groups ---------------- */
  let stuGradeFilter = 'all';
  function isGirl(a) { return String(a.gender || '').toLowerCase() === 'female'; }

  function stuRowHtml(a) {
    const s = NBANA.billingSummary(a);
    const st = a.student || {};
    const gone = isGraduated(a);
    const rev = a.photoReview || null;
    return '<tr><td>' + avatarSpan('st-avatar', nameOf(a), a.photo) + '</td>' +
      '<td><strong>' + esc(nameOf(a)) + '</strong><br><span class="sc-sub">' + esc(a.email) + '</span>' +
      (rev && rev.status === 'removed' ? '<br><span class="pill pill-red">Photo removed</span>' : '') +
      (rev && rev.status === 'ok' ? '<br><span class="pill pill-green">Photo checked</span>' : '') +
      '</td>' +
      '<td>' + (gone ? '<span class="pill pill-navy">Graduated</span>' : esc(st.gradeLevel || '\u2014')) + '</td>' +
      '<td>' + esc(st.lrn || '\u2014') + '</td>' +
      '<td class="num">' + (s.unset ? '\u2014' : money(s.balance)) + '</td>' +
      '<td><button type="button" class="btn-sm" data-stuedit="' + esc(a.id) + '">Edit</button>' +
      (a.photo ? ' <button type="button" class="btn-sm" data-photorev="' + esc(a.id) + '">Photo</button>' : '') +
      '</td></tr>';
  }

  function stuGroupRow(label, n) {
    return '<tr class="stu-group"><td colspan="6"><strong>' + label + '</strong> \u00b7 ' +
      n + ' student' + (n === 1 ? '' : 's') + '</td></tr>';
  }

  function renderStudents() {
    const all = allStudents();
    const enrolled = activeStudents().length;
    const list = stuGradeFilter === 'all'
      ? all
      : all.filter(a => ((a.student || {}).gradeLevel || '') === stuGradeFilter);
    const boys = list.filter(a => !isGirl(a));
    const girls = list.filter(a => isGirl(a));

    $('stuCount').textContent = stuGradeFilter === 'all'
      ? enrolled + ' enrolled student account' + (enrolled === 1 ? '' : 's') +
        (all.length > enrolled ? ' \u00b7 ' + (all.length - enrolled) + ' graduated' : '') + ' \u00b7 editable records'
      : stuGradeFilter + ' \u00b7 ' + list.length + ' student' + (list.length === 1 ? '' : 's') +
        ' \u00b7 ' + boys.length + ' boy' + (boys.length === 1 ? '' : 's') + ', ' +
        girls.length + ' girl' + (girls.length === 1 ? '' : 's');

    const note = $('stuFilterNote');
    if (note) {
      note.textContent = stuGradeFilter === 'all'
        ? 'Pick a grade to list boys and girls separately'
        : boys.length + ' boys above, ' + girls.length + ' girls below \u00b7 alphabetical';
    }

    if (!list.length) {
      $('stuRows').innerHTML = '<tr><td colspan="6"><div class="empty-state">No students in ' +
        esc(stuGradeFilter === 'all' ? 'this school' : stuGradeFilter) + ' yet.</div></td></tr>';
    } else if (stuGradeFilter === 'all') {
      $('stuRows').innerHTML = all.map(stuRowHtml).join('');
    } else {
      $('stuRows').innerHTML =
        (boys.length ? stuGroupRow('Boys', boys.length) + boys.map(stuRowHtml).join('') : '') +
        (girls.length ? stuGroupRow('Girls', girls.length) + girls.map(stuRowHtml).join('') : '');
    }

    document.querySelectorAll('[data-stuedit]').forEach(b => {
      b.addEventListener('click', () => openStuEditor(b.dataset.stuedit));
    });
    document.querySelectorAll('[data-photorev]').forEach(b => {
      b.addEventListener('click', () => openPhotoReview(b.dataset.photorev));
    });
  }

  /* ---------------- Profile picture moderation (principal) ---------------- */
  let photoTargetId = null;

  function closePhotoReview() {
    photoTargetId = null;
    $('photoReview').hidden = true;
    $('prComment').value = '';
    $('prComment').classList.remove('invalid');
    $('prComment').parentElement.querySelector('.error').classList.remove('show');
  }

  function openPhotoReview(id) {
    const a = NBANA.findAccount(id);
    if (!a || !a.photo) { NBANA.toast('That student has no profile picture.', 'error'); return; }
    photoTargetId = id;
    const st = a.student || {};
    $('prTitle').textContent = 'Profile photo \u00b7 ' + nameOf(a);
    $('prPhoto').innerHTML = '<img src="' + a.photo + '" alt="Student profile picture">';
    $('prWho').textContent = nameOf(a) + ' \u00b7 ' + (st.gradeLevel || '') +
      (st.section ? ' \u00b7 ' + st.section : '') + ' \u00b7 ' + a.email;
    $('prComment').value = '';
    $('prComment').classList.remove('invalid');
    $('photoReview').hidden = false;
    $('photoReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function photoReviewInit() {
    if (!isPrincipal) return;
    $('btnPrClose').addEventListener('click', closePhotoReview);

    $('btnPrOk').addEventListener('click', () => {
      const a = photoTargetId ? NBANA.findAccount(photoTargetId) : null;
      if (!a) return;
      a.photoReview = { status: 'ok', by: fullName, at: nowStamp() };
      saveUser(a);
      closePhotoReview();
      renderStudents();
      NBANA.toast('Marked as okay \u2014 the picture stays.', 'success');
    });

    $('btnPrRemove').addEventListener('click', () => {
      const a = photoTargetId ? NBANA.findAccount(photoTargetId) : null;
      if (!a) return;
      const msg = $('prComment').value.trim();
      const ok = msg !== '';
      $('prComment').classList.toggle('invalid', !ok);
      $('prComment').parentElement.querySelector('.error').classList.toggle('show', !ok);
      if (!ok) { NBANA.toast('Please write why the picture is being removed.', 'error'); return; }

      a.photo = '';
      a.photoReview = { status: 'removed', by: fullName, at: nowStamp(), reason: msg };
      saveUser(a);
      addNotice(a.id, 'Your profile picture was removed', msg);
      closePhotoReview();
      renderStudents();
      renderNotices();
      renderFeed();
      refreshNotifs();
      NBANA.toast('Picture removed \u2014 ' + a.firstName + ' was sent a message.', 'success');
    });
  }

  /* ---------------- Faculty & staff directory ----------------
     The listing the school shows on its Teachers & Staff page (about.html):
     the administration, then the class advisers, in the same order and with
     the same photos. Both pages render the same shared faculty list, and a
     full admin can edit it right here. */

  function facultyAccountFor(f) {
    const list = NBANA.getAccounts();
    return list.find(a => a.role === 'teacher' && a.facultyId === f.id) ||
      list.find(a => a.role === 'teacher' && nameOf(a) === f.name) || null;
  }

  function facCard(f) {
    const acct = f.group === 'teacher' ? facultyAccountFor(f) : null;
    return '<div class="fac-card ' + (f.group === 'teacher' ? 'card-teacher' : 'card-admin') + '">' +
      '<div class="fac-photo"><img src="' + esc(f.photo || 'logo.png') + '" alt="' + esc(f.name) + '" loading="lazy"></div>' +
      '<h4>' + esc(f.name) + '</h4>' +
      '<p class="fac-role">' + esc(f.role || '') + '</p>' +
      (acct ? '<p class="fac-mail">' + esc(acct.email) + '</p>' : '') +
      '</div>';
  }

  function renderFaculty() {
    if (!$('facDirAdmins') && !$('facDirTeachers')) return;
    const list = NBANA.facultyList();
    const adminList = list.filter(f => f.group !== 'teacher');
    const teacherList = list.filter(f => f.group === 'teacher');
    if ($('facDirAdmins')) $('facDirAdmins').innerHTML = adminList.map(facCard).join('') ||
      '<p class="sc-sub">No administration listed yet.</p>';
    if ($('facDirTeachers')) $('facDirTeachers').innerHTML = teacherList.map(facCard).join('') ||
      '<p class="sc-sub">No teachers listed yet.</p>';
    if ($('facultySub')) {
      const withAccount = teacherList.filter(f => facultyAccountFor(f)).length;
      $('facultySub').textContent = adminList.length + ' administration \u00b7 ' +
        teacherList.length + ' teaching faculty \u00b7 ' + withAccount + ' with a portal account';
    }
    if ($('btnFacEdit')) $('btnFacEdit').hidden = !isPrincipal;
    const prin = adminList.find(f => /principal/i.test(f.role || '')) || null;
    $('facultyAdmin').innerHTML =
      row('Principal', prin ? esc(prin.name) : 'School Principal') +
      row('School office', 'Tuition, records, and enrollment concerns') +
      row('Class adviser', 'Your teacher handles daily classroom matters') +
      row('Written concerns', 'Use Contact School to send a message to the office');
  }

  /* ---------------- Faculty editor (full admin only) ---------------- */
  let facDraft = null;

  function facEditorRow(f) {
    const isClassTeacher = f.group === 'teacher';
    return '<div class="fac-edit-row" data-id="' + esc(f.id) + '" data-group="' + (isClassTeacher ? 'teacher' : 'admin') + '">' +
      '<input class="input input-sm" data-f="name" placeholder="Full name" value="' + esc(f.name || '') + '">' +
      '<input class="input input-sm" data-f="role" placeholder="Role / position" value="' + esc(f.role || '') + '">' +
      (isClassTeacher
        ? '<select class="input input-sm" data-f="grade"><option value="">No grade</option>' +
          GRADES.map(g => '<option' + (g === f.grade ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>'
        : '<span class="fac-edit-fill"></span>') +
      '<input class="input input-sm fac-photo-input" data-f="photo" placeholder="teacher1.jpg" value="' + esc(f.photo || '') + '">' +
      '<button type="button" class="btn-sm danger" data-facdel="' + esc(f.id) + '">Remove</button>' +
      '</div>';
  }

  function renderFacEditor() {
    if (!facDraft) return;
    if ($('facEditAdmins')) $('facEditAdmins').innerHTML = facDraft.filter(f => f.group !== 'teacher').map(facEditorRow).join('') ||
      '<p class="sc-sub">Nothing listed under Administration. Use \u201c+ Add administration\u201d.</p>';
    if ($('facEditTeachers')) $('facEditTeachers').innerHTML = facDraft.filter(f => f.group === 'teacher').map(facEditorRow).join('') ||
      '<p class="sc-sub">No teachers listed. Use \u201c+ Add teacher\u201d.</p>';
  }

  /* Read what is on screen so Add / Remove never lose unsaved typing */
  function facCollect() {
    const out = [];
    [['facEditAdmins', 'admin', 0], ['facEditTeachers', 'teacher', 100]].forEach(([id, group, base]) => {
      const wrap = $(id);
      if (!wrap) return;
      wrap.querySelectorAll('.fac-edit-row').forEach((r, i) => {
        const val = (k) => {
          const el = r.querySelector('[data-f="' + k + '"]');
          return el ? String(el.value || '').trim() : '';
        };
        out.push({
          id: r.dataset.id,
          group: group,
          order: base + i + 1,
          name: val('name'),
          role: val('role'),
          grade: group === 'teacher' ? val('grade') : undefined,
          photo: val('photo')
        });
      });
    });
    return out;
  }

  function openFacEditor() {
    if (!isPrincipal) return;
    facDraft = NBANA.facultyList().map(f => Object.assign({}, f));
    renderFacEditor();
    $('facEditor').hidden = false;
    $('facEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeFacEditor() { $('facEditor').hidden = true; facDraft = null; }

  function facMarkNames() {
    let firstBad = null;
    document.querySelectorAll('#facEditAdmins .fac-edit-row, #facEditTeachers .fac-edit-row').forEach((r) => {
      const el = r.querySelector('[data-f="name"]');
      const ok = !!(el && el.value.trim());
      if (el) el.classList.toggle('invalid', !ok);
      if (!ok && !firstBad) firstBad = el;
    });
    return firstBad;
  }

  function facultyInit() {
    if (!isPrincipal) return;
    if ($('btnFacEdit')) $('btnFacEdit').addEventListener('click', openFacEditor);
    if ($('btnFacClose')) $('btnFacClose').addEventListener('click', closeFacEditor);
    if ($('btnFacCancel')) $('btnFacCancel').addEventListener('click', closeFacEditor);

    const addMember = (group) => {
      facDraft = facCollect();
      facDraft.push({
        id: 'fac_' + group + '_' + Date.now().toString(36),
        group: group,
        order: 0,
        name: '',
        role: group === 'teacher' ? 'Class Teacher' : '',
        grade: '',
        photo: ''
      });
      renderFacEditor();
      const last = (group === 'teacher' ? $('facEditTeachers') : $('facEditAdmins'));
      const input = last ? last.querySelector('.fac-edit-row:last-child [data-f="name"]') : null;
      if (input) input.focus();
    };
    if ($('btnFacAddAdmin')) $('btnFacAddAdmin').addEventListener('click', () => addMember('admin'));
    if ($('btnFacAddTeacher')) $('btnFacAddTeacher').addEventListener('click', () => addMember('teacher'));

    if ($('facEditor')) $('facEditor').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-facdel]');
      if (!btn || !facDraft) return;
      facDraft = facCollect().filter(f => f.id !== btn.dataset.facdel);
      renderFacEditor();
      NBANA.toast('Removed from the list. Nothing is saved until you press Save faculty.');
    });

    if ($('btnFacSave')) $('btnFacSave').addEventListener('click', () => {
      const bad = facMarkNames();
      if (bad) { bad.focus(); NBANA.toast('Every faculty member needs a name.', 'error'); return; }
      const list = facCollect();
      /* Keep the label in step when only the grade was changed:
         "Grade 5 Teacher" becomes "Grade 6 Teacher" on reassignment. */
      list.forEach(f => {
        if (f.group !== 'teacher' || !f.grade) return;
        if (/^(Kinder [\d]+|Grade [\d]+) Teacher$/.test(f.role || '')) f.role = f.grade + ' Teacher';
      });
      NBANA.saveFaculty(list);
      /* Keeps the teacher accounts in step: new hires get an account, and a
         teacher moved to another grade now handles that grade's class. */
      const res = NBANA.seedFaculty();
      renderFaculty();
      renderSchedule();
      renderTasks();
      renderProfile();
      closeFacEditor();
      NBANA.toast('Faculty list saved' +
        (res.added ? ' \u00b7 ' + res.added + ' new teacher account' + (res.added === 1 ? '' : 's') + ' created' : '') +
        ' \u00b7 live on every device.', 'success');
    });
  }

  function toggleRoleFields() {
    const r = $('sfRole').value;
    const asTeacher = r === 'teacher';
    const asStaff = asTeacher || r === 'admin';
    $('sfTGradeField').hidden = !asTeacher;
    $('sfGradeField').hidden = asStaff;
    $('sfSectionField').hidden = asStaff;
    $('sfLrnField').hidden = asStaff;
    /* New teacher / admin accounts must be unlocked with the staff secret code */
    $('sfCodeField').hidden = !(asStaff && stuEditingId === 'new');
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
    const aRole = a ? (a.role === 'principal' ? 'admin' : (a.role || 'student')) : 'student';
    $('sfRole').value = (aRole === 'teacher' || aRole === 'admin') ? aRole : 'student';
    $('sfGrade').value = GRADES.indexOf(st.gradeLevel) > -1 ? st.gradeLevel : GRADES[4];
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
    $('sfCode').value = '';
    toggleRoleFields();
    $('stuEditor').hidden = false;
    $('stuEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function studentsInit() {
    if (!isPrincipal) return;
    $('sfGrade').innerHTML = gradeOptionsHtml();
    $('sfTGrade').innerHTML = gradeOptionsHtml();
    $('stuGradeSel').innerHTML = '<option value="all">All grades</option>' +
      GRADES.map(g => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
    $('stuGradeSel').addEventListener('change', (e) => {
      stuGradeFilter = e.target.value;
      renderStudents();
    });
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
      const newRole = $('sfRole').value;
      const asTeacher = newRole === 'teacher';
      const asAdmin = newRole === 'admin';
      let pw = '';
      if (isNew) {
        pw = $('sfPw').value;
        const pwOk = pw.length >= 6;
        $('sfPw').classList.toggle('invalid', !pwOk);
        $('sfPw').parentElement.querySelector('.error').classList.toggle('show', !pwOk);
        if (!pwOk) { NBANA.toast('Initial password must be at least 6 characters.', 'error'); return; }

        /* Teacher and admin accounts are locked behind the staff secret code */
        if (asTeacher || asAdmin) {
          const codeOk = NBANA.checkStaffCode($('sfCode').value);
          $('sfCode').classList.toggle('invalid', !codeOk);
          $('sfCode').parentElement.querySelector('.error').classList.toggle('show', !codeOk);
          if (!codeOk) { NBANA.toast('That staff secret code is not valid.', 'error'); return; }
        }
      }

      const profile = {
        firstName: first,
        middleName: $('sfMiddle').value.trim(),
        lastName: last,
        fullName: [first, $('sfMiddle').value.trim(), last].filter(Boolean).join(' '),
        email: email,
        phone: $('sfPhone').value.trim(),
        role: newRole,
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
        else if (!asAdmin) profile.student = {
          lrn: $('sfLrn').value.trim(),
          gradeLevel: $('sfGrade').value,
          section: $('sfSection').value.trim() || 'TBD',
          schoolYear: NBANA.getSchoolYear(),
          semester: 'First Semester'
        };
        const created = NBANA.createAccount(profile, pw);
        NBANA.toast(NBANA.roleLabel(newRole) + ' account created for ' + created.fullName + '.', 'success');
      } else {
        const a = NBANA.findAccount(stuEditingId);
        if (!a) { NBANA.toast('Account not found.', 'error'); return; }
        Object.assign(a, profile);
        if (asTeacher) {
          a.assignedGrade = $('sfTGrade').value;
        } else if (asAdmin) {
          delete a.assignedGrade;
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
      renderPromotePanel();
      renderGrades();
      renderAttendance();
      renderFees();
    });
  }

  /* ---------------- School year change & grade promotion (principal) ---------------- */
  let pendingYear = null;

  /* 'Grade 5' -> 'Grade 6'; last grade leaves the school */
  function nextGrade(grade) {
    const i = GRADES.indexOf(grade);
    if (i === -1) return null;
    return i === GRADES.length - 1 ? GRADUATED : GRADES[i + 1];
  }

  /* Every enrolled student, grouped by the move they will make */
  function promotionPlan() {
    const moves = {};
    activeStudents().forEach(a => {
      const from = (a.student && a.student.gradeLevel) || '';
      const to = nextGrade(from);
      if (!to) return;
      const k = from + '\u0000' + to;
      if (!moves[k]) moves[k] = { from: from, to: to, n: 0 };
      moves[k].n++;
    });
    return Object.keys(moves).map(k => moves[k]).sort((a, b) => GRADES.indexOf(a.from) - GRADES.indexOf(b.from));
  }

  function renderPromotePanel() {
    if (!isPrincipal) return;
    const now = NBANA.getSchoolYear();
    $('promoteYearNow').textContent = now;
    const active = activeStudents().length;
    const grads = allStudents().length - active;
    $('promoteCount').textContent = active + ' can move up' + (grads ? ' \u00b7 ' + grads + ' already graduated' : '');
    if (!$('syInput').value) $('syInput').value = NBANA.nextSchoolYear(now);
  }

  function promotionInit() {
    if (!isPrincipal) return;
    $('promotePanel').hidden = false;
    renderPromotePanel();

    const hidePlan = () => { pendingYear = null; $('promoteConfirm').hidden = true; };

    $('btnPromotePlan').addEventListener('click', () => {
      const year = $('syInput').value.trim();
      const formatted = /^\d{4}\s*[-\u2013\u2014]\s*\d{4}$/.test(year);
      const same = year === NBANA.getSchoolYear();
      $('syInput').classList.toggle('invalid', !formatted || same);
      $('syInput').parentElement.querySelector('.error').classList.toggle('show', !formatted || same);
      if (!formatted) { NBANA.toast('Enter the school year like 2027-2028.', 'error'); return; }
      if (same) { NBANA.toast('That is already the current school year.', 'error'); return; }

      const plan = promotionPlan();
      if (!plan.length) { NBANA.toast('No enrolled students to promote.', 'error'); return; }

      const total = plan.reduce((s, m) => s + m.n, 0);
      const grads = plan.filter(m => m.to === GRADUATED).reduce((s, m) => s + m.n, 0);
      pendingYear = year;
      $('promoteSummary').innerHTML = 'School year <b>' + esc(NBANA.getSchoolYear()) + '</b> \u2192 <b>' + esc(year) +
        '</b>. ' + total + ' student' + (total === 1 ? '' : 's') + ' will move up one grade level' +
        (grads ? ', and ' + grads + ' Grade 6 student' + (grads === 1 ? '' : 's') + ' will graduate' : '') + '.';
      $('promoteList').innerHTML = plan.map(m =>
        '<li><span>' + esc(m.from) + ' \u2192 ' + (m.to === GRADUATED ? '<b>Graduated</b>' : esc(m.to)) +
        '</span><span class="pl-count">' + m.n + ' student' + (m.n === 1 ? '' : 's') + '</span></li>'
      ).join('');
      $('promoteConfirm').hidden = false;
      NBANA.toast('Review the promotion list, then confirm.', 'success');
    });

    $('btnPromoteCancel').addEventListener('click', hidePlan);

    $('btnPromoteGo').addEventListener('click', () => {
      const year = pendingYear;
      if (!year) return;
      const accounts = NBANA.getAccounts();
      let moved = 0, grads = 0;
      accounts.forEach(a => {
        if ((a.role || 'student') !== 'student') return;
        const st = a.student;
        if (!st || st.status === GRADUATED) return;
        const to = nextGrade(st.gradeLevel);
        if (!to) return;
        if (to === GRADUATED) {
          st.gradeLevel = GRADUATED;
          st.status = GRADUATED;
          st.graduatedYear = year;
          grads++;
        } else {
          st.gradeLevel = to;
          moved++;
        }
        st.schoolYear = year;
        st.promotedAt = new Date().toISOString();
        if (a.billing) a.billing.schoolYear = year;
      });
      NBANA.store.set(NBANA.KEYS.accounts, accounts);
      NBANA.setSchoolYear(year);
      pendingYear = null;
      $('promoteConfirm').hidden = true;
      NBANA.toast('School year ' + year + ': ' + moved + ' promoted, ' + grads + ' graduated. Reloading\u2026', 'success');
      /* Reload so every panel picks up the new grade levels and school year */
      setTimeout(() => window.location.reload(), 1600);
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

    const students = activeStudents();
    const teachers = NBANA.getAccounts().filter(a => a.role === 'teacher');
    const feed = visibleFeed();
    const hour = new Date().getHours();
    const kicker = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

    let cards, actions, bannerText;
    if (isPrincipal) {
      cards = [
        { icon: '&#10003;', label: 'Students', value: students.length, sub: 'enrolled portal accounts' },
        { icon: '&#9733;', label: 'Teachers', value: teachers.length, sub: 'faculty with portal access' },
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
        const g = computeGrades(a).filter(x => x.final !== null);
        return g.length ? Math.round(g.reduce((s, x) => s + x.final, 0) / g.length) : null;
      }).filter(v => v != null);
      const classAvg = avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null;
      cards = [
        { icon: '&#10003;', label: 'My students', value: mine.length, sub: teacherGrade + ' class' },
        { icon: '&#9733;', label: 'Class average', value: avgs.length ? classAvg : '\u2014', sub: avgs.length ? 'general average, all subjects' : 'grades not posted yet' },
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

    const announcements = feed.filter(p => NBANA.isAdminRole(p.role)).slice(0, 3);

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
        '<div class="panel"><div class="panel-head"><div><h3>Latest announcements</h3><span class="sub">Official posts from the school</span></div>' +
        '<button type="button" class="btn-sm" data-goto="news">See all</button></div>' +
        '<div class="panel-body flush feed">' +
        (announcements.length ? announcements.map(p => postHtml(p)).join('') : NEWS.slice(0, 2).map(newsItemHtml).join('')) +
        '</div></div>' +
      '</div>' +
      '<div class="panel" id="adminPerfPanel">' +
        '<div class="panel-head"><div><h3>Student performance</h3><span class="sub" id="adminPerfSub">Class standing</span></div>' +
        '<button type="button" class="btn-sm" data-goto="grades">Open grades</button></div>' +
        '<div class="panel-body" id="adminPerf"></div>' +
      '</div>';
    mediaHydrate(box);

    box.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => setView(b.dataset.goto));
    });
    renderDashPerf();
  }

  /* ============================================================
     Kid-friendly look for student accounts
     ============================================================ */
  const KID_ICONS = {
    dashboard: '\u{1F3E0}', students: '\u{1F466}', approvals: '\u{1F4DD}', fees: '\u{1F4B0}',
    grades: '\u2B50', attendance: '\u2705', schedule: '\u23F0', tasks: '\u{1F4DA}',
    news: '\u{1F4E3}', messages: '\u{1F4AC}', contact: '\u{1F4EE}', profile: '\u{1F64B}'
  };

  function kidMode() {
    if (role !== 'student') return;
    document.body.classList.add('kid-mode');
    document.querySelectorAll('#sideNav button').forEach(b => {
      const ic = b.querySelector('.s-icon');
      if (ic && KID_ICONS[b.dataset.view]) ic.textContent = KID_ICONS[b.dataset.view];
    });
  }

  function navLabels() {
    if (isPrincipal) $('navContactLabel').textContent = 'School Concerns';
  }

  function relTime(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }
  function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ============================================================
     Contact School - student concerns, read only by the principal/admin
     ============================================================ */
  function loadConcerns() { return NBANA.store.get(K.concerns, []) || []; }
  function saveConcerns(list) { NBANA.store.set(K.concerns, list); }

  function concernCardHtml(c) {
    const open = c.status !== 'resolved';
    const replies = (c.replies || []).map(r =>
      '<div class="cn-reply"><strong>' + esc(r.byName) + '</strong>' +
      '<p>' + esc(r.text).replace(/\n/g, '<br>') + '</p>' +
      '<span class="cn-at">' + fmtStamp(r.at) + '</span></div>').join('');
    const fresh = (c.replies || []).some(re => !c.studentReadAt || new Date(re.at) > new Date(c.studentReadAt));
    const replyForm = isPrincipal
      ? '<form class="cn-reply-form" data-creply="' + esc(c.id) + '">' +
          '<input class="input" placeholder="Reply to ' + esc(String(c.studentName || '').split(' ')[0]) + '..." aria-label="Reply to student">' +
          '<button type="submit" class="btn-sm solid">Reply</button>' +
        '</form>'
      : '';
    const statusBtn = isPrincipal
      ? '<span class="fp-actions"><button type="button" class="btn-sm" data-cstatus="' + esc(c.id) + '">' +
        (open ? 'Mark resolved' : 'Reopen') + '</button></span>'
      : '';
    return '<article class="feed-post concern' + (open ? '' : ' resolved') + '">' +
      '<div class="fp-head">' +
        avatarSpan('fp-avatar', isPrincipal ? c.studentName : c.category, isPrincipal ? photoOf(c.studentId) : '') +
        '<div class="fp-who"><strong>' + esc(isPrincipal ? (c.studentName || 'Student') : c.subject) + '</strong>' +
          '<span class="fp-meta">' +
            (isPrincipal ? '<span class="pill pill-navy">' + esc(c.grade || 'Student') + '</span> ' : '') +
            '<span class="pill pill-amber">' + esc(c.category) + '</span> ' +
            '<span class="pill ' + (open ? 'pill-red' : 'pill-green') + '">' + (open ? 'Open' : 'Resolved') + '</span> ' +
            (fresh && !isPrincipal ? '<span class="pill pill-teal">New reply</span> ' : '') +
            '\u00b7 ' + fmtStamp(c.at) + '</span></div>' +
        statusBtn +
      '</div>' +
      (isPrincipal ? '<h4 class="fp-title">' + esc(c.subject) + '</h4>' : '') +
      '<p class="fp-body">' + esc(c.body).replace(/\n/g, '<br>') + '</p>' +
      (replies ? '<div class="cn-replies">' + replies + '</div>' : '') +
      replyForm +
    '</article>';
  }

  function renderConcerns() {
    if (ALLOWED[role].indexOf('contact') === -1) return;
    if (isPrincipal) {
      $('concernFormPanel').hidden = true;
      $('concernListTitle').textContent = 'Concerns from students';
      const list = loadConcerns().slice().sort((a, b) => new Date(b.at) - new Date(a.at));
      const open = list.filter(c => c.status !== 'resolved').length;
      $('concernListSub').textContent = list.length + ' received \u00b7 ' + open + ' still open \u00b7 teachers cannot see these';
      $('concernList').innerHTML = list.length
        ? list.map(c => concernCardHtml(c)).join('')
        : '<div class="empty-state"><span class="es-icon">&#9993;</span>No student concerns yet.</div>';
    } else {
      const mine = loadConcerns().filter(c => c.studentId === user.id)
        .sort((a, b) => new Date(b.at) - new Date(a.at));
      $('concernListTitle').textContent = 'My concerns';
      $('concernListSub').textContent = mine.length + ' sent \u00b7 answers from the school office appear here';
      $('concernList').innerHTML = mine.length
        ? mine.map(c => concernCardHtml(c)).join('')
        : '<div class="empty-state"><span class="es-icon">&#9993;</span>You have not sent a concern yet.</div>';
    }

    document.querySelectorAll('[data-creply]').forEach(f => f.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = f.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      const list = loadConcerns();
      const c = list.find(x => x.id === f.dataset.creply);
      if (!c) return;
      c.replies = c.replies || [];
      c.replies.push({ by: 'admin', byName: fullName, text: text, at: nowStamp() });
      c.status = 'open';
      saveConcerns(list);
      renderConcerns();
      NBANA.toast('Reply sent to ' + (c.studentName || 'the student') + '.', 'success');
    }));

    document.querySelectorAll('[data-cstatus]').forEach(b => b.addEventListener('click', () => {
      const list = loadConcerns();
      const c = list.find(x => x.id === b.dataset.cstatus);
      if (!c) return;
      c.status = c.status === 'resolved' ? 'open' : 'resolved';
      c.resolvedBy = fullName;
      c.resolvedAt = nowStamp();
      saveConcerns(list);
      renderConcerns();
      NBANA.toast(c.status === 'resolved' ? 'Concern marked as resolved.' : 'Concern reopened.', 'success');
    }));

    refreshNotifs();
  }

  /* The student's "New reply" flag clears once they open this section */
  function markConcernsSeen() {
    if (isPrincipal) {
      const list = loadConcerns();
      let dirty = false;
      list.forEach(c => { if (!c.seenByAdmin) { c.seenByAdmin = true; dirty = true; } });
      if (dirty) { saveConcerns(list); refreshNotifs(); }
      return;
    }
    const list = loadConcerns();
    let dirty = false;
    list.forEach(c => { if (c.studentId === user.id) { c.studentReadAt = nowStamp(); dirty = true; } });
    if (dirty) { saveConcerns(list); renderConcerns(); refreshNotifs(); }
  }

  function concernsInit() {
    if (ALLOWED[role].indexOf('contact') === -1) return;
    const form = $('concernForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = $('cnSubject').value.trim();
      const body = $('cnBody').value.trim();
      const sOk = subject !== '', bOk = body !== '';
      $('cnSubject').classList.toggle('invalid', !sOk);
      $('cnSubject').parentElement.querySelector('.error').classList.toggle('show', !sOk);
      $('cnBody').classList.toggle('invalid', !bOk);
      $('cnBody').parentElement.querySelector('.error').classList.toggle('show', !bOk);
      if (!sOk || !bOk) { NBANA.toast('Please add a subject and your concern.', 'error'); return; }
      const list = loadConcerns();
      list.push({
        id: newId('c'),
        studentId: user.id, studentName: fullName,
        grade: gradeLevel + (section && section !== 'TBD' ? ' \u00b7 ' + section : ''),
        category: $('cnCategory').value,
        subject: subject, body: body,
        at: nowStamp(), status: 'open', replies: [],
        seenByAdmin: false, studentReadAt: nowStamp()
      });
      saveConcerns(list);
      form.reset();
      renderConcerns();
      NBANA.toast('Your concern was sent to the school office.', 'success');
    });
    renderConcerns();
    renderNotices();
  }

  /* ---------------- Notes from the school office (e.g. photo removals) ---------------- */
  function loadNotices() { return NBANA.store.get(K.notices, []) || []; }
  function saveNotices(list) { NBANA.store.set(K.notices, list); }

  function addNotice(studentId, title, body) {
    const list = loadNotices();
    list.unshift({
      id: newId('n'), studentId: studentId, byName: fullName,
      title: title, body: body, at: nowStamp(), read: false
    });
    saveNotices(list);
  }

  function noticeCardHtml(n) {
    return '<article class="feed-post notice">' +
      '<div class="fp-head">' +
        '<span class="fp-avatar">&#9993;</span>' +
        '<div class="fp-who"><strong>' + esc(n.title) + '</strong>' +
          '<span class="fp-meta">' +
            '<span class="pill pill-navy">School office</span> ' +
            (n.read ? '' : '<span class="pill pill-red">New</span> ') +
            '\u00b7 ' + fmtStamp(n.at) + '</span></div>' +
      '</div>' +
      '<p class="fp-body">' + esc(n.body).replace(/\n/g, '<br>') + '</p>' +
      '<p class="hint" style="margin:8px 0 0">Sent by ' + esc(n.byName) + ' \u00b7 you may upload a new picture from My Profile.</p>' +
    '</article>';
  }

  function renderNotices() {
    const panel = $('noticesPanel');
    if (!panel) return;
    const all = loadNotices();
    const list = isPrincipal ? all : all.filter(n => n.studentId === user.id);
    panel.hidden = !list.length;
    if (!list.length) return;
    const sub = panel.querySelector('.sub');
    if (sub) sub.textContent = isPrincipal
      ? 'Notes you sent to students about their profiles'
      : 'Notes the principal sent about your account';
    $('noticeList').innerHTML = list.map(n => noticeCardHtml(n)).join('');
  }

  function unreadNoticeCount() {
    if (role !== 'student') return 0;
    return loadNotices().filter(n => n.studentId === user.id && !n.read).length;
  }

  function markNoticesRead() {
    if (role !== 'student') return;
    const list = loadNotices();
    let dirty = false;
    list.forEach(n => { if (n.studentId === user.id && !n.read) { n.read = true; dirty = true; } });
    if (dirty) { saveNotices(list); renderNotices(); refreshNotifs(); }
  }

  /* ============================================================
     Messages - student <-> teacher chat, monitored by the principal
     ============================================================ */
  /* Restored from the last visit so a refresh keeps the same conversation open */
  let activeThreadKey = lsGet(K.thread) || null;
  let adminChatMode = lsGet(K.chatMode) === 'concerns' ? 'concerns' : 'threads';
  let activeConcernId = null;

  function loadThreads() { return NBANA.store.get(K.threads, {}) || {}; }
  function saveThreads(t) { NBANA.store.set(K.threads, t); }
  function tKey(sid, tid) { return sid + '|' + tid; }
  function participantKey() { return isPrincipal ? 'admin' : (isTeacher ? 'teacher' : 'student'); }

  function teacherAccountFor(grade) {
    return NBANA.getAccounts().find(a => a.role === 'teacher' && a.assignedGrade === grade) || null;
  }
  function myTeacherAccount() {
    if (!user.student) return null;
    return teacherAccountFor(user.student.gradeLevel);
  }

  function lastAtOf(t) {
    const m = t && t.msgs && t.msgs[t.msgs.length - 1];
    return m ? new Date(m.at).getTime() : 0;
  }
  function threadOf(key) { return loadThreads()[key] || null; }

  function unreadIn(t) {
    const k = participantKey();
    const since = t.read && t.read[k] ? new Date(t.read[k]).getTime() : 0;
    return (t.msgs || []).filter(m => m.from !== k && new Date(m.at).getTime() > since).length;
  }

  /* Every conversation the signed-in user may open */
  function myContacts() {
    const all = loadThreads();
    if (isTeacher) {
      return studentsInScope().map(s => {
        const st = s.student || {};
        return {
          threadKey: tKey(s.id, user.id), studentId: s.id, teacherId: user.id,
          title: nameOf(s), sub: (st.gradeLevel || '') + (st.section ? ' \u00b7 ' + st.section : ''),
          studentName: nameOf(s), teacherName: fullName,
          studentPhoto: s.photo || '', teacherPhoto: user.photo || '', photo: s.photo || ''
        };
      }).sort((a, b) => lastAtOf(all[b.threadKey]) - lastAtOf(all[a.threadKey]));
    }
    if (isPrincipal) {
      const map = {};
      activeStudents().forEach(s => {
        const t = s.student && teacherAccountFor(s.student.gradeLevel);
        if (!t) return;
        map[tKey(s.id, t.id)] = {
          threadKey: tKey(s.id, t.id), studentId: s.id, teacherId: t.id,
          title: nameOf(s) + ' \u2192 ' + nameOf(t),
          sub: (s.student.gradeLevel || '') + ' \u00b7 adviser ' + nameOf(t),
          studentName: nameOf(s), teacherName: nameOf(t),
          studentPhoto: s.photo || '', teacherPhoto: t.photo || '', photo: s.photo || ''
        };
      });
      Object.keys(all).forEach(k => {
        const t = all[k];
        if (map[k] || !(t.msgs || []).length) return;
        const s = NBANA.findAccount(t.studentId), tc = NBANA.findAccount(t.teacherId);
        map[k] = {
          threadKey: k, studentId: t.studentId, teacherId: t.teacherId,
          title: (s ? nameOf(s) : 'Student') + ' \u2192 ' + (tc ? nameOf(tc) : 'Teacher'),
          sub: 'Conversation',
          studentName: s ? nameOf(s) : 'Student', teacherName: tc ? nameOf(tc) : 'Teacher',
          studentPhoto: (s && s.photo) || '', teacherPhoto: (tc && tc.photo) || '', photo: (s && s.photo) || ''
        };
      });
      return Object.keys(map).map(k => map[k]).sort((a, b) => lastAtOf(all[b.threadKey]) - lastAtOf(all[a.threadKey]));
    }
    const t = myTeacherAccount();
    return t ? [{
      threadKey: tKey(user.id, t.id), studentId: user.id, teacherId: t.id,
      title: nameOf(t), sub: t.assignedGrade ? 'Adviser \u00b7 ' + t.assignedGrade : 'Your teacher',
      studentName: fullName, teacherName: nameOf(t),
      studentPhoto: user.photo || '', teacherPhoto: t.photo || '', photo: t.photo || ''
    }] : [];
  }

  /* Principal: chat-style reader for student concerns (same panel, other switch position) */
  function renderConcernChat() {
    const list = loadConcerns().slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!list.some(c => c.id === activeConcernId)) activeConcernId = list.length ? list[0].id : null;
    const cur = list.find(c => c.id === activeConcernId) || null;

    if (cur && !cur.seenByAdmin) {
      cur.seenByAdmin = true;
      const all = loadConcerns();
      const i = all.findIndex(x => x.id === cur.id);
      if (i > -1) { all[i] = cur; saveConcerns(all); }
      refreshNotifs();
    }

    $('chatSideTitle').textContent = 'Student concerns';
    $('chatSideSub').textContent = 'Switch back for teacher \u2194 student messages';

    $('threadList').innerHTML = list.length ? list.map(c => {
      const open = c.status !== 'resolved';
      return '<button type="button" class="thread' + (c.id === activeConcernId ? ' active' : '') +
        '" data-concern="' + esc(c.id) + '">' +
        avatarSpan('th-avatar', c.studentName, photoOf(c.studentId)) +
        '<span class="th-body"><span class="th-name">' + esc(c.studentName) + '</span>' +
        '<span class="th-last">' + esc(c.subject) + '</span></span>' +
        '<span class="th-meta">' + esc(relTime(c.at)) +
        '<span class="pill ' + (open ? 'pill-red' : 'pill-green') + '">' + (open ? 'Open' : 'Done') + '</span></span>' +
      '</button>';
    }).join('') : '<div class="empty-state"><span class="es-icon">&#9993;</span>No student concerns yet.</div>';

    if (!cur) {
      $('chatHead').innerHTML = '';
      $('chatBody').innerHTML = '<div class="chat-blank"><span>&#9993;</span><p>No student concerns to show yet.</p></div>';
      $('chatForm').hidden = true;
      refreshNotifs();
      return;
    }

    $('chatHead').innerHTML =
      avatarSpan('th-avatar big', cur.studentName, photoOf(cur.studentId)) +
      '<div class="ch-who"><strong>' + esc(cur.subject) + '</strong>' +
      '<span class="ch-sub">' + esc(cur.studentName) + ' \u00b7 ' + esc(cur.grade || '') + ' \u00b7 ' + esc(cur.category) + '</span></div>' +
      '<span class="pill ' + (cur.status === 'resolved' ? 'pill-green' : 'pill-red') + '">' +
      (cur.status === 'resolved' ? 'Resolved' : 'Open') + '</span>';

    const msgs = [{ from: 'student', text: cur.body, at: cur.at }]
      .concat((cur.replies || []).map(r => ({ from: 'admin', text: r.text, at: r.at })));

    $('chatBody').innerHTML = msgs.map(m => {
      const mine = m.from === 'admin';
      return '<div class="msg-row ' + (mine ? 'me' : 'them') + '">' +
        (mine ? '' : avatarSpan('msg-avatar', cur.studentName, photoOf(cur.studentId))) +
        '<div class="msg-bubble">' + esc(m.text).replace(/\n/g, '<br>') +
        '<span class="msg-time">' + fmtStamp(m.at) + '</span></div></div>';
    }).join('');

    $('chatForm').hidden = false;
    $('chatInput').placeholder = 'Reply to ' + (cur.studentName || 'the student') + '...';
    $('chatBody').scrollTop = $('chatBody').scrollHeight;

    document.querySelectorAll('[data-concern]').forEach(b => b.addEventListener('click', () => {
      activeConcernId = b.dataset.concern;
      renderConcernChat();
    }));
    refreshNotifs();
  }

  function replyToActiveConcern(text) {
    const list = loadConcerns();
    const c = list.find(x => x.id === activeConcernId);
    if (!c) return;
    c.replies = c.replies || [];
    c.replies.push({ by: 'admin', byName: fullName, text: text, at: nowStamp() });
    c.status = 'open';
    saveConcerns(list);
    renderConcernChat();
    renderConcerns();
    NBANA.toast('Reply sent to ' + (c.studentName || 'the student') + '.', 'success');
  }

  function renderMessages() {
    if (ALLOWED[role].indexOf('messages') === -1) return;
    if (isPrincipal && adminChatMode === 'concerns') { renderConcernChat(); return; }
    const contacts = myContacts();
    if (!contacts.some(c => c.threadKey === activeThreadKey)) {
      activeThreadKey = contacts.length ? contacts[0].threadKey : null;
    }
    lsSet(K.thread, activeThreadKey || '');

    const all = loadThreads();
    const cur = activeThreadKey ? all[activeThreadKey] : null;
    if (cur) {                              /* opening a conversation clears its unread count */
      cur.read = cur.read || {};
      cur.read[participantKey()] = nowStamp();
      saveThreads(all);
    }

    $('chatSideTitle').textContent = isPrincipal ? 'All conversations' : 'Conversations';
    $('chatSideSub').textContent = isPrincipal
      ? 'Which student is messaging which teacher'
      : (isTeacher ? 'Students in ' + teacherGrade : 'Your class teacher');

    $('threadList').innerHTML = contacts.length ? contacts.map(c => {
      const t = all[c.threadKey];
      const msgs = (t && t.msgs) || [];
      const last = msgs[msgs.length - 1];
      const unread = t ? unreadIn(t) : 0;
      return '<button type="button" class="thread' + (c.threadKey === activeThreadKey ? ' active' : '') +
        '" data-thread="' + esc(c.threadKey) + '">' +
        avatarSpan('th-avatar', c.title, c.photo) +
        '<span class="th-body"><span class="th-name">' + esc(c.title) + '</span>' +
        '<span class="th-last">' + (last ? esc(last.text.slice(0, 46)) : 'No messages yet') + '</span></span>' +
        '<span class="th-meta">' + (last ? esc(relTime(last.at)) : '') +
        (unread ? '<span class="th-dot">' + unread + '</span>' : '') + '</span>' +
      '</button>';
    }).join('') : '<div class="empty-state"><span class="es-icon">&#128172;</span>No conversations available.</div>';

    const c = contacts.find(x => x.threadKey === activeThreadKey);
    if (!c) {
      $('chatHead').innerHTML = '';
      $('chatBody').innerHTML = '<div class="chat-blank"><span>&#128172;</span><p>' +
        (isPrincipal ? 'Pick a conversation on the left to read it.' : 'No conversation to show yet.') + '</p></div>';
      $('chatForm').hidden = true;
      refreshNotifs();
      return;
    }

    $('chatHead').innerHTML =
      avatarSpan('th-avatar big', c.title, c.photo) +
      '<div class="ch-who"><strong>' + esc(c.title) + '</strong><span class="ch-sub">' + esc(c.sub) + '</span></div>' +
      (isPrincipal ? '<span class="pill pill-navy">Monitoring \u00b7 read only</span>' : '');

    const msgs = (cur && cur.msgs) || [];
    $('chatBody').innerHTML = msgs.length ? msgs.map(m => {
      const mine = !isPrincipal && m.from === participantKey();
      const who = m.from === 'student' ? c.studentName : c.teacherName;
      return '<div class="msg-row ' + (mine ? 'me' : 'them') + '">' +
        (mine ? '' : avatarSpan('msg-avatar', who, m.from === 'student' ? c.studentPhoto : c.teacherPhoto)) +
        '<div class="msg-bubble">' +
          (isPrincipal ? '<span class="msg-who">' + esc(who) + '</span>' : '') +
          esc(m.text).replace(/\n/g, '<br>') +
          '<span class="msg-time">' + fmtStamp(m.at) + '</span>' +
        '</div></div>';
    }).join('') : '<div class="chat-blank"><span>&#128075;</span><p>' + (isPrincipal
      ? 'No messages in this conversation yet.'
      : 'Say hello to ' + esc(c.title) + '!') + '</p></div>';

    $('chatForm').hidden = isPrincipal;
    $('chatBody').scrollTop = $('chatBody').scrollHeight;

    document.querySelectorAll('[data-thread]').forEach(b => b.addEventListener('click', () => {
      activeThreadKey = b.dataset.thread;
      renderMessages();
    }));
    refreshNotifs();
  }

  function sendChat(text) {
    const c = myContacts().find(x => x.threadKey === activeThreadKey);
    if (!c) return;
    const all = loadThreads();
    let t = all[activeThreadKey];
    if (!t) {
      t = { id: activeThreadKey, studentId: c.studentId, teacherId: c.teacherId, msgs: [], read: {} };
      all[activeThreadKey] = t;
    }
    t.msgs = t.msgs || [];
    t.msgs.push({ id: newId('m'), from: isTeacher ? 'teacher' : 'student', text: text, at: nowStamp() });
    t.read = t.read || {};
    t.read[participantKey()] = nowStamp();
    saveThreads(all);
    renderMessages();
  }

  function messagesInit() {
    if (ALLOWED[role].indexOf('messages') === -1) return;
    const form = $('chatForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('chatInput').value.trim();
      if (!text) return;
      if (isPrincipal && adminChatMode === 'concerns') replyToActiveConcern(text);
      else sendChat(text);
      $('chatInput').value = '';
      $('chatInput').focus();
    });

    /* The principal can switch the Messages view between monitoring and concerns */
    if (isPrincipal && $('monitorSwitch')) {
      $('monitorSwitch').hidden = false;
      /* the switch remembers its position, so paint it from the restored mode */
      $('monitorSwitch').querySelectorAll('.ms-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === adminChatMode);
      });
      $('monitorSwitch').querySelectorAll('.ms-btn').forEach(b => b.addEventListener('click', () => {
        adminChatMode = b.dataset.mode;
        lsSet(K.chatMode, adminChatMode);
        $('monitorSwitch').querySelectorAll('.ms-btn').forEach(x => x.classList.toggle('active', x === b));
        $('chatInput').placeholder = 'Aa';
        renderMessages();
      }));
    }
  }

  /* Another tab wrote to the shared school data - keep this tab in step */
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf('nbana.') !== 0) return;
    renderFeed();
    renderApprovals();
    renderConcerns();
    const active = document.querySelector('.view.active');
    if (active && active.id === 'view-messages') renderMessages();
    refreshNotifs();
  });

  /* ============================================================
     Notifications (approvals, concerns, unread messages)
     ============================================================ */
  function openConcernCount() {
    if (isPrincipal) return loadConcerns().filter(c => c.status !== 'resolved' && !c.seenByAdmin).length;
    if (role !== 'student') return 0;
    return loadConcerns().filter(c => c.studentId === user.id &&
      (c.replies || []).some(re => !c.studentReadAt || new Date(re.at) > new Date(c.studentReadAt))).length;
  }

  function myStoredThreads() {
    const all = loadThreads();
    return Object.keys(all).map(k => all[k]).filter(t => {
      if (isPrincipal) return true;
      if (isTeacher) return t.teacherId === user.id;
      return t.studentId === user.id;
    });
  }
  function unreadMsgCount() { return myStoredThreads().reduce((s, t) => s + unreadIn(t), 0); }

  function setBadge(id, n) {
    const el = $(id);
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
  }

  function refreshNotifs() {
    const appr = isPrincipal ? pendingPosts().length : 0;
    const cn = openConcernCount();
    const notes = unreadNoticeCount();
    const msgs = unreadMsgCount();
    const total = appr + cn + notes + msgs;

    const bell = $('notifBtn');
    if (bell) {
      const parts = [];
      if (appr) parts.push(appr + ' teacher post' + (appr === 1 ? '' : 's') + ' waiting for approval');
      if (cn) parts.push(isPrincipal
        ? cn + ' student concern' + (cn === 1 ? '' : 's') + ' waiting for your reply'
        : cn + ' new repl' + (cn === 1 ? 'y' : 'ies') + ' from the school office');
      if (notes) parts.push(notes + ' note' + (notes === 1 ? '' : 's') + ' from the school office');
      if (msgs) parts.push(msgs + ' unread message' + (msgs === 1 ? '' : 's'));
      bell.title = parts.length ? parts.join(' \u00b7 ') : 'No new notifications';
    }
    const nb = $('notifBadge');
    if (nb) { nb.textContent = total > 99 ? '99+' : total; nb.hidden = !total; }
    setBadge('navApprCount', appr);
    setBadge('navConcernCount', cn + notes);
    setBadge('navMsgCount', msgs);
    if (isPrincipal) renderPwReqs();
  }

  function notifInit() {
    if ($('notifBtn')) {
      $('notifBtn').hidden = false;
      $('notifBtn').addEventListener('click', () => {
        if (isPrincipal && pendingPosts().length) return setView('approvals');
        if (unreadMsgCount()) return setView('messages');
        if (openConcernCount()) return setView(ALLOWED[role].indexOf('contact') > -1 ? 'contact' : 'messages');
        setView(isPrincipal ? 'approvals' : 'messages');
      });
    }
    refreshNotifs();
  }

  /* ---------------- App mode: bottom navigation + right drawer ---------------- */
  const VIEW_ICON = {
    dashboard: '&#8962;', students: '&#9679;', approvals: '&#9878;', fees: '&#8369;',
    grades: '&#9733;', attendance: '&#10003;', schedule: '&#9200;', tasks: '&#9776;',
    news: '&#128240;', faculty: '&#127979;', messages: '&#128172;', contact: '&#128238;',
    profile: '&#9823;', pwreq: '&#128273;'
  };
  function appModeOn() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      window.innerWidth <= 860;
  }
  function applyAppMode() {
    document.body.classList.toggle('app-mode', appModeOn());
  }
  function appModeInit() {
    applyAppMode();
    window.addEventListener('resize', applyAppMode);
    if (window.matchMedia('(display-mode: standalone)').addEventListener) {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', applyAppMode);
    }
  }
  function openDrawer() {
    const wrap = $('drawerWrap');
    if (!wrap) return;
    wrap.hidden = false;
    requestAnimationFrame(() => wrap.classList.add('open'));
  }
  function closeDrawer() {
    const wrap = $('drawerWrap');
    if (!wrap || wrap.hidden) return;
    wrap.classList.remove('open');
    setTimeout(() => { wrap.hidden = true; }, 260);
  }
  function drawerInit() {
    if (!$('drawer')) return;
    const av = $('dwAvatar');
    av.innerHTML = user.photo ? '<img src="' + user.photo + '" alt="">' : esc(initialsOf(fullName));
    $('dwName').textContent = fullName;
    $('dwRole').textContent = NBANA.roleLabel(role) +
      (isTeacher ? ' \u00b7 ' + teacherGrade
        : (user.student && user.student.gradeLevel ? ' \u00b7 ' + user.student.gradeLevel : ''));
    const skip = { news: 1, dashboard: 1, messages: 1, profile: 1 };
    $('dwLinks').innerHTML = ALLOWED[role].filter((v) => !skip[v]).map((v) =>
      '<button type="button" data-dw="' + v + '"><span class="s-icon">' + (VIEW_ICON[v] || '&#8226;') + '</span>' + esc(viewMeta(v)[0]) + '</button>'
    ).join('');
    $('dwLinks').querySelectorAll('[data-dw]').forEach((b) =>
      b.addEventListener('click', () => { closeDrawer(); setView(b.dataset.dw); }));
    $('dwEditBtn').addEventListener('click', () => { closeDrawer(); setView('profile'); });
    $('dwLogout').addEventListener('click', () => NBANA.logout());
    const inst = $('dwInstall');
    if (inst) {
      if (window.__nbanaInstall) inst.hidden = false;
      inst.addEventListener('click', () => {
        if (!window.__nbanaInstall) return;
        window.__nbanaInstall.prompt();
        window.__nbanaInstall = null;
        inst.hidden = true;
      });
    }
  }
  function syncBottomNav(name) {
    const nav = $('bottomNav');
    if (!nav) return;
    const map = { news: 'news', dashboard: 'dashboard', messages: 'messages', approvals: 'alerts', contact: 'alerts', pwreq: 'more' };
    const on = map[name] || 'more';
    nav.querySelectorAll('[data-bnav]').forEach((b) => b.classList.toggle('active', b.dataset.bnav === on));
  }
  function bottomNavInit() {
    const nav = $('bottomNav');
    if (!nav) return;
    nav.querySelectorAll('[data-bnav]').forEach((b) => {
      b.addEventListener('click', () => {
        const t = b.dataset.bnav;
        if (t === 'more') { openDrawer(); return; }
        if (t === 'alerts') {
          const nb = $('notifBtn');
          if (nb && !nb.hidden) { nb.click(); return; }
        }
        setView(t === 'alerts' ? (isPrincipal ? 'approvals' : 'messages') : t);
      });
    });
  }
  if ($('drawerBack')) $('drawerBack').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('drawerWrap') && !$('drawerWrap').hidden) closeDrawer();
  });

  /* ---------------- Boot ---------------- */
  migrateFeedPhotos();
  renderFeed();
  composerSetup();

  kidMode();
  navLabels();
  renderBanner();
  appModeInit();
  drawerInit();
  bottomNavInit();
  messagesInit();
  concernsInit();
  profileInit();
  renderFaculty();
  facultyInit();

  if (isAdmin) {
    renderAdminDash();
    if (canSeeFees) feesInit();
    gradesInit();
    attInit();
    schedInit();
    tasksInit();
    studentsInit();
    promotionInit();
    photoReviewInit();
    renderApprovals();
  }

  if (canSeeFees) renderFees();
  renderGrades();
  renderAttendance();
  renderSchedule();
  renderTasks();
  renderProfile();
  notifInit();
  if (!isAdmin) renderDashPerf();
  setView(savedView() || 'news');
})();
