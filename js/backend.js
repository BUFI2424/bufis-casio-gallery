// Backend for Casio Gallery on Firebase (Auth + Firestore).
// It offers the same small API the page was written against (db / assets / user / downloads),
// so the gallery code itself barely changes.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, OWNER_UID } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);

// ---------- who is here ----------
let resolveUser;
const userReady = new Promise((r) => (resolveUser = r));
onAuthStateChanged(auth, (u) => {
  if (u) { resolveUser(u); return; }
  signInAnonymously(auth).catch(() => resolveUser(null));   // every visitor gets a quiet anonymous id
});
const isOwner = (u) => !!(u && !u.isAnonymous && u.uid === OWNER_UID);

// ---------- database: thin wrapper with the old call shapes ----------
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const docSnap = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data() });
const qSnap = (s) => ({ docs: s.docs.map(docSnap), size: s.size, empty: s.empty });
function docRef(path) {
  const ref = doc(fs, path);
  return {
    id: ref.id, path,
    get: async () => docSnap(await getDoc(ref)),
    set: (data) => setDoc(ref, data),
    update: (data) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next, err) => onSnapshot(ref, (s) => next(docSnap(s)), err)
  };
}
function queryRef(q) {
  return {
    get: async () => qSnap(await getDocs(q)),
    onSnapshot: (next, err) => onSnapshot(q, (s) => next(qSnap(s)), err)
  };
}
function collRef(path) {
  const ref = collection(fs, path);
  return {
    path,
    doc: (id) => docRef(path + "/" + (id || newId())),
    orderBy: (field, dir = "asc") => queryRef(query(ref, orderBy(field, dir))),
    ...queryRef(ref)
  };
}
const db = { doc: docRef, collection: collRef };

// ---------- files: kept inside the database as data: URLs (no paid storage needed) ----------
const LIMIT = 900 * 1024;
const readAsDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function shrinkImage(file) {
  // big pictures (wallpaper, photos for what?.exe) are scaled down so they fit in one record
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight, q = 0.85;
    const max = 1600; if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    const c = document.createElement("canvas");
    for (let tries = 0; tries < 6; tries++) {
      c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length < LIMIT) return out;
      q -= 0.12; w = Math.round(w * 0.8); h = Math.round(h * 0.8);
    }
    throw new Error("too big");
  } finally { URL.revokeObjectURL(url); }
}
const assets = {
  async upload(file, opts = {}) {
    let url = await readAsDataURL(file);
    if (url.length > LIMIT) {
      if ((file.type || "").startsWith("image/")) url = await shrinkImage(file);
      else { const e = new Error("That file is too big (max about 650 KB)."); e.code = "too_big"; throw e; }
    }
    return { id: newId(), url };
  },
  async delete() { /* the picture lives inside the record that uses it */ }
};

// ---------- downloads ----------
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename || "download";
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
};

// ---------- user ----------
const user = {
  async id() { const u = await userReady; return u ? u.uid : null; },
  async isOwner() { return isOwner(await userReady); },
  async profiles() { return {}; }   // visitors are known by their nickname only
};

// ---------- what the page asks for ----------
async function use(name) {
  const u = await userReady;
  if (name === "db") return u ? db : null;
  if (name === "assets") return isOwner(u) ? assets : null;   // only the owner uploads to the gallery itself
  if (name === "user") return user;
  if (name === "downloads") return downloads;
  return null;
}
window.__backend = { use, auth, signOut: () => signOut(auth), isOwner: async () => isOwner(await userReady), OWNER_UID };
window.__backendResolve(window.__backend);

// ---------- owner sign-in: open the site with #login ----------
async function loginPanel() {
  if (!/login/.test(location.hash)) return;
  const u = await userReady;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483646;left:50%;top:50%;transform:translate(-50%,-50%);background:#c0c0c0;color:#000;font:13px Verdana,sans-serif;padding:16px 18px;box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #000,inset 2px 2px 0 #dfdfdf,inset -2px -2px 0 #808080;max-width:320px";
  const msg = document.createElement("p"); msg.style.margin = "0 0 10px";
  const go = document.createElement("button"); go.textContent = "Sign in with Google";
  const out = document.createElement("button"); out.textContent = "Sign out"; out.style.marginLeft = "6px";
  const close = document.createElement("button"); close.textContent = "Close"; close.style.marginLeft = "6px";
  const show = (usr) => {
    msg.innerHTML = usr && !usr.isAnonymous
      ? (isOwner(usr) ? "Signed in as the owner." : "Signed in, but this account is not the owner.") + "<br><small>Your user id: <code>" + usr.uid + "</code></small>"
      : "Owner sign-in.";
    go.hidden = !!(usr && !usr.isAnonymous); out.hidden = !(usr && !usr.isAnonymous);
  };
  go.onclick = async () => { try { const r = await signInWithPopup(auth, new GoogleAuthProvider()); show(r.user); setTimeout(() => location.replace(location.pathname), 1200); } catch (e) { msg.textContent = "Couldn't sign in: " + (e.code || e.message); } };
  out.onclick = async () => { await signOut(auth); location.replace(location.pathname); };
  close.onclick = () => { box.remove(); history.replaceState(null, "", location.pathname); };
  box.append(msg, go, out, close); document.body.append(box); show(u);
}
loginPanel();
