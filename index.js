// Global State & Constants
let chart = null, employees = [], allExpanded = false;
let currentLayout = "top"; // "top" = vertical (top-to-bottom), "left" = horizontal (left-to-right)
let editMode = false, dragState = null, dropTargetEl = null;
let undoStack = [];
const MAX_UNDO_STEPS = 20;
let hasUnpublishedChanges = false;
let deletedEmployeeIds = [];

// Only Techture itself is a hardcoded virtual node. Top-level directors are
// no longer hardcoded by name — anyone whose "Reporting To" is blank (or,
// going forward, literally "Techture") is treated as reporting directly to
// the company root. This is fully data-driven: however many people qualify,
// that's how many direct children Techture gets, no code change needed if
// the number of directors changes later.
const COMPANY_ROOT = { id: "__COMPANY_ROOT__", parentId: null, name: "Techture", designation: "", virtual: true, hidden: false, companyRoot: true };
const REQUIRED_COLUMNS = ["Employee Number", "Full Name", "Job Title", "Reporting To"];
const CSV_COLUMNS = ["Employee Number", "Full Name", "Job Title", "Reporting To", "Email", "Department", "Sub Department", "Location", "Secondary Job Title", "Dotted Line Manager", "Date of Joining", "Is Placeholder", "Was Placeholder"];
const MAX_AUTO_EXPAND_LEVEL = 3;

// DOM Elements
const excelInput = document.getElementById("excel-file");
const fitButton = document.getElementById("fit-button");
const layoutToggleButton = document.getElementById("layout-toggle-button");
const layoutToggleLabel = document.getElementById("layout-toggle-label");
const editModeButton = document.getElementById("edit-mode-button");
const editModeLabel = document.getElementById("edit-mode-label");
const addPlaceholderButton = document.getElementById("add-placeholder-button");
const toHireOverlay = document.getElementById("to-hire-overlay");
const toHireCountToggle = document.getElementById("to-hire-count-toggle");
const toHireCountInput = document.getElementById("to-hire-count-input");
const toHireManagerToggle = document.getElementById("to-hire-manager-toggle");
const toHireManagerPicker = document.getElementById("to-hire-manager-picker");
const toHireManagerSearch = document.getElementById("to-hire-manager-search");
const toHireManagerResults = document.getElementById("to-hire-manager-results");
const toHireManagerSelected = document.getElementById("to-hire-manager-selected");
const toHireDepartmentToggle = document.getElementById("to-hire-department-toggle");
const toHireDepartmentSelect = document.getElementById("to-hire-department-select");
const toHireSubDepartmentToggle = document.getElementById("to-hire-subdepartment-toggle");
const toHireSubDepartmentSelect = document.getElementById("to-hire-subdepartment-select");
const toHireCancelButton = document.getElementById("to-hire-cancel");
const toHireSubmitButton = document.getElementById("to-hire-submit");
const importCompareOverlay = document.getElementById("import-compare-overlay");
const importCompareContent = document.getElementById("import-compare-content");
const importCompareCancelButton = document.getElementById("import-compare-cancel");
const importCompareMergeButton = document.getElementById("import-compare-merge");
const importCompareReplaceButton = document.getElementById("import-compare-replace");
const exportCsvButton = document.getElementById("export-csv-button");
const chartContainer = document.getElementById("chart-container");
const expandCollapseButton = document.getElementById("expand-collapse-button");
const undoButton = document.getElementById("undo-button");
const searchInput = document.getElementById("employee-search");
const searchResults = document.getElementById("search-results");
const searchResultsList = document.getElementById("search-results-list");
const clearSearchButton = document.getElementById("clear-search");
const searchWrapper = document.querySelector(".search-wrapper");
const departmentFilter = document.getElementById("department-filter");
const subDepartmentFilter = document.getElementById("subdepartment-filter");
const locationFilter = document.getElementById("location-filter");
const clearFilterButton = document.getElementById("clear-filter-button");
const employeeDetailPanel = document.getElementById("employee-detail-panel");
const employeeDetailContent = document.getElementById("employee-detail-content");
const closeDetailPanelButton = document.getElementById("close-detail-panel");
const closeStatusPanelButton = document.getElementById("close-status-panel");
const publishMenuWrapper = document.getElementById("publish-menu-wrapper");
const publishMenuButton = document.getElementById("publish-menu-button");
const publishMenuDropdown = document.getElementById("publish-menu-dropdown");
const publishNowItem = document.getElementById("publish-now-item");
const legendWrapper = document.getElementById("legend-wrapper");
const legendButton = document.getElementById("legend-button");
const legendDropdown = document.getElementById("legend-dropdown");
const versionHistoryItem = document.getElementById("version-history-item");
const signInOverlay = document.getElementById("signin-overlay");
const signInForm = document.getElementById("signin-form");
const signInError = document.getElementById("signin-error");
const signInCancelButton = document.getElementById("signin-cancel");
const signOutButton = document.getElementById("signout-button");
const conflictOverlay = document.getElementById("conflict-overlay");
const conflictContent = document.getElementById("conflict-content");
const conflictCancelButton = document.getElementById("conflict-cancel");
const conflictDiscardButton = document.getElementById("conflict-discard");
const conflictPublishAnywayButton = document.getElementById("conflict-publish-anyway");
const historyOverlay = document.getElementById("history-overlay");
const historyContent = document.getElementById("history-content");
const historyCloseButton = document.getElementById("history-close");
let pendingSignInSuccess = null;

// Event Listeners
if (closeDetailPanelButton) closeDetailPanelButton.addEventListener("click", closeEmployeeDetail);
if (closeStatusPanelButton) closeStatusPanelButton.addEventListener("click", closeStatusPanel);
if (excelInput) excelInput.addEventListener("change", handleExcelImport);
if (fitButton) fitButton.addEventListener("click", () => chart?.fit());
if (layoutToggleButton) layoutToggleButton.addEventListener("click", toggleLayout);
if (editModeButton) editModeButton.addEventListener("click", toggleEditMode);
if (addPlaceholderButton) addPlaceholderButton.addEventListener("click", openToHireModal);
if (toHireCancelButton) toHireCancelButton.addEventListener("click", closeToHireModal);
if (toHireSubmitButton) toHireSubmitButton.addEventListener("click", submitToHire);
if (toHireManagerSearch) toHireManagerSearch.addEventListener("input", handleToHireManagerSearchInput);
if (toHireCountToggle) toHireCountToggle.addEventListener("change", () => toHireCountInput.classList.toggle("hidden", !toHireCountToggle.checked));
if (toHireManagerToggle) toHireManagerToggle.addEventListener("change", () => toHireManagerPicker.classList.toggle("hidden", !toHireManagerToggle.checked));
if (toHireDepartmentToggle) toHireDepartmentToggle.addEventListener("change", () => toHireDepartmentSelect.classList.toggle("hidden", !toHireDepartmentToggle.checked));
if (toHireSubDepartmentToggle) toHireSubDepartmentToggle.addEventListener("change", () => toHireSubDepartmentSelect.classList.toggle("hidden", !toHireSubDepartmentToggle.checked));
if (importCompareCancelButton) importCompareCancelButton.addEventListener("click", cancelImportComparison);
if (importCompareMergeButton) importCompareMergeButton.addEventListener("click", () => commitImport("merge"));
if (importCompareReplaceButton) importCompareReplaceButton.addEventListener("click", () => commitImport("replace"));
if (exportCsvButton) exportCsvButton.addEventListener("click", exportToCsv);
if (publishMenuButton) publishMenuButton.addEventListener("click", togglePublishMenu);
if (legendButton) legendButton.addEventListener("click", toggleLegend);
if (publishNowItem) publishNowItem.addEventListener("click", () => { closePublishMenu(); handlePublishClick(); });
if (versionHistoryItem) versionHistoryItem.addEventListener("click", () => { closePublishMenu(); handleVersionHistoryClick(); });
if (historyCloseButton) historyCloseButton.addEventListener("click", closeHistoryPanel);
if (signInForm) signInForm.addEventListener("submit", handleSignInSubmit);
if (signInCancelButton) signInCancelButton.addEventListener("click", closeSignInPrompt);
if (signOutButton) signOutButton.addEventListener("click", () => window.FirebaseSync.signOutAdmin());
if (conflictCancelButton) conflictCancelButton.addEventListener("click", closeConflictModal);
if (conflictPublishAnywayButton) conflictPublishAnywayButton.addEventListener("click", () => { closeConflictModal(); runPublish(); });
if (conflictDiscardButton) conflictDiscardButton.addEventListener("click", discardMineAndLoadLatest);
if (expandCollapseButton) expandCollapseButton.addEventListener("click", toggleAll);
if (undoButton) undoButton.addEventListener("click", undoLastChange);
if (clearSearchButton) clearSearchButton.addEventListener("click", clearSearch);

if (chartContainer) {
    chartContainer.addEventListener("pointerdown", handleCardPointerDown, true);
    chartContainer.addEventListener("click", event => {
        if (editMode && event.target.closest(".employee-card")) {
            event.stopPropagation();
            event.preventDefault();
        }
    }, true);
}

if (searchInput) {
    searchInput.addEventListener("input", handleSearchInput);
    searchInput.addEventListener("keydown", handleSearchKeydown);
    searchInput.addEventListener("focus", handleSearchInput);
}
if (departmentFilter) departmentFilter.addEventListener("change", () => { handleSearchInput(); renderChart(); updateClearFilterButtonVisibility(); });
if (subDepartmentFilter) subDepartmentFilter.addEventListener("change", () => { handleSearchInput(); renderChart(); updateClearFilterButtonVisibility(); });
if (locationFilter) locationFilter.addEventListener("change", () => { handleSearchInput(); renderChart(); updateClearFilterButtonVisibility(); });
if (clearFilterButton) clearFilterButton.addEventListener("click", () => {
    if (departmentFilter) departmentFilter.value = "";
    if (subDepartmentFilter) subDepartmentFilter.value = "";
    if (locationFilter) locationFilter.value = "";
    updateClearFilterButtonVisibility();
    handleSearchInput();
    renderChart();
    showStatus("Filter cleared.", "success");
});

// Shows/hides the persistent "Filtered ×" button — kept outside the
// collapsible search-results panel so it stays visible (and clearable)
// even after the user clicks away and the dropdown panel closes.
function updateClearFilterButtonVisibility() {
    if (!clearFilterButton) return;
    const active = Boolean(departmentFilter?.value || subDepartmentFilter?.value || locationFilter?.value);
    clearFilterButton.classList.toggle("hidden", !active);
}

// Search Logic
let searchDebounceTimer = null;
function handleSearchInput() {
    const query = searchInput.value.trim();
    searchWrapper.classList.toggle("has-value", query.length > 0);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        if (!employees.length) return;
        showSearchResults(findEmployees(query), query);
    }, 150);
}

function handleSearchKeydown(event) {
    if (event.key === "Enter") {
        const matches = findEmployees(searchInput.value.trim());
        if (matches.length > 0) {
            focusEmployee(matches[0].id);
            hideSearchResults();
        }
    } else if (event.key === "Escape") {
        clearSearch();
    }
}

function fuzzyScore(query, text) {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0, score = 0, consecutive = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) {
            score += 1 + consecutive * 2;
            consecutive++;
            qi++;
        } else {
            consecutive = 0;
        }
    }
    if (qi < q.length) return -1;
    if (t.startsWith(q)) score += 15;
    return score;
}

function scoreEmployee(emp, query) {
    const fields = [[emp.name, 3], [emp.id, 2], [emp.designation, 1.5], [emp.department, 1]];
    let best = -1;
    fields.forEach(([text, weight]) => {
        const fieldScore = fuzzyScore(query, String(text || ""));
        if (fieldScore >= 0) best = Math.max(best, fieldScore * weight);
    });
    return best;
}

function findEmployees(query) {
    const department = departmentFilter?.value || "";
    const subDepartment = subDepartmentFilter?.value || "";
    const location = locationFilter?.value || "";

    let pool = employees.filter(emp => !emp.virtual);
    if (department) pool = pool.filter(emp => emp.department === department);
    if (subDepartment) pool = pool.filter(emp => emp.subDepartment === subDepartment);
    if (location) pool = pool.filter(emp => emp.location === location);
    if (!query) return (department || subDepartment || location) ? pool.slice(0, 20) : [];

    return pool
        .map(emp => ({ emp, score: scoreEmployee(emp, query) }))
        .filter(result => result.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(result => result.emp);
}

function highlightMatch(text, query) {
    const safeText = escapeHtml(text);
    if (!query) return safeText;
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return safeText;
    const before = escapeHtml(text.slice(0, index));
    const match = escapeHtml(text.slice(index, index + query.length));
    const after = escapeHtml(text.slice(index + query.length));
    return `${before}<mark>${match}</mark>${after}`;
}

function showSearchResults(matches, query = "") {
    if (!matches.length) {
        searchResultsList.innerHTML = `<div class="search-empty">No employees found</div>`;
    } else {
        searchResultsList.innerHTML = matches.map(emp => `
            <div class="search-result" data-id="${escapeHtml(emp.id)}">
                <div class="search-result-name">${highlightMatch(emp.name, query)}</div>
                <div class="search-result-meta">#${escapeHtml(emp.id)} · ${escapeHtml(emp.designation || "")}</div>
            </div>
        `).join("");

        searchResultsList.querySelectorAll(".search-result").forEach(item => {
            item.addEventListener("click", () => {
                focusEmployee(item.dataset.id);
                hideSearchResults();
            });
        });
    }
    searchResults.classList.remove("hidden");
}

function hideSearchResults() { searchResults.classList.add("hidden"); }

function clearSearch() {
    searchInput.value = "";
    searchWrapper.classList.remove("has-value");
    hideSearchResults();
    renderChart();
}

function populateFilters() {
    if (!departmentFilter || !subDepartmentFilter || !locationFilter) return;
    const departments = [...new Set(employees.filter(e => !e.virtual && e.department).map(e => e.department))].sort();
    const subDepartments = [...new Set(employees.filter(e => !e.virtual && e.subDepartment).map(e => e.subDepartment))].sort();
    const locations = [...new Set(employees.filter(e => !e.virtual && e.location).map(e => e.location))].sort();

    departmentFilter.innerHTML = `<option value="">All Departments</option>` +
        departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    subDepartmentFilter.innerHTML = `<option value="">All Sub-Depts</option>` +
        subDepartments.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    locationFilter.innerHTML = `<option value="">All Locations</option>` +
        locations.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
}

document.addEventListener("click", event => {
    if (searchWrapper && !searchWrapper.contains(event.target)) hideSearchResults();
    if (publishMenuWrapper && !publishMenuWrapper.contains(event.target)) closePublishMenu();
    if (legendWrapper && !legendWrapper.contains(event.target)) closeLegend();
});

function focusEmployee(employeeId) {
    if (!chart) return;
    const employee = employees.find(item => String(item.id) === String(employeeId));
    if (!employee) return;

    const ancestors = [];
    const seen = new Set([String(employee.id)]);
    let current = employee;
    while (current?.parentId) {
        if (seen.has(String(current.parentId))) break; // cycle detected — stop safely instead of looping forever
        seen.add(String(current.parentId));
        ancestors.push(current.parentId);
        current = employees.find(item => item.id === current.parentId);
    }

    renderChart({ expandIds: ancestors.reverse(), highlightId: employeeId, centerId: employeeId });
}

// Excel Import
async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ""; // allow re-uploading the same file if cancelled

    const isCsv = file.name.endsWith(".csv");
    if (!isCsv && !file.name.endsWith(".xlsx")) {
        return showStatus("Please select an .xlsx or .csv file.", "error");
    }

    try {
        showStatus("Reading file...", "success");
        const workbook = isCsv
            ? XLSX.read(await file.text(), { type: "string" })
            : XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) throw new Error("No worksheet found in workbook.");
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
        if (!rows.length) throw new Error("Worksheet contains no records.");

        validateColumns(rows);
        const candidateEmployees = buildEmployeeData(rows);

        const validation = validateEmployees(candidateEmployees);
        showValidationResults(validation, file.name);

        if (validation.errors.length > 0) {
            showStatus("The organization data contains errors. Review the Data Status panel.", "error");
            return;
        }

        // Compare the validated candidate against what's currently loaded.
        // If there are employees missing from the new file (potential
        // deletions), show a modal asking how to proceed. If nothing's
        // missing, commit directly — adding people is never destructive.
        const comparison = compareImportAgainstCurrent(candidateEmployees);

        if (comparison.missing.length > 0) {
            pendingImport = { candidateEmployees, comparison };
            showImportComparisonModal(comparison);
        } else {
            finalizeImport(candidateEmployees, []);
            if (comparison.added.length > 0) {
                showStatus(`${comparison.added.length} new employee${comparison.added.length > 1 ? "s" : ""} added.`, "success");
            }
        }
    } catch (error) {
        console.error("Excel import error:", error);
        showStatus("Import failed: " + error.message, "error");
    }
}

function validateColumns(rows) {
    const available = Object.keys(rows[0] || {});
    const missing = REQUIRED_COLUMNS.filter(col => !available.includes(col));
    if (missing.length) throw new Error("Missing required columns: " + missing.join(", "));
}

// Computes a signature for a placeholder based on the fields a user
// actually chooses when creating one — used to match re-imported
// placeholders back to their existing counterparts and avoid duplicates.
function placeholderSignature(emp) {
    return [normalizeName(emp.name), normalizeName(emp.reportingTo), normalizeName(emp.department), normalizeName(emp.subDepartment)].join("|");
}

function buildEmployeeData(rows) {
    const data = [{ ...COMPANY_ROOT }];
    const realEmployees = rows.map(row => ({
        id: String(row["Employee Number"] ?? "").trim(),
        parentId: null,
        name: String(row["Full Name"] ?? "").trim(),
        designation: String(row["Job Title"] ?? "").trim(),
        reportingTo: String(row["Reporting To"] ?? "").trim(),
        email: String(row["Email"] ?? "").trim(),
        department: String(row["Department"] ?? "").trim(),
        subDepartment: String(row["Sub Department"] ?? "").trim(),
        location: String(row["Location"] ?? "").trim(),
        secondaryTitle: String(row["Secondary Job Title"] ?? "").trim(),
        dottedLineManager: String(row["Dotted Line Manager"] ?? "").trim(),
        dateOfJoining: String(row["Date of Joining"] ?? "").trim(),
        virtual: false,
        hidden: false,
        isPlaceholder: normalizeName(row["Is Placeholder"]) === "yes",
        wasPlaceholder: normalizeName(row["Was Placeholder"]) === "yes"
    }));

    // Blank-ID placeholders get a unique internal ID so they can be
    // individually tracked, deleted, undone, and published without
    // collisions. Previously they'd all share an empty string as their ID.
    const existingPlaceholders = employees.filter(e => e.isPlaceholder && !e.virtual);
    const sigToExisting = new Map();
    existingPlaceholders.forEach(ep => {
        const sig = placeholderSignature(ep);
        if (!sigToExisting.has(sig)) sigToExisting.set(sig, []);
        sigToExisting.get(sig).push(ep);
    });

    realEmployees.forEach(emp => {
        if (emp.id) return; // has a real Employee Number, nothing to fix
        if (emp.isPlaceholder) {
            // Try to match back to an existing placeholder by signature
            const sig = placeholderSignature(emp);
            const candidates = sigToExisting.get(sig);
            if (candidates && candidates.length > 0) {
                emp.id = candidates.shift().id; // reuse existing ID, consume the match
            } else {
                emp.id = `PH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            }
        } else {
            emp.id = `PH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        }
    });

    const nameLookup = new Map();
    realEmployees.forEach(emp => {
        const key = normalizeName(emp.name);
        if (key && !nameLookup.has(key)) nameLookup.set(key, emp);
    });

    realEmployees.forEach(emp => {
        const manager = normalizeName(emp.reportingTo);
        emp.parentId = nameLookup.get(manager)?.id || COMPANY_ROOT.id;
    });

    return [...data, ...realEmployees];
}

// Import comparison — compares a validated candidate employee list against
// what's currently loaded, identifying who's missing (potential deletion)
// and who's new (addition). Placeholders are excluded from both sides of
// the comparison on purpose — they're in-app constructs that will never
// appear in any real Excel file, so comparing them would produce false
// "missing" results on every single import.
let pendingImport = null;

function compareImportAgainstCurrent(candidateEmployees) {
    const currentReal = employees.filter(e => !e.virtual && !e.isPlaceholder);
    const candidateReal = candidateEmployees.filter(e => !e.virtual && !e.isPlaceholder);

    const currentIds = new Map(currentReal.map(e => [String(e.id), e]));
    const candidateIds = new Set(candidateReal.map(e => String(e.id)));

    const missing = [];
    currentIds.forEach((emp, id) => {
        if (!candidateIds.has(id)) missing.push(emp);
    });

    const added = candidateReal.filter(e => !currentIds.has(String(e.id)));

    return { missing, added };
}

function showImportComparisonModal(comparison) {
    let html = "";
    if (comparison.missing.length > 0) {
        html += `<div class="import-compare-section">`;
        html += `<div class="import-compare-section-title">Missing from new file (${comparison.missing.length})</div>`;
        comparison.missing.forEach(emp => {
            html += `<div class="import-compare-name">${escapeHtml(emp.name)} (#${escapeHtml(emp.id)})</div>`;
        });
        html += `</div>`;
    }
    if (comparison.added.length > 0) {
        html += `<div class="import-compare-section">`;
        html += `<div class="import-compare-section-title">New in file (${comparison.added.length})</div>`;
        comparison.added.forEach(emp => {
            html += `<div class="import-compare-name">${escapeHtml(emp.name)} (#${escapeHtml(emp.id)})</div>`;
        });
        html += `</div>`;
    }
    importCompareContent.innerHTML = html;
    importCompareOverlay.classList.add("open");
    importCompareOverlay.setAttribute("aria-hidden", "false");
}

function closeImportComparisonModal() {
    importCompareOverlay.classList.remove("open");
    importCompareOverlay.setAttribute("aria-hidden", "true");
}

function cancelImportComparison() {
    pendingImport = null;
    closeImportComparisonModal();
    showStatus("Import cancelled.", "success");
}

function commitImport(mode) {
    if (!pendingImport) return;
    const { candidateEmployees, comparison } = pendingImport;
    const idsToDelete = mode === "replace" ? comparison.missing.map(e => String(e.id)) : [];
    pendingImport = null;
    closeImportComparisonModal();
    finalizeImport(candidateEmployees, idsToDelete);

    if (mode === "replace" && comparison.missing.length > 0) {
        showStatus(
            `Import complete. ${comparison.missing.length} removed, ${comparison.added.length} added. Publish to make this live.`,
            "success"
        );
    } else {
        showStatus(
            `Import complete (merge). ${comparison.added.length} new employee${comparison.added.length !== 1 ? "s" : ""} added. Publish to make this live.`,
            "success"
        );
    }
}

// The single place that actually commits an import — used by both the
// direct path (no missing employees, no modal needed) and the modal's
// two commit buttons (Replace / Merge). Keeps existing placeholders
// that aren't in the import file, since they're in-app constructs.
function finalizeImport(candidateEmployees, idsToDelete) {
    // Preserve existing placeholders — they're invisible to the
    // comparison and should survive any import unchanged.
    const existingPlaceholders = employees.filter(e => e.isPlaceholder && !e.virtual);
    const candidateIds = new Set(candidateEmployees.map(e => String(e.id)));
    const placeholdersToPreserve = existingPlaceholders.filter(e => !candidateIds.has(String(e.id)));

    setEmployees([...candidateEmployees, ...placeholdersToPreserve]);

    allExpanded = false;
    updateExpandButton();
    populateFilters();
    updateClearFilterButtonVisibility();
    clearSearch();
    createChart();
    // Reset FIRST (which clears deletedEmployeeIds along with the undo
    // stack), THEN stage the Replace deletions — so they're written into a
    // freshly-cleared list rather than being immediately wiped by the reset.
    resetUndoHistory(true);

    if (idsToDelete.length > 0) {
        deletedEmployeeIds = [...new Set([...deletedEmployeeIds, ...idsToDelete])];
    }
}

function normalizeName(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }

function validateEmployees(data) {
    const errors = [], warnings = [];
    const realEmployees = data.filter(e => !e.virtual);
    const idMap = new Map();

    realEmployees.forEach(e => {
        if (!e.id && !e.isPlaceholder) errors.push(`${e.name || "Unnamed employee"} has no Employee Number.`);
        else if (e.id) idMap.set(e.id, (idMap.get(e.id) || 0) + 1);
    });

    idMap.forEach((count, id) => { if (count > 1) errors.push(`Duplicate Employee Number: ${id}`); });

    // Anyone with a blank Reporting To is a top-level director, reporting
    // directly to Techture — fully data-driven, not a hardcoded name list.
    const rootDirectors = [];

    realEmployees.forEach(e => {
        const manager = normalizeName(e.reportingTo);
        if (!manager) {
            rootDirectors.push(e.name || `Employee #${e.id}`);
            return;
        }
        // A self-reference used to be a silent, confusing cycle bug (someone
        // listing their own name instead of leaving the field blank). Now
        // it's a hard error, since blank is the one supported way to mark a
        // top-level director.
        if (manager === normalizeName(e.name)) {
            errors.push(`${e.name} lists themselves as their own manager — blank the "Reporting To" field instead if they're a top-level director.`);
            return;
        }
        const nameMatch = manager === normalizeName(COMPANY_ROOT.name) ||
                      realEmployees.some(c => normalizeName(c.name) === manager);
        // Live Firestore data uses IDs (e.g. "EMP002") in reportingTo rather
        // than names — accept that scheme too.
        const idMatch = e.reportingTo === COMPANY_ROOT.id ||
                      realEmployees.some(c => c.id === e.reportingTo);
        if (!nameMatch && !idMatch) errors.push(`${e.name} → manager "${e.reportingTo}" was not found`);
    });

    return { totalEmployees: realEmployees.length, rootDirectors, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// D3 Chart Creation
function createChart() {
    document.getElementById("chart-container").innerHTML = "";

    computeFilterFlags();
    chart = new d3.OrgChart()
        .container("#chart-container")
        .data(employees)
        .layout(currentLayout)
        .nodeWidth(node => node.data.companyRoot ? 200 : 190)
        .nodeHeight(node => node.data.companyRoot ? 150 : 88)
        .childrenMargin(() => 116)
        .compactMarginBetween(() => 42)
        .compactMarginPair(() => 42)
        .neighbourMargin(() => 25)
        .initialExpandLevel(1)
        .pagingStep(() => 5)
        .minPagingVisibleNodes(() => 3)
        .duration(500)
        .nodeContent(node => {
            const data = node.data;
            const filterClass = data.filterMatch ? "filter-match" : (data.filterDimmed ? "filter-dimmed" : "");
            if (data.companyRoot) {
                const { total, breakdown } = computeHeadcountSummary();
                const breakdownHtml = breakdown.map(([loc, count]) => `
                    <div class="company-root-location-row">
                        <span>${escapeHtml(loc)}</span><span>${count}</span>
                    </div>`).join("");
                return `
                    <div class="company-root-card ${filterClass}">
                        <img src="techture-logo.png" class="company-root-logo" alt="Techture">
                        <div class="company-root-total">${total} Employees</div>
                        <div class="company-root-breakdown">${breakdownHtml}</div>
                    </div>`;
            }
            const empId = data.virtual || data.isPlaceholder ? "" : `#${escapeHtml(data.id)}`;
            const baseClass = data.isPlaceholder ? "employee-card placeholder-card" : "employee-card";
            const cardClass = `${baseClass} ${locationCardClass(data.location)} ${filterClass}`.trim();
            return `
                <div class="${cardClass}" data-drag-id="${escapeHtml(data.id)}" data-draggable="${!data.virtual}">
                    <div class="photo-wrapper"><div class="employee-photo"></div></div>
                    <div class="employee-content">
                        <div class="employee-id">${empId}</div>
                        <div class="employee-name">${escapeHtml(shortenNameForCard(data.name))}</div>
                        ${cardLine("employee-designation", data.designation)}
                        ${cardLine("employee-department", data.department)}
                        ${cardLine("employee-subdepartment", data.subDepartment)}
                        ${cardLine("employee-location", data.location)}
                    </div>
                </div>`;
        })
        .buttonContent(({ node }) => {
            if (node.data.companyRoot) return "";
            const count = node.data._directSubordinates || 0;
            if (count === 0) return "";
            const collapsed = !node.children || node.children.length === 0;
            return `
                <div class="child-count">
                    <span class="toggle-icon ${collapsed ? "collapsed" : ""}"></span>
                    <span class="count-number">${count}</span>
                </div>`;
        })
        .onNodeClick(node => openEmployeeDetail(node.data))
        .render();

    setTimeout(() => chart?.fit(), 500);
}

// Shortens a full name to first + last token only, for the org chart card
// display specifically. Doesn't touch the underlying data.name anywhere —
// detail panel, search, exports, and Firestore all keep the full name.
function shortenNameForCard(fullName) {
    const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return fullName || "";
    return `${parts[0]} ${parts[parts.length - 1]}`;
}

// Maps a location to a card background class. Unrecognized/blank locations
// fall back to "location-other" (or no class at all if blank), so adding a
// new office location later just needs a new CSS rule, not a code change
// here unless it should get its own distinct color. Noida matches as a
// substring (not exact) since the real data uses "Greater Noida" — this
// also covers likely future variants like "Noida Extension" the same way.
// Total real headcount (placeholders excluded — they're future hires, not
// current staff) plus a per-location breakdown, sorted by count descending.
function computeHeadcountSummary() {
    const real = employees.filter(e => !e.virtual && !e.isPlaceholder);
    const counts = new Map();
    real.forEach(e => {
        const loc = (e.location || "").trim() || "Unspecified";
        counts.set(loc, (counts.get(loc) || 0) + 1);
    });
    return { total: real.length, breakdown: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
}

function locationCardClass(location) {
    const norm = normalizeName(location);
    if (!norm) return "";
    if (norm === "nagpur") return "location-nagpur";
    if (norm === "indore") return "location-indore";
    if (norm.includes("noida")) return "location-noida";
    return "location-other";
}

// Renders one optional card line — omitted entirely if the value is blank,
// so virtual nodes (company root, directors) without department/location
// data don't show empty gaps.
function cardLine(className, value) {
    return value ? `<div class="${className}">${escapeHtml(value)}</div>` : "";
}

// Computes which employees match the active Department/Sub-Department/
// Location filters, and tags every employee with filterMatch / filterDimmed
// flags that nodeContent reads to style the card. "Relevant" (not dimmed,
// but not a match either) = a match's entire management chain up to the
// top, and a match's entire team down to the bottom — only employees with
// no connection at all to any match get dimmed. Returns the set of match IDs.
function computeFilterFlags() {
    const department = departmentFilter?.value || "";
    const subDepartment = subDepartmentFilter?.value || "";
    const location = locationFilter?.value || "";

    if (!department && !subDepartment && !location) {
        employees.forEach(e => { e.filterMatch = false; e.filterDimmed = false; });
        return new Set();
    }

    const byId = new Map(employees.map(e => [String(e.id), e]));
    const matchIds = new Set();
    employees.forEach(e => {
        if (e.virtual) return;
        const deptOk = !department || e.department === department;
        const subDeptOk = !subDepartment || e.subDepartment === subDepartment;
        const locOk = !location || e.location === location;
        if (deptOk && subDeptOk && locOk) matchIds.add(String(e.id));
    });

    const relevantIds = new Set(matchIds);
    ancestorIdsOf(matchIds, byId).forEach(id => relevantIds.add(id));

    const childrenOf = new Map();
    employees.forEach(e => {
        if (!e.parentId) return;
        const key = String(e.parentId);
        if (!childrenOf.has(key)) childrenOf.set(key, []);
        childrenOf.get(key).push(e);
    });
    const queue = [...matchIds];
    while (queue.length) {
        const id = queue.shift();
        (childrenOf.get(id) || []).forEach(kid => {
            const kidId = String(kid.id);
            if (!relevantIds.has(kidId)) {
                relevantIds.add(kidId);
                queue.push(kidId);
            }
        });
    }

    employees.forEach(e => {
        const id = String(e.id);
        e.filterMatch = matchIds.has(id);
        e.filterDimmed = !relevantIds.has(id);
    });

    if (matchIds.size === 0) showStatus("No employees match this filter.", "error");
    return matchIds;
}

function ancestorIdsOf(ids, byId = new Map(employees.map(e => [String(e.id), e]))) {
    const result = new Set();
    ids.forEach(id => {
        const seen = new Set([String(id)]);
        let current = byId.get(String(id));
        while (current?.parentId) {
            const parentId = String(current.parentId);
            if (seen.has(parentId)) break; // cycle detected — stop safely instead of looping forever
            seen.add(parentId);
            result.add(parentId);
            current = byId.get(parentId);
        }
    });
    return result;
}

// The single place that re-renders the chart. Always recomputes filter
// flags first, so the highlight/dim state stays correct no matter what
// triggered the re-render (an edit, undo, publish, live sync, etc.) — one
// consolidated function instead of repeating filter logic at every call site.
function renderChart(options = {}) {
    if (!chart) return;
    const matches = computeFilterFlags();
    // Always clear any previous search highlight first. Without this, a
    // highlighted node from an earlier search stays highlighted forever —
    // it's only ever re-applied below if THIS render explicitly asks for one.
    let c = chart.data(employees).clearHighlighting();
    ancestorIdsOf(matches).forEach(id => { c = c.setExpanded(id, true); });
    if (options.expandId) c = c.setExpanded(options.expandId, true);
    (options.expandIds || []).forEach(id => { c = c.setExpanded(id, true); });
    if (options.highlightId) c = c.setHighlighted(options.highlightId);
    if (options.centerId) c = c.setCentered(options.centerId);
    c.render();
}

function employeeDepth(employee) {
    let depth = 0;
    let current = employee;
    const seen = new Set([employee?.id]);
    while (current?.parentId) {
        if (seen.has(current.parentId)) break; // cycle detected — stop safely instead of looping forever
        seen.add(current.parentId);
        depth++;
        current = employees.find(e => e.id === current.parentId);
    }
    return depth;
}

function toggleAll() {
    if (!chart) return;
    if (!allExpanded) {
        employees.forEach(e => {
            if (employeeDepth(e) <= MAX_AUTO_EXPAND_LEVEL) chart.setExpanded(e.id, true);
        });
        chart.clearHighlighting().render();
        if (employees.length > 150) showStatus(`Expanded the top ${MAX_AUTO_EXPAND_LEVEL} levels to keep the chart readable.`, "success");
        allExpanded = true;
    } else {
        chart.collapseAll().setExpanded(COMPANY_ROOT.id, true);
        employees.forEach(e => { if (e.parentId === COMPANY_ROOT.id) chart.setExpanded(e.id, false); });
        chart.clearHighlighting().render();
        allExpanded = false;
    }
    updateExpandButton();
}

function updateExpandButton() {
    if (expandCollapseButton) expandCollapseButton.textContent = allExpanded ? "Collapse All" : "Expand All";
}

// Layout Direction (Vertical <-> Horizontal)
function toggleLayout() {
    if (!chart) return;
    currentLayout = currentLayout === "top" ? "left" : "top";
    chart.layout(currentLayout).clearHighlighting().render();
    updateLayoutToggleButton();
    // Re-fit once the chart's own transition (500ms) has finished moving nodes
    setTimeout(() => chart?.fit(), 550);
}

function updateLayoutToggleButton() {
    if (!layoutToggleButton || !layoutToggleLabel) return;
    const isHorizontal = currentLayout === "left";
    layoutToggleButton.setAttribute("aria-pressed", String(isHorizontal));
    layoutToggleLabel.textContent = isHorizontal ? "Vertical Layout" : "Horizontal Layout";
}

// Drag & Drop Re-parenting
function toggleEditMode() {
    if (!chart) return;
    editMode = !editMode;
    chartContainer.classList.toggle("edit-mode", editMode);
    editModeButton.setAttribute("aria-pressed", String(editMode));
    editModeLabel.textContent = editMode ? "Exit Reorder Mode" : "Reorder Mode";
    showStatus(editMode ? "Drag an employee card onto a new manager to reassign them." : "Reorder mode off.", "success");
    if (!editMode) applyPendingUpdateIfAny();
}

function handleCardPointerDown(event) {
    if (!editMode) return;
    const card = event.target.closest(".employee-card");
    if (!card || card.dataset.draggable !== "true") return;

    event.preventDefault();
    event.stopPropagation();
    dragState = { employeeId: card.dataset.dragId, sourceCard: card, startX: event.clientX, startY: event.clientY, moved: false, ghostEl: null };
    document.addEventListener("pointermove", handleCardPointerMove);
    document.addEventListener("pointerup", handleCardPointerUp, { once: true });
}

function handleCardPointerMove(event) {
    if (!dragState) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(dx, dy) > 4) {
        dragState.moved = true;
        dragState.sourceCard.classList.add("dragging");
        dragState.ghostEl = createDragGhost(dragState.sourceCard);
        document.body.appendChild(dragState.ghostEl);
    }
    if (dragState.moved) {
        positionGhost(dragState.ghostEl, event.clientX, event.clientY);
        updateDropTarget(event.clientX, event.clientY);
    }
}

function handleCardPointerUp(event) {
    document.removeEventListener("pointermove", handleCardPointerMove);
    if (!dragState) return;

    const { employeeId, moved, sourceCard, ghostEl } = dragState;
    sourceCard.classList.remove("dragging");
    if (ghostEl) ghostEl.remove();

    if (moved) {
        const targetCard = cardAtPoint(event.clientX, event.clientY);
        clearDropTarget();
        if (targetCard && canReparent(employeeId, targetCard.dataset.dragId)) {
            snapshotForUndo();
            reparentEmployee(employeeId, targetCard.dataset.dragId);
            const targetId = targetCard.dataset.dragId;
            renderChart({ expandId: targetId, highlightId: employeeId });
            showStatus("Reporting line updated.", "success");
        }
    }
    dragState = null;
}

function createDragGhost(card) {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = card.querySelector(".employee-name")?.textContent || "Employee";
    return ghost;
}

function positionGhost(ghostEl, x, y) {
    if (!ghostEl) return;
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
}

function cardAtPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest(".employee-card") || null;
}

function updateDropTarget(x, y) {
    const card = cardAtPoint(x, y);
    if (!card || !dragState || card.dataset.dragId === dragState.employeeId) {
        clearDropTarget();
        return;
    }
    if (card !== dropTargetEl) clearDropTarget();
    dropTargetEl = card;
    const valid = canReparent(dragState.employeeId, card.dataset.dragId);
    card.classList.toggle("drop-target", valid);
    card.classList.toggle("drop-invalid", !valid);
}

function clearDropTarget() {
    if (dropTargetEl) dropTargetEl.classList.remove("drop-target", "drop-invalid");
    dropTargetEl = null;
}

function canReparent(employeeId, newParentId) {
    if (!employeeId || !newParentId || employeeId === newParentId) return false;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee || employee.parentId === newParentId) return false;
    return !isDescendant(newParentId, employeeId);
}

function reparentEmployee(employeeId, newParentId) {
    if (!canReparent(employeeId, newParentId)) return false;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    const newParent = employees.find(e => String(e.id) === String(newParentId));
    if (!employee || !newParent) return false;
    employee.parentId = newParent.id;
    employee.reportingTo = newParent.name;
    return true;
}

function isDescendant(candidateId, ancestorId) {
    const seen = new Set([candidateId]);
    let current = employees.find(e => e.id === candidateId);
    while (current?.parentId) {
        if (current.parentId === ancestorId) return true;
        if (seen.has(current.parentId)) return false; // cycle detected — stop safely instead of looping forever
        seen.add(current.parentId);
        current = employees.find(e => e.id === current.parentId);
    }
    return false;
}

// UI Status Panels & Details Drawer
let statusHideTimer = null;

function showStatus(message, type = "success") {
    const panel = document.getElementById("status-panel");
    const content = document.getElementById("status-content");
    if (!panel || !content) return;
    clearTimeout(statusHideTimer);
    panel.classList.remove("hidden");
    content.innerHTML = `<div class="status-line status-${type}">${escapeHtml(message)}</div>`;
    statusHideTimer = setTimeout(() => panel.classList.add("hidden"), 4000);
}

function showValidationResults(validation, fileName) {
    const panel = document.getElementById("status-panel");
    const content = document.getElementById("status-content");
    if (!panel || !content) return;

    clearTimeout(statusHideTimer);
    panel.classList.remove("hidden");
    let html = `
        <div class="status-line status-success">✓ File: ${escapeHtml(fileName)}</div>
        <div class="status-line status-success">✓ ${validation.totalEmployees} employees loaded</div>
        <div class="status-line status-success">✓ Techture logo root loaded</div>`;

    (validation.rootDirectors || []).forEach(name => {
        html += `<div class="status-line status-success">✓ ${escapeHtml(name)} reports directly to Techture</div>`;
    });

    validation.warnings.forEach(w => html += `<div class="status-line status-warning">⚠ ${escapeHtml(w)}</div>`);
    validation.errors.forEach(e => html += `<div class="status-line status-error">✕ ${escapeHtml(e)}</div>`);
    content.innerHTML = html;
}

function closeStatusPanel() {
    const panel = document.getElementById("status-panel");
    if (panel) panel.classList.add("hidden");
    clearTimeout(statusHideTimer);
}

function openEmployeeDetail(data) {
    if (!employeeDetailPanel || !employeeDetailContent || !data) return;

    const reportingTo = getManagerDisplayName(data.parentId) || data.reportingTo || "—";

    if (data.virtual) {
        employeeDetailContent.innerHTML = `
            <div class="detail-profile">
                <div class="detail-photo"></div>
                <div>
                    <div class="detail-name">${escapeHtml(data.name || "Unknown")}</div>
                    <div class="detail-designation">${escapeHtml(data.designation || "—")}</div>
                </div>
            </div>
            <div class="detail-section">
                <div class="detail-section-title">Reporting Structure</div>
                ${detailRow("Reporting To", reportingTo)}
            </div>`;
        employeeDetailPanel.classList.add("open");
        employeeDetailPanel.setAttribute("aria-hidden", "false");
        return;
    }

    employeeDetailContent.innerHTML = `
        <div class="detail-profile">
            <div class="detail-photo"></div>
            <div>
                <div class="detail-name">${escapeHtml(data.name || "Unknown")}</div>
                <div class="detail-designation">${escapeHtml(data.designation || "—")}</div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Employee Information</div>
            ${detailField("id", "Employee Number", data.id, !data.isPlaceholder)}
            ${detailField("name", "Full Name", data.name)}
            ${detailField("designation", "Job Title", data.designation)}
            ${detailField("email", "Email", data.email)}
            ${detailField("department", "Department", data.department)}
            ${detailField("subDepartment", "Sub Department", data.subDepartment)}
            ${detailField("location", "Location", data.location)}
            ${detailField("secondaryTitle", "Secondary Job Title", data.secondaryTitle)}
            ${detailField("dateOfJoining", "Date of Joining", data.dateOfJoining)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Reporting Structure</div>
            ${detailRow("Reporting To", reportingTo)}
            ${detailField("dottedLineManager", "Dotted Line Manager", data.dottedLineManager)}
        </div>
        <div class="detail-actions">
            <button type="button" class="detail-save" id="detail-save-button">Save</button>
            <button type="button" class="detail-cancel" id="detail-cancel-button">Cancel</button>
        </div>
        <div class="detail-actions">
            ${data.isPlaceholder ? `<button type="button" class="detail-hire" id="detail-hire-button">Mark as Hired</button>` : ""}
            ${!data.isPlaceholder && data.wasPlaceholder ? `<button type="button" class="detail-unhire" id="detail-unhire-button">Unmark as Hired</button>` : ""}
            <button type="button" class="detail-delete" id="detail-delete-button">Delete</button>
        </div>`;

    employeeDetailPanel.dataset.editingId = data.id;
    document.getElementById("detail-save-button")?.addEventListener("click", saveEmployeeDetail);
    document.getElementById("detail-cancel-button")?.addEventListener("click", () => openEmployeeDetail(data));
    document.getElementById("detail-hire-button")?.addEventListener("click", markAsHired);
    document.getElementById("detail-unhire-button")?.addEventListener("click", unmarkAsHired);
    document.getElementById("detail-delete-button")?.addEventListener("click", deleteEmployee);

    employeeDetailPanel.classList.add("open");
    employeeDetailPanel.setAttribute("aria-hidden", "false");
}

function saveEmployeeDetail() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    const oldId = employee.id;
    const oldName = employee.name;

    const idInput = document.getElementById("detail-id");
    if (idInput && !idInput.disabled) {
        const newId = idInput.value.trim().replace(/^#+/, "");
        if (newId !== oldId && employees.some(e => e !== employee && String(e.id) === String(newId))) {
            showStatus(`Employee Number "${newId}" is already in use. Choose a different one.`, "error");
            return;
        }
    }

    snapshotForUndo();
    const fields = ["id", "name", "designation", "email", "department", "subDepartment", "location", "secondaryTitle", "dateOfJoining", "dottedLineManager"];
    fields.forEach(field => {
        const input = document.getElementById(`detail-${field}`);
        if (!input || input.disabled) return;
        employee[field] = field === "id" ? input.value.trim().replace(/^#+/, "") : input.value.trim();
    });

    if (employee.id !== oldId) {
        employees.forEach(e => { if (e.parentId === oldId) { e.parentId = employee.id; e.reportingTo = employee.name; } });
        deletedEmployeeIds.push(String(oldId));
    }
    if (employee.name !== oldName) employees.forEach(e => { if (e.parentId === employee.id) e.reportingTo = employee.name; });

    renderChart();
    showStatus(`${employee.name || "Employee"} updated.`, "success");
    openEmployeeDetail(employee);
}

function markAsHired() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    snapshotForUndo();
    employee.isPlaceholder = false;
    renderChart();
    showStatus(`${employee.name || "Employee"} marked as hired.`, "success");
    openEmployeeDetail(employee);
}

function unmarkAsHired() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    snapshotForUndo();
    employee.isPlaceholder = true;
    renderChart();
    showStatus(`${employee.name || "Employee"} reverted to a placeholder.`, "success");
    openEmployeeDetail(employee);
}

function deleteEmployee() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    const managerName = getManagerDisplayName(employee.parentId) || "the top level";
    if (!confirm(`Delete ${employee.name || "this employee"}? Their direct reports will move under ${managerName}.`)) return;

    snapshotForUndo();
    deletedEmployeeIds.push(String(employee.id));
    employees.forEach(e => { if (e.parentId === employee.id) { e.parentId = employee.parentId; e.reportingTo = managerName; } });
    setEmployees(employees.filter(e => e.id !== employee.id));

    renderChart();
    closeEmployeeDetail();
    showStatus(`${employee.name || "Employee"} removed. Direct reports now sit under ${managerName}.`, "success");
}

function closeEmployeeDetail() {
    if (!employeeDetailPanel) return;
    employeeDetailPanel.classList.remove("open");
    employeeDetailPanel.setAttribute("aria-hidden", "true");
    applyPendingUpdateIfAny();
}

function detailRow(label, value, type = "") {
    const rawValue = value || "—";
    const valMarkup = (type === "email" && rawValue !== "—")
        ? `<a class="detail-email" href="mailto:${escapeHtml(rawValue)}">${escapeHtml(rawValue)}</a>`
        : escapeHtml(rawValue);

    return `<div class="detail-row"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${valMarkup}</div></div>`;
}

function detailField(field, label, value, disabled = false) {
    return `
        <div class="detail-field">
            <label for="detail-${field}">${escapeHtml(label)}</label>
            <input class="detail-input" id="detail-${field}" type="text" value="${escapeHtml(value || "")}" ${disabled ? "disabled" : ""}>
        </div>`;
}

// To Hire modal — lets the admin optionally configure how many placeholders
// to create, who they report to, and their department/sub-department, all
// in one step, instead of always defaulting to Techture and requiring a
// manual drag afterward. Each of the four options is independently
// optional; anything left unchecked falls back to today's old default.
let toHireSelectedManagerId = null;

function openToHireModal() {
    if (!chart) return showStatus("Chart isn't ready yet — please wait for data to load.", "error");

    toHireCountToggle.checked = false;
    toHireCountInput.value = 1;
    toHireCountInput.classList.add("hidden");

    toHireManagerToggle.checked = false;
    toHireManagerPicker.classList.add("hidden");
    toHireManagerSearch.value = "";
    toHireManagerResults.classList.add("hidden");
    toHireManagerResults.innerHTML = "";
    toHireManagerSelected.classList.add("hidden");
    toHireManagerSelected.innerHTML = "";
    toHireSelectedManagerId = null;

    toHireDepartmentToggle.checked = false;
    toHireDepartmentSelect.classList.add("hidden");
    toHireSubDepartmentToggle.checked = false;
    toHireSubDepartmentSelect.classList.add("hidden");
    populateToHireDropdowns();

    toHireOverlay.classList.add("open");
    toHireOverlay.setAttribute("aria-hidden", "false");
}

function closeToHireModal() {
    toHireOverlay.classList.remove("open");
    toHireOverlay.setAttribute("aria-hidden", "true");
}

function populateToHireDropdowns() {
    const departments = [...new Set(employees.filter(e => !e.virtual && e.department).map(e => e.department))].sort();
    const subDepartments = [...new Set(employees.filter(e => !e.virtual && e.subDepartment).map(e => e.subDepartment))].sort();
    toHireDepartmentSelect.innerHTML = departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    toHireSubDepartmentSelect.innerHTML = subDepartments.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

// Existing placeholders are deliberately excluded as manager candidates —
// picking an unnamed future hire as someone's manager would be ambiguous
// (several could all be labeled "To Hire" with nothing to tell them apart).
function handleToHireManagerSearchInput() {
    const query = toHireManagerSearch.value.trim().toLowerCase();
    if (!query) {
        toHireManagerResults.classList.add("hidden");
        toHireManagerResults.innerHTML = "";
        return;
    }
    const matches = employees
        .filter(e => !e.isPlaceholder)
        .filter(e => e.name.toLowerCase().includes(query) || String(e.id).toLowerCase().includes(query))
        .slice(0, 20);

    toHireManagerResults.innerHTML = matches.length === 0
        ? `<div class="to-hire-manager-empty">No match</div>`
        : matches.map(e => `
            <div class="to-hire-manager-result" data-id="${escapeHtml(e.id)}">
                ${escapeHtml(e.name)}${e.virtual ? "" : ` <span class="to-hire-manager-result-meta">#${escapeHtml(e.id)}</span>`}
            </div>`).join("");

    toHireManagerResults.querySelectorAll(".to-hire-manager-result").forEach(row => {
        row.addEventListener("click", () => selectToHireManager(row.dataset.id));
    });
    toHireManagerResults.classList.remove("hidden");
}

function selectToHireManager(id) {
    const employee = employees.find(e => String(e.id) === String(id));
    if (!employee) return;
    toHireSelectedManagerId = id;
    toHireManagerSearch.value = "";
    toHireManagerResults.classList.add("hidden");
    toHireManagerResults.innerHTML = "";
    toHireManagerSelected.innerHTML = `<span>${escapeHtml(employee.name)}</span><button type="button" class="to-hire-manager-clear" aria-label="Clear selected manager">×</button>`;
    toHireManagerSelected.classList.remove("hidden");
    toHireManagerSelected.querySelector(".to-hire-manager-clear").addEventListener("click", () => {
        toHireSelectedManagerId = null;
        toHireManagerSelected.classList.add("hidden");
        toHireManagerSelected.innerHTML = "";
    });
}

function submitToHire() {
    if (toHireManagerToggle.checked && !toHireSelectedManagerId) {
        return showStatus('Pick an employee from the search results, or uncheck "Reporting Manager".', "error");
    }

    const count = toHireCountToggle.checked ? Math.max(1, Math.min(50, parseInt(toHireCountInput.value, 10) || 1)) : 1;
    const parentId = (toHireManagerToggle.checked && toHireSelectedManagerId) ? toHireSelectedManagerId : COMPANY_ROOT.id;
    const parent = employees.find(e => String(e.id) === String(parentId)) || COMPANY_ROOT;
    const department = toHireDepartmentToggle.checked ? toHireDepartmentSelect.value : "";
    const subDepartment = toHireSubDepartmentToggle.checked ? toHireSubDepartmentSelect.value : "";

    snapshotForUndo();
    const timestamp = Date.now();
    const newPlaceholders = [];
    for (let i = 0; i < count; i++) {
        newPlaceholders.push({
            id: `PH-${timestamp}-${i}`,
            parentId: parent.id,
            name: count > 1 ? `To Hire ${i + 1}` : "To Hire",
            designation: "",
            reportingTo: "",
            email: "",
            department,
            subDepartment,
            location: "",
            secondaryTitle: "",
            dottedLineManager: "",
            dateOfJoining: "",
            virtual: false,
            hidden: false,
            isPlaceholder: true,
            wasPlaceholder: true
        });
    }

    employees.push(...newPlaceholders);
    closeToHireModal();
    renderChart({ expandId: parent.id, centerId: newPlaceholders[0].id });

    const details = [parentId !== COMPANY_ROOT.id ? `under ${parent.name}` : "under Techture"];
    if (department) details.push(department);
    if (subDepartment) details.push(subDepartment);
    showStatus(`${count} placeholder${count > 1 ? "s" : ""} added (${details.join(", ")}).`, "success");
}

function exportToCsv() {
    if (!employees.length) return showStatus("Nothing to export yet.", "error");

    const idToEmployee = new Map(employees.map(e => [String(e.id), e]));
    const rows = employees
        .filter(e => !e.virtual)
        .map(e => {
            const manager = idToEmployee.get(String(e.parentId));
            return [
                e.id, e.name, e.designation, manager ? manager.name : "", e.email, e.department,
                e.subDepartment, e.location, e.secondaryTitle, e.dottedLineManager,
                e.dateOfJoining, e.isPlaceholder ? "Yes" : "No", e.wasPlaceholder ? "Yes" : "No"
            ];
        });

    const worksheet = XLSX.utils.aoa_to_sheet([CSV_COLUMNS, ...rows]);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "org-chart-export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    showStatus("Chart exported to CSV.", "success");
}

function getManagerDisplayName(parentId, list = employees) {
    if (!parentId) return "";
    if (parentId === COMPANY_ROOT.id) return "Techture";
    return list.find(e => String(e.id) === String(parentId))?.name || "";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Firebase live data — initial load + subscription
document.addEventListener("DOMContentLoaded", initializeFromFirestore);

// Merges live Firestore employees with the hardcoded company root. Manager-
// reference sanitization happens once, universally, in setEmployees() below
// — every caller of this function commits the result through setEmployees(),
// so there's no need to duplicate that check here too.
function buildFullEmployeeList(liveEmployees) {
    return [{ ...COMPANY_ROOT }, ...liveEmployees];
}

// The single place `employees` ever gets reassigned, instead of eight
// separate spots each deciding independently whether to defend against bad
// data. Previously this safety check only ran for live-synced Firestore
// data; undo, restoring a historical version, and discarding local changes
// had no such defense at all. Now every wholesale replacement of the
// employee list goes through the same check, regardless of where the data
// came from.
function setEmployees(newList) {
    employees = sanitizeAgainstDanglingManagers(newList);
}

// Moves any employee whose manager reference is missing, unresolvable, or
// points at themselves to report directly to Techture instead, with a
// warning — rather than leaving data in place that could cause a rendering
// crash or an infinite loop later. Virtual nodes (Techture itself) are
// skipped, since they have no manager by definition.
function sanitizeAgainstDanglingManagers(list) {
    const validIds = new Set([COMPANY_ROOT.id, ...list.map(e => String(e.id))]);
    let fixedCount = 0;
    const fixed = list.map(emp => {
        if (emp.virtual) return emp;
        const isSelfReference = emp.parentId && String(emp.parentId) === String(emp.id);
        if (emp.parentId && !isSelfReference && validIds.has(String(emp.parentId))) return emp;
        fixedCount++;
        return { ...emp, parentId: COMPANY_ROOT.id };
    });

    if (fixedCount > 0) {
        showStatus(
            `${fixedCount} employee${fixedCount > 1 ? "s" : ""} had an invalid manager reference (likely edited directly in Firestore) and ${fixedCount > 1 ? "were" : "was"} moved under Techture. Please review and reassign.`,
            "error"
        );
    }

    return fixed;
}

async function initializeFromFirestore() {
    try {
        showStatus("Loading organization data...", "success");
        const liveEmployees = await window.FirebaseSync.loadEmployeesFromFirestore();
        setEmployees(buildFullEmployeeList(liveEmployees));

        allExpanded = false;
        updateExpandButton();
        populateFilters();
        updateClearFilterButtonVisibility();
        clearSearch();
        createChart();
        resetUndoHistory();
        showStatus("Organization data loaded.", "success");

        window.FirebaseSync.subscribeToFirestore(handleLiveUpdate, handleLiveSyncError);
        window.FirebaseSync.watchAuthState(signedIn => {
            if (signOutButton) signOutButton.hidden = !signedIn;
        });
    } catch (error) {
        console.error("Firestore load error:", error);
        showStatus("Could not load live data. You can still load a file manually.", "error");
    }
}

function handleLiveSyncError() {
    showStatus("Live connection lost — you may be viewing outdated data. Refresh to reconnect.", "error");
}

// pendingLiveUpdate and conflictSnapshot are tightly coupled: a conflict
// snapshot is always a frozen copy of a pending update, taken the moment
// the conflict modal opens so its diff can't shift under the user if yet
// another update arrives while they're deciding. Previously each of the
// three places that clear this state picked whichever subset it happened
// to think of — one of them cleared pendingLiveUpdate but left
// conflictSnapshot stale. Centralizing the set/clear operations here means
// every exit path clears both together, every time.
let pendingLiveUpdate = null;
let conflictSnapshot = null;

function setPendingLiveUpdate(update) {
    pendingLiveUpdate = update;
}

function clearPendingLiveUpdate() {
    pendingLiveUpdate = null;
    conflictSnapshot = null;
}

function freezeConflictSnapshot() {
    conflictSnapshot = pendingLiveUpdate;
    return conflictSnapshot;
}

function handleLiveUpdate(liveEmployees) {
    const updated = buildFullEmployeeList(liveEmployees);
    const isBusy = editMode ||
        employeeDetailPanel?.getAttribute("aria-hidden") === "false" ||
        signInOverlay?.classList.contains("open") ||
        importCompareOverlay?.classList.contains("open") ||
        hasUnpublishedChanges;

    if (isBusy) {
        setPendingLiveUpdate(updated);
        showStatus("New updates available — will apply once you finish editing.", "success");
    } else {
        setEmployees(updated);
        resetUndoHistory();
        renderChart();
    }
}

function applyPendingUpdateIfAny() {
    if (!pendingLiveUpdate) return;
    if (hasUnpublishedChanges) {
        showStatus("New updates are available, but you have unpublished local changes. Publish or undo your changes to receive them.", "error");
        return;
    }
    setEmployees(pendingLiveUpdate);
    clearPendingLiveUpdate();
    resetUndoHistory();
    renderChart();
    showStatus("Updated with the latest changes.", "success");
}

// Publish — pushes local employees to Firestore. Requires admin sign-in,
// since the Firestore rule only allows writes from an authenticated user.
async function handlePublishClick() {
    if (!employees.some(e => !e.virtual) && deletedEmployeeIds.length === 0) {
        return showStatus("Nothing to publish yet.", "error");
    }
    if (!window.FirebaseSync.isSignedIn()) return openSignInPrompt(publishFlow);
    publishFlow();
}

// Checks whether the version you're about to publish conflicts with newer
// data that arrived while you were editing (held in pendingLiveUpdate since
// isBusy was true). If it does, shows a preview before publishing rather
// than silently overwriting someone else's changes. If there's newer data
// but it doesn't actually conflict with anything you touched, publishing
// is safe and proceeds normally.
const CONFLICT_FIELDS = [
    { key: "name", label: "Name" },
    { key: "designation", label: "Designation" },
    { key: "email", label: "Email" },
    { key: "department", label: "Department" },
    { key: "subDepartment", label: "Sub-Department" },
    { key: "location", label: "Location" },
    { key: "secondaryTitle", label: "Secondary Title" },
    { key: "dottedLineManager", label: "Dotted-Line Manager" },
    { key: "dateOfJoining", label: "Date of Joining" },
    { key: "parentId", label: "Reporting To", format: (v, list) => getManagerDisplayName(v, list) },
    { key: "isPlaceholder", label: "Status", format: v => (v ? "To Hire" : "Hired") },
];

function computeConflicts(mine, theirs) {
    const theirsById = new Map(theirs.filter(e => !e.virtual).map(e => [String(e.id), e]));
    const edited = [];
    const removedByOthers = [];

    mine.filter(e => !e.virtual).forEach(mineEmp => {
        const theirEmp = theirsById.get(String(mineEmp.id));
        if (!theirEmp) {
            removedByOthers.push(mineEmp);
            return;
        }
        const changedFields = CONFLICT_FIELDS.filter(f => String(mineEmp[f.key] ?? "") !== String(theirEmp[f.key] ?? ""));
        if (changedFields.length > 0) edited.push({ mine: mineEmp, theirs: theirEmp, changedFields });
    });

    return { edited, removedByOthers };
}

function renderConflictModal(edited, removedByOthers, mineList, theirsList) {
    let html = "";
    if (edited.length > 0) {
        html += `<div class="conflict-section-title">Edited by both of you (${edited.length})</div>`;
        edited.forEach(({ mine, theirs, changedFields }) => {
            html += `<div class="conflict-item"><div class="conflict-item-name">${escapeHtml(mine.name || mine.id)}</div>`;
            changedFields.forEach(f => {
                const mineVal = f.format ? f.format(mine[f.key], mineList) : (mine[f.key] || "—");
                const theirVal = f.format ? f.format(theirs[f.key], theirsList) : (theirs[f.key] || "—");
                html += `<div class="conflict-field"><span class="conflict-field-label">${f.label}:</span> yours is "${escapeHtml(mineVal)}", latest is "${escapeHtml(theirVal)}"</div>`;
            });
            html += `</div>`;
        });
    }
    if (removedByOthers.length > 0) {
        html += `<div class="conflict-section-title">Removed by someone else (${removedByOthers.length})</div>`;
        removedByOthers.forEach(emp => {
            html += `<div class="conflict-item"><div class="conflict-item-name">${escapeHtml(emp.name || emp.id)}</div><div class="conflict-field">Publishing your version would bring this employee back.</div></div>`;
        });
    }
    conflictContent.innerHTML = html;
}

function openConflictModal(edited, removedByOthers, mineList, theirsList) {
    renderConflictModal(edited, removedByOthers, mineList, theirsList);
    conflictOverlay.classList.add("open");
    conflictOverlay.setAttribute("aria-hidden", "false");
}

function closeConflictModal() {
    conflictOverlay.classList.remove("open");
    conflictOverlay.setAttribute("aria-hidden", "true");
}

function publishFlow() {
    if (pendingLiveUpdate) {
        const snapshot = freezeConflictSnapshot();
        const { edited, removedByOthers } = computeConflicts(employees, snapshot);
        if (edited.length > 0 || removedByOthers.length > 0) {
            openConflictModal(edited, removedByOthers, employees, snapshot);
            return;
        }
    }
    runPublish();
}

function discardMineAndLoadLatest() {
    if (!conflictSnapshot) return closeConflictModal();
    const snapshot = conflictSnapshot;
    clearPendingLiveUpdate();
    setEmployees(snapshot);
    resetUndoHistory();
    renderChart();
    closeConflictModal();
    showStatus("Loaded the latest published version. Your changes were discarded.", "success");
}

async function runPublish() {
    const validation = validateEmployees(employees);
    showValidationResults(validation, "current data");
    if (validation.errors.length > 0) {
        showStatus("Fix data errors before publishing. Review the Data Status panel.", "error");
        return;
    }

    const publishable = employees.filter(e => !e.virtual);
    const deletionNote = deletedEmployeeIds.length > 0 ? ` (including ${deletedEmployeeIds.length} deletion${deletedEmployeeIds.length > 1 ? "s" : ""})` : "";
    if (!confirm(`Publish these changes for everyone to see? This will update the live org chart (${publishable.length} employees${deletionNote}).`)) {
        return;
    }

    try {
        showStatus("Publishing...", "success");
        await window.FirebaseSync.publishEmployeesToFirestore(publishable, deletedEmployeeIds);
        resetUndoHistory();
        clearPendingLiveUpdate();
        showStatus("Published. Everyone will see these changes.", "success");
    } catch (error) {
        console.error("Publish error:", error);
        showStatus("Publish failed: " + error.message, "error");
    }
}

// Legend dropdown (shows what each card's location color means)
function closeLegend() {
    if (!legendDropdown) return;
    legendDropdown.classList.add("hidden");
    legendButton?.setAttribute("aria-expanded", "false");
}

function toggleLegend(event) {
    event.stopPropagation();
    if (!legendDropdown) return;
    const opening = legendDropdown.classList.contains("hidden");
    legendDropdown.classList.toggle("hidden");
    legendButton?.setAttribute("aria-expanded", String(opening));
}

// Publish dropdown menu (Publish Now / Version History)
function openPublishMenu() {
    publishMenuDropdown.classList.remove("hidden");
    publishMenuButton.setAttribute("aria-expanded", "true");
}

function closePublishMenu() {
    publishMenuDropdown.classList.add("hidden");
    publishMenuButton.setAttribute("aria-expanded", "false");
}

function togglePublishMenu(event) {
    event.stopPropagation();
    if (publishMenuDropdown.classList.contains("hidden")) openPublishMenu();
    else closePublishMenu();
}

// Version History — lets an admin browse the last 30 days of published
// versions and load one locally for review before publishing it. History
// itself is admin-only to view (same sign-in gate as Publish), consistent
// with the write access model for the rest of the app.
let historyEntriesById = new Map();

function handleVersionHistoryClick() {
    if (!window.FirebaseSync.isSignedIn()) return openSignInPrompt(openHistoryPanel);
    openHistoryPanel();
}

function formatHistoryDate(date) {
    if (!date) return "Unknown time";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function openHistoryPanel() {
    historyContent.innerHTML = `<div class="history-loading">Loading version history…</div>`;
    historyOverlay.classList.add("open");
    historyOverlay.setAttribute("aria-hidden", "false");
    try {
        const entries = await window.FirebaseSync.loadPublishHistory();
        historyEntriesById = new Map(entries.map(e => [e.id, e]));
        renderHistoryList(entries);
    } catch (error) {
        console.error("History load error:", error);
        historyContent.innerHTML = `<div class="history-loading">Couldn't load version history.</div>`;
    }
}

function renderHistoryList(entries) {
    if (entries.length === 0) {
        historyContent.innerHTML = `<div class="history-loading">No published versions in the last 30 days.</div>`;
        return;
    }
    historyContent.innerHTML = entries.map(entry => `
        <div class="history-item">
            <div class="history-item-info">
                <div class="history-item-date">${escapeHtml(formatHistoryDate(entry.publishedAt))}</div>
                <div class="history-item-meta">${escapeHtml(entry.publishedBy)} · ${entry.employees.length} employees</div>
            </div>
            <button type="button" class="history-restore-button" data-history-id="${escapeHtml(entry.id)}">Restore</button>
        </div>
    `).join("");
}

function closeHistoryPanel() {
    historyOverlay.classList.remove("open");
    historyOverlay.setAttribute("aria-hidden", "true");
}

if (historyContent) historyContent.addEventListener("click", event => {
    const button = event.target.closest(".history-restore-button");
    if (button) restoreVersion(button.dataset.historyId);
});

// Loads a historical version locally for review. Anyone currently live but
// absent from that version is queued for deletion too — otherwise this
// wouldn't be a real rollback, just old data layered back on top of new
// data. Nothing is written to Firestore here; the normal Publish flow
// (validation, conflict-check, confirm) handles that once you review and
// publish, same as any other local edit.
function restoreVersion(entryId) {
    if (hasUnpublishedChanges) {
        showStatus("You have unpublished changes already. Publish or undo them before restoring a different version.", "error");
        return;
    }
    const entry = historyEntriesById.get(entryId);
    if (!entry) return;
    if (!confirm(`Load the version from ${formatHistoryDate(entry.publishedAt)}? You'll be able to review it locally before publishing.`)) {
        return;
    }

    const currentIds = new Set(employees.filter(e => !e.virtual).map(e => String(e.id)));
    const restoredIds = new Set(entry.employees.map(e => String(e.id)));
    const toDelete = [...currentIds].filter(id => !restoredIds.has(id));

    snapshotForUndo();
    deletedEmployeeIds = [...new Set([...deletedEmployeeIds, ...toDelete])];
    setEmployees(buildFullEmployeeList(entry.employees.map(e => ({ ...e }))));
    renderChart();
    closeHistoryPanel();
    showStatus(`Loaded the version from ${formatHistoryDate(entry.publishedAt)}. Review, then use Publish to make it live.`, "success");
}

// Local Undo — a short history of employee-array snapshots, reverted one
// step at a time. Cleared whenever the baseline changes externally (fresh
// load, live sync, publish), since undoing past that point wouldn't make sense.
function snapshotForUndo() {
    undoStack.push({
        employees: JSON.parse(JSON.stringify(employees)),
        deletedIds: [...deletedEmployeeIds]
    });
    if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
    hasUnpublishedChanges = true;
    updateUndoButton();
}

function undoLastChange() {
    if (!undoStack.length) return;
    const snapshot = undoStack.pop();
    setEmployees(snapshot.employees);
    deletedEmployeeIds = snapshot.deletedIds;
    hasUnpublishedChanges = undoStack.length > 0;
    renderChart();
    closeEmployeeDetail();
    updateUndoButton();
    showStatus("Reverted last change.", "success");
}

// The one place that resets the local edit session. The undo stack, the
// pending-deletion tracker, and the "unpublished changes" flag must always
// move together — previously each caller set hasUnpublishedChanges
// separately right after calling this, six identical-looking pairs of
// statements repeated across the file, relying on every one of them
// remembering to stay in sync. Pass true when the new baseline should
// immediately count as dirty (a fresh Excel import needs publishing before
// it's live); every other caller wants the default, a clean baseline.
function resetUndoHistory(markDirty = false) {
    undoStack = [];
    deletedEmployeeIds = [];
    hasUnpublishedChanges = markDirty;
    updateUndoButton();
}

function updateUndoButton() {
    if (undoButton) undoButton.disabled = undoStack.length === 0;
}

function openSignInPrompt(onSuccess) {
    pendingSignInSuccess = onSuccess;
    signInError.textContent = "";
    signInOverlay.classList.add("open");
    signInOverlay.setAttribute("aria-hidden", "false");
    document.getElementById("signin-email")?.focus();
}

function closeSignInPrompt() {
    signInOverlay.classList.remove("open");
    signInOverlay.setAttribute("aria-hidden", "true");
    signInForm?.reset();
    pendingSignInSuccess = null;
    applyPendingUpdateIfAny();
}

async function handleSignInSubmit(event) {
    event.preventDefault();
    signInError.textContent = "";
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;

    try {
        await window.FirebaseSync.signInAdmin(email, password);
        const onSuccess = pendingSignInSuccess;
        closeSignInPrompt();
        onSuccess?.();
    } catch (error) {
        console.error("Sign-in error:", error);
        signInError.textContent = "Sign-in failed. Check your email and password.";
    }
}