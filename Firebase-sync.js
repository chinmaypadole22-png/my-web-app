// firebase-sync.js
// Handles all communication with Firebase/Firestore for the org chart.
// Loaded as a <script type="module"> — exposes functions on window.FirebaseSync
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
const employeesCollection = collection(db, "employees");

// Converts a Firestore document into the internal employee object shape
// used by index.js / the D3 org chart (id, parentId, name, designation, etc).
// Manager relationships are resolved by ID (reportingTo = employee number,
// or "ROOT-ARNAV" / "ROOT-SHRIKANT" for the two hardcoded directors) —
// not by name-matching.
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

// One-time fetch of all employees, used on initial page load.
export async function loadEmployeesFromFirestore() {
  const snapshot = await getDocs(employeesCollection);
  return snapshot.docs.map(mapDocToEmployee);
}

// Keeps a live connection open; calls onChange(employees) whenever
// the employees collection changes (from this tab or any other user).
// Returns the unsubscribe function in case it's ever needed.
export function subscribeToFirestore(onChange) {
  return onSnapshot(
    employeesCollection,
    snapshot => onChange(snapshot.docs.map(mapDocToEmployee)),
    error => console.error("Firestore live sync error:", error)
  );
}

// Admin sign-in — required because the Firestore security rule only
// allows writes from an authenticated user (allow write: if request.auth != null).
export function signInAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function isSignedIn() {
  return !!auth.currentUser;
}

export function signOutAdmin() {
  return signOut(auth);
}

// Lets index.js react to sign-in/sign-out (e.g. to show/hide a Sign Out
// button) without polling isSignedIn() manually.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, user => callback(!!user));
}

// Publishes the full current employee list to Firestore: writes/updates
// every employee passed in, and deletes any Firestore document that's no
// longer present in the list (full-replace, not a diff/patch).
// Callers should exclude the hardcoded company root + director nodes —
// those never get written to Firestore.
export async function publishEmployeesToFirestore(employeeList) {
  const snapshot = await getDocs(employeesCollection);
  const existingIds = new Set(snapshot.docs.map(d => d.id));
  const newIds = new Set(employeeList.map(e => String(e.id)));
  const batch = writeBatch(db);

  employeeList.forEach(emp => {
    batch.set(doc(db, "employees", String(emp.id)), {
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

  existingIds.forEach(id => {
    if (!newIds.has(id)) batch.delete(doc(db, "employees", id));
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