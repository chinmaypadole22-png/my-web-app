// Global State & Constants
let chart = null, employees = [], allExpanded = false;
let currentLayout = "top"; // "top" = vertical (top-to-bottom), "left" = horizontal (left-to-right)
let editMode = false, dragState = null, dropTargetEl = null;
let undoStack = [];
const MAX_UNDO_STEPS = 20;
let hasUnpublishedChanges = false;
let deletedEmployeeIds = [];

const COMPANY_ROOT = { id: "__COMPANY_ROOT__", parentId: null, name: "Techture", designation: "", virtual: true, hidden: false, companyRoot: true };
const DIRECTORS = [
    { id: "ROOT-ARNAV", parentId: COMPANY_ROOT.id, name: "Arnav Jain", designation: "Co-Founder / Director", virtual: true, hidden: false },
    { id: "ROOT-SHRIKANT", parentId: COMPANY_ROOT.id, name: "Shrikant Maniyar", designation: "Co-Founder / Director", virtual: true, hidden: false }
];
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
const locationFilter = document.getElementById("location-filter");
const employeeDetailPanel = document.getElementById("employee-detail-panel");
const employeeDetailContent = document.getElementById("employee-detail-content");
const closeDetailPanelButton = document.getElementById("close-detail-panel");
const closeStatusPanelButton = document.getElementById("close-status-panel");
const publishButton = document.getElementById("publish-button");
const signInOverlay = document.getElementById("signin-overlay");
const signInForm = document.getElementById("signin-form");
const signInError = document.getElementById("signin-error");
const signInCancelButton = document.getElementById("signin-cancel");
const signOutButton = document.getElementById("signout-button");
let pendingSignInSuccess = null;

// Event Listeners
if (closeDetailPanelButton) closeDetailPanelButton.addEventListener("click", closeEmployeeDetail);
if (closeStatusPanelButton) closeStatusPanelButton.addEventListener("click", closeStatusPanel);
if (excelInput) excelInput.addEventListener("change", handleExcelImport);
if (fitButton) fitButton.addEventListener("click", () => chart?.fit());
if (layoutToggleButton) layoutToggleButton.addEventListener("click", toggleLayout);
if (editModeButton) editModeButton.addEventListener("click", toggleEditMode);
if (addPlaceholderButton) addPlaceholderButton.addEventListener("click", addPlaceholderNode);
if (exportCsvButton) exportCsvButton.addEventListener("click", exportToCsv);
if (publishButton) publishButton.addEventListener("click", handlePublishClick);
if (signInForm) signInForm.addEventListener("submit", handleSignInSubmit);
if (signInCancelButton) signInCancelButton.addEventListener("click", closeSignInPrompt);
if (signOutButton) signOutButton.addEventListener("click", () => window.FirebaseSync.signOutAdmin());
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
if (departmentFilter) departmentFilter.addEventListener("change", handleSearchInput);
if (locationFilter) locationFilter.addEventListener("change", handleSearchInput);

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
    const location = locationFilter?.value || "";

    let pool = employees.filter(emp => !emp.virtual);
    if (department) pool = pool.filter(emp => emp.department === department);
    if (location) pool = pool.filter(emp => emp.location === location);
    if (!query) return (department || location) ? pool.slice(0, 20) : [];

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
    chart?.clearHighlighting().render();
}

function populateFilters() {
    if (!departmentFilter || !locationFilter) return;
    const departments = [...new Set(employees.filter(e => !e.virtual && e.department).map(e => e.department))].sort();
    const locations = [...new Set(employees.filter(e => !e.virtual && e.location).map(e => e.location))].sort();

    departmentFilter.innerHTML = `<option value="">All Departments</option>` +
        departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    locationFilter.innerHTML = `<option value="">All Locations</option>` +
        locations.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
}

document.addEventListener("click", event => {
    if (searchWrapper && !searchWrapper.contains(event.target)) hideSearchResults();
});

function focusEmployee(employeeId) {
    if (!chart) return;
    const employee = employees.find(item => String(item.id) === String(employeeId));
    if (!employee) return;

    const ancestors = [];
    let current = employee;
    while (current?.parentId) {
        ancestors.push(current.parentId);
        current = employees.find(item => item.id === current.parentId);
    }

    ancestors.reverse().forEach(id => chart.setExpanded(id, true));
    chart.setHighlighted(employeeId).setCentered(employeeId).render();
}

// Excel Import
async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

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
        employees = buildEmployeeData(rows);

        const validation = validateEmployees(employees);
        showValidationResults(validation, file.name);

        if (validation.errors.length > 0) {
            showStatus("The organization data contains errors. Review the Data Status panel.", "error");
            return;
        }

        allExpanded = false;
        updateExpandButton();
        populateFilters();
        clearSearch();
        createChart();
        resetUndoHistory();
        hasUnpublishedChanges = true;
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

function buildEmployeeData(rows) {
    const data = [{ ...COMPANY_ROOT }, ...DIRECTORS.map(d => ({ ...d }))];
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

    const nameLookup = new Map();
    realEmployees.forEach(emp => {
        const key = normalizeName(emp.name);
        if (key && !nameLookup.has(key)) nameLookup.set(key, emp);
    });

    realEmployees.forEach(emp => {
        const manager = normalizeName(emp.reportingTo);
        if (manager === normalizeName("Arnav Jain")) emp.parentId = "ROOT-ARNAV";
        else if (manager === normalizeName("Shrikant Maniyar")) emp.parentId = "ROOT-SHRIKANT";
        else emp.parentId = nameLookup.get(manager)?.id || COMPANY_ROOT.id;
    });

    return [...data, ...realEmployees];
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

    realEmployees.forEach(e => {
        const manager = normalizeName(e.reportingTo);
        if (!manager) return;
        const nameMatch = manager === normalizeName("Arnav Jain") ||
                      manager === normalizeName("Shrikant Maniyar") ||
                      manager === normalizeName(COMPANY_ROOT.name) ||
                      realEmployees.some(c => normalizeName(c.name) === manager);
        // Live Firestore data uses IDs (e.g. "EMP002", "ROOT-ARNAV") in reportingTo
        // rather than names — accept that scheme too.
        const idMatch = e.reportingTo === "ROOT-ARNAV" || e.reportingTo === "ROOT-SHRIKANT" ||
                      e.reportingTo === COMPANY_ROOT.id ||
                      realEmployees.some(c => c.id === e.reportingTo);
        if (!nameMatch && !idMatch) errors.push(`${e.name} → manager "${e.reportingTo}" was not found`);
    });

    return { totalEmployees: realEmployees.length, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// D3 Chart Creation
function createChart() {
    document.getElementById("chart-container").innerHTML = "";

    chart = new d3.OrgChart()
        .container("#chart-container")
        .data(employees)
        .layout(currentLayout)
        .nodeWidth(node => node.data.companyRoot ? 170 : 160)
        .nodeHeight(() => 70)
        .childrenMargin(() => 70)
        .compactMarginBetween(() => 28)
        .compactMarginPair(() => 28)
        .neighbourMargin(() => 18)
        .initialExpandLevel(1)
        .pagingStep(() => 5)
        .minPagingVisibleNodes(() => 3)
        .duration(500)
        .nodeContent(node => {
            const data = node.data;
            if (data.companyRoot) {
                return `<div class="company-root-card"><img src="techture-logo.png" class="company-root-logo" alt="Techture"></div>`;
            }
            const empId = data.virtual || data.isPlaceholder ? "" : `#${escapeHtml(data.id)}`;
            const cardClass = data.isPlaceholder ? "employee-card placeholder-card" : "employee-card";
            return `
                <div class="${cardClass}" data-drag-id="${escapeHtml(data.id)}" data-draggable="${!data.virtual}">
                    <div class="photo-wrapper"><div class="employee-photo"></div></div>
                    <div class="employee-content">
                        <div class="employee-id">${empId}</div>
                        <div class="employee-name">${escapeHtml(data.name)}</div>
                        <div class="employee-designation">${escapeHtml(data.designation || "")}</div>
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

function employeeDepth(employee) {
    let depth = 0;
    let current = employee;
    while (current?.parentId) {
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
        chart.render();
        if (employees.length > 150) showStatus(`Expanded the top ${MAX_AUTO_EXPAND_LEVEL} levels to keep the chart readable.`, "success");
        allExpanded = true;
    } else {
        chart.collapseAll()
             .setExpanded(COMPANY_ROOT.id, true)
             .setExpanded("ROOT-ARNAV", false)
             .setExpanded("ROOT-SHRIKANT", false)
             .render();
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
    chart.layout(currentLayout).render();
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
            chart.data(employees).setExpanded(targetId, true).setHighlighted(employeeId).render();
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
    let current = employees.find(e => e.id === candidateId);
    while (current?.parentId) {
        if (current.parentId === ancestorId) return true;
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
        <div class="status-line status-success">✓ Techture logo root loaded</div>
        <div class="status-line status-success">✓ Arnav Jain added as Director</div>
        <div class="status-line status-success">✓ Shrikant Maniyar added as Director</div>`;

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

    if (employee.id !== oldId) employees.forEach(e => { if (e.parentId === oldId) { e.parentId = employee.id; e.reportingTo = employee.name; } });
    if (employee.name !== oldName) employees.forEach(e => { if (e.parentId === employee.id) e.reportingTo = employee.name; });

    chart.data(employees).render();
    showStatus(`${employee.name || "Employee"} updated.`, "success");
    openEmployeeDetail(employee);
}

function markAsHired() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    snapshotForUndo();
    employee.isPlaceholder = false;
    chart.data(employees).render();
    showStatus(`${employee.name || "Employee"} marked as hired.`, "success");
    openEmployeeDetail(employee);
}

function unmarkAsHired() {
    const employeeId = employeeDetailPanel.dataset.editingId;
    const employee = employees.find(e => String(e.id) === String(employeeId));
    if (!employee) return;

    snapshotForUndo();
    employee.isPlaceholder = true;
    chart.data(employees).render();
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
    employees = employees.filter(e => e.id !== employee.id);

    chart.data(employees).render();
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

function addPlaceholderNode() {
    if (!chart) return showStatus("Chart isn't ready yet — please wait for data to load.", "error");

    snapshotForUndo();
    const placeholder = {
        id: `PH-${Date.now()}`,
        parentId: COMPANY_ROOT.id,
        name: "To Hire",
        designation: "",
        reportingTo: "",
        email: "",
        department: "",
        subDepartment: "",
        location: "",
        secondaryTitle: "",
        dottedLineManager: "",
        dateOfJoining: "",
        virtual: false,
        hidden: false,
        isPlaceholder: true,
        wasPlaceholder: true
    };

    employees.push(placeholder);
    chart.data(employees).setExpanded(COMPANY_ROOT.id, true).setCentered(placeholder.id).render();
    showStatus("Placeholder added under Techture. Use Reorder Mode to drag it under the intended manager.", "success");
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

function getManagerDisplayName(parentId) {
    if (!parentId) return "";
    if (parentId === "ROOT-ARNAV") return "Arnav Jain";
    if (parentId === "ROOT-SHRIKANT") return "Shrikant Maniyar";
    if (parentId === COMPANY_ROOT.id) return "Techture";
    return employees.find(e => String(e.id) === String(parentId))?.name || "";
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

// Merges live Firestore employees with the hardcoded company root + directors.
// Also defends against dangling manager references (e.g. a document deleted
// directly in the Firebase Console) by moving orphans under the company root
// instead of breaking the chart, with a warning shown.
function buildFullEmployeeList(liveEmployees) {
    const base = [{ ...COMPANY_ROOT }, ...DIRECTORS.map(d => ({ ...d }))];
    const validIds = new Set([...base.map(b => b.id), ...liveEmployees.map(e => String(e.id))]);

    let orphanCount = 0;
    const fixed = liveEmployees.map(emp => {
        if (emp.parentId && validIds.has(String(emp.parentId))) return emp;
        orphanCount++;
        return { ...emp, parentId: COMPANY_ROOT.id };
    });

    if (orphanCount > 0) {
        showStatus(
            `${orphanCount} employee${orphanCount > 1 ? "s" : ""} had an invalid manager reference (likely edited directly in Firestore) and ${orphanCount > 1 ? "were" : "was"} moved under Techture. Please review and reassign.`,
            "error"
        );
    }

    return [...base, ...fixed];
}

async function initializeFromFirestore() {
    try {
        showStatus("Loading organization data...", "success");
        const liveEmployees = await window.FirebaseSync.loadEmployeesFromFirestore();
        employees = buildFullEmployeeList(liveEmployees);

        allExpanded = false;
        updateExpandButton();
        populateFilters();
        clearSearch();
        createChart();
        resetUndoHistory();
        hasUnpublishedChanges = false;
        showStatus("Organization data loaded.", "success");

        window.FirebaseSync.subscribeToFirestore(handleLiveUpdate);
        window.FirebaseSync.watchAuthState(signedIn => {
            if (signOutButton) signOutButton.hidden = !signedIn;
        });
    } catch (error) {
        console.error("Firestore load error:", error);
        showStatus("Could not load live data. You can still load a file manually.", "error");
    }
}

let pendingLiveUpdate = null;

function handleLiveUpdate(liveEmployees) {
    const updated = buildFullEmployeeList(liveEmployees);
    const isBusy = editMode ||
        employeeDetailPanel?.getAttribute("aria-hidden") === "false" ||
        signInOverlay?.classList.contains("open") ||
        hasUnpublishedChanges;

    if (isBusy) {
        pendingLiveUpdate = updated;
        showStatus("New updates available — will apply once you finish editing.", "success");
    } else {
        employees = updated;
        resetUndoHistory();
        hasUnpublishedChanges = false;
        chart?.data(employees).render();
    }
}

function applyPendingUpdateIfAny() {
    if (!pendingLiveUpdate) return;
    if (hasUnpublishedChanges) {
        showStatus("New updates are available, but you have unpublished local changes. Publish or undo your changes to receive them.", "error");
        return;
    }
    employees = pendingLiveUpdate;
    pendingLiveUpdate = null;
    resetUndoHistory();
    hasUnpublishedChanges = false;
    chart?.data(employees).render();
    showStatus("Updated with the latest changes.", "success");
}

// Publish — pushes local employees to Firestore. Requires admin sign-in,
// since the Firestore rule only allows writes from an authenticated user.
async function handlePublishClick() {
    if (!employees.some(e => !e.virtual) && deletedEmployeeIds.length === 0) {
        return showStatus("Nothing to publish yet.", "error");
    }
    if (!window.FirebaseSync.isSignedIn()) return openSignInPrompt(runPublish);
    runPublish();
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
        hasUnpublishedChanges = false;
        pendingLiveUpdate = null;
        showStatus("Published. Everyone will see these changes.", "success");
    } catch (error) {
        console.error("Publish error:", error);
        showStatus("Publish failed: " + error.message, "error");
    }
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
    employees = snapshot.employees;
    deletedEmployeeIds = snapshot.deletedIds;
    hasUnpublishedChanges = undoStack.length > 0;
    chart?.data(employees).render();
    closeEmployeeDetail();
    updateUndoButton();
    showStatus("Reverted last change.", "success");
}

function resetUndoHistory() {
    undoStack = [];
    deletedEmployeeIds = [];
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