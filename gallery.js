import { auth, googleProvider, db, storage, isOwner } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const CATEGORY_GRIDS = {
  personal: { grid: document.getElementById("gallery-personal-grid"), aspect: "aspect-square", hoverBorder: "hover:border-neonPurple" },
  event: { grid: document.getElementById("gallery-events-grid"), aspect: "aspect-square", hoverBorder: "hover:border-amber-400" },
  project: { grid: document.getElementById("gallery-projects-grid"), aspect: "aspect-video", hoverBorder: "hover:border-neonBlue" },
};

const privateSection = document.getElementById("gallery-private-section");
const privateGrid = document.getElementById("gallery-private-grid");
const accessNote = document.getElementById("gallery-access-note");
const uploadSection = document.getElementById("gallery-upload-section");
const uploadForm = document.getElementById("upload-form");
const uploadStatus = document.getElementById("upload-status");
const authControl = document.getElementById("auth-control");

function photoEl(photo, { aspect, hoverBorder }) {
  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.caption || "Gallery photo";
  img.className = `reveal ${aspect} rounded-xl border border-borderNeon object-cover ${hoverBorder} transition-all is-visible`;
  return img;
}

function clearGrid(grid) {
  if (grid) grid.replaceChildren();
}

async function renderPublicPhotos() {
  Object.values(CATEGORY_GRIDS).forEach(({ grid }) => clearGrid(grid));

  const q = query(collection(db, "photos"), where("visibility", "==", "public"));
  const snap = await getDocs(q);
  snap.forEach((doc) => {
    const photo = doc.data();
    const target = CATEGORY_GRIDS[photo.category];
    if (target?.grid) target.grid.appendChild(photoEl(photo, target));
  });
}

async function renderPrivatePhotos() {
  clearGrid(privateGrid);
  try {
    const q = query(collection(db, "photos"), where("visibility", "==", "private"));
    const snap = await getDocs(q);
    snap.forEach((doc) => {
      const photo = doc.data();
      privateGrid.appendChild(photoEl(photo, { aspect: "aspect-square", hoverBorder: "hover:border-rose-400" }));
    });
    privateSection.classList.remove("hidden");
    accessNote.classList.add("hidden");
  } catch (err) {
    // Rules denied the read — user is signed in but not on the allowlist.
    privateSection.classList.add("hidden");
    accessNote.classList.remove("hidden");
  }
}

function renderSignedOut() {
  authControl.innerHTML = `
    <button id="auth-signin-btn" class="px-4 py-2 bg-gradient-to-r from-neonViolet to-neonPurple rounded-xl text-xs font-cyber font-bold tracking-wider text-white hover:scale-105 transition-all">
      <i class="fa-brands fa-google mr-2"></i> SIGN IN
    </button>`;
  document.getElementById("auth-signin-btn").addEventListener("click", () => {
    signInWithPopup(auth, googleProvider).catch((err) => console.error("Sign-in failed", err));
  });
  privateSection.classList.add("hidden");
  accessNote.classList.add("hidden");
  uploadSection.classList.add("hidden");
}

function renderSignedIn(user) {
  authControl.innerHTML = `
    <span class="text-xs text-textGray font-code">Signed in as <span class="text-white">${user.displayName || user.email}</span></span>
    <button id="auth-signout-btn" class="px-4 py-2 bg-cardBg/70 border border-borderNeon rounded-xl text-xs font-cyber font-bold tracking-wider text-white hover:border-neonPurple transition-all">
      SIGN OUT
    </button>`;
  document.getElementById("auth-signout-btn").addEventListener("click", () => signOut(auth));

  renderPrivatePhotos();
  uploadSection.classList.toggle("hidden", !isOwner(user));
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    renderSignedIn(user);
  } else {
    renderSignedOut();
  }
});

renderPublicPhotos();

uploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!isOwner(user)) return;

  const file = document.getElementById("upload-file").files[0];
  const category = document.getElementById("upload-category").value;
  const visibility = uploadForm.querySelector('input[name="upload-visibility"]:checked').value;
  if (!file) return;

  uploadStatus.textContent = "Uploading...";
  try {
    const storagePath = `gallery/${visibility}/${category}/${Date.now()}-${file.name}`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await addDoc(collection(db, "photos"), {
      url,
      storagePath,
      category,
      visibility,
      caption: file.name,
      uploadedAt: serverTimestamp(),
      uploadedBy: user.uid,
    });

    uploadStatus.textContent = "Uploaded.";
    uploadForm.reset();
    await renderPublicPhotos();
    if (visibility === "private") await renderPrivatePhotos();
  } catch (err) {
    console.error("Upload failed", err);
    uploadStatus.textContent = "Upload failed — check console.";
  }
});
