const state = { user: null, vehicles: [], services: [], technicians: [], bookings: [], admin: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function setPreferredTime() {
  const input = document.querySelector("[name=preferredAt]");
  const d = new Date(Date.now() + 36 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  input.value = d.toISOString().slice(0, 16);
}

function showShell() {
  $("#authPanel").classList.toggle("hidden", Boolean(state.user));
  $("#appShell").classList.toggle("hidden", !state.user);
  if (state.user) {
    $("#userBadge").innerHTML = `<div>${state.user.email}</div><p class="fineprint">${state.user.role}</p>`;
    switchView(state.user.role === "TECHNICIAN" ? "technician" : state.user.role === "ADMIN" ? "admin" : "customer");
  }
}

function switchView(name) {
  $$(".view").forEach((el) => el.classList.add("hidden"));
  $(`#${name}View`).classList.remove("hidden");
  if (name === "customer") refreshCustomer();
  if (name === "technician") refreshTechnician();
  if (name === "admin") refreshAdmin();
}

async function refreshBase() {
  const me = await api("/api/me");
  state.user = me.user;
  const svc = await api("/api/services");
  state.services = svc.services;
  state.technicians = (await api("/api/technicians")).technicians;
  $("#serviceSelect").innerHTML = state.services.map((s) => `<option value="${s.id}">${s.name} - ${money(s.basePriceCents)}</option>`).join("");
  $("#technicianSelect").innerHTML = state.technicians.map((t) => `<option value="${t.userId}">${t.fullName} - ${t.ratingAverage} stars - ${t.specialties.join(", ")}</option>`).join("");
  showShell();
}

async function refreshCustomer() {
  if (!state.user || state.user.role !== "CUSTOMER") return;
  state.vehicles = (await api("/api/vehicles")).vehicles;
  state.bookings = (await api("/api/bookings")).bookings;
  $("#vehicleSelect").innerHTML = state.vehicles.map((v) => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`).join("");
  $("#vehicleCount").textContent = state.vehicles.length;
  const active = state.bookings.find((b) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(b.status));
  $("#activeRepair").textContent = active ? active.status.replaceAll("_", " ") : "No active repair";
  $("#upcomingAppointment").textContent = active ? new Date(active.preferredAt).toLocaleString() : "None yet";
  $("#historyCount").textContent = `${state.bookings.filter((b) => b.status === "COMPLETED").length} completed`;
  $("#customerBookings").innerHTML = state.bookings.map(renderCustomerBooking).join("") || "<p class='fineprint'>No bookings yet.</p>";
}

function renderCustomerBooking(b) {
  const quoteActions = b.quote && b.quote.status === "PENDING" ? `<button data-approve-quote="${b.id}">Approve ${money(b.quote.amountCents)}</button>` : "";
  const reviewAction = b.status === "COMPLETED" && !b.review ? `<button data-review="${b.id}">Leave Review</button>` : "";
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} at ${new Date(b.preferredAt).toLocaleString()}</p></div><span class="status">${b.status}</span></div>
    <p>${b.symptoms || "No symptoms provided."}</p>
    ${b.invoice ? `<p><strong>Invoice:</strong> ${money(b.invoice.totalCents)} | Platform fee ${money(b.invoice.platformFeeCents)} | Technician ${money(b.invoice.technicianEarningsCents)}</p>` : ""}
    <div class="actions">${quoteActions}${reviewAction}</div>
  </article>`;
}

async function refreshTechnician() {
  if (!state.user || state.user.role !== "TECHNICIAN") return;
  state.bookings = (await api("/api/bookings")).bookings;
  const opportunities = state.bookings.filter((b) => b.status === "REQUESTED");
  $("#opportunityCount").textContent = opportunities.length;
  const current = state.bookings.find((b) => ["BOOKED", "ARRIVED", "IN_PROGRESS"].includes(b.status));
  $("#currentJob").textContent = current ? current.service.name : "None";
  $("#earnings").textContent = money(state.bookings.reduce((sum, b) => sum + (b.invoice?.technicianEarningsCents || 0), 0));
  $("#techJobs").innerHTML = state.bookings.map(renderTechJob).join("") || "<p class='fineprint'>No jobs assigned yet. Customer demo can create one.</p>";
}

function renderTechJob(b) {
  const accept = b.status === "REQUESTED" ? `<button data-accept="${b.id}">Accept</button>` : "";
  const quote = ["REQUESTED", "BOOKED"].includes(b.status) && !b.quote ? `<button data-quote="${b.id}">Send Quote</button>` : "";
  const start = b.status === "BOOKED" ? `<button data-status="${b.id}:IN_PROGRESS">Start Job</button>` : "";
  const add = b.status === "IN_PROGRESS" ? `<button data-additional="${b.id}">Additional Work</button>` : "";
  const done = ["IN_PROGRESS", "ADDITIONAL_WORK_APPROVED", "ADDITIONAL_WORK_DECLINED"].includes(b.status) ? `<button data-status="${b.id}:COMPLETED">Complete</button>` : "";
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} - ${b.dtcs || "No DTCs"}</p></div><span class="status">${b.status}</span></div>
    <p>${b.symptoms}</p>
    <div class="actions">${accept}${quote}${start}${add}${done}</div>
  </article>`;
}

async function refreshAdmin() {
  if (!state.user || state.user.role !== "ADMIN") return;
  state.admin = await api("/api/admin/summary");
  const labels = [
    ["Active jobs", state.admin.activeJobs],
    ["Today's bookings", state.admin.todaysBookings],
    ["Total customers", state.admin.totalCustomers],
    ["Total technicians", state.admin.totalTechnicians],
    ["Pending approvals", state.admin.pendingTechnicianApprovals],
    ["Today's revenue", money(state.admin.todaysRevenueCents)],
    ["Technician payouts", money(state.admin.technicianPayoutsCents)],
    ["Open disputes", state.admin.openDisputes]
  ];
  $("#adminMetrics").innerHTML = labels.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  document.querySelector("[name=platformCommissionPercent]").value = state.admin.commissionPercent;
}

async function login(email, password = "DemoPass123!") {
  await api("/api/auth/login", { method: "POST", body: { email, password } });
  await refreshBase();
  toast("Logged in.");
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  try { await login(form.get("email"), form.get("password")); } catch (err) { toast(err.message); }
});

$$("[data-login]").forEach((btn) => btn.addEventListener("click", () => login(btn.dataset.login)));
$$("[data-view]").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
$("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); state.user = null; showShell(); });

$("#vehicleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/vehicles", { method: "POST", body }); await refreshCustomer(); toast("Vehicle saved."); } catch (err) { toast(err.message); }
});

$("#bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/bookings", { method: "POST", body }); await refreshCustomer(); toast("Repair request sent."); } catch (err) { toast(err.message); }
});

document.body.addEventListener("click", async (e) => {
  const target = e.target;
  try {
    if (target.dataset.accept) await api(`/api/bookings/${target.dataset.accept}/accept`, { method: "POST" });
    if (target.dataset.quote) await api(`/api/bookings/${target.dataset.quote}/quote`, { method: "POST", body: { amountCents: 42500, pricingModel: "FLAT_RATE", laborMinutes: 150 } });
    if (target.dataset.approveQuote) await api(`/api/bookings/${target.dataset.approveQuote}/approve-quote`, { method: "POST" });
    if (target.dataset.status) {
      const [id, status] = target.dataset.status.split(":");
      await api(`/api/bookings/${id}/status`, { method: "POST", body: { status } });
    }
    if (target.dataset.additional) await api(`/api/bookings/${target.dataset.additional}/additional-work`, { method: "POST", body: { description: "Seized brake caliper replacement", amountCents: 18500 } });
    if (target.dataset.review) await api(`/api/bookings/${target.dataset.review}/review`, { method: "POST", body: { rating: 5, body: "Professional work and clear communication." } });
    if (Object.keys(target.dataset).length) {
      await refreshCustomer();
      await refreshTechnician();
      toast("Updated.");
    }
  } catch (err) {
    toast(err.message);
  }
});

$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/admin/settings", { method: "POST", body }); await refreshAdmin(); toast("Settings saved."); } catch (err) { toast(err.message); }
});

$("#bookButton").addEventListener("click", () => $("#bookingForm").scrollIntoView({ behavior: "smooth" }));
$("#findJobs").addEventListener("click", refreshTechnician);

setPreferredTime();
refreshBase().catch(() => showShell());
