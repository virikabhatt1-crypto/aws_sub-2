/* =========================================================
   SpendWise — script.js
   All logic for the expense tracker using plain Vanilla JS.
   Beginner-friendly: normal functions, arrays, objects,
   loops, and conditions. Comments explain every step.

   Sections:
   1. State variables
   2. LocalStorage helpers (save / load)
   3. Formatting helpers
   4. Calculations (totals, monthly, category breakdown)
   5. Rendering (summary, table, budget bar, breakdown)
   6. Search & filter
   7. CRUD: add / update / edit / delete
   8. Validation
   9. Budget handling
   10. Theme toggle
   11. Event listeners + init
   ========================================================= */

/* ============ 1. STATE VARIABLES ============ */
// These hold the current data while the app is running.
let transactions = [];     // array of transaction objects
let budget = 0;             // monthly spending budget (number)
let editingId = null;       // id of the transaction being edited (null = add mode)
let currentTheme = "light"; // "light" or "dark"

// The 7 expense categories (used for breakdown + filters)
const CATEGORIES = ["Food", "Travel", "Shopping", "Education", "Entertainment", "Bills", "Other"];

/* ============ 2. LOCALSTORAGE HELPERS ============ */
// LocalStorage can only store strings, so we use JSON.

// Save the transactions array
function saveTransactions() {
  localStorage.setItem("spendwise_transactions", JSON.stringify(transactions));
}

// Save the budget number
function saveBudget() {
  localStorage.setItem("spendwise_budget", String(budget));
}

// Save the theme string
function saveTheme() {
  localStorage.setItem("spendwise_theme", currentTheme);
}

// Load everything on page start; fall back to defaults if empty
function loadFromStorage() {
  const savedTx = localStorage.getItem("spendwise_transactions");
  transactions = savedTx ? JSON.parse(savedTx) : [];

  const savedBudget = localStorage.getItem("spendwise_budget");
  budget = savedBudget ? Number(savedBudget) : 0;

  const savedTheme = localStorage.getItem("spendwise_theme");
  currentTheme = savedTheme ? savedTheme : "light";
}

/* ============ 3. FORMATTING HELPERS ============ */

// Format a number as Indian-style currency, e.g. 1200.5 -> "₹1,200.50"
function formatMoney(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Format a YYYY-MM-DD date into a readable form, e.g. "20 Nov 2026"
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Convert a date string to a "YYYY-MM" month key, e.g. "2026-11-20" -> "2026-11"
function getMonthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}

// Turn "2026-11" into a readable label "November 2026"
function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// Round to 2 decimals to avoid floating-point drift in totals
function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

// Return today's date as YYYY-MM-DD in LOCAL time.
// (new Date().toISOString() uses UTC, which can be off by a day near midnight.)
function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

// Escape user-entered text so it cannot break the HTML or inject scripts (XSS safety).
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

/* ============ 4. CALCULATIONS ============ */

// Sum all income and all expense; balance = income - expense
function calculateTotals() {
  let income = 0;
  let expense = 0;
  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].type === "income") {
      income += Number(transactions[i].amount);
    } else {
      expense += Number(transactions[i].amount);
    }
  }
  return {
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense)
  };
}

// Get income, expense, and balance for a specific month (YYYY-MM)
function getMonthlyTotals(monthKey) {
  let income = 0;
  let expense = 0;
  for (let i = 0; i < transactions.length; i++) {
    if (getMonthKey(transactions[i].date) !== monthKey) continue;
    if (transactions[i].type === "income") {
      income += Number(transactions[i].amount);
    } else {
      expense += Number(transactions[i].amount);
    }
  }
  return {
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense)
  };
}

// Group all expenses by category and work out each category's percentage
function getCategoryBreakdown() {
  const totals = {};   // { "Food": 500, "Travel": 200, ... }

  // Step 1: add up amounts per category
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (t.type !== "expense") continue;
    totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
  }

  // Step 2: total of all expenses
  let totalExpense = 0;
  for (const key in totals) {
    totalExpense += totals[key];
  }

  // Step 3: build an array of breakdown objects
  const result = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const amount = totals[cat] || 0;
    const percent = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
    result.push({ category: cat, amount: round2(amount), percent: round2(percent) });
  }

  return { items: result, totalExpense: round2(totalExpense) };
}

/* ============ 5. RENDERING ============ */

// Update the three summary cards + sidebar mini balance
function updateSummary() {
  const totals = calculateTotals();
  document.getElementById("totalIncome").textContent = formatMoney(totals.income);
  document.getElementById("totalExpense").textContent = formatMoney(totals.expense);
  document.getElementById("totalBalance").textContent = formatMoney(totals.balance);
  document.getElementById("sidebarBalance").textContent = formatMoney(totals.balance);
}

// Render the transaction table using the current filters
function renderTransactions() {
  const tbody = document.getElementById("transactionsTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";   // clear old rows

  // Keep the monthly summary in sync with the selected month filter
  updateMonthlySummary();

  const filtered = applyFilters();   // search + type + category + month

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    tbody.innerHTML = "";
    return;
  }
  emptyState.classList.add("hidden");

  // Build a row for each transaction
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    const tr = document.createElement("tr");

    // Amount cell with + or - sign
    const sign = t.type === "income" ? "+" : "-";
    const amountCell = `<td class="amt ${t.type}">${sign}${formatMoney(t.amount)}</td>`;

    // Type badge
    const badge = `<span class="badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span>`;

    // Category tag (income has no category, show "—")
    const catTag = t.type === "expense"
      ? `<span class="cat-tag">${t.category}</span>`
      : `<span class="cat-tag">—</span>`;

    // Edit & Delete buttons (use data-id to know which row was clicked)
    const actions = `
      <td>
        <div class="action-btns">
          <button class="icon-btn edit" onclick="startEdit('${t.id}')">Edit</button>
          <button class="icon-btn delete" onclick="deleteTransaction('${t.id}')">Delete</button>
        </div>
      </td>`;

    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td>${catTag}</td>
      <td>${badge}</td>
      ${amountCell}
      ${actions}
    `;

    tbody.appendChild(tr);
  }
}

// Update the budget progress bar and warnings
function updateBudgetBar() {
  const monthKey = getMonthKey(todayLocalISO()); // current month (local time)
  const monthly = getMonthlyTotals(monthKey);  // this month's expense
  const spent = monthly.expense;

  document.getElementById("budgetSpent").textContent = formatMoney(spent);
  document.getElementById("budgetAmount").textContent = formatMoney(budget);

  const bar = document.getElementById("budgetBar");
  const percentText = document.getElementById("budgetPercent");
  const warning = document.getElementById("budgetWarning");

  // If no budget set, show 0% and hide warning
  if (budget <= 0) {
    bar.style.width = "0%";
    bar.style.background = "var(--green)";
    percentText.textContent = "Set a budget to track spending";
    warning.classList.add("hidden");
    return;
  }

  // Percentage of budget used (can go above 100%)
  let percent = (spent / budget) * 100;
  const cappedPercent = Math.min(percent, 100); // bar can't exceed 100% width
  bar.style.width = cappedPercent + "%";

  // Colour shifts: green -> amber -> red
  if (percent >= 100) {
    bar.style.background = "var(--red)";
  } else if (percent >= 80) {
    bar.style.background = "#f59e0b"; // amber
  } else {
    bar.style.background = "var(--green)";
  }

  percentText.textContent = Math.round(percent) + "% used";

  // Show warning only if over budget
  if (percent >= 100) {
    warning.classList.remove("hidden");
  } else {
    warning.classList.add("hidden");
  }
}

// Render the expense breakdown bars
function renderCategoryBreakdown() {
  const container = document.getElementById("categoryBreakdown");
  const empty = document.getElementById("breakdownEmpty");
  container.innerHTML = "";

  const data = getCategoryBreakdown();

  if (data.totalExpense <= 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.amount <= 0) continue;   // skip categories with no spending

    const row = document.createElement("div");
    row.className = "breakdown-item";
    row.innerHTML = `
      <div class="breakdown-top">
        <span class="breakdown-name">${item.category}</span>
        <span class="breakdown-amount">${formatMoney(item.amount)} · ${item.percent}%</span>
      </div>
      <div class="bd-track">
        <div class="bd-fill bd-${item.category}" style="width: ${item.percent}%"></div>
      </div>
    `;
    container.appendChild(row);
  }
}

/* ============ 6. SEARCH & FILTER ============ */

// Update the monthly summary bar based on the selected month in the filter.
// When "All Months" is chosen it shows all-time totals (labelled "All time").
function updateMonthlySummary() {
  const monthKey = document.getElementById("filterMonth").value;
  let income, expense, balance, label;

  if (monthKey === "all") {
    const totals = calculateTotals();
    income = totals.income;
    expense = totals.expense;
    balance = totals.balance;
    label = "All time";
  } else {
    const m = getMonthlyTotals(monthKey);
    income = m.income;
    expense = m.expense;
    balance = m.balance;
    label = getMonthLabel(monthKey);
  }

  document.getElementById("msMonth").textContent = label;
  document.getElementById("msIncome").textContent = formatMoney(income);
  document.getElementById("msExpense").textContent = formatMoney(expense);
  document.getElementById("msBalance").textContent = formatMoney(balance);
}

// Return only the transactions matching the search + filter selections
function applyFilters() {
  const searchText = document.getElementById("searchInput").value.trim().toLowerCase();
  const filterType = document.getElementById("filterType").value;
  const filterCategory = document.getElementById("filterCategory").value;
  const filterMonth = document.getElementById("filterMonth").value;

  const result = [];

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];

    // Search: description must contain the text (case-insensitive)
    if (searchText && !t.description.toLowerCase().includes(searchText)) continue;

    // Type filter
    if (filterType !== "all" && t.type !== filterType) continue;

    // Category filter (only meaningful for expenses)
    if (filterCategory !== "all" && t.category !== filterCategory) continue;

    // Month filter
    if (filterMonth !== "all" && getMonthKey(t.date) !== filterMonth) continue;

    result.push(t);
  }

  return result;
}

// Build the month dropdown from the months present in transactions
function populateMonthFilter() {
  const select = document.getElementById("filterMonth");
  const current = select.value;   // remember selection

  // Keep only the "All Months" option
  select.innerHTML = '<option value="all">All Months</option>';

  // Collect unique month keys
  const months = [];
  for (let i = 0; i < transactions.length; i++) {
    const key = getMonthKey(transactions[i].date);
    if (key && months.indexOf(key) === -1) months.push(key);
  }

  // Sort newest first
  months.sort().reverse();

  // Add each month as an option
  for (let i = 0; i < months.length; i++) {
    const opt = document.createElement("option");
    opt.value = months[i];
    opt.textContent = getMonthLabel(months[i]);
    select.appendChild(opt);
  }

  // Restore previous selection only if that month still exists
  if (current && current !== "all") {
    select.value = current;
    if (select.value !== current) {
      select.value = "all";   // month no longer present, reset to all
    }
  }
}

/* ============ 7. CRUD: ADD / UPDATE / EDIT / DELETE ============ */

// Called when the form is submitted (handles both add and update)
function addOrUpdateTransaction(event) {
  event.preventDefault();   // stop page reload

  // Read form values
  const type = document.querySelector('input[name="type"]:checked').value;
  const category = document.getElementById("categorySelect").value;
  const amountStr = document.getElementById("amount").value;
  const description = document.getElementById("description").value.trim();
  const date = document.getElementById("date").value;

  // Validate first; stop if invalid
  const error = validateForm(type, amountStr, description, date);
  const msg = document.getElementById("formMessage");
  if (error) {
    msg.textContent = error;
    msg.className = "form-message error";
    return;
  }
  msg.textContent = "";

  const amount = round2(Number(amountStr));

  if (editingId !== null) {
    // EDIT MODE: update the existing transaction
    for (let i = 0; i < transactions.length; i++) {
      if (transactions[i].id === editingId) {
        transactions[i].type = type;
        transactions[i].category = type === "expense" ? category : "Income";
        transactions[i].amount = amount;
        transactions[i].description = description;
        transactions[i].date = date;
        break;
      }
    }
    editingId = null;
    resetFormToAdd();
    msg.textContent = "Transaction updated successfully!";
  } else {
    // ADD MODE: create a new transaction object
    const newTx = {
      id: "t_" + Date.now(),          // unique id using timestamp
      type: type,
      category: type === "expense" ? category : "Income",
      amount: amount,
      description: description,
      date: date
    };
    transactions.push(newTx);
    msg.textContent = "Transaction added successfully!";
  }

  msg.className = "form-message success";
  saveTransactions();
  refreshAll();
  clearFormFields();
}

// Fill the form with a transaction's values and switch to edit mode
function startEdit(id) {
  let tx = null;
  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].id === id) { tx = transactions[i]; break; }
  }
  if (!tx) return;

  editingId = id;

  // Set the type radio
  document.getElementById("typeIncome").checked = (tx.type === "income");
  document.getElementById("typeExpense").checked = (tx.type === "expense");
  toggleCategoryField();

  // Fill the other fields
  if (tx.type === "expense") document.getElementById("categorySelect").value = tx.category;
  document.getElementById("amount").value = tx.amount;
  document.getElementById("description").value = tx.description;
  document.getElementById("date").value = tx.date;

  // Switch button text + show cancel
  document.getElementById("submitBtn").textContent = "Update Transaction";
  document.getElementById("cancelEditBtn").classList.remove("hidden");

  // Scroll to the form so the user can see it
  document.getElementById("form-section").scrollIntoView({ behavior: "smooth" });
}

// Delete a transaction after confirmation
function deleteTransaction(id) {
  if (!confirm("Are you sure you want to delete this transaction?")) return;

  transactions = transactions.filter(function (t) { return t.id !== id; });

  // If we were editing this one, cancel the edit
  if (editingId === id) {
    editingId = null;
    resetFormToAdd();
  }

  saveTransactions();
  refreshAll();
}

// Reset the form back to add mode
function resetFormToAdd() {
  editingId = null;
  document.getElementById("submitBtn").textContent = "Add Transaction";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  clearFormFields();
  document.getElementById("formMessage").textContent = "";
}

function clearFormFields() {
  document.getElementById("transactionForm").reset();
  document.getElementById("typeIncome").checked = true; // default to income
  toggleCategoryField();
  setDefaultDate();
}

/* ============ 8. VALIDATION ============ */

// Returns an error message string, or "" if everything is valid
function validateForm(type, amountStr, description, date) {
  // Amount checks
  if (amountStr === "" || amountStr === null) {
    return "Please enter an amount.";
  }
  const amount = Number(amountStr);
  if (isNaN(amount)) {
    return "Amount must be a valid number.";
  }
  if (amount <= 0) {
    return "Amount must be greater than zero.";
  }

  // Description check
  if (description === "") {
    return "Please enter a description.";
  }

  // Date check
  if (date === "") {
    return "Please select a date.";
  }

  // Don't allow a date in the future
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const chosen = new Date(date);
  if (chosen > today) {
    return "Date cannot be in the future.";
  }

  return "";   // all good
}

/* ============ 9. BUDGET HANDLING ============ */

function handleSetBudget() {
  const input = document.getElementById("budgetInput");
  const value = input.value;

  if (value === "" || isNaN(Number(value))) {
    alert("Please enter a valid budget amount.");
    return;
  }
  if (Number(value) < 0) {
    alert("Budget cannot be negative.");
    return;
  }

  budget = round2(Number(value));
  input.value = "";
  saveBudget();
  updateBudgetBar();
}

/* ============ 10. THEME TOGGLE ============ */

function toggleTheme() {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme();
  saveTheme();
}

// Apply the current theme to the HTML element and update the button label
function applyTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme);
  const icon = document.querySelector(".theme-icon");
  const text = document.querySelector(".theme-text");
  if (currentTheme === "dark") {
    icon.textContent = "☀️";
    text.textContent = "Light Mode";
  } else {
    icon.textContent = "🌙";
    text.textContent = "Dark Mode";
  }
}

/* ============ HELPER: toggle category field visibility ============ */
// Category is only relevant for expenses; hide it when income is chosen
function toggleCategoryField() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const group = document.getElementById("categoryGroup");
  if (type === "expense") {
    group.classList.remove("hidden");
  } else {
    group.classList.add("hidden");
  }
}

// Set the date input to today by default (local time)
function setDefaultDate() {
  document.getElementById("date").value = todayLocalISO();
}

// Show current month/year in the welcome header
function setCurrentMonthLabel() {
  document.getElementById("currentMonth").textContent = getMonthLabel(
    todayLocalISO().slice(0, 7)
  );
}

// Re-render everything at once (used after any data change)
function refreshAll() {
  updateSummary();
  populateMonthFilter();
  renderTransactions();
  updateBudgetBar();
  renderCategoryBreakdown();
}

// Clear all stored data (with confirmation)
function clearAllData() {
  if (!confirm("This will permanently delete ALL transactions and budget. Continue?")) return;
  transactions = [];
  budget = 0;
  editingId = null;
  localStorage.removeItem("spendwise_transactions");
  localStorage.removeItem("spendwise_budget");
  resetFormToAdd();
  refreshAll();
}

/* ============ 11. EVENT LISTENERS + INIT ============ */

function init() {
  // Load saved data
  loadFromStorage();

  // Apply theme before showing the page
  applyTheme();

  // Set up defaults in the form
  setDefaultDate();
  toggleCategoryField();
  setCurrentMonthLabel();

  // Pre-fill budget input if a budget already exists
  if (budget > 0) {
    document.getElementById("budgetInput").value = budget;
  }

  // ---- Attach event listeners ----

  // Form submit
  document.getElementById("transactionForm").addEventListener("submit", addOrUpdateTransaction);

  // Cancel edit button
  document.getElementById("cancelEditBtn").addEventListener("click", resetFormToAdd);

  // Type radio change -> toggle category field
  document.getElementById("typeIncome").addEventListener("change", toggleCategoryField);
  document.getElementById("typeExpense").addEventListener("change", toggleCategoryField);

  // Search + filters -> re-render table live
  document.getElementById("searchInput").addEventListener("input", renderTransactions);
  document.getElementById("filterType").addEventListener("change", renderTransactions);
  document.getElementById("filterCategory").addEventListener("change", renderTransactions);
  document.getElementById("filterMonth").addEventListener("change", renderTransactions);

  // Budget
  document.getElementById("setBudgetBtn").addEventListener("click", handleSetBudget);
  document.getElementById("budgetInput").addEventListener("keypress", function (e) {
    if (e.key === "Enter") handleSetBudget();
  });

  // Theme toggle
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Clear all
  document.getElementById("clearAllBtn").addEventListener("click", clearAllData);

  // Sidebar nav: highlight active link on scroll-less click
  const navLinks = document.querySelectorAll(".nav-link");
  for (let i = 0; i < navLinks.length; i++) {
    navLinks[i].addEventListener("click", function () {
      for (let j = 0; j < navLinks.length; j++) navLinks[j].classList.remove("active");
      this.classList.add("active");
    });
  }

  // First render of the whole dashboard
  refreshAll();
}

// Run init once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", init);
