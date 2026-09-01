const state = { user: null, profile: null, vehicles: [], services: [], technicians: [], bookings: [], admin: null };
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

function dollars(cents) {
  return (Number(cents || 0) / 100).toFixed(0);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

async function filesToDataUrls(fileList, max = 4) {
  return Promise.all(Array.from(fileList || []).slice(0, max).map(fileToDataUrl));
}

function appointmentOptions(baseValue) {
  const base = baseValue ? new Date(baseValue) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const taken = new Set(state.bookings.filter((b) => !["CANCELLED", "COMPLETED", "REFUNDED"].includes(b.status)).map((b) => new Date(b.preferredAt).toISOString().slice(0, 13)));
  const options = [];
  for (let day = 0; day < 7; day += 1) {
    for (const hour of [9, 11, 13, 15, 17]) {
      const d = new Date(base);
      d.setDate(base.getDate() + day);
      d.setHours(hour, 0, 0, 0);
      if (d.getTime() < Date.now()) continue;
      if (!taken.has(d.toISOString().slice(0, 13))) options.push(d);
      if (options.length >= 8) return options;
    }
  }
  return options;
}

function setPreferredTime() {
  const input = document.querySelector("[name=preferredAt]");
  const d = new Date(Date.now() + 36 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  input.value = d.toISOString().slice(0, 16);
}

function setAuthTab(name) {
  $$(".auth-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.authTab === name));
  $$(".auth-form").forEach((form) => form.classList.add("hidden"));
  const map = { signup: "#signupForm", login: "#loginForm", tech: "#technicianSignupForm" };
  $(map[name] || "#signupForm").classList.remove("hidden");
  $(".auth-card").scrollIntoView({ behavior: "smooth", block: "center" });
}

function showShell() {
  const isReset = new URLSearchParams(location.search).has("resetToken");
  $("#resetPanel").classList.toggle("hidden", !isReset);
  $("#authPanel").classList.toggle("hidden", Boolean(state.user));
  $("#appShell").classList.toggle("hidden", !state.user);
  if (isReset) {
    $("#authPanel").classList.add("hidden");
    $("#appShell").classList.add("hidden");
    return;
  }
  $$(".public-action").forEach((button) => button.classList.toggle("hidden", Boolean(state.user)));
  $$(".app-action").forEach((button) => button.classList.toggle("hidden", !state.user));
  $("#logoutBtn").classList.toggle("hidden", !state.user);
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
  state.profile = me.profile;
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
  state.technicians = (await api("/api/technicians")).technicians;
  $("#vehicleSelect").innerHTML = state.vehicles.map((v) => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`).join("");
  $("#bookingHint").classList.toggle("hidden", state.vehicles.length > 0);
  $("#bookingForm button[type=submit]").disabled = state.vehicles.length === 0;
  $("#technicianProfiles").innerHTML = state.technicians.map(renderTechnicianCard).join("") || "<p class='fineprint'>No approved technicians are available yet.</p>";
  $("#vehicleCount").textContent = state.vehicles.length;
  const active = state.bookings.find((b) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(b.status));
  $("#activeRepair").textContent = active ? active.status.replaceAll("_", " ") : "No active repair";
  $("#upcomingAppointment").textContent = active ? new Date(active.preferredAt).toLocaleString() : "None yet";
  $("#historyCount").textContent = `${state.bookings.filter((b) => b.status === "COMPLETED").length} completed`;
  $("#customerBookings").innerHTML = state.bookings.map(renderCustomerBooking).join("") || "<p class='fineprint'>No bookings yet.</p>";
}

function renderTechnicianCard(t) {
  const comments = [...(t.reviews || []).map((review) => review.body), ...(t.comments || []).map((comment) => comment.body)].filter(Boolean);
  return `<article class="tech-card" data-tech-card="${t.userId}">
    <div class="profile-card">
      ${t.profilePhotoUrl ? `<img class="avatar" src="${t.profilePhotoUrl}" alt="${escapeHtml(t.fullName)}" />` : `<div class="avatar">WL</div>`}
      <div>
        <strong>${escapeHtml(t.fullName)}</strong>
        <p class="meta">${t.ratingAverage || "New"} stars - ${t.yearsExperience || 0} years</p>
        <p class="meta">Flat rate from ${money(t.defaultFlatRateCents)} minimum</p>
      </div>
    </div>
    <p>${escapeHtml(t.bio || "This technician has not added a bio yet.")}</p>
    <p class="fineprint">${escapeHtml((t.specialties || []).join(", "))}</p>
    <div class="comment-list">${comments.slice(-4).map((comment) => `<div class="comment">${escapeHtml(comment)}</div>`).join("") || "<p class='fineprint'>No profile comments yet.</p>"}</div>
    <form class="comment-form" data-comment-form="${t.userId}">
      <input name="body" placeholder="Leave a profile comment" />
      <button type="submit">Post</button>
    </form>
    <button type="button" data-select-tech="${t.userId}">Select This Technician</button>
  </article>`;
}

function renderCustomerBooking(b) {
  const quoteActions = b.quote && b.quote.status === "PENDING" ? `<button data-approve-quote="${b.id}">Approve ${money(b.quote.amountCents)}</button>` : "";
  const reviewAction = b.status === "COMPLETED" && !b.review ? `<button data-review="${b.id}">Leave Review</button>` : "";
  const additions = (b.additionalWorkRequests || []).map((item) => `<div class="item">
    <strong>Suggested additional repair: ${escapeHtml(item.description)}</strong>
    <p class="meta">${money(item.amountCents)} - ${item.status}</p>
    ${item.status === "PENDING" ? `<div class="actions"><button data-add-approve="${item.id}">Approve</button><button class="ghost" data-add-decline="${item.id}">Decline</button></div>` : ""}
  </div>`).join("");
  const findings = (b.inspectionFindings || []).map((finding) => `<div class="item">
    <strong>${escapeHtml(finding.title)}</strong>
    <p>${escapeHtml(finding.notes)}</p>
    ${finding.suggestedRepair ? `<p><strong>Suggested repair:</strong> ${escapeHtml(finding.suggestedRepair)} ${finding.estimatedAmountCents ? `(${money(finding.estimatedAmountCents)})` : ""}</p>` : ""}
    ${finding.photoUrls?.length ? `<div class="finding-gallery">${finding.photoUrls.map((src) => `<img src="${src}" alt="Inspection finding photo" />`).join("")}</div>` : ""}
  </div>`).join("");
  const tech = b.technicianProfile ? `<div class="profile-card">
    ${b.technicianProfile.profilePhotoUrl ? `<img class="avatar" src="${b.technicianProfile.profilePhotoUrl}" alt="${escapeHtml(b.technicianProfile.fullName)}" />` : `<div class="avatar">WL</div>`}
    <div><strong>${escapeHtml(b.technicianProfile.fullName)}</strong><p class="meta">${b.technicianProfile.yearsExperience || 0} years - ${escapeHtml((b.technicianProfile.specialties || []).join(", "))}</p><p class="fineprint">${escapeHtml(b.technicianProfile.bio || "")}</p></div>
  </div>` : "";
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} at ${new Date(b.preferredAt).toLocaleString()}</p></div><span class="status">${b.status}</span></div>
    ${tech}
    <p>${b.symptoms || "No symptoms provided."}</p>
    ${b.invoice ? `<p><strong>Invoice:</strong> ${money(b.invoice.totalCents)} | Platform fee ${money(b.invoice.platformFeeCents)} | Technician ${money(b.invoice.technicianEarningsCents)}</p>` : ""}
    ${findings}
    ${additions}
    <div class="actions">${quoteActions}${reviewAction}</div>
  </article>`;
}

async function refreshTechnician() {
  if (!state.user || state.user.role !== "TECHNICIAN") return;
  state.bookings = (await api("/api/bookings")).bookings;
  await refreshBaseProfileOnly();
  fillTechProfileForm();
  const opportunities = state.bookings.filter((b) => b.status === "REQUESTED");
  $("#opportunityCount").textContent = opportunities.length;
  const current = state.bookings.find((b) => ["BOOKED", "ARRIVED", "IN_PROGRESS"].includes(b.status));
  $("#currentJob").textContent = current ? current.service.name : "None";
  $("#earnings").textContent = money(state.bookings.reduce((sum, b) => sum + (b.invoice?.technicianEarningsCents || 0), 0));
  $("#techJobs").innerHTML = state.bookings.map(renderTechJob).join("") || "<p class='fineprint'>No jobs assigned yet. Customer demo can create one.</p>";
}

async function refreshBaseProfileOnly() {
  const me = await api("/api/me");
  state.profile = me.profile;
}

function fillTechProfileForm() {
  if (!state.profile) return;
  $("#techFullName").value = state.profile.fullName || "";
  $("#techBio").value = state.profile.bio || "";
  $("#techYears").value = state.profile.yearsExperience || 0;
  $("#techFlatRate").value = dollars(state.profile.defaultFlatRateCents || 0);
  $("#techHourlyRate").value = dollars(state.profile.hourlyRateCents || 0);
  $("#techRadius").value = state.profile.serviceRadiusMiles || 20;
  $("#techSpecialties").value = (state.profile.specialties || []).join(", ");
  $("#techCertifications").value = (state.profile.certifications || []).join(", ");
  $("#techMobile").checked = Boolean(state.profile.mobileServiceAvailable);
  $("#techShop").checked = Boolean(state.profile.shopServiceAvailable);
  $("#techRating").textContent = state.profile.ratingAverage || "New";
  $("#techProfilePreview").innerHTML = `<div class="profile-card">
    ${state.profile.profilePhotoUrl ? `<img class="avatar" src="${state.profile.profilePhotoUrl}" alt="${escapeHtml(state.profile.fullName)}" />` : `<div class="avatar">WL</div>`}
    <div><strong>${escapeHtml(state.profile.fullName)}</strong><p class="meta">${state.profile.yearsExperience || 0} years - Flat rate from ${money(state.profile.defaultFlatRateCents)}</p><p class="fineprint">${escapeHtml(state.profile.bio || "Add a bio so customers know why they should book you.")}</p></div>
  </div>`;
}

function renderTechJob(b) {
  const slots = appointmentOptions(b.preferredAt).map((slot) => `<option value="${slot.toISOString()}">${slot.toLocaleString()}</option>`).join("");
  const accept = b.status === "REQUESTED" ? `<form class="mini-form" data-accept-form="${b.id}">
    <label>Appointment <select name="scheduledAt">${slots}</select></label>
    <button type="submit">Accept Time</button>
  </form>` : "";
  const quote = ["REQUESTED", "BOOKED"].includes(b.status) && !b.quote ? `<form class="mini-form" data-quote-form="${b.id}">
    <label>Flat rate <input name="amount" type="number" min="${Math.ceil(Math.max(b.service.estimatedMinutes, 60) / 60 * 100)}" value="${dollars(Math.max(state.profile?.defaultFlatRateCents || b.service.basePriceCents, Math.ceil(Math.max(b.service.estimatedMinutes, 60) / 60 * 10000)))}" /></label>
    <label>Labor minutes <input name="laborMinutes" type="number" min="15" value="${b.service.estimatedMinutes}" /></label>
    <button type="submit">Send Quote</button>
    <p class="fineprint">Minimum flat rate is $100 per hour equivalent.</p>
  </form>` : "";
  const start = b.status === "BOOKED" ? `<button data-status="${b.id}:IN_PROGRESS">Start Job</button>` : "";
  const add = b.status === "IN_PROGRESS" ? `<button data-additional="${b.id}">Additional Work</button>` : "";
  const done = ["IN_PROGRESS", "ADDITIONAL_WORK_APPROVED", "ADDITIONAL_WORK_DECLINED"].includes(b.status) ? `<button data-status="${b.id}:COMPLETED">Complete</button>` : "";
  const findings = ["IN_PROGRESS", "ADDITIONAL_WORK_REQUESTED", "ADDITIONAL_WORK_APPROVED", "ADDITIONAL_WORK_DECLINED"].includes(b.status) ? `<form class="mini-form" data-finding-form="${b.id}">
    <label>Finding title <input name="title" value="Inspection finding" /></label>
    <label>Estimated repair $ <input name="estimatedAmount" type="number" min="0" placeholder="185" /></label>
    <label>Finding photos <input name="photos" type="file" accept="image/*" multiple /></label>
    <label>Notes <textarea name="notes" placeholder="What did you find?"></textarea></label>
    <label>Suggested repair <textarea name="suggestedRepair" placeholder="What do you recommend?"></textarea></label>
    <button type="submit">Upload Finding</button>
  </form>` : "";
  const existingFindings = (b.inspectionFindings || []).map((finding) => `<div class="item"><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.notes)}</p>${finding.photoUrls?.length ? `<div class="finding-gallery">${finding.photoUrls.map((src) => `<img src="${src}" alt="Finding" />`).join("")}</div>` : ""}</div>`).join("");
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} - ${b.dtcs || "No DTCs"}</p></div><span class="status">${b.status}</span></div>
    <p>${b.symptoms}</p>
    ${accept}${quote}${findings}${existingFindings}
    <div class="actions">${start}${add}${done}</div>
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

async function login(email, password = "DemoPass123!", adminAccessCode = "") {
  await api("/api/auth/login", { method: "POST", body: { email, password, adminAccessCode } });
  await refreshBase();
  toast("Logged in.");
}

async function register(role, form) {
  const body = Object.fromEntries(new FormData(form).entries());
  body.role = role;
  if (role === "CUSTOMER") body.customerTermsAccepted = form.elements.customerTermsAccepted.checked;
  if (role === "TECHNICIAN") {
    body.yearsInField = Number(body.yearsInField || 0);
    body.hasTravelVehicle = body.hasTravelVehicle === "true";
    body.honestRepairs = form.elements.honestRepairs.checked;
    body.complaintResolution = form.elements.complaintResolution.checked;
    body.technicianTermsAccepted = form.elements.technicianTermsAccepted.checked;
    body.legalName = form.elements.legalName.value;
    body.businessName = form.elements.businessName.value;
    body.electronicSignature = form.elements.electronicSignature.value;
  }
  await api("/api/auth/register", { method: "POST", body });
  if (role === "CUSTOMER") {
    await login(body.email, body.password);
    toast("Account created. Add your vehicle to book a technician.");
  } else {
    setAuthTab("login");
    toast("Technician application created. Admin approval is required before paid jobs.");
  }
}

$$("[data-auth-tab]").forEach((btn) => btn.addEventListener("click", () => setAuthTab(btn.dataset.authTab)));

$("#signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await register("CUSTOMER", e.currentTarget); } catch (err) { toast(err.message); }
});

$("#technicianSignupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await register("TECHNICIAN", e.currentTarget); } catch (err) { toast(err.message); }
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  try { await login(form.get("email"), form.get("password"), form.get("adminAccessCode") || ""); } catch (err) { toast(err.message); }
});

$("#ownerLoginBtn").addEventListener("click", () => {
  setAuthTab("login");
  $("#ownerCodeField").classList.remove("hidden");
  $("#loginForm [name=email]").value = "admin@demo.com";
  $("#loginForm [name=password]").value = "";
  toast("Enter your private owner access code to open admin controls.");
});

$("#resetPasswordBtn").addEventListener("click", async () => {
  const email = $("#loginForm [name=email]").value;
  try {
    const out = await api("/api/auth/password-reset", { method: "POST", body: { email } });
    if (out.resetUrl) {
      toast(`${out.message} Local test link: ${out.resetUrl}`);
      console.log("Password reset link:", out.resetUrl);
    } else {
      toast(out.message);
    }
  } catch (err) {
    toast(err.message);
  }
});

$("#newPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  if (body.password !== body.confirmPassword) return toast("Passwords do not match.");
  try {
    const out = await api("/api/auth/password-reset/confirm", { method: "POST", body });
    history.replaceState({}, "", "/");
    setAuthTab("login");
    $("#resetPanel").classList.add("hidden");
    $("#authPanel").classList.remove("hidden");
    toast(out.message);
  } catch (err) {
    toast(err.message);
  }
});

$("#backToLoginBtn").addEventListener("click", () => {
  history.replaceState({}, "", "/");
  setAuthTab("login");
  $("#resetPanel").classList.add("hidden");
  $("#authPanel").classList.remove("hidden");
});

$$("[data-login]").forEach((btn) => btn.addEventListener("click", () => login(btn.dataset.login)));
$$("[data-view]").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
$("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); state.user = null; showShell(); });

$("#vehicleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/vehicles", { method: "POST", body }); await refreshCustomer(); toast("Vehicle saved."); } catch (err) { toast(err.message); }
});

$("#techProfileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  const photo = form.elements.profilePhoto.files[0];
  if (photo) body.profilePhotoUrl = await fileToDataUrl(photo);
  body.mobileServiceAvailable = form.elements.mobileServiceAvailable.checked;
  body.shopServiceAvailable = form.elements.shopServiceAvailable.checked;
  try {
    await api("/api/technician/profile", { method: "PUT", body });
    await refreshTechnician();
    toast("Technician profile saved.");
  } catch (err) {
    toast(err.message);
  }
});

$("#bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/bookings", { method: "POST", body }); await refreshCustomer(); toast("Repair request sent."); } catch (err) { toast(err.message); }
});

document.body.addEventListener("submit", async (e) => {
  const form = e.target;
  try {
    if (form.dataset.acceptForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/bookings/${form.dataset.acceptForm}/accept`, { method: "POST", body });
      await refreshTechnician();
      toast("Appointment accepted and scheduled.");
    }
    if (form.dataset.quoteForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/bookings/${form.dataset.quoteForm}/quote`, { method: "POST", body: { amountCents: Math.round(Number(body.amount) * 100), pricingModel: "FLAT_RATE", laborMinutes: Number(body.laborMinutes) } });
      await refreshTechnician();
      toast("Flat-rate quote sent to customer.");
    }
    if (form.dataset.findingForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      body.photoUrls = await filesToDataUrls(form.elements.photos.files, 4);
      await api(`/api/bookings/${form.dataset.findingForm}/findings`, { method: "POST", body });
      form.reset();
      await refreshTechnician();
      toast("Inspection finding uploaded.");
    }
    if (form.dataset.commentForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/technicians/${form.dataset.commentForm}/comments`, { method: "POST", body });
      form.reset();
      await refreshCustomer();
      toast("Comment added to technician profile.");
    }
  } catch (err) {
    toast(err.message);
  }
});

document.body.addEventListener("click", async (e) => {
  const target = e.target;
  try {
    let handled = false;
    if (target.dataset.accept) { await api(`/api/bookings/${target.dataset.accept}/accept`, { method: "POST" }); handled = true; }
    if (target.dataset.quote) { await api(`/api/bookings/${target.dataset.quote}/quote`, { method: "POST", body: { amountCents: 42500, pricingModel: "FLAT_RATE", laborMinutes: 150 } }); handled = true; }
    if (target.dataset.approveQuote) { await api(`/api/bookings/${target.dataset.approveQuote}/approve-quote`, { method: "POST" }); handled = true; }
    if (target.dataset.status) {
      const [id, status] = target.dataset.status.split(":");
      await api(`/api/bookings/${id}/status`, { method: "POST", body: { status } });
      handled = true;
    }
    if (target.dataset.additional) { await api(`/api/bookings/${target.dataset.additional}/additional-work`, { method: "POST", body: { description: "Seized brake caliper replacement", amountCents: 18500 } }); handled = true; }
    if (target.dataset.addApprove) { await api(`/api/additional-work/${target.dataset.addApprove}/approve`, { method: "POST" }); handled = true; }
    if (target.dataset.addDecline) { await api(`/api/additional-work/${target.dataset.addDecline}/decline`, { method: "POST" }); handled = true; }
    if (target.dataset.review) { await api(`/api/bookings/${target.dataset.review}/review`, { method: "POST", body: { rating: 5, body: "Professional work and clear communication." } }); handled = true; }
    if (target.dataset.selectTech) {
      $("#technicianSelect").value = target.dataset.selectTech;
      $$("[data-tech-card]").forEach((card) => card.classList.toggle("selected", card.dataset.techCard === target.dataset.selectTech));
      $("#bookingForm").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Technician selected. Describe what you need done.");
    }
    if (handled) {
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
setAuthTab("signup");
const resetToken = new URLSearchParams(location.search).get("resetToken");
if (resetToken) {
  $("#newPasswordForm [name=token]").value = resetToken;
}
refreshBase().catch(() => showShell());
