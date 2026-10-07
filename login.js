/* ============================================================
   NBANA APP - Sign in + mandatory sign-up survey wizard
   ============================================================ */
(function () {
  'use strict';

  /* Already signed in? Go straight to the portal. */
  if (NBANA.currentUser()) {
    window.location.replace('portal.html');
    return;
  }

  const $ = (id) => document.getElementById(id);

  /* ---------------- Tabs ---------------- */
  const tabSignIn = $('tabSignIn');
  const tabSignUp = $('tabSignUp');
  const paneSignIn = $('paneSignIn');
  const paneSignUp = $('paneSignUp');

  function showTab(which) {
    const signIn = which === 'in';
    tabSignIn.classList.toggle('active', signIn);
    tabSignUp.classList.toggle('active', !signIn);
    paneSignIn.hidden = !signIn;
    paneSignUp.hidden = signIn;
  }
  tabSignIn.addEventListener('click', () => showTab('in'));
  tabSignUp.addEventListener('click', () => showTab('up'));

  /* ---------------- Field error helpers ---------------- */
  function markError(input, on) {
    input.classList.toggle('invalid', !!on);
    const err = input.parentElement.querySelector('.error');
    if (err) err.classList.toggle('show', !!on);
    return !on;
  }
  function required(id) {
    const el = $(id);
    const ok = el.value.trim() !== '';
    markError(el, !ok);
    return ok;
  }
  function showError(id, on) {
    const el = $(id);
    if (el) el.classList.toggle('show', !!on);
    return !on;
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const digits = (s) => (s.replace(/\D/g, '').length);

  /* ---------------- Sign in ---------------- */
  $('signInForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const idOk = required('loginId');
    const pwOk = required('loginPw');
    if (!idOk || !pwOk) return;

    const res = NBANA.authenticate($('loginId').value, $('loginPw').value);
    if (!res.ok) {
      NBANA.toast(res.error, 'error');
      $('loginPw').classList.add('invalid');
      return;
    }
    NBANA.toast('Welcome back, ' + res.account.firstName + '!', 'success');
    setTimeout(() => { window.location.href = 'portal.html'; }, 500);
  });

  /* ---------------- Wizard ---------------- */
  const steps = Array.from(document.querySelectorAll('.wizard-step'));
  const TOTAL = steps.length;
  let current = 1;

  const btnBack = $('btnBack');
  const btnNext = $('btnNext');
  const btnCreate = $('btnCreate');

  const STEP_NAMES = ['Personal', 'Address', 'Schooling', 'Login', 'Review'];

  function renderStep() {
    steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === current));
    $('wpStep').textContent = 'Step ' + current + ' of ' + TOTAL + ' \u00b7 ' + STEP_NAMES[current - 1];
    const pct = Math.round((current / TOTAL) * 100);
    $('wpPct').textContent = pct + '%';
    $('wpFill').style.width = pct + '%';
    btnBack.hidden = current === 1;
    btnNext.hidden = current === TOTAL;
    btnCreate.hidden = current !== TOTAL;
    if (current === TOTAL) buildReview();
    document.querySelector('.auth-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(n) {
    let ok = true;
    if (n === 1) {
      ok = required('f_first') && ok;
      ok = required('f_last') && ok;
      const birth = $('f_birth');
      const validBirth = birth.value !== '' && new Date(birth.value) <= new Date() && new Date(birth.value).getFullYear() > 1990;
      markError(birth, !validBirth); ok = validBirth && ok;
      ok = required('f_gender') && ok;
    } else if (n === 2) {
      ok = required('f_house') && ok;
      ok = required('f_brgy') && ok;
      ok = required('f_city') && ok;
      ok = required('f_prov') && ok;
      const phoneOk = digits($('f_phone').value) >= 7;
      markError($('f_phone'), !phoneOk); ok = phoneOk && ok;
    } else if (n === 3) {
      ok = required('f_grade') && ok;
      ok = required('f_gname') && ok;
      ok = required('f_grel') && ok;
      const gOk = digits($('f_gphone').value) >= 7;
      markError($('f_gphone'), !gOk); ok = gOk && ok;
    } else if (n === 4) {
      const emailOk = EMAIL_RE.test($('f_email').value.trim());
      markError($('f_email'), !emailOk); ok = emailOk && ok;
      const pwOk = $('f_pw').value.length >= 6;
      markError($('f_pw'), !pwOk); ok = pwOk && ok;
      const matchOk = $('f_pw2').value === $('f_pw').value && $('f_pw2').value !== '';
      markError($('f_pw2'), !matchOk); ok = matchOk && ok;
      ok = showError('agreeErr', !$('f_agree').checked) && ok;
      if (ok && NBANA.findByLogin($('f_email').value)) {
        markError($('f_email'), true);
        $('f_email').parentElement.querySelector('.error').textContent = 'An account with this email already exists.';
        NBANA.toast('An account with this email already exists. Please sign in instead.', 'error');
        ok = false;
      } else if (emailOk) {
        $('f_email').parentElement.querySelector('.error').textContent = 'Enter a valid email address.';
      }
    } else if (n === 5) {
      ok = showError('confirmErr', !$('f_confirm').checked) && ok;
    }
    if (!ok) NBANA.toast('Please complete the required fields in Step ' + n + '.', 'error');
    return ok;
  }

  /* Auto-compute age */
  $('f_birth').addEventListener('change', () => {
    const v = $('f_birth').value;
    if (!v) { $('f_age').value = ''; return; }
    const b = new Date(v);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    $('f_age').value = (age >= 0 && age < 120) ? age : '';
  });

  btnNext.addEventListener('click', () => {
    if (!validateStep(current)) return;
    current++;
    renderStep();
  });

  btnBack.addEventListener('click', () => {
    current--;
    renderStep();
  });

  /* Review summary */
  function row(label, value) {
    return '<div class="r-row"><b>' + label + '</b><span>' + (value || '&mdash;') + '</span></div>';
  }
  function buildReview() {
    const name = [$('f_first').value, $('f_middle').value, $('f_last').value].filter(Boolean).join(' ');
    const addr = [$('f_house').value, $('f_brgy').value, $('f_city').value, $('f_prov').value, $('f_zip').value]
      .filter(Boolean).join(', ');
    $('reviewList').innerHTML =
      row('Full name', name) +
      row('Date of birth', $('f_birth').value) +
      row('Age', $('f_age').value ? $('f_age').value + ' years old' : '') +
      row('Sex', $('f_gender').value) +
      row('Religion', $('f_religion').value) +
      row('Nationality', $('f_nation').value) +
      row('Address', addr) +
      row('Contact number', $('f_phone').value) +
      row('Grade level', $('f_grade').value) +
      row('Section', $('f_section').value) +
      row('School year', $('f_year').value) +
      row('Semester', $('f_sem').value) +
      row('LRN', $('f_lrn').value) +
      row('Guardian', $('f_gname').value) +
      row('Relationship', $('f_grel').value) +
      row('Guardian contact', $('f_gphone').value) +
      row('Login email', $('f_email').value);
  }

  /* Create account */
  $('signupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep(5)) return;

    const fullName = [$('f_first').value.trim(), $('f_middle').value.trim(), $('f_last').value.trim()]
      .filter(Boolean).join(' ');

    const profile = {
      firstName: $('f_first').value.trim(),
      middleName: $('f_middle').value.trim(),
      lastName: $('f_last').value.trim(),
      fullName: fullName,
      age: $('f_age').value,
      birthdate: $('f_birth').value,
      gender: $('f_gender').value,
      civilStatus: $('f_civil').value,
      religion: $('f_religion').value.trim(),
      nationality: $('f_nation').value.trim(),
      email: $('f_email').value.trim(),
      phone: $('f_phone').value.trim(),
      address: {
        house: $('f_house').value.trim(),
        barangay: $('f_brgy').value.trim(),
        city: $('f_city').value.trim(),
        province: $('f_prov').value.trim(),
        zip: $('f_zip').value.trim()
      },
      guardian: {
        name: $('f_gname').value.trim(),
        relationship: $('f_grel').value,
        phone: $('f_gphone').value.trim()
      },
      student: {
        lrn: $('f_lrn').value.trim(),
        gradeLevel: $('f_grade').value,
        section: $('f_section').value.trim() || 'TBD',
        schoolYear: $('f_year').value.trim(),
        semester: $('f_sem').value
      }
    };

    const account = NBANA.createAccount(profile, $('f_pw').value);
    NBANA.setSession(account.id);
    NBANA.toast('Survey complete! Your account has been created.', 'success');
    setTimeout(() => { window.location.href = 'portal.html'; }, 800);
  });

  renderStep();
})();
