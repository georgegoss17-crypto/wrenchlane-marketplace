const state = { user: null, profile: null, vehicles: [], categories: [], services: [], technicians: [], bookings: [], admin: null, selectedTechnicianId: null };
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

function toDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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
  $$("[data-view=customer]").forEach((button) => button.classList.toggle("hidden", state.user?.role !== "CUSTOMER"));
  $$("[data-view=technician]").forEach((button) => button.classList.toggle("hidden", state.user?.role !== "TECHNICIAN"));
  $$("[data-view=admin]").forEach((button) => button.classList.toggle("hidden", state.user?.role !== "ADMIN"));
  $("#logoutBtn").classList.toggle("hidden", !state.user);
  if (state.user) {
    $("#userBadge").innerHTML = `<div>${state.user.email}</div><p class="fineprint">${state.user.role}</p>`;
    switchView(state.user.role === "TECHNICIAN" ? "technician" : state.user.role === "ADMIN" ? "admin" : "customer");
  }
}

function allowedViewForRole(name) {
  if (!state.user) return false;
  if (state.user.role === "CUSTOMER") return ["customer", "technicianProfile"].includes(name);
  if (state.user.role === "TECHNICIAN") return name === "technician";
  if (state.user.role === "ADMIN") return name === "admin";
  return false;
}

function switchView(name) {
  if (!allowedViewForRole(name)) {
    toast("That page is not available for this account type.");
    return;
  }
  $$(".view").forEach((el) => el.classList.add("hidden"));
  $(`#${name}View`).classList.remove("hidden");
  if (name === "customer") refreshCustomer();
  if (name === "technicianProfile") refreshTechnicianProfilePage();
  if (name === "technician") refreshTechnician();
  if (name === "admin") refreshAdmin();
}

async function refreshBase() {
  const me = await api("/api/me");
  state.user = me.user;
  state.profile = me.profile;
  const svc = await api("/api/services");
  state.categories = svc.categories || [];
  state.services = svc.services;
  state.technicians = (await api("/api/technicians")).technicians;
  $("#serviceSelect").innerHTML = serviceOptionsHtml();
  $("#technicianSelect").innerHTML = state.technicians.map((t) => `<option value="${t.userId}">${t.fullName} - ${t.ratingAverage} stars - ${t.specialties.join(", ")}</option>`).join("");
  showShell();
}

function serviceOptionsHtml(selectedServiceId = "") {
  const byCategory = new Map(state.categories.map((category) => [category.id, { ...category, services: [] }]));
  for (const service of state.services) {
    if (!byCategory.has(service.categoryId)) byCategory.set(service.categoryId, { id: service.categoryId, name: "Other Services", services: [] });
    byCategory.get(service.categoryId).services.push(service);
  }
  return Array.from(byCategory.values()).map((category) => {
    const options = category.services.map((service) => `<option value="${service.id}" ${service.id === selectedServiceId ? "selected" : ""}>${escapeHtml(service.name)}</option>`).join("");
    return options ? `<optgroup label="${escapeHtml(category.name)}">${options}</optgroup>` : "";
  }).join("");
}

async function refreshCustomer() {
  if (!state.user || state.user.role !== "CUSTOMER") return;
  await refreshBaseProfileOnly();
  state.vehicles = (await api("/api/vehicles")).vehicles;
  state.bookings = (await api("/api/bookings")).bookings;
  state.technicians = (await api("/api/technicians")).technicians;
  $("#vehicleSelect").innerHTML = state.vehicles.map((v) => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`).join("");
  $("#bookingHint").classList.toggle("hidden", state.vehicles.length > 0);
  $("#bookingForm button[type=submit]").disabled = state.vehicles.length === 0;
  $("#technicianProfiles").innerHTML = state.technicians.map(renderTechnicianCard).join("") || "<p class='fineprint'>No approved technicians are available yet.</p>";
  fillCustomerProfileForm();
  $("#vehicleProfiles").innerHTML = state.vehicles.map(renderVehicleProfile).join("") || "<p class='fineprint'>No vehicles saved yet.</p>";
  $("#vehicleCount").textContent = state.vehicles.length;
  const active = state.bookings.find((b) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(b.status));
  $("#activeRepair").textContent = active ? active.status.replaceAll("_", " ") : "No active repair";
  $("#upcomingAppointment").textContent = active ? new Date(active.preferredAt).toLocaleString() : "None yet";
  $("#historyCount").textContent = `${state.bookings.filter((b) => b.status === "COMPLETED").length} completed`;
  $("#customerBookings").innerHTML = state.bookings.map(renderCustomerBooking).join("") || "<p class='fineprint'>No bookings yet.</p>";
}

function fillCustomerProfileForm() {
  $("#customerFullName").value = state.profile?.fullName || "";
  $("#customerEmail").value = state.user?.email || "";
  $("#customerPhone").value = state.profile?.phone || "";
}

function renderVehicleProfile(vehicle) {
  return `<details class="edit-booking">
    <summary>${vehicle.year} ${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}</summary>
    <form class="mini-form" data-vehicle-edit-form="${vehicle.id}">
      <label>Year <input name="year" type="number" value="${vehicle.year || ""}" required /></label>
      <label>Make <input name="make" value="${escapeHtml(vehicle.make || "")}" required /></label>
      <label>Model <input name="model" value="${escapeHtml(vehicle.model || "")}" required /></label>
      <label>Engine <input name="engine" value="${escapeHtml(vehicle.engine || "")}" /></label>
      <label>Mileage <input name="mileage" type="number" value="${vehicle.mileage || 0}" /></label>
      <label>VIN <input name="vin" value="${escapeHtml(vehicle.vin || "")}" /></label>
      <label>Plate <input name="plate" value="${escapeHtml(vehicle.plate || "")}" /></label>
      <label>Color <input name="color" value="${escapeHtml(vehicle.color || "")}" /></label>
      <button type="submit">Save Vehicle Profile</button>
    </form>
  </details>`;
}

function renderTechnicianCard(t) {
  const reviewCount = (t.reviews || []).length;
  return `<article class="tech-card" data-tech-card="${t.userId}" data-open-tech="${t.userId}" tabindex="0">
    <div class="profile-card">
      ${t.profilePhotoUrl ? `<img class="avatar" src="${t.profilePhotoUrl}" alt="${escapeHtml(t.fullName)}" />` : `<div class="avatar">WL</div>`}
      <div>
        <button class="link-button" type="button" data-open-tech="${t.userId}"><strong>${escapeHtml(t.fullName)}</strong></button>
        <p class="meta">${t.ratingAverage || "New"} stars - ${t.yearsExperience || 0} years</p>
        <p class="meta">${reviewCount} reviews</p>
      </div>
    </div>
    <p>${escapeHtml(t.bio || "This technician has not added a bio yet.")}</p>
    <p class="fineprint">${escapeHtml((t.specialties || []).join(", "))}</p>
    <button type="button" data-select-tech="${t.userId}">Select This Technician</button>
  </article>`;
}

function openTechnicianProfile(technicianId) {
  state.selectedTechnicianId = technicianId;
  switchView("technicianProfile");
}

function refreshTechnicianProfilePage() {
  const t = state.technicians.find((item) => item.userId === state.selectedTechnicianId);
  if (!t) {
    $("#selectedTechnicianProfile").innerHTML = "<p class='fineprint'>Technician profile could not be found.</p>";
    return;
  }
  $("#profilePageTitle").textContent = t.fullName;
  const reviews = (t.reviews || []).map((review) => `<div class="comment"><strong>${review.rating} stars</strong><p>${escapeHtml(review.body || "No review comment.")}</p></div>`).join("");
  const comments = (t.comments || []).map((comment) => `<div class="comment">${escapeHtml(comment.body)}</div>`).join("");
  $("#selectedTechnicianProfile").innerHTML = `<div class="tech-profile-page">
    <div class="profile-card large-profile">
      ${t.profilePhotoUrl ? `<img class="profile-photo" src="${t.profilePhotoUrl}" alt="${escapeHtml(t.fullName)}" />` : `<div class="profile-photo">WL</div>`}
      <div>
        <h2>${escapeHtml(t.fullName)}</h2>
        <p class="meta">${t.ratingAverage || "New"} stars - ${t.yearsExperience || 0} years in the field</p>
        <p class="meta">Flat rate from ${money(t.defaultFlatRateCents)} minimum</p>
        <p>${escapeHtml(t.bio || "This technician has not added a bio yet.")}</p>
        <p class="fineprint">${escapeHtml((t.specialties || []).join(", "))}</p>
        <p class="fineprint">${escapeHtml((t.certifications || []).join(", "))}</p>
        <button type="button" data-select-tech="${t.userId}">Select This Technician</button>
      </div>
    </div>
    <div class="grid two">
      <section>
        <h3>Reviews</h3>
        <div class="comment-list">${reviews || "<p class='fineprint'>No reviews yet.</p>"}</div>
      </section>
      <section>
        <h3>Profile Comments</h3>
        <div class="comment-list">${comments || "<p class='fineprint'>No profile comments yet.</p>"}</div>
        <form class="comment-form" data-comment-form="${t.userId}">
          <input name="body" placeholder="Leave a profile comment" />
          <button type="submit">Post</button>
        </form>
      </section>
    </div>
  </div>`;
}

function renderCustomerBooking(b) {
  const quoteActions = b.quote && b.quote.status === "PENDING" ? `<button data-approve-quote="${b.id}">Approve ${money(b.quote.amountCents)}</button>` : "";
  const reviewPanel = renderCustomerReviewPanel(b);
  const editForm = renderBookingEditForm(b);
  const additions = (b.additionalWorkRequests || []).map((item) => `<div class="item">
    <p><strong>Suggested repair:</strong> ${escapeHtml(item.description)}</p>
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
  const chat = renderBookingChat(b);
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} at ${new Date(b.preferredAt).toLocaleString()}</p></div><span class="status">${b.status}</span></div>
    ${tech}
    <p>${b.symptoms || "No symptoms provided."}</p>
    ${editForm}
    ${b.invoice ? `<p><strong>Invoice:</strong> ${money(b.invoice.totalCents)} | Platform fee ${money(b.invoice.platformFeeCents)} | Technician ${money(b.invoice.technicianEarningsCents)}</p>` : ""}
    ${findings}
    ${additions}
    ${chat}
    ${reviewPanel}
    <div class="actions">${quoteActions}</div>
  </article>`;
}

function renderCustomerReviewPanel(b) {
  if (b.status !== "COMPLETED") return "";
  if (b.review) {
    return `<section class="review-panel">
      <h3>Your Review</h3>
      <p><strong>${b.review.rating} stars</strong></p>
      <p>${escapeHtml(b.review.body || "No review comment.")}</p>
      <p class="fineprint">This review is posted on the technician profile.</p>
    </section>`;
  }
  return `<section class="review-panel">
    <h3>Leave a Review</h3>
    <form class="mini-form review-form" data-review-form="${b.id}">
      <label>Star rating
        <select name="rating" required>
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
      </label>
      <label>Review comment <textarea name="body" placeholder="Tell other customers about this technician"></textarea></label>
      <button type="submit">Post Review</button>
    </form>
  </section>`;
}

function renderBookingChat(b) {
  const messages = (b.messages || []).map((message) => {
    const mine = message.senderId === state.user?.id;
    return `<div class="chat-message ${mine ? "mine" : ""}">
      <strong>${mine ? "You" : "Them"}</strong>
      <p>${escapeHtml(message.body)}</p>
      <span>${new Date(message.createdAt).toLocaleString()}</span>
    </div>`;
  }).join("");
  return `<section class="chat-box">
    <h3>Live Chat</h3>
    <div class="chat-log">${messages || "<p class='fineprint'>No messages yet.</p>"}</div>
    <form class="comment-form" data-chat-form="${b.id}">
      <input name="body" placeholder="Type a message" />
      <button type="submit">Send</button>
    </form>
  </section>`;
}

function renderBookingEditForm(b) {
  if (!["REQUESTED", "BOOKED", "QUOTED", "AWAITING_CUSTOMER_APPROVAL"].includes(b.status) || b.quote?.status === "APPROVED") return "";
  const vehicleOptions = state.vehicles.map((vehicle) => `<option value="${vehicle.id}" ${vehicle.id === b.vehicleId ? "selected" : ""}>${vehicle.year} ${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}</option>`).join("");
  const techOptions = state.technicians.map((tech) => `<option value="${tech.userId}" ${tech.userId === b.technicianId ? "selected" : ""}>${escapeHtml(tech.fullName)} - ${tech.ratingAverage || "New"} stars</option>`).join("");
  return `<details class="edit-booking">
    <summary>Edit booking</summary>
    <form class="mini-form" data-booking-edit-form="${b.id}">
      <label>Vehicle <select name="vehicleId">${vehicleOptions}</select></label>
      <label>Service <select name="serviceId">${serviceOptionsHtml(b.serviceId)}</select></label>
      <label>Technician <select name="technicianId">${techOptions}</select></label>
      <label>Service mode
        <select name="serviceMode">
          <option value="MOBILE" ${b.serviceMode === "MOBILE" ? "selected" : ""}>Mobile service</option>
          <option value="SHOP" ${b.serviceMode === "SHOP" ? "selected" : ""}>Shop service</option>
        </select>
      </label>
      <label>Preferred time <input name="preferredAt" type="datetime-local" value="${toDateTimeLocal(b.preferredAt)}" required /></label>
      <label>Address <input name="address" value="${escapeHtml(b.location?.address || "")}" required /></label>
      <label>Describe what you need done <textarea name="symptoms">${escapeHtml(b.symptoms || "")}</textarea></label>
      <label>DTCs <input name="dtcs" value="${escapeHtml(b.dtcs || "")}" /></label>
      <button type="submit">Save Booking Changes</button>
      <p class="fineprint">Editing after a quote is sent will send the request back to the technician for review.</p>
    </form>
  </details>`;
}

async function refreshTechnician() {
  if (!state.user || state.user.role !== "TECHNICIAN") return;
  state.bookings = (await api("/api/bookings")).bookings;
  await refreshBaseProfileOnly();
  fillTechProfileForm();
  const techReviews = await api("/api/technician/reviews");
  const opportunities = state.bookings.filter((b) => b.status === "REQUESTED");
  $("#opportunityCount").textContent = opportunities.length;
  const current = state.bookings.find((b) => ["BOOKED", "ARRIVED", "IN_PROGRESS"].includes(b.status));
  $("#currentJob").textContent = current ? current.service.name : "None";
  $("#earnings").textContent = money(state.bookings.reduce((sum, b) => sum + (b.invoice?.technicianEarningsCents || 0), 0));
  $("#techJobs").innerHTML = state.bookings.map(renderTechJob).join("") || "<p class='fineprint'>No jobs assigned yet.</p>";
  $("#techReviews").innerHTML = techReviews.reviews.map(renderTechReview).join("") || "<p class='fineprint'>No customer reviews yet.</p>";
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
  const estimatedHours = Math.max((b.service.estimatedMinutes || 60) / 60, 0.5);
  const defaultHours = Math.ceil(estimatedHours * 2) / 2;
  const minimumQuoteDollars = Math.max(100, defaultHours * 100);
  const quote = ["REQUESTED", "BOOKED"].includes(b.status) && !b.quote ? `<form class="mini-form" data-quote-form="${b.id}">
    <label>Flat rate <input name="amount" type="number" min="${minimumQuoteDollars}" step="1" value="${dollars(Math.max(state.profile?.defaultFlatRateCents || b.service.basePriceCents, minimumQuoteDollars * 100))}" /></label>
    <label>Labor hours <input name="laborHours" type="number" min="0.5" step="0.5" value="${defaultHours.toFixed(1)}" /></label>
    <button type="submit">Send Quote</button>
    <p class="fineprint">Flat rate must be $100 or more. Labor hours must use .5 increments.</p>
  </form>` : "";
  const start = b.status === "BOOKED" ? `<button data-status="${b.id}:IN_PROGRESS">Start Job</button>` : "";
  const add = b.status === "IN_PROGRESS" ? `<form class="mini-form" data-additional-work-form="${b.id}">
    <label>Suggested repair <textarea name="description" placeholder="Example: Suggest replacing the caliper, front brake pads and rotors"></textarea></label>
    <label>Price to customer <input name="amount" type="number" min="1" step="1" placeholder="185" /></label>
    <button type="submit">Send Additional Repair</button>
  </form>` : "";
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
  const chat = renderBookingChat(b);
  const customerContact = b.customerContactAvailable ? `<div class="privacy-box">
    <strong>Booked customer contact</strong>
    <p class="meta">${escapeHtml(b.customerProfile?.fullName || "Customer")} - ${escapeHtml(b.customer?.email || "No email listed")} - ${escapeHtml(b.customerProfile?.phone || "No phone listed")}</p>
    <p class="meta">${escapeHtml(b.location?.address || "")}${b.location?.city ? `, ${escapeHtml(b.location.city)}` : ""}${b.location?.region ? `, ${escapeHtml(b.location.region)}` : ""} ${escapeHtml(b.location?.postalCode || "")}</p>
    <p class="meta">VIN: ${escapeHtml(b.vehicle?.vin || "Not listed")} - Plate: ${escapeHtml(b.vehicle?.plate || "Not listed")}</p>
  </div>` : `<p class="fineprint">Customer contact, exact address, VIN, and plate stay private until the appointment is booked.</p>`;
  return `<article class="item">
    <div class="item-head"><div><strong>${b.service.name}</strong><p class="meta">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} - ${b.dtcs || "No DTCs"}</p></div><span class="status">${b.status}</span></div>
    <p>${b.symptoms}</p>
    ${customerContact}
    ${accept}${quote}${findings}${existingFindings}
    ${chat}
    <div class="actions">${start}${add}${done}</div>
  </article>`;
}

function renderTechReview(review) {
  const disputeText = review.dispute ? `<p class="fineprint">Sent to owner/admin for review.</p>` : `<form class="mini-form" data-review-dispute-form="${review.id}">
    <label>Why should the owner/admin review this? <textarea name="reason" placeholder="Explain what is inaccurate or unfair about this review."></textarea></label>
    <button type="submit">Send To Owner/Admin</button>
  </form>`;
  return `<article class="item">
    <div class="item-head"><div><strong>${review.rating} stars</strong><p class="meta">${new Date(review.createdAt).toLocaleString()}</p></div><span class="status">${review.status || "ACTIVE"}</span></div>
    <p>${escapeHtml(review.body || "No review comment.")}</p>
    ${disputeText}
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
  $("#adminTechnicianApplications").innerHTML = (state.admin.pendingTechnicians || []).map(renderAdminTechnicianApplication).join("") || "<p class='fineprint'>No technician applications waiting right now.</p>";
  $("#adminCustomerAccounts").innerHTML = (state.admin.customers || []).map(renderAdminCustomerAccount).join("") || "<p class='fineprint'>No customer accounts yet.</p>";
  $("#adminTechnicianAccounts").innerHTML = (state.admin.technicians || []).map(renderAdminTechnicianAccount).join("") || "<p class='fineprint'>No technician accounts yet.</p>";
  $("#adminReviewDisputes").innerHTML = (state.admin.reviewDisputes || []).map(renderAdminReviewDispute).join("") || "<p class='fineprint'>No review disputes need a decision.</p>";
  renderAdminStorageAndLogs();
}

function renderAdminStorageAndLogs() {
  const storage = state.admin.storage || {};
  $("#adminStorageStatus").innerHTML = `<article class="item">
    <strong>${storage.persistentDiskExpected ? "Persistent storage path detected" : "Check Render persistent disk settings"}</strong>
    <p class="meta">Data: ${escapeHtml(storage.dataDir || "Unknown")}</p>
    <p class="meta">Database: ${escapeHtml(storage.databaseFile || "Unknown")}</p>
    <p class="meta">Backups kept: ${storage.backupCount || 0}</p>
  </article>`;
  const logs = [...(state.admin.recentLogs || []), ...(state.admin.recentNotifications || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  $("#adminRecentLogs").innerHTML = logs.map((log) => `<article class="item">
    <strong>${escapeHtml(log.action || log.type || "Log")}</strong>
    <p>${escapeHtml(log.title || log.body || log.entityType || "")}</p>
    <p class="meta">${new Date(log.createdAt).toLocaleString()}</p>
  </article>`).join("") || "<p class='fineprint'>No recent logs yet.</p>";
}

function renderAdminTechnicianApplication(profile) {
  const answers = profile.applicationAnswers || {};
  return `<article class="item">
    <div class="item-head">
      <div>
        <strong>${escapeHtml(profile.fullName)}</strong>
        <p class="meta">${escapeHtml(profile.user?.email || "")} - ${profile.verificationStatus}</p>
      </div>
      <span class="status">${profile.yearsExperience || 0} years</span>
    </div>
    <p><strong>Legal name:</strong> ${escapeHtml(answers.legalName || "")}</p>
    <p><strong>Business:</strong> ${escapeHtml(answers.businessName || "None listed")}</p>
    <p><strong>Travel vehicle:</strong> ${answers.hasTravelVehicle ? "Yes" : "No"}</p>
    <p><strong>Parts preference:</strong> ${escapeHtml(answers.partsPreference || "Not listed")}</p>
    <p><strong>Honesty agreement:</strong> ${answers.honestRepairs ? "Yes" : "No"} | <strong>Complaint agreement:</strong> ${answers.complaintResolution ? "Yes" : "No"}</p>
    <div class="actions">
      <button type="button" data-tech-approval="${profile.userId}:APPROVED">Approve</button>
      <button type="button" class="ghost" data-tech-approval="${profile.userId}:DENIED">Deny</button>
    </div>
  </article>`;
}

function renderAdminCustomerAccount(customer) {
  const name = customer.profile?.fullName || "Customer";
  const details = `${customer.vehicleCount || 0} vehicles - ${customer.bookingCount || 0} bookings`;
  const disabled = customer.status === "DELETED";
  return `<article class="item">
    <div class="item-head">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <p class="meta">${escapeHtml(customer.email)} - ${escapeHtml(customer.statusLabel || customer.status)}</p>
      </div>
      <span class="status">${details}</span>
    </div>
    <p class="fineprint">Last booking: ${customer.lastBookingAt ? new Date(customer.lastBookingAt).toLocaleString() : "None yet"}</p>
    <form class="mini-form" data-customer-status-form="${customer.id}">
      <label>Reason <input name="reason" placeholder="Reason for this account action" /></label>
      <label>Suspend
        <select name="days">
          <option value="5">5 days</option>
          <option value="15">15 days</option>
          <option value="30">30 days</option>
        </select>
      </label>
      <div class="actions">
        <button name="action" value="SUSPEND" type="submit" ${disabled ? "disabled" : ""}>Suspend</button>
        <button name="action" value="BLOCK" type="submit" class="ghost" ${disabled ? "disabled" : ""}>Block</button>
        <button name="action" value="DELETE" type="submit" class="ghost">Delete</button>
        <button name="action" value="ACTIVATE" type="submit" class="ghost">Reactivate</button>
      </div>
    </form>
  </article>`;
}

function renderAdminTechnicianAccount(technician) {
  const name = technician.profile?.fullName || "Technician";
  const details = `${technician.activeBookingCount || 0} active - ${technician.bookingCount || 0} total jobs`;
  const disabled = technician.status === "DELETED";
  return `<article class="item">
    <div class="item-head">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <p class="meta">${escapeHtml(technician.email)} - ${escapeHtml(technician.statusLabel || technician.status)}</p>
        <p class="meta">Profile: ${escapeHtml(technician.profile?.verificationStatus || "No profile")} - Rating: ${escapeHtml(technician.profile?.ratingAverage || "New")}</p>
      </div>
      <span class="status">${details}</span>
    </div>
    <p class="fineprint">Last booking: ${technician.lastBookingAt ? new Date(technician.lastBookingAt).toLocaleString() : "None yet"}</p>
    <form class="mini-form" data-technician-status-form="${technician.id}">
      <label>Reason <input name="reason" placeholder="Reason for this account action" /></label>
      <label>Suspend
        <select name="days">
          <option value="5">5 days</option>
          <option value="15">15 days</option>
          <option value="30">30 days</option>
        </select>
      </label>
      <div class="actions">
        <button name="action" value="SUSPEND" type="submit" ${disabled ? "disabled" : ""}>Suspend</button>
        <button name="action" value="BLOCK" type="submit" class="ghost" ${disabled ? "disabled" : ""}>Block</button>
        <button name="action" value="DELETE" type="submit" class="ghost">Delete</button>
        <button name="action" value="ACTIVATE" type="submit" class="ghost">Reactivate</button>
      </div>
    </form>
  </article>`;
}

function renderAdminReviewDispute(dispute) {
  return `<article class="item">
    <div class="item-head"><div><strong>${escapeHtml(dispute.technicianProfile?.fullName || "Technician")}</strong><p class="meta">Customer: ${escapeHtml(dispute.customer?.email || "Unknown")}</p></div><span class="status">${dispute.status}</span></div>
    <p><strong>Review:</strong> ${dispute.review?.rating || "?"} stars - ${escapeHtml(dispute.review?.body || "No review comment.")}</p>
    <p><strong>Technician complaint:</strong> ${escapeHtml(dispute.reason)}</p>
    <form class="mini-form" data-admin-review-dispute-form="${dispute.id}">
      <label>Admin notes <textarea name="adminNotes" placeholder="Notes from contacting customer and technician"></textarea></label>
      <div class="actions">
        <button name="decision" value="KEEP" type="submit">Keep Review</button>
        <button name="decision" value="REMOVE" type="submit" class="ghost">Remove Review</button>
      </div>
    </form>
  </article>`;
}

function updateOwnerCodeVisibility() {
  $("#ownerCodeField").classList.toggle("hidden", $("#loginRole").value !== "ADMIN");
}

async function login(email, password = "DemoPass123!", adminAccessCode = "", role = "") {
  await api("/api/auth/login", { method: "POST", body: { email, password, adminAccessCode, role } });
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
    await login(body.email, body.password, "", "CUSTOMER");
    toast("Account created. Add your vehicle to book a technician.");
  } else {
    await login(body.email, body.password, "", "TECHNICIAN");
    toast("Technician application created. Admin approval is required before customers can book you.");
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
  try { await login(form.get("email"), form.get("password"), form.get("adminAccessCode") || "", form.get("role") || ""); } catch (err) { toast(err.message); }
});

$("#loginRole").addEventListener("change", updateOwnerCodeVisibility);

$("#ownerLoginBtn").addEventListener("click", () => {
  setAuthTab("login");
  $("#loginRole").value = "ADMIN";
  updateOwnerCodeVisibility();
  $("#ownerCodeField").classList.remove("hidden");
  $("#loginForm [name=password]").value = "";
  toast("Enter your private owner access code to open admin controls.");
});

$("#resetPasswordBtn").addEventListener("click", async () => {
  const email = $("#loginForm [name=email]").value;
  const role = $("#loginRole").value;
  try {
    const out = await api("/api/auth/password-reset", { method: "POST", body: { email, role } });
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

$$("[data-login]").forEach((btn) => btn.addEventListener("click", () => login(btn.dataset.login, "DemoPass123!", "", btn.dataset.loginRole || "")));
$$("[data-view]").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
$("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); state.user = null; showShell(); });

$("#vehicleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/vehicles", { method: "POST", body }); await refreshCustomer(); toast("Vehicle saved."); } catch (err) { toast(err.message); }
});

$("#customerProfileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/customer/profile", { method: "PUT", body }); await refreshCustomer(); toast("Customer profile saved."); } catch (err) { toast(err.message); }
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
      await api(`/api/bookings/${form.dataset.quoteForm}/quote`, { method: "POST", body: { amountCents: Math.round(Number(body.amount) * 100), pricingModel: "FLAT_RATE", laborHours: Number(body.laborHours) } });
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
    if (form.dataset.additionalWorkForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/bookings/${form.dataset.additionalWorkForm}/additional-work`, { method: "POST", body: { description: body.description, amountCents: Math.round(Number(body.amount) * 100) } });
      form.reset();
      await refreshTechnician();
      toast("Additional repair sent to customer.");
    }
    if (form.dataset.bookingEditForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/bookings/${form.dataset.bookingEditForm}`, { method: "PUT", body });
      await refreshCustomer();
      toast("Booking updated.");
    }
    if (form.dataset.vehicleEditForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/vehicles/${form.dataset.vehicleEditForm}`, { method: "PUT", body });
      await refreshCustomer();
      toast("Vehicle profile saved.");
    }
    if (form.dataset.chatForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/bookings/${form.dataset.chatForm}/message`, { method: "POST", body });
      form.reset();
      if (state.user?.role === "TECHNICIAN") await refreshTechnician();
      else await refreshCustomer();
      toast("Message sent.");
    }
    if (form.dataset.reviewForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      body.rating = Number(body.rating);
      await api(`/api/bookings/${form.dataset.reviewForm}/review`, { method: "POST", body });
      state.technicians = (await api("/api/technicians")).technicians;
      await refreshCustomer();
      toast("Review posted to the technician profile.");
    }
    if (form.dataset.commentForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/technicians/${form.dataset.commentForm}/comments`, { method: "POST", body });
      form.reset();
      state.technicians = (await api("/api/technicians")).technicians;
      if (state.selectedTechnicianId === form.dataset.commentForm && !$("#technicianProfileView").classList.contains("hidden")) refreshTechnicianProfilePage();
      else await refreshCustomer();
      toast("Comment added to technician profile.");
    }
    if (form.dataset.reviewDisputeForm) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      await api(`/api/reviews/${form.dataset.reviewDisputeForm}/dispute`, { method: "POST", body });
      await refreshTechnician();
      toast("Review dispute sent to owner/admin.");
    }
    if (form.dataset.adminReviewDisputeForm) {
      e.preventDefault();
      const submitter = e.submitter;
      const body = Object.fromEntries(new FormData(form).entries());
      body.decision = submitter?.value || body.decision;
      await api(`/api/admin/review-disputes/${form.dataset.adminReviewDisputeForm}/resolve`, { method: "POST", body });
      await refreshAdmin();
      toast(body.decision === "REMOVE" ? "Review removed." : "Review kept.");
    }
    if (form.dataset.customerStatusForm) {
      e.preventDefault();
      const submitter = e.submitter;
      const body = Object.fromEntries(new FormData(form).entries());
      body.customerId = form.dataset.customerStatusForm;
      body.action = submitter?.value || body.action;
      await api("/api/admin/customers/status", { method: "POST", body });
      await refreshAdmin();
      toast("Customer account updated.");
    }
    if (form.dataset.technicianStatusForm) {
      e.preventDefault();
      const submitter = e.submitter;
      const body = Object.fromEntries(new FormData(form).entries());
      body.technicianId = form.dataset.technicianStatusForm;
      body.action = submitter?.value || body.action;
      await api("/api/admin/technicians/status", { method: "POST", body });
      await refreshAdmin();
      toast("Technician account updated.");
    }
  } catch (err) {
    toast(err.message);
  }
});

document.body.addEventListener("click", async (e) => {
  const target = e.target.closest("button, [data-open-tech], [data-tech-card]") || e.target;
  try {
    let handled = false;
    if (target.dataset.accept) { await api(`/api/bookings/${target.dataset.accept}/accept`, { method: "POST" }); handled = true; }
    if (target.dataset.quote) { await api(`/api/bookings/${target.dataset.quote}/quote`, { method: "POST", body: { amountCents: 42500, pricingModel: "FLAT_RATE", laborHours: 2.5 } }); handled = true; }
    if (target.dataset.approveQuote) { await api(`/api/bookings/${target.dataset.approveQuote}/approve-quote`, { method: "POST" }); handled = true; }
    if (target.dataset.status) {
      const [id, status] = target.dataset.status.split(":");
      await api(`/api/bookings/${id}/status`, { method: "POST", body: { status } });
      handled = true;
    }
    if (target.dataset.addApprove) { await api(`/api/additional-work/${target.dataset.addApprove}/approve`, { method: "POST" }); handled = true; }
    if (target.dataset.addDecline) { await api(`/api/additional-work/${target.dataset.addDecline}/decline`, { method: "POST" }); handled = true; }
    if (target.dataset.techApproval) {
      const [technicianId, status] = target.dataset.techApproval.split(":");
      await api("/api/admin/technicians/approve", { method: "POST", body: { technicianId, status } });
      await refreshAdmin();
      toast(status === "APPROVED" ? "Technician approved." : "Technician denied.");
      handled = false;
    }
    if (target.dataset.openTech && !e.target.closest("form, input, textarea, select")) {
      openTechnicianProfile(target.dataset.openTech);
      toast("Technician profile opened.");
    }
    if (target.dataset.selectTech) {
      $("#technicianSelect").value = target.dataset.selectTech;
      $$("[data-tech-card]").forEach((card) => card.classList.toggle("selected", card.dataset.techCard === target.dataset.selectTech));
      switchView("customer");
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

$("#exportDatabaseBtn").addEventListener("click", async () => {
  try {
    const backup = await api("/api/admin/database-export");
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wrenchlane-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    await refreshAdmin();
    toast("Database backup downloaded.");
  } catch (err) {
    toast(err.message);
  }
});

$("#importDatabaseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = e.currentTarget.elements.backupFile.files[0];
  if (!file) return toast("Choose a backup file first.");
  try {
    const backup = JSON.parse(await file.text());
    const result = await api("/api/admin/database-import", { method: "POST", body: backup });
    await refreshAdmin();
    e.currentTarget.reset();
    toast(`Backup restored: ${result.customers} customers, ${result.technicians} techs.`);
  } catch (err) {
    toast(`Restore failed: ${err.message}`);
  }
});

$("#bookButton").addEventListener("click", () => $("#bookingForm").scrollIntoView({ behavior: "smooth" }));
$("#findJobs").addEventListener("click", refreshTechnician);
$("#backToTechnicians").addEventListener("click", () => switchView("customer"));

async function refreshCurrentView() {
  if (!state.user) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (!document.hidden) {
    if (state.user.role === "CUSTOMER") await refreshCustomer();
    if (state.user.role === "TECHNICIAN") await refreshTechnician();
    if (state.user.role === "ADMIN") await refreshAdmin();
  }
}

setPreferredTime();
setAuthTab("signup");
const resetToken = new URLSearchParams(location.search).get("resetToken");
if (resetToken) {
  $("#newPasswordForm [name=token]").value = resetToken;
}
refreshBase().catch(() => showShell());
setInterval(() => refreshCurrentView().catch((err) => console.warn("Auto refresh failed", err)), 60 * 1000);
