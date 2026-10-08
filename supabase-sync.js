/* ============================================================
   NBANA APP — cloud sync (Supabase REST, no third-party library)
   ------------------------------------------------------------
   Every kind of portal data lives in one Supabase table,
   nbana_records, tagged by `kind`:

     account  -> student / teacher / principal / admin accounts
     post     -> feed posts (text + settings)
     thread   -> student <-> teacher conversations and messages
     concern  -> "Contact School" concerns and replies
     pwreq    -> "forgot password" requests from the sign-in page

   Design rules:
     • The portal must never depend on the network. If anything here
       fails, the app keeps working from this browser's localStorage.
     • Photos/videos stay on the device that attached them
       (IndexedDB is per-device); text and settings do sync.
     • The reversible password copy (pwCode) is NEVER uploaded.
     • New data types only need one line in KINDS below.

   Settings live in supabase-config.js. Set enabled:false there to
   turn cloud sync off completely.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.NBANA_CLOUD || {};
  if (cfg.enabled === false || !cfg.url || !cfg.key) return;
  if (typeof NBANA === 'undefined' || !NBANA || !NBANA.store || !NBANA.KEYS) return;

  const REST = cfg.url.replace(/\/+$/, '') + '/rest/v1/';
  const TABLE = 'nbana_records';
  const RELOAD_FLAG = 'nbana.cloud.reloaded';

  /* ---------------- what syncs, and where it lives locally ----------------
     shape 'list' = stored as an array, 'map' = stored as an object keyed by id. */
  const KINDS = {
    account: { key: NBANA.KEYS.accounts, shape: 'list' },
    post: { key: 'nbana.feed.v1', shape: 'list' },
    thread: { key: 'nbana.threads.v1', shape: 'map' },
    concern: { key: 'nbana.concerns.v1', shape: 'list' },
    pwreq: { key: 'nbana.pwreq.v1', shape: 'list' },
    /* School records: grades & attendance are keyed by account id,
       schedules by grade level, notices are a plain list. */
    grades: { key: 'nbana.grades.v1', shape: 'map' },
    attendance: { key: 'nbana.attendance.v1', shape: 'map' },
    schedule: { key: 'nbana.schedules.v1', shape: 'map' },
    notice: { key: 'nbana.notices.v1', shape: 'list' },
    /* Faculty & staff listing (portal + the public Teachers & Staff page) */
    faculty: { key: 'nbana.faculty.v1', shape: 'list' }
  };
  const KEY_TO_KIND = {};
  Object.keys(KINDS).forEach(function (name) { KEY_TO_KIND[KINDS[name].key] = name; });

  const cloud = {
    state: { online: true, kinds: {}, storage: 'idle', storageError: null, lastError: null, syncedAt: 0 },
    pull: pullAll,
    push: pushItems,
    pushAccount: function (acc) { return pushItems('account', [acc]); },
    pushPost: function (post) { return pushItems('post', [post]); },
    deletePost: function (id) { return deleteItems('post', [id]); }
  };
  NBANA.cloud = cloud;

  /* ---------------- REST helpers ---------------- */
  function headers(extra) {
    const h = {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    };
    if (extra) for (const k in extra) h[k] = extra[k];
    return h;
  }

  async function api(path, method, body, prefer) {
    const init = { method: method || 'GET', headers: headers(prefer ? { Prefer: prefer } : null) };
    if (body !== undefined && body !== null) init.body = JSON.stringify(body);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    if (ctrl) init.signal = ctrl.signal;
    try {
      const res = await fetch(REST + path, init);
      if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (e) { /* ignore */ }
        throw new Error('HTTP ' + res.status + (detail ? ' — ' + detail.slice(0, 200) : ''));
      }
      if (res.status === 204) return null;
      try { return await res.json(); } catch (e) { return null; }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------------- storage <-> item helpers ---------------- */
  function itemsOf(name, value) {
    const shape = KINDS[name].shape;
    const out = [];
    if (shape === 'map') {
      const obj = (value && typeof value === 'object') ? value : {};
      Object.keys(obj).forEach(function (k) {
        const item = obj[k];
        if (item && typeof item === 'object') {
          out.push({ id: String(item.id != null ? item.id : k), item: item });
        }
      });
    } else {
      (Array.isArray(value) ? value : []).forEach(function (item) {
        if (item && typeof item === 'object' && item.id != null) out.push({ id: String(item.id), item: item });
      });
    }
    return out;
  }

  function rebuild(name, entries) {
    if (KINDS[name].shape === 'map') {
      const obj = {};
      entries.forEach(function (e) { obj[e.id] = e.item; });
      return obj;
    }
    return entries.map(function (e) { return e.item; });
  }

  /* Never upload the reversible copy of a password. */
  function cleanForCloud(name, item) {
    const copy = JSON.parse(JSON.stringify(item || {}));
    if (name === 'account') delete copy.pwCode;
    return copy;
  }

  /* Keep device-only secrets when a cloud copy replaces a local one. */
  function adopt(name, mine, incoming) {
    const merged = Object.assign({}, incoming);
    if (name === 'account') {
      if (!merged.passwordHash && mine && mine.passwordHash) merged.passwordHash = mine.passwordHash;
      if (mine && mine.pwCode) merged.pwCode = mine.pwCode;
    }
    return merged;
  }

  function newer(cloudItem, localItem) {
    const c = Number((cloudItem && cloudItem.updatedAt) || 0);
    const l = Number((localItem && localItem.updatedAt) || 0);
    return c > l;
  }

  /* ---------------- public calls ---------------- */
  async function pushItems(name, items) {
    const list = (items || []).filter(function (x) { return x && x.id != null; });
    if (!list.length) return null;
    const now = new Date().toISOString();
    const rows = list.map(function (item) {
      return { kind: name, id: String(item.id), payload: cleanForCloud(name, item), updated_at: now };
    });
    const out = await api(TABLE + '?on_conflict=kind,id', 'POST', rows, 'resolution=merge-duplicates,return=minimal');
    cloud.state.kinds[name] = 'ok';
    cloud.state.lastError = null;
    cloud.state.syncedAt = Date.now();
    return out;
  }

  async function deleteItems(name, ids) {
    const list = (ids || []).map(String).filter(Boolean);
    if (!list.length) return null;
    return api(TABLE + '?kind=eq.' + encodeURIComponent(name) +
      '&id=in.(' + list.map(encodeURIComponent).join(',') + ')', 'DELETE');
  }

  async function pullAll() {
    try {
      const rows = await api(TABLE + '?select=kind,id,payload,updated_at', 'GET');
      cloud.state.online = true;
      cloud.state.lastError = null;
      cloud.state.syncedAt = Date.now();
      return rows || [];
    } catch (e) {
      cloud.state.online = false;
      cloud.state.lastError = String((e && e.message) || e);
      throw e;
    }
  }

  /* ---------------- local storage hooks ----------------
     Every save the portal makes already goes through
     NBANA.store.set(), so wrapping it catches logins, profile
     edits, new posts, messages, concerns and requests in one place. */
  let pushingLocal = false;
  const pendingUpserts = new Map();
  const pendingDeletes = new Map();
  Object.keys(KINDS).forEach(function (name) {
    pendingUpserts.set(name, new Map());
    pendingDeletes.set(name, new Set());
  });
  let flushTimer = null;

  const origSet = NBANA.store.set;

  NBANA.store.set = function (key, value) {
    const name = KEY_TO_KIND[key];
    const before = name ? NBANA.store.get(key, KINDS[name].shape === 'map' ? {} : []) : null;
    const result = origSet.call(NBANA.store, key, value);
    if (pushingLocal || !name) return result;
    try { queue(name, before, value); } catch (e) { cloud.state.lastError = String((e && e.message) || e); }
    return result;
  };

  function writeLocal(key, value) {
    pushingLocal = true;
    try { origSet.call(NBANA.store, key, value); } finally { pushingLocal = false; }
  }

  function queue(name, before, after) {
    const prev = new Map();
    itemsOf(name, before).forEach(function (e) { prev.set(e.id, JSON.stringify(e.item)); });
    const nextIds = new Set();
    itemsOf(name, after).forEach(function (e) {
      nextIds.add(e.id);
      if (prev.get(e.id) === JSON.stringify(e.item)) return;
      pendingUpserts.get(name).set(e.id, e.item);
      pendingDeletes.get(name).delete(e.id);
    });
    prev.forEach(function (json, id) { if (!nextIds.has(id)) pendingDeletes.get(name).add(id); });
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flushTimer = null; flush(); }, 700);
  }

  /* Local edits get a timestamp so two devices can tell which copy is newer. */
  function stampLocal(name, items) {
    const conf = KINDS[name];
    const now = Date.now();
    const entries = itemsOf(name, NBANA.store.get(conf.key, conf.shape === 'map' ? {} : []));
    let touched = false;
    items.forEach(function (item) {
      item.updatedAt = now;
      const hit = entries.find(function (e) { return e.id === String(item.id); });
      if (hit && hit.item) { hit.item.updatedAt = now; touched = true; }
    });
    if (touched) writeLocal(conf.key, rebuild(name, entries));
  }

  async function flush() {
    for (const name of Object.keys(KINDS)) {
      const items = Array.from(pendingUpserts.get(name).values());
      const gone = Array.from(pendingDeletes.get(name).values());
      if (!items.length && !gone.length) continue;
      pendingUpserts.get(name).clear();
      pendingDeletes.get(name).clear();
      try {
        if (items.length && name === 'post') {
          let mediaChanged = false;
          for (const p of items) { if (await syncPostMedia(p)) mediaChanged = true; }
          if (mediaChanged) persistPostsLocally(items);
        }
        if (items.length) { stampLocal(name, items); await pushItems(name, items); }
        if (gone.length) await deleteItems(name, gone);
        cloud.state.kinds[name] = 'ok';
        cloud.state.lastError = null;
        cloud.state.syncedAt = Date.now();
      } catch (e) {
        cloud.state.kinds[name] = 'error';
        cloud.state.lastError = String((e && e.message) || e);
      }
    }
  }

  /* ---------------- media files (Supabase Storage) ----------------
     Feed photos and videos live in this browser's IndexedDB as data URLs.
     We upload each one to the public bucket and remember its URL on the
     post, so every device can show the same picture. */
  const BUCKET = 'nbana-media';
  const STORAGE = cfg.url.replace(/\/+$/, '') + '/storage/v1';

  function mediaRecord(key) {
    return new Promise(function (resolve) {
      try {
        const rq = indexedDB.open('nbana-media', 1);
        rq.onupgradeneeded = function () {
          const dx = rq.result;
          if (!dx.objectStoreNames.contains('files')) dx.createObjectStore('files', { keyPath: 'key' });
        };
        rq.onerror = function () { resolve(null); };
        rq.onsuccess = function () {
          const dx = rq.result;
          try {
            const get = dx.transaction('files', 'readonly').objectStore('files').get(key);
            get.onsuccess = function () { dx.close(); resolve((get.result && get.result.dataUrl) || null); };
            get.onerror = function () { dx.close(); resolve(null); };
          } catch (e) { dx.close(); resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(parts[1] || '');
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  function extFor(mime) {
    if (/png/.test(mime)) return '.png';
    if (/webp/.test(mime)) return '.webp';
    if (/gif/.test(mime)) return '.gif';
    if (/mp4/.test(mime)) return '.mp4';
    if (/webm/.test(mime)) return '.webm';
    if (/quicktime/.test(mime)) return '.mov';
    return '.jpg';
  }

  async function uploadMedia(name, dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const file = name.replace(/[^a-zA-Z0-9._-]/g, '_') + extFor(blob.type);
    const res = await fetch(STORAGE + '/object/' + BUCKET + '/' + encodeURIComponent(file), {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        'Content-Type': blob.type || 'application/octet-stream',
        'x-upsert': 'true',
        'cache-control': 'max-age=31536000'
      },
      body: blob
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch (e) { /* ignore */ }
      throw new Error('storage HTTP ' + res.status + (detail ? ' \u2014 ' + detail.slice(0, 120) : ''));
    }
    return cfg.url.replace(/\/+$/, '') + '/storage/v1/object/public/' + BUCKET + '/' + encodeURIComponent(file);
  }

  /* Upload whatever this device still holds locally for a post. */
  async function syncPostMedia(post) {
    if (!post || !Array.isArray(post.media) || !post.media.length) return false;
    let changed = false;
    for (const m of post.media) {
      try {
        if (!m.url && m.key && !m.legacy) {
          const dataUrl = await mediaRecord(m.key);
          if (dataUrl) { m.url = await uploadMedia(m.key, dataUrl); changed = true; }
        }
        if (!m.posterUrl && m.posterKey) {
          const d = await mediaRecord(m.posterKey);
          if (d) { m.posterUrl = await uploadMedia(m.posterKey, d); changed = true; }
        }
      } catch (e) {
        cloud.state.storage = 'error';
        cloud.state.storageError = String((e && e.message) || e);
      }
    }
    if (changed && cloud.state.storage !== 'error') { cloud.state.storage = 'ok'; cloud.state.storageError = null; }
    return changed;
  }

  /* Copy freshly uploaded URLs back into this browser's feed. */
  function persistPostsLocally(items) {
    const feed = NBANA.store.get('nbana.feed.v1', []) || [];
    let touched = false;
    items.forEach(function (p) {
      const mine = feed.find(function (x) { return x.id === p.id; });
      if (mine && JSON.stringify(mine.media) !== JSON.stringify(p.media)) {
        mine.media = p.media;
        touched = true;
      }
    });
    if (touched) writeLocal('nbana.feed.v1', feed);
  }

  /* ---------------- boot: pull what other devices saved ---------------- */
  async function boot() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      cloud.state.online = false;
      return;
    }
    let rows;
    try {
      rows = await pullAll();
    } catch (e) {
      return;
    }

    const byKind = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.kind) return;
      (byKind[r.kind] = byKind[r.kind] || []).push(r);
    });

    let changed = false;
    for (const name of Object.keys(KINDS)) {
      const conf = KINDS[name];
      const cloudRows = byKind[name] || [];
      const entries = itemsOf(name, NBANA.store.get(conf.key, conf.shape === 'map' ? {} : []));
      const localById = new Map();
      entries.forEach(function (e) { localById.set(e.id, e); });
      const cloudIds = new Set();
      let dirty = false;

      cloudRows.forEach(function (row) {
        const id = String(row.id);
        cloudIds.add(id);
        const payload = row.payload || {};
        if (payload.id == null) payload.id = id;
        const mine = localById.get(id);
        if (!mine) {
          entries.push({ id: id, item: payload });
          dirty = true;
        } else if (newer(payload, mine.item)) {
          mine.item = adopt(name, mine.item, payload);
          dirty = true;
        }
      });

      if (dirty) { writeLocal(conf.key, rebuild(name, entries)); changed = true; }

      const localOnly = entries
        .filter(function (e) { return !cloudIds.has(e.id); })
        .map(function (e) { return e.item; });
      if (localOnly.length) {
        try {
          stampLocal(name, localOnly);
          await pushItems(name, localOnly);
        } catch (e) {
          cloud.state.kinds[name] = 'error';
          cloud.state.lastError = String((e && e.message) || e);
        }
      }

      /* Photos this device holds that the cloud has never seen. */
      if (name === 'post') {
        const posts = NBANA.store.get(conf.key, []) || [];
        const uploaded = [];
        for (const p of posts) { if (await syncPostMedia(p)) uploaded.push(p); }
        if (uploaded.length) {
          persistPostsLocally(uploaded);
          try { await pushItems('post', uploaded); } catch (e) {
            cloud.state.storage = 'error';
            cloud.state.lastError = String((e && e.message) || e);
          }
        }
      }
    }

    /* New cloud data needs one clean render, but never a reload loop. */
    if (changed && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }
    if (!changed) sessionStorage.removeItem(RELOAD_FLAG);
  }

  function start() {
    boot().catch(function (e) { cloud.state.lastError = String((e && e.message) || e); });
  }

  if (document.readyState === 'complete') setTimeout(start, 150);
  else window.addEventListener('load', function () { setTimeout(start, 150); });

  window.addEventListener('online', function () { start(); });
})();
