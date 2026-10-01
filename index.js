// Global State & Constants
let chart = null, employees = [], allExpanded = false;
let currentLayout = "top"; // "top" = vertical (top-to-bottom), "left" = horizontal (left-to-right)
let editMode = false, dragState = null, dropTargetEl = null;

const COMPANY_ROOT = { id: "__COMPANY_ROOT__", parentId: null, name: "Techture", designation: "", image: "techture-logo.png", virtual: true, hidden: false, companyRoot: true };
const DIRECTORS = [
    { id: "ROOT-ARNAV", parentId: COMPANY_ROOT.id, name: "Arnav Jain", designation: "Co-Founder / Director", image: "https://i.pravatar.cc/150?img=12", virtual: true, hidden: false },
    { id: "ROOT-SHRIKANT", parentId: COMPANY_ROOT.id, name: "Shrikant Maniyar", designation: "Co-Founder / Director", image: "https://i.pravatar.cc/150?img=11", virtual: true, hidden: false }
];
const REQUIRED_COLUMNS = ["Employee Number", "Full Name", "Job Title", "Reporting To"];

// DOM Elements
const excelInput = document.getElementById("excel-file");
const fitButton = document.getElementById("fit-button");
const layoutToggleButton = document.getElementById("layout-toggle-button");
const layoutToggleLabel = document.getElementById("layout-toggle-label");
const editModeButton = document.getElementById("edit-mode-button");
const editModeLabel = document.getElementById("edit-mode-label");
const chartContainer = document.getElementById("chart-container");
const expandCollapseButton = document.getElementById("expand-collapse-button");
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

// Event Listeners
if (closeDetailPanelButton) closeDetailPanelButton.addEventListener("click", closeEmployeeDetail);
if (excelInput) excelInput.addEventListener("change", handleExcelImport);
if (fitButton) fitButton.addEventListener("click", () => chart?.fit());
if (layoutToggleButton) layoutToggleButton.addEventListener("click", toggleLayout);
if (editModeButton) editModeButton.addEventListener("click", toggleEditMode);
if (expandCollapseButton) expandCollapseButton.addEventListener("click", toggleAll);
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
function handleSearchInput() {
    const query = searchInput.value.trim();
    searchWrapper.classList.toggle("has-value", query.length > 0);
    if (!employees.length) return;
    showSearchResults(findEmployees(query), query);
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

    if (!file.name.endsWith(".xlsx")) {
        return showStatus("Please select an .xlsx Excel file.", "error");
    }

    try {
        showStatus("Reading Excel workbook...", "success");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
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
    const realEmployees = rows.map((row, index) => ({
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
        image: generatePlaceholderImage(index),
        virtual: false,
        hidden: false
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

function generatePlaceholderImage(index) { return `https://i.pravatar.cc/150?img=${(index % 70) + 1}`; }
function normalizeName(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }

function validateEmployees(data) {
    const errors = [], warnings = [];
    const realEmployees = data.filter(e => !e.virtual);
    const idMap = new Map();

    realEmployees.forEach(e => {
        if (!e.id) errors.push(`${e.name || "Unnamed employee"} has no Employee Number.`);
        else idMap.set(e.id, (idMap.get(e.id) || 0) + 1);
    });

    idMap.forEach((count, id) => { if (count > 1) errors.push(`Duplicate Employee Number: ${id}`); });

    realEmployees.forEach(e => {
        const manager = normalizeName(e.reportingTo);
        if (!manager) return;
        const valid = manager === normalizeName("Arnav Jain") ||
                      manager === normalizeName("Shrikant Maniyar") ||
                      realEmployees.some(c => normalizeName(c.name) === manager);
        if (!valid) errors.push(`${e.name} → manager "${e.reportingTo}" was not found`);
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
            const empId = data.virtual ? "" : `#${escapeHtml(data.id)}`;
            const img = data.image || generatePlaceholderImage(1);
            return `
                <div class="employee-card" data-drag-id="${escapeHtml(data.id)}" data-draggable="${!data.virtual}">
                    <div class="photo-wrapper"><img src="${img}" class="employee-photo" alt="${escapeHtml(data.name)}" draggable="false"></div>
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

function toggleAll() {
    if (!chart) return;
    if (!allExpanded) {
        chart.expandAll().render();
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
        if (targetCard && reparentEmployee(employeeId, targetCard.dataset.dragId)) {
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
function showStatus(message, type = "success") {
    const panel = document.getElementById("status-panel");
    const content = document.getElementById("status-content");
    if (!panel || !content) return;
    panel.classList.remove("hidden");
    content.innerHTML = `<div class="status-line status-${type}">${escapeHtml(message)}</div>`;
}

function showValidationResults(validation, fileName) {
    const panel = document.getElementById("status-panel");
    const content = document.getElementById("status-content");
    if (!panel || !content) return;

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

function openEmployeeDetail(data) {
    if (!employeeDetailPanel || !employeeDetailContent || !data) return;

    const reportingTo = data.reportingTo || getManagerDisplayName(data.parentId) || "—";
    const img = data.image || generatePlaceholderImage(1);

    employeeDetailContent.innerHTML = `
        <div class="detail-profile">
            <img src="${img}" class="detail-photo" alt="${escapeHtml(data.name)}">
            <div>
                <div class="detail-name">${escapeHtml(data.name || "Unknown")}</div>
                <div class="detail-designation">${escapeHtml(data.designation || "—")}</div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Employee Information</div>
            ${detailRow("Employee Number", data.companyRoot ? "—" : (data.id ? `#${escapeHtml(data.id)}` : "—"))}
            ${detailRow("Email", data.email, "email")}
            ${detailRow("Department", data.department)}
            ${detailRow("Sub Department", data.subDepartment)}
            ${detailRow("Location", data.location)}
            ${detailRow("Secondary Job Title", data.secondaryTitle)}
            ${detailRow("Date of Joining", data.dateOfJoining)}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Reporting Structure</div>
            ${detailRow("Reporting To", reportingTo)}
            ${detailRow("Dotted Line Manager", data.dottedLineManager)}
        </div>`;

    employeeDetailPanel.classList.add("open");
    employeeDetailPanel.setAttribute("aria-hidden", "false");
}

function closeEmployeeDetail() {
    if (!employeeDetailPanel) return;
    employeeDetailPanel.classList.remove("open");
    employeeDetailPanel.setAttribute("aria-hidden", "true");
}

function detailRow(label, value, type = "") {
    const rawValue = value || "—";
    const valMarkup = (type === "email" && rawValue !== "—")
        ? `<a class="detail-email" href="mailto:${escapeHtml(rawValue)}">${escapeHtml(rawValue)}</a>`
        : escapeHtml(rawValue);

    return `<div class="detail-row"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${valMarkup}</div></div>`;
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