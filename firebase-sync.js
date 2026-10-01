// firebase-sync.js — all Firestore/Auth communication for the org chart.
// Loaded as a <script type="module">; exposes functions on window.FirebaseSync
// so the plain (non-module) index.js can call them.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot, doc, writeBatch, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
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
const historyCollection = collection(db, IS_TEST_MODE ? "publishHistory_test" : "publishHistory");

// How long version-history entries are kept. Enforced by the app itself
// (pruned as part of each publish's batch write) rather than a Firestore
// TTL policy, so it doesn't depend on separate console configuration.
const HISTORY_RETENTION_DAYS = 30;
function historyCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  return Timestamp.fromDate(cutoff);
}

// Converts the flat shape stored in Firestore back into the internal
// employee shape used by index.js / the D3 chart. Manager relationships
// resolve by ID (reportingTo = employee number, or the company root ID for
// top-level directors), not by name. Shared by the live loader/listener and
// by version-history entries, so both stay in sync with one field mapping.
function mapDataToEmployee(id, d) {
  return {
    id,
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

function mapDocToEmployee(docSnap) {
  return mapDataToEmployee(docSnap.id, docSnap.data());
}

// The reverse direction: internal employee object -> flat Firestore shape.
// Used both for the live employees collection and for history snapshots.
function buildEmployeeDocData(emp) {
  return {
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
//
// Also records this publish as a version-history entry (for rollback) and
// prunes history entries older than the retention window, in the same
// batch as the employee writes so it's all-or-nothing with the publish.
export async function publishEmployeesToFirestore(employeeList, deletedIds = []) {
  const batch = writeBatch(db);

  employeeList.forEach(emp => {
    batch.set(doc(employeesCollection, String(emp.id)), buildEmployeeDocData(emp));
  });

  const stillPresent = new Set(employeeList.map(e => String(e.id)));
  deletedIds.forEach(id => {
    if (!stillPresent.has(String(id))) batch.delete(doc(employeesCollection, String(id)));
  });

  batch.set(doc(historyCollection), {
    employees: employeeList.map(buildEmployeeDocData),
    publishedAt: Timestamp.now(),
    publishedBy: auth.currentUser?.email || "Unknown"
  });

  const staleHistory = await getDocs(query(historyCollection, where("publishedAt", "<", historyCutoff())));
  staleHistory.docs.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

// Fetches version-history entries from the retention window, newest first.
// Each entry carries its full employee snapshot so Restore can use it
// directly without a second fetch. Requires admin sign-in (see Firestore
// rules — history read access is pinned to the same admin UID as writes).
export async function loadPublishHistory() {
  const snapshot = await getDocs(query(
    historyCollection,
    where("publishedAt", ">=", historyCutoff()),
    orderBy("publishedAt", "desc")
  ));
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      publishedAt: data.publishedAt?.toDate?.() || null,
      publishedBy: data.publishedBy || "Unknown",
      employees: (data.employees || []).map(e => mapDataToEmployee(e.employeeNumber, e))
    };
  });
}

window.FirebaseSync = {
  loadEmployeesFromFirestore,
  subscribeToFirestore,
  signInAdmin,
  isSignedIn,
  signOutAdmin,
  watchAuthState,
  publishEmployeesToFirestore,
  loadPublishHistory
};
