// EduScan cloud: Google or e-mail sign-in (Firebase Auth) and live sync (Firestore) for the stand-alone web app.
// Exposes window.EDU_CLOUD = { ready, signIn, signOut, signUp, signInEmail, resetPassword, sendVerification,
// saveProfile, isAdmin, listProfiles } when firebase-config.js holds a config.
// The app talks to it through the same small interface it uses inside Claude:
//   db.doc(path).collection(kind).get() / .doc(id).set(obj) / .doc(id).delete() / .onSnapshot(cb)
// Each record is stored as one JSON string field, so nested arrays and empty values never trouble Firestore.
(function () {
  var cfg = window.EDU_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || /claudeusercontent\.com$/i.test(location.hostname)) return;
  var BASE = 'https://cdn.jsdelivr.net/npm/firebase@10.14.1/';
  var auth = null, fs = null, provider = null;

  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  var sdk = load(BASE + 'firebase-app-compat.js')
    .then(function () { return Promise.all([load(BASE + 'firebase-auth-compat.js'), load(BASE + 'firebase-firestore-compat.js')]); })
    .then(function () {
      firebase.initializeApp(cfg);
      auth = firebase.auth(); fs = firebase.firestore();
      var emu = window.EDU_FIREBASE_EMULATOR; // tests only
      if (emu) { auth.useEmulator(emu.auth); fs.useEmulator(emu.host, emu.port); }
      provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // keep a copy on the device: works offline, sends when the connection returns
      return fs.enablePersistence({ synchronizeTabs: true }).catch(function () {});
    });

  function decode(d) { try { return JSON.parse(d.j); } catch (e) { return {}; } }
  function snap(s) { return { docs: s.docs.map(function (d) { return { id: d.id, data: function () { return decode(d.data()); } }; }) }; }
  // writes land in the local copy at once; don't keep the teacher waiting for the server when offline
  function settle(p) { p.catch(function (e) { console.warn('EduScan sync', e); }); return Promise.race([p, new Promise(function (r) { setTimeout(r, 1500); })]); }
  function col(ref) {
    return {
      get: function () { return ref.get().then(snap); },
      doc: function (id) {
        var r = ref.doc(id);
        return {
          set: function (obj) { return settle(r.set({ j: JSON.stringify(obj), u: Date.now() })); },
          delete: function () { return settle(r.delete()); }
        };
      },
      onSnapshot: function (cb, err) { return ref.onSnapshot(function (s) { cb(snap(s)); }, err); }
    };
  }
  function wrap() {
    return {
      doc: function (path) {
        var m = /^data\/users\/([^/]+)\/app$/.exec(path);
        var d = fs.doc(m ? 'users/' + m[1] : path);
        return { collection: function (name) { return col(d.collection(name)); } };
      }
    };
  }

  var ready = sdk.then(function () {
    return new Promise(function (resolve) {
      var done = false, stop = null;
      var t = setTimeout(function () { if (!done) { done = true; if (stop) stop(); resolve(auth.currentUser); } }, 8000);
      stop = auth.onAuthStateChanged(function (u) { if (done) return; done = true; clearTimeout(t); if (stop) stop(); resolve(u); });
    });
  }).then(function (u) {
    if (!u) return null;
    // an e-mail account that was just verified in another tab: refresh the flag (quickly, never blocks the start)
    var fresh = u.emailVerified || providerOf(u) !== 'password' ? Promise.resolve()
      : Promise.race([u.reload().catch(function () {}), new Promise(function (r) { setTimeout(r, 2500); })]);
    return fresh.then(function () { return { db: wrap(), user: info(auth.currentUser || u) }; });
  }).catch(function (e) { console.warn('EduScan cloud unavailable', e); return null; });

  function providerOf(u) { var p = u && u.providerData; return (p && p.length && p[0] && p[0].providerId) || 'password'; }
  function info(u) {
    return { uid: u.uid, name: u.displayName || '', email: u.email || '', provider: providerOf(u), verified: !!u.emailVerified,
      created: (u.metadata && Date.parse(u.metadata.creationTime)) || 0 };
  }
  function withSdk(fn) { return auth ? Promise.resolve().then(fn) : sdk.then(fn); }

  function popup() {
    return auth.signInWithPopup(provider).catch(function (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(provider);
      throw e;
    });
  }
  window.EDU_CLOUD = {
    ready: ready,
    // open the Google window straight from the tap when the SDK is already loaded (popup blockers)
    signIn: function () { return auth ? popup() : sdk.then(popup); },
    signOut: function () { return sdk.then(function () { return auth.signOut(); }); },
    // e-mail and password: new account (with display name and a verification e-mail), sign-in, reset link
    signUp: function (email, pass, name) {
      return withSdk(function () {
        return auth.createUserWithEmailAndPassword(email, pass).then(function (c) {
          var u = c.user;
          return u.updateProfile({ displayName: name || '' }).catch(function () {})
            .then(function () { return u.sendEmailVerification().catch(function () {}); });
        });
      });
    },
    signInEmail: function (email, pass) { return withSdk(function () { return auth.signInWithEmailAndPassword(email, pass); }); },
    resetPassword: function (email) { return withSdk(function () { return auth.sendPasswordResetEmail(email); }); },
    sendVerification: function () {
      return withSdk(function () { var u = auth.currentUser; if (!u) throw { code: 'auth/no-current-user' }; return u.sendEmailVerification(); });
    },
    // profiles/{uid}: name, e-mail, school, dates and counts that the administrator sees (never students' data)
    saveProfile: function (data) {
      return withSdk(function () { var u = auth.currentUser; if (!u) return null; return settle(fs.collection('profiles').doc(u.uid).set(data, { merge: true })); });
    },
    isAdmin: function () {
      return withSdk(function () {
        var u = auth.currentUser; if (!u) return false;
        return fs.collection('admins').doc(u.uid).get().then(function (d) { return d.exists; }).catch(function () { return false; });
      });
    },
    listProfiles: function () {
      return withSdk(function () {
        return fs.collection('profiles').get({ source: 'server' }).catch(function (e) {
          if (e && e.code === 'permission-denied') throw e;
          return fs.collection('profiles').get();
        }).then(function (s) { return s.docs.map(function (d) { var o = d.data() || {}; o.uid = d.id; return o; }); });
      });
    }
  };
})();
