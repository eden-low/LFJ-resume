import { auth, googleProvider, db, getUserMode } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const authControl = document.getElementById("auth-control");

// ---- Search People ----
//
// Visibility of search results is role-gated (mirroring firestore.rules' isFriend()/isOwner()
// intent, but enforced here client-side against the `role` field every user's own login.html
// upsert writes to their `users/{uid}` doc — see CLAUDE.md): a Viewer may only find the Owner;
// a Friend or the Owner may find the Owner and any Friend. Opening a result navigates to
// profile.html, a dedicated read-only IG-style profile page, rather than showing an inline
// summary — that page re-checks this same role gate before fetching anything. Personal
// analytics/Goals/Achievements moved to me.html in v2.7 — this page is Connections-only now.

let allUsers = [];
const peopleSearchInput = document.getElementById("people-search");
const peopleResults = document.getElementById("people-results");

async function loadUserDirectory() {
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers = snap.docs.map((d) => d.data());
  } catch (err) {
    console.error("[dashboard] users directory fetch failed:", err.code || err);
    allUsers = [];
  }
}

function searchableUsers() {
  const myRole = getUserMode(); // OWNER / FRIEND / VIEWER
  return allUsers.filter((p) => {
    if (p.uid === auth.currentUser?.uid) return false;
    if (myRole === "OWNER") return p.role === "owner" || p.role === "friend";
    if (myRole === "FRIEND") return p.role === "owner" || p.role === "friend";
    return p.role === "owner";
  });
}

function renderPeopleResults(list) {
  peopleResults.replaceChildren(
    ...list.map((person) => {
      const el = document.createElement("a");
      el.href = `profile.html?uid=${encodeURIComponent(person.uid)}`;
      el.className = "w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-darkBg/40 transition-colors text-left";
      el.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-neonPurple/10 flex items-center justify-center text-neonPurple text-xs overflow-hidden flex-shrink-0">
          ${person.photoURL ? `<img src="${person.photoURL}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-user"></i>`}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${person.displayName || person.email}</p>
          <p class="text-[11px] text-textGray font-code truncate">${person.username ? "@" + person.username : person.email}</p>
        </div>`;
      return el;
    })
  );
}

peopleSearchInput.addEventListener("input", (event) => {
  const q = event.target.value.trim().toLowerCase().replace(/^@/, "");
  if (!q) {
    peopleResults.replaceChildren();
    return;
  }
  const matches = searchableUsers()
    .filter((p) => (p.displayName || "").toLowerCase().includes(q) || (p.username || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q))
    .slice(0, 8);
  renderPeopleResults(matches);
});

function renderSignedOut() {
  authControl.innerHTML = `
    <button id="auth-signin-btn" class="px-4 py-2 bg-gradient-to-r from-neonViolet to-neonPurple rounded-xl text-xs font-cyber font-bold tracking-wider text-white hover:scale-105 transition-all">
      <i class="fa-brands fa-google mr-2"></i> SIGN IN
    </button>`;
  document.getElementById("auth-signin-btn").addEventListener("click", () => {
    signInWithPopup(auth, googleProvider).catch((err) => console.error("Sign-in failed", err));
  });
}

function renderSignedIn(user) {
  authControl.innerHTML = `
    <span class="text-xs text-textGray font-code">Signed in as <span class="text-white">${user.displayName || user.email}</span></span>
    <button id="auth-signout-btn" class="px-4 py-2 bg-cardBg/70 border border-borderNeon rounded-xl text-xs font-cyber font-bold tracking-wider text-white hover:border-neonPurple transition-all">
      SIGN OUT
    </button>`;
  document.getElementById("auth-signout-btn").addEventListener("click", () => signOut(auth));
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    renderSignedIn(user);
  } else {
    renderSignedOut();
  }
  loadUserDirectory();
});
