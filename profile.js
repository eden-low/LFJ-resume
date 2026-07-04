import { auth, db, getUserMode } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const targetUid = new URLSearchParams(location.search).get("uid");

const headerEl = document.getElementById("profile-header");
const privateNotice = document.getElementById("private-notice");
const contentSection = document.getElementById("profile-content");
const statsEl = document.getElementById("profile-stats");
const gridEl = document.getElementById("photo-grid");
const gridEmpty = document.getElementById("photo-grid-empty");

const photoModal = document.getElementById("photo-modal");
const photoModalBackdrop = document.getElementById("photo-modal-backdrop");
const photoModalClose = document.getElementById("photo-modal-close");
const photoModalImg = document.getElementById("photo-modal-img");
const photoModalCaption = document.getElementById("photo-modal-caption");
const photoModalLikeBtn = document.getElementById("photo-modal-like-btn");
const photoModalLikeCount = document.getElementById("photo-modal-like-count");
const photoModalComments = document.getElementById("photo-modal-comments");

function renderHeader(person) {
  headerEl.innerHTML = `
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 rounded-full bg-neonPurple/10 flex items-center justify-center text-neonPurple overflow-hidden flex-shrink-0">
        ${person.photoURL ? `<img src="${person.photoURL}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-user text-2xl"></i>`}
      </div>
      <div class="min-w-0">
        <h1 class="font-cyber font-black text-2xl text-white truncate">${person.displayName || person.email}</h1>
        <p class="text-textGray font-code text-sm mt-0.5">${person.username ? "@" + person.username : person.email}</p>
      </div>
    </div>`;
}

async function fetchPublicFor(collectionName, uid) {
  try {
    const snap = await getDocs(query(collection(db, collectionName), where("uid", "==", uid), where("visibility", "==", "public")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[profile] public ${collectionName} for ${uid} failed:`, err.code || err);
    return [];
  }
}

function renderStats({ photos, journals, events, habits }) {
  statsEl.innerHTML = `
    <div><p class="text-textGray text-xs">Public photos</p><p class="font-code font-semibold text-xl mt-1">${photos.length}</p></div>
    <div><p class="text-textGray text-xs">Public journal entries</p><p class="font-code font-semibold text-xl mt-1">${journals.length}</p></div>
    <div><p class="text-textGray text-xs">Public timeline events</p><p class="font-code font-semibold text-xl mt-1">${events.length}</p></div>
    <div><p class="text-textGray text-xs">Public habits</p><p class="font-code font-semibold text-xl mt-1">${habits.length}</p></div>`;
}

function renderPhotoGrid(photos) {
  gridEmpty.classList.toggle("hidden", photos.length > 0);
  gridEl.replaceChildren(
    ...photos.map((post) => {
      const el = document.createElement("button");
      el.className = "aspect-square overflow-hidden bg-darkBg/40";
      el.innerHTML = `<img src="${post.url}" alt="${post.caption || "Photo"}" class="w-full h-full object-cover hover:opacity-80 transition-opacity">`;
      el.addEventListener("click", () => openPhotoModal(post));
      return el;
    })
  );
}

// ---- Photo modal: like/comment, read-only otherwise (mirrors gallery.js's per-post panel) ----

let activePost = null;

function closePhotoModal() {
  photoModal.classList.add("hidden");
  activePost = null;
}
photoModalClose.addEventListener("click", closePhotoModal);
photoModalBackdrop.addEventListener("click", closePhotoModal);

async function openPhotoModal(post) {
  activePost = post;
  photoModal.classList.remove("hidden");
  photoModalImg.src = post.url;
  photoModalCaption.textContent = post.caption || "";
  photoModalLikeBtn.innerHTML = `<i class="fa-regular fa-heart"></i> <span id="photo-modal-like-count">&hellip;</span>`;
  photoModalComments.innerHTML = `<p class="text-xs font-code text-textGray">Loading comments&hellip;</p>`;

  const user = auth.currentUser;
  let likedByMe = false;
  let likeCount = 0;
  try {
    const likesSnap = await getDocs(collection(db, "photos", post.id, "likes"));
    likeCount = likesSnap.size;
    likedByMe = !!user && likesSnap.docs.some((d) => d.id === user.uid);
  } catch (err) {
    console.error("[profile] likes fetch failed:", err.code || err);
  }
  renderLikeButton(post, likedByMe, likeCount);

  let comments = [];
  try {
    const commentsSnap = await getDocs(query(collection(db, "photos", post.id, "comments"), orderBy("createdAt", "asc")));
    comments = commentsSnap.docs.map((d) => d.data());
  } catch (err) {
    console.error("[profile] comments fetch failed:", err.code || err);
  }
  renderComments(post, comments);
}

function renderLikeButton(post, likedByMe, likeCount) {
  photoModalLikeBtn.className = `flex items-center gap-1.5 text-xs font-code ${likedByMe ? "text-rose-400" : "text-textGray"} hover:text-rose-400 transition-colors`;
  photoModalLikeBtn.innerHTML = `<i class="fa-${likedByMe ? "solid" : "regular"} fa-heart"></i> <span>${likeCount}</span>`;
  photoModalLikeBtn.onclick = async () => {
    const user = auth.currentUser;
    if (!user || !activePost || activePost.id !== post.id) return;
    const likeRef = doc(db, "photos", post.id, "likes", user.uid);
    try {
      if (likedByMe) {
        await deleteDoc(likeRef);
        renderLikeButton(post, false, Math.max(0, likeCount - 1));
      } else {
        await setDoc(likeRef, { uid: user.uid, likedAt: serverTimestamp() });
        renderLikeButton(post, true, likeCount + 1);
      }
    } catch (err) {
      console.error("[profile] like toggle failed:", err.code || err);
    }
  };
}

function renderComments(post, comments) {
  const list = comments.length
    ? comments.map((c) => `
        <div class="text-xs">
          <span class="font-semibold text-white">${c.email}</span>
          <span class="text-textGray ml-1.5">${c.text}</span>
        </div>`).join("")
    : `<p class="text-xs font-code text-textGray">No comments yet.</p>`;

  const user = auth.currentUser;
  photoModalComments.innerHTML = `
    <div class="space-y-1.5">${list}</div>
    ${user ? `
      <form class="comment-form flex items-center gap-2 mt-2.5">
        <input type="text" placeholder="Add a comment..." class="comment-input flex-1 bg-darkBg/60 border border-borderNeon rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-textGray/60">
        <button type="submit" class="px-3 py-1.5 bg-neonPurple/15 text-neonPurple rounded-lg text-xs font-code hover:bg-neonPurple/25 transition-colors">Post</button>
      </form>` : ""}`;

  const form = photoModalComments.querySelector(".comment-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.querySelector(".comment-input");
      const text = input.value.trim();
      if (!text || !activePost || activePost.id !== post.id) return;
      try {
        await addDoc(collection(db, "photos", post.id, "comments"), {
          uid: user.uid,
          email: user.email,
          text,
          createdAt: serverTimestamp(),
        });
        const commentsSnap = await getDocs(query(collection(db, "photos", post.id, "comments"), orderBy("createdAt", "asc")));
        renderComments(post, commentsSnap.docs.map((d) => d.data()));
      } catch (err) {
        console.error("[profile] comment post failed:", err.code || err);
      }
    });
  }
}

// ---- Role gate + load ----
//
// Viewer -> only the Owner's profile is visible. Friend/Owner -> the Owner's and any Friend's
// profile is visible. This is a UI-level gate against the public `role` field on users/{uid}
// (see login.html), not a firestore.rules change — the underlying public-content read rules
// intentionally stay open to any signed-in user (that's what powers the main Gallery/Journal/
// Timeline/Habits feeds showing everyone's public posts), so this only affects what Search
// People surfaces and what this page chooses to render.
function canViewProfile(targetRole) {
  const myRole = getUserMode(); // OWNER / FRIEND / VIEWER
  if (myRole === "OWNER") return true;
  if (myRole === "FRIEND") return targetRole === "owner" || targetRole === "friend";
  return targetRole === "owner";
}

async function loadProfile() {
  if (!targetUid) {
    headerEl.innerHTML = `<p class="text-sm text-textGray">No profile specified.</p>`;
    return;
  }

  let person;
  try {
    const snap = await getDoc(doc(db, "users", targetUid));
    if (!snap.exists()) {
      headerEl.innerHTML = `<p class="text-sm text-textGray">User not found.</p>`;
      return;
    }
    person = snap.data();
  } catch (err) {
    console.error("[profile] user fetch failed:", err.code || err);
    headerEl.innerHTML = `<p class="text-sm text-textGray">Couldn't load this profile.</p>`;
    return;
  }

  renderHeader(person);

  if (!canViewProfile(person.role || "viewer")) {
    privateNotice.classList.remove("hidden");
    return;
  }

  const [photos, journals, events, habits] = await Promise.all([
    fetchPublicFor("photos", targetUid),
    fetchPublicFor("journals", targetUid),
    fetchPublicFor("life_events", targetUid),
    fetchPublicFor("habits", targetUid),
  ]);
  photos.sort((a, b) => (b.uploadedAt?.toMillis?.() || 0) - (a.uploadedAt?.toMillis?.() || 0));

  contentSection.classList.remove("hidden");
  renderStats({ photos, journals, events, habits });
  renderPhotoGrid(photos);
}

onAuthStateChanged(auth, (user) => {
  if (user) loadProfile();
});
