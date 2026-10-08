/* ============================================================
   NBANA APP - School faculty & staff roster.
   ------------------------------------------------------------
   Mirrors the "Teachers & Staff" page (about.html): the six
   administration members, then the eight class advisers, in the
   same order and with the same photos. The portal's Faculty &
   Staff section and the public Teachers & Staff page both render
   from this one list, so they can never drift apart.

   A full admin (principal) can edit the list inside the portal.
   Those edits are saved under 'nbana.faculty.v1', sync to every
   device through Supabase, and take precedence over this file.

   Teacher logins: one account per adviser below. Plain passwords
   are NOT in this file - only their hashes.
   ============================================================ */
window.NBANA_FACULTY = [
  { id: 'fac_adm01', group: 'admin', order: 1, name: "Arc Castro", role: "School Owner", photo: "owner1.jpg" },
  { id: 'fac_adm02', group: 'admin', order: 2, name: "Iris Daphne Castro", role: "School Owner", photo: "owner2.jpg" },
  { id: 'fac_adm03', group: 'admin', order: 3, name: "Cleopatra Hilda Bana-Valdehueza", role: "School Administrator", photo: "admin1.jpg" },
  { id: 'fac_adm04', group: 'admin', order: 4, name: "Billy A. Rubino", role: "Education Superintendent, Western Mindanao Conference", photo: "admin2.jpg" },
  { id: 'fac_adm05', group: 'admin', order: 5, name: "Janice Rose B. Beronas", role: "School Principal", photo: "principal.jpg" },
  { id: 'fac_adm06', group: 'admin', order: 6, name: "Marissa D. Villamor", role: "School Treasurer", photo: "treasurer.jpg" },
  { id: 'fac_tch01', group: 'teacher', order: 101, name: "Loven R. Nano", role: "Kinder 1 Teacher", grade: "Kinder 1", photo: "teacher1.jpg" },
  { id: 'fac_tch02', group: 'teacher', order: 102, name: "Janice G. Baldicantos", role: "Kinder 2 Teacher", grade: "Kinder 2", photo: "teacher2.jpg" },
  { id: 'fac_tch03', group: 'teacher', order: 103, name: "Estephanie V. Perolino", role: "Grade 1 Teacher", grade: "Grade 1", photo: "teacher3.jpg" },
  { id: 'fac_tch04', group: 'teacher', order: 104, name: "Adelfa B. Quilat", role: "Grade 2 Teacher", grade: "Grade 2", photo: "teacher4.jpg" },
  { id: 'fac_tch05', group: 'teacher', order: 105, name: "Sunshine Rose A. Anggot", role: "Grade 3 Teacher", grade: "Grade 3", photo: "teacher5.jpg" },
  { id: 'fac_tch06', group: 'teacher', order: 106, name: "Rotchel D. Alozo", role: "Grade 4 Teacher", grade: "Grade 4", photo: "teacher6.jpg" },
  { id: 'fac_tch07', group: 'teacher', order: 107, name: "Joy E. Lomongo", role: "Grade 5 Teacher", grade: "Grade 5", photo: "teacher7.jpg" },
  { id: 'fac_tch08', group: 'teacher', order: 108, name: "Sandra E. Argod", role: "Grade 6 Teacher", grade: "Grade 6", photo: "teacher8.jpg" }
];

/* One portal account per class adviser, keyed on the faculty id above. */
window.NBANA_TEACHER_SEEDS = [
  { id: "acc_tchr0002", facultyId: "fac_tch01", fullName: "Loven R. Nano", firstName: "Loven", lastName: "Nano", assignedGrade: "Kinder 1", email: "loven.nano@nbana.edu.ph", passwordHash: "h17q8r1z_8" },
  { id: "acc_tchr0003", facultyId: "fac_tch02", fullName: "Janice G. Baldicantos", firstName: "Janice", lastName: "Baldicantos", assignedGrade: "Kinder 2", email: "janice.baldicantos@nbana.edu.ph", passwordHash: "hb0as9y_8" },
  { id: "acc_tchr0004", facultyId: "fac_tch03", fullName: "Estephanie V. Perolino", firstName: "Estephanie", lastName: "Perolino", assignedGrade: "Grade 1", email: "estephanie.perolino@nbana.edu.ph", passwordHash: "hqjvn7w_8" },
  { id: "acc_tchr0005", facultyId: "fac_tch04", fullName: "Adelfa B. Quilat", firstName: "Adelfa", lastName: "Quilat", assignedGrade: "Grade 2", email: "adelfa.quilat@nbana.edu.ph", passwordHash: "hnir1on_8" },
  { id: "acc_tchr0006", facultyId: "fac_tch05", fullName: "Sunshine Rose A. Anggot", firstName: "Sunshine", lastName: "Anggot", assignedGrade: "Grade 3", email: "sunshine.anggot@nbana.edu.ph", passwordHash: "hm240n1_8" },
  { id: "acc_tchr0007", facultyId: "fac_tch06", fullName: "Rotchel D. Alozo", firstName: "Rotchel", lastName: "Alozo", assignedGrade: "Grade 4", email: "rotchel.alozo@nbana.edu.ph", passwordHash: "h1d2xa7m_8" },
  { id: "acc_tchr0001", facultyId: "fac_tch07", fullName: "Joy E. Lomongo", firstName: "Joy", lastName: "Lomongo", assignedGrade: "Grade 5", email: "joy.lomongo@nbana.edu.ph", passwordHash: "hr78t7f_8" },
  { id: "acc_tchr0008", facultyId: "fac_tch08", fullName: "Sandra E. Argod", firstName: "Sandra", lastName: "Argod", assignedGrade: "Grade 6", email: "sandra.argod@nbana.edu.ph", passwordHash: "hu154l0_8" }
];
