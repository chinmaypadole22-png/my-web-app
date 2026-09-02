// firebase-sync.js — all Firestore/Auth communication for the org chart.
// Loaded as a <script type="module">; exposes functions on window.FirebaseSync
// so the plain (non-module) index.js can call them.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCM3QrbKORlNKe_97y3BfpP36NXGK1T5T4",
  authDomain: "techture-org-chart.firebaseapp.com",
  projectId: "techture-org-chart",
  storageBucket: "techture-org-chart.firebasestorage.app",
  messagingSenderId: "740198116394",
  appId: "1:740198116394:web:868c211327b32a066da753"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Set to true while testing so writes/reads hit a separate collection
// instead of real production data. Flip back to false before publishing
// for real use. Matching Firestore rules for "employees_test" are required
// (see the rules update alongside this change).
const IS_TEST_MODE = false;
const employeesCollection = collection(db, IS_TEST_MODE ? "employees_test" : "employees");

// Converts a Firestore document into the internal employee shape used by
// index.js / the D3 chart. Manager relationships resolve by ID (reportingTo
// = employee number, or "ROOT-ARNAV" / "ROOT-SHRIKANT"), not by name.
function mapDocToEmployee(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    parentId: d.reportingTo || null,
    name: d.fullName || "",
    designation: d.jobTitle || "",
    reportingTo: d.reportingTo || "",
    email: d.email || "",
    department: d.department || "",
    subDepartment: d.subDepartment || "",
    location: d.location || "",
    secondaryTitle: d.secondaryJobTitle || "",
    dottedLineManager: d.dottedLineManager || "",
    dateOfJoining: d.dateOfJoining || "",
    virtual: false,
    hidden: false,
    isPlaceholder: !!d.isPlaceholder,
    wasPlaceholder: !!d.wasPlaceholder
  };
}

export async function loadEmployeesFromFirestore() {
  const snapshot = await getDocs(employeesCollection);
  return snapshot.docs.map(mapDocToEmployee);
}

// Live connection — calls onChange(employees) whenever the collection
// changes, from this tab or any other user. onError fires if the
// connection drops, so the UI can warn the user their view may be stale.
export function subscribeToFirestore(onChange, onError) {
  return onSnapshot(
    employeesCollection,
    snapshot => onChange(snapshot.docs.map(mapDocToEmployee)),
    error => {
      console.error("Firestore live sync error:", error);
      onError?.(error);
    }
  );
}

// Required because the Firestore rule only allows writes from an
// authenticated user (allow write: if request.auth != null).
export function signInAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function isSignedIn() {
  return !!auth.currentUser;
}

export function signOutAdmin() {
  return signOut(auth);
}

// Lets index.js react to sign-in/sign-out (e.g. show/hide Sign Out) without polling.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, user => callback(!!user));
}

// Writes/updates every employee passed in, and deletes only the specific
// IDs in deletedIds (employees actually deleted this session). Deliberately
// does NOT delete anything merely absent from employeeList — that would
// silently wipe out an employee a different user added concurrently.
// Callers should exclude the hardcoded company root + director nodes.
export async function publishEmployeesToFirestore(employeeList, deletedIds = []) {
  const batch = writeBatch(db);

  employeeList.forEach(emp => {
    batch.set(doc(employeesCollection, String(emp.id)), {
      employeeNumber: String(emp.id),
      fullName: emp.name || "",
      jobTitle: emp.designation || "",
      reportingTo: emp.parentId || "",
      email: emp.email || "",
      department: emp.department || "",
      subDepartment: emp.subDepartment || "",
      location: emp.location || "",
      secondaryJobTitle: emp.secondaryTitle || "",
      dottedLineManager: emp.dottedLineManager || "",
      dateOfJoining: emp.dateOfJoining || "",
      isPlaceholder: !!emp.isPlaceholder,
      wasPlaceholder: !!emp.wasPlaceholder
    });
  });

  const stillPresent = new Set(employeeList.map(e => String(e.id)));
  deletedIds.forEach(id => {
    if (!stillPresent.has(String(id))) batch.delete(doc(employeesCollection, String(id)));
  });

  await batch.commit();
}

window.FirebaseSync = {
  loadEmployeesFromFirestore,
  subscribeToFirestore,
  signInAdmin,
  isSignedIn,
  signOutAdmin,
  watchAuthState,
  publishEmployeesToFirestore
};