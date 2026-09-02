// firebase-sync.js
// Handles all communication with Firebase/Firestore for the org chart.
// Loaded as a <script type="module"> — exposes functions on window.FirebaseSync
// so the plain (non-module) index.js can call them.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

window.FirebaseSync = { loadEmployeesFromFirestore, subscribeToFirestore };