const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const SESSION_SECRET = process.env.SESSION_SECRET || "local-development-secret-change-before-production";

const roles = {
  CUSTOMER: "CUSTOMER",
  TECHNICIAN: "TECHNICIAN",
  ADMIN: "ADMIN"
};

const jobStatuses = [
  "REQUESTED",
  "QUOTED",
  "AWAITING_CUSTOMER_APPROVAL",
  "BOOKED",
  "TECHNICIAN_EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "ADDITIONAL_WORK_REQUESTED",
  "ADDITIONAL_WORK_APPROVED",
  "ADDITIONAL_WORK_DECLINED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED"
];

const allowedTransitions = {
  REQUESTED: ["QUOTED", "BOOKED", "CANCELLED"],
  QUOTED: ["AWAITING_CUSTOMER_APPROVAL", "CANCELLED"],
  AWAITING_CUSTOMER_APPROVAL: ["BOOKED", "CANCELLED"],
  BOOKED: ["TECHNICIAN_EN_ROUTE", "ARRIVED", "IN_PROGRESS", "CANCELLED", "DISPUTED"],
  TECHNICIAN_EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["ADDITIONAL_WORK_REQUESTED", "COMPLETED", "DISPUTED"],
  ADDITIONAL_WORK_REQUESTED: ["ADDITIONAL_WORK_APPROVED", "ADDITIONAL_WORK_DECLINED", "DISPUTED"],
  ADDITIONAL_WORK_APPROVED: ["IN_PROGRESS", "COMPLETED"],
  ADDITIONAL_WORK_DECLINED: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: ["DISPUTED", "REFUNDED"],
  CANCELLED: [],
  DISPUTED: ["REFUNDED"],
  REFUNDED: []
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function cents(amount) {
  return Math.round(Number(amount) * 100);
}

function money(centsValue) {
  return `$${(centsValue / 100).toFixed(2)}`;
}

function blankDb() {
  return {
    users: [],
    customerProfiles: [],
    technicianProfiles: [],
    technicianCertifications: [],
    vehicles: [],
    serviceCategories: [],
    services: [],
    bookings: [],
    quotes: [],
    invoices: [],
    payments: [],
    payouts: [],
    additionalWorkRequests: [],
    inspectionFindings: [],
    messages: [],
    reviews: [],
    notifications: [],
    disputes: [],
    locations: [],
    availability: [],
    adminUsers: [],
    platformSettings: [],
    auditLogs: [],
    sessions: []
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), actual);
}

function signedSessionValue(sessionId) {
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(sessionId).digest("hex");
  return `${sessionId}.${sig}`;
}

function readSessionValue(cookieValue) {
  if (!cookieValue) return null;
  const [sessionId, sig] = cookieValue.split(".");
  if (!sessionId || !sig) return null;
  const expected = signedSessionValue(sessionId).split(".")[1];
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? sessionId : null;
}

function seed(db) {
  if (db.users.length) return db;
  const createdAt = now();
  const customer = { id: id("usr"), email: "customer@demo.com", passwordHash: hashPassword("DemoPass123!"), role: roles.CUSTOMER, status: "ACTIVE", createdAt, updatedAt: createdAt };
  const tech = { id: id("usr"), email: "tech@demo.com", passwordHash: hashPassword("DemoPass123!"), role: roles.TECHNICIAN, status: "ACTIVE", createdAt, updatedAt: createdAt };
  const admin = { id: id("usr"), email: "admin@demo.com", passwordHash: hashPassword("DemoPass123!"), role: roles.ADMIN, status: "ACTIVE", createdAt, updatedAt: createdAt };
  const brakes = { id: id("cat"), name: "Brakes" };
  const electrical = { id: id("cat"), name: "Diagnostics" };
  db.users.push(customer, tech, admin);
  db.customerProfiles.push({ id: id("cus"), userId: customer.id, fullName: "Jordan Driver", phone: "555-0100", createdAt, updatedAt: createdAt });
  db.technicianProfiles.push({
    id: id("tec"),
    userId: tech.id,
    fullName: "Avery Masterson",
    profilePhotoUrl: "",
    bio: "ASE-certified mobile technician focused on clear estimates, clean work, and honest inspections.",
    yearsExperience: 12,
    specialties: ["Brakes", "Diagnostics", "Suspension"],
    certifications: ["ASE Brakes", "ASE Electrical"],
    serviceRadiusMiles: 35,
    mobileServiceAvailable: true,
    shopServiceAvailable: true,
    hourlyRateCents: 10500,
    defaultFlatRateCents: 42500,
    verificationStatus: "APPROVED",
    ratingAverage: 4.9,
    createdAt,
    updatedAt: createdAt
  });
  db.technicianCertifications.push({ id: id("cert"), technicianProfileId: db.technicianProfiles[0].id, name: "ASE Brakes", documentUrl: "", status: "APPROVED", createdAt });
  db.serviceCategories.push(brakes, electrical);
  db.services.push(
    { id: id("svc"), categoryId: brakes.id, name: "Brake pads and rotors", description: "Replace pads and rotors on one axle.", pricingModel: "FLAT_RATE", basePriceCents: 42500, estimatedMinutes: 150, requiredSpecialty: "Brakes" },
    { id: id("svc"), categoryId: electrical.id, name: "Check engine diagnostic", description: "Read DTCs and perform initial diagnostic workflow.", pricingModel: "HOURLY", basePriceCents: 14500, estimatedMinutes: 60, requiredSpecialty: "Diagnostics" }
  );
  db.platformSettings.push({ key: "platformCommissionPercent", value: "10", updatedAt: createdAt });
  db.adminUsers.push({ id: id("adm"), userId: admin.id, createdAt });
  return db;
}

function normalizeDb(db) {
  const template = blankDb();
  for (const key of Object.keys(template)) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  for (const profile of db.technicianProfiles) {
    if (typeof profile.bio !== "string") profile.bio = "";
    if (typeof profile.profilePhotoUrl !== "string") profile.profilePhotoUrl = "";
    if (typeof profile.defaultFlatRateCents !== "number") profile.defaultFlatRateCents = 35000;
  }
  return db;
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbFile = process.env.DB_FILE || path.join(DATA_DIR, "database.json");
  if (!fs.existsSync(dbFile)) {
    const seeded = normalizeDb(seed(blankDb()));
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    fs.writeFileSync(dbFile, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  return normalizeDb(seed(JSON.parse(fs.readFileSync(dbFile, "utf8"))));
}

function saveDb(db) {
  const dbFile = process.env.DB_FILE || path.join(DATA_DIR, "database.json");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role, status: user.status };
}

function sanitize(text) {
  return String(text || "").replace(/[<>]/g, "").trim();
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

function error(res, status, message) {
  send(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 6_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function currentUser(req, db) {
  const sessionId = readSessionValue(parseCookies(req).session);
  const session = db.sessions.find((item) => item.id === sessionId && item.expiresAt > now());
  return session ? db.users.find((user) => user.id === session.userId && user.status === "ACTIVE") : null;
}

function requireUser(req, res, db, allowedRoles) {
  const user = currentUser(req, db);
  if (!user) {
    error(res, 401, "Please log in first.");
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    error(res, 403, "You are not allowed to do that.");
    return null;
  }
  return user;
}

function setting(db, key, fallback) {
  return db.platformSettings.find((item) => item.key === key)?.value || fallback;
}

function addAudit(db, actorUserId, action, entityType, entityId, metadata = {}) {
  db.auditLogs.push({ id: id("aud"), actorUserId, action, entityType, entityId, metadata, createdAt: now() });
}

function notify(db, userId, type, title, body) {
  db.notifications.push({ id: id("not"), userId, type, title, body, readAt: null, createdAt: now() });
}

function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to);
}

function ownedBooking(user, booking) {
  return booking.customerId === user.id || booking.technicianId === user.id || user.role === roles.ADMIN;
}

function technicianMatches(db, technicianUserId, service, location) {
  const profile = db.technicianProfiles.find((item) => item.userId === technicianUserId);
  if (!profile || profile.verificationStatus !== "APPROVED") return false;
  if (service.requiredSpecialty && !profile.specialties.includes(service.requiredSpecialty)) return false;
  return Boolean(location) && profile.serviceRadiusMiles > 0;
}

function isDoubleBooked(db, technicianId, preferredAt, ignoreBookingId = null) {
  const target = new Date(preferredAt).getTime();
  return db.bookings.some((booking) => {
    if (booking.id === ignoreBookingId || booking.technicianId !== technicianId) return false;
    if (["CANCELLED", "COMPLETED", "REFUNDED"].includes(booking.status)) return false;
    return Math.abs(new Date(booking.preferredAt).getTime() - target) < 2 * 60 * 60 * 1000;
  });
}

function invoiceForBooking(db, booking) {
  const quote = db.quotes.find((item) => item.bookingId === booking.id && item.status === "APPROVED");
  if (!quote) throw new Error("Booking needs an approved quote first.");
  const additions = db.additionalWorkRequests.filter((item) => item.bookingId === booking.id && item.status === "APPROVED");
  const totalCents = quote.amountCents + additions.reduce((sum, item) => sum + item.amountCents, 0);
  const percent = Number(setting(db, "platformCommissionPercent", "10"));
  const platformFeeCents = Math.round(totalCents * (percent / 100));
  return {
    totalCents,
    platformFeeCents,
    technicianEarningsCents: totalCents - platformFeeCents
  };
}

function serveStatic(req, res) {
  const requested = new URL(req.url, `http://${req.headers.host}`).pathname;
  const fileName = requested === "/" ? "index.html" : requested.slice(1);
  const fullPath = path.normalize(path.join(PUBLIC_DIR, fileName));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(fullPath);
  const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" }[ext] || "text/plain";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(fullPath).pipe(res);
}

async function api(req, res, db) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await parseBody(req) : {};

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const email = sanitize(body.email).toLowerCase();
    const password = String(body.password || "");
    const role = body.role;
    if (!email.includes("@") || password.length < 8 || ![roles.CUSTOMER, roles.TECHNICIAN].includes(role)) return error(res, 400, "Enter an email, password, and customer or technician role.");
    if (db.users.some((user) => user.email === email)) return error(res, 409, "That email is already registered.");
    const user = { id: id("usr"), email, passwordHash: hashPassword(password), role, status: "ACTIVE", createdAt: now(), updatedAt: now() };
    db.users.push(user);
    if (role === roles.CUSTOMER) db.customerProfiles.push({ id: id("cus"), userId: user.id, fullName: sanitize(body.fullName || "New Customer"), phone: "", createdAt: now(), updatedAt: now() });
    if (role === roles.TECHNICIAN) db.technicianProfiles.push({ id: id("tec"), userId: user.id, fullName: sanitize(body.fullName || "New Technician"), profilePhotoUrl: "", bio: "", yearsExperience: 0, specialties: [], certifications: [], serviceRadiusMiles: 20, mobileServiceAvailable: true, shopServiceAvailable: false, hourlyRateCents: 9500, defaultFlatRateCents: 35000, verificationStatus: "PENDING", ratingAverage: 0, createdAt: now(), updatedAt: now() });
    addAudit(db, user.id, "REGISTER", "User", user.id);
    saveDb(db);
    return send(res, 201, { user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const user = db.users.find((item) => item.email === sanitize(body.email).toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) return error(res, 401, "Invalid email or password.");
    const session = { id: id("ses"), userId: user.id, createdAt: now(), expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString() };
    db.sessions.push(session);
    saveDb(db);
    return send(res, 200, { user: publicUser(user) }, { "Set-Cookie": `session=${encodeURIComponent(signedSessionValue(session.id))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const sid = readSessionValue(parseCookies(req).session);
    db.sessions = db.sessions.filter((session) => session.id !== sid);
    saveDb(db);
    return send(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset") {
    return send(res, 200, { ok: true, message: "Password reset flow is ready for an email provider. Set EMAIL_PROVIDER_API_KEY to send real reset links." });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(req, db);
    if (!user) return send(res, 200, { user: null });
    const profile = user.role === roles.CUSTOMER ? db.customerProfiles.find((item) => item.userId === user.id) : user.role === roles.TECHNICIAN ? db.technicianProfiles.find((item) => item.userId === user.id) : db.adminUsers.find((item) => item.userId === user.id);
    return send(res, 200, { user: publicUser(user), profile });
  }

  if (req.method === "GET" && url.pathname === "/api/services") return send(res, 200, { categories: db.serviceCategories, services: db.services });

  if (req.method === "GET" && url.pathname === "/api/technicians") {
    return send(res, 200, { technicians: db.technicianProfiles.filter((profile) => profile.verificationStatus === "APPROVED").map((profile) => ({ ...profile, user: publicUser(db.users.find((user) => user.id === profile.userId)) })) });
  }

  if (req.method === "PUT" && url.pathname === "/api/technician/profile") {
    const user = requireUser(req, res, db, [roles.TECHNICIAN]);
    if (!user) return;
    const profile = db.technicianProfiles.find((item) => item.userId === user.id);
    if (!profile) return error(res, 404, "Technician profile not found.");
    profile.fullName = sanitize(body.fullName || profile.fullName);
    profile.profilePhotoUrl = String(body.profilePhotoUrl || profile.profilePhotoUrl || "");
    profile.bio = sanitize(body.bio || "");
    profile.yearsExperience = Number(body.yearsExperience || 0);
    profile.specialties = String(body.specialties || "").split(",").map((item) => sanitize(item)).filter(Boolean);
    profile.certifications = String(body.certifications || "").split(",").map((item) => sanitize(item)).filter(Boolean);
    profile.serviceRadiusMiles = Number(body.serviceRadiusMiles || profile.serviceRadiusMiles || 20);
    profile.mobileServiceAvailable = Boolean(body.mobileServiceAvailable);
    profile.shopServiceAvailable = Boolean(body.shopServiceAvailable);
    profile.hourlyRateCents = Math.max(0, cents(body.hourlyRate || 0));
    profile.defaultFlatRateCents = Math.max(0, cents(body.defaultFlatRate || 0));
    profile.updatedAt = now();
    saveDb(db);
    return send(res, 200, { profile });
  }

  if (req.method === "POST" && url.pathname === "/api/vehicles") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const vehicle = { id: id("veh"), customerId: user.id, year: Number(body.year), make: sanitize(body.make), model: sanitize(body.model), engine: sanitize(body.engine), mileage: Number(body.mileage || 0), vin: sanitize(body.vin), createdAt: now(), updatedAt: now() };
    if (!vehicle.year || !vehicle.make || !vehicle.model) return error(res, 400, "Vehicle year, make, and model are required.");
    db.vehicles.push(vehicle);
    saveDb(db);
    return send(res, 201, { vehicle });
  }

  if (req.method === "GET" && url.pathname === "/api/vehicles") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    return send(res, 200, { vehicles: db.vehicles.filter((vehicle) => vehicle.customerId === user.id) });
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const vehicle = db.vehicles.find((item) => item.id === body.vehicleId && item.customerId === user.id);
    const service = db.services.find((item) => item.id === body.serviceId);
    const technician = db.users.find((item) => item.id === body.technicianId && item.role === roles.TECHNICIAN);
    if (!vehicle || !service || !technician) return error(res, 400, "Choose a valid vehicle, service, and technician.");
    const location = { id: id("loc"), userId: user.id, address: sanitize(body.address), city: sanitize(body.city), region: sanitize(body.region), postalCode: sanitize(body.postalCode), latitude: Number(body.latitude || 0), longitude: Number(body.longitude || 0), privacyLabel: "APPROXIMATE_UNTIL_BOOKED", createdAt: now() };
    if (!location.address) return error(res, 400, "Enter the service address.");
    if (!technicianMatches(db, technician.id, service, location)) return error(res, 400, "That technician is not approved or does not match this service.");
    if (isDoubleBooked(db, technician.id, body.preferredAt)) return error(res, 409, "That technician is already booked near that time.");
    const booking = { id: id("bok"), customerId: user.id, technicianId: technician.id, vehicleId: vehicle.id, serviceId: service.id, locationId: location.id, status: "REQUESTED", serviceMode: body.serviceMode === "SHOP" ? "SHOP" : "MOBILE", preferredAt: body.preferredAt, symptoms: sanitize(body.symptoms), dtcs: sanitize(body.dtcs), mediaUrls: [], createdAt: now(), updatedAt: now() };
    db.locations.push(location);
    db.bookings.push(booking);
    notify(db, technician.id, "NEW_BOOKING_REQUEST", "New repair request", `${service.name} requested for ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);
    saveDb(db);
    return send(res, 201, { booking });
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    const user = requireUser(req, res, db);
    if (!user) return;
    const bookings = db.bookings.filter((booking) => ownedBooking(user, booking)).map((booking) => ({
      ...booking,
      vehicle: db.vehicles.find((item) => item.id === booking.vehicleId),
      service: db.services.find((item) => item.id === booking.serviceId),
      technicianProfile: db.technicianProfiles.find((item) => item.userId === booking.technicianId),
      quote: db.quotes.find((item) => item.bookingId === booking.id),
      invoice: db.invoices.find((item) => item.bookingId === booking.id),
      additionalWorkRequests: db.additionalWorkRequests.filter((item) => item.bookingId === booking.id),
      inspectionFindings: db.inspectionFindings.filter((item) => item.bookingId === booking.id)
    }));
    return send(res, 200, { bookings });
  }

  if (req.method === "GET" && url.pathname === "/api/jobs/opportunities") {
    const user = requireUser(req, res, db, [roles.TECHNICIAN]);
    if (!user) return;
    const jobs = db.bookings.filter((booking) => booking.technicianId === user.id && booking.status === "REQUESTED").map((booking) => ({ ...booking, vehicle: db.vehicles.find((item) => item.id === booking.vehicleId), service: db.services.find((item) => item.id === booking.serviceId) }));
    return send(res, 200, { jobs });
  }

  const bookingAction = url.pathname.match(/^\/api\/bookings\/([^/]+)\/([^/]+)$/);
  if (bookingAction) {
    const [, bookingId, action] = bookingAction;
    const booking = db.bookings.find((item) => item.id === bookingId);
    const user = requireUser(req, res, db);
    if (!user || !booking) return booking ? undefined : error(res, 404, "Booking not found.");
    if (!ownedBooking(user, booking)) return error(res, 403, "This booking does not belong to you.");

    if (req.method === "POST" && action === "accept") {
      if (user.id !== booking.technicianId) return error(res, 403, "Only the assigned technician can accept this job.");
      const scheduledAt = body.scheduledAt || booking.preferredAt;
      if (isDoubleBooked(db, user.id, scheduledAt, booking.id)) return error(res, 409, "You are already booked near that time.");
      if (!canTransition(booking.status, "BOOKED")) return error(res, 409, "This job cannot be accepted from its current status.");
      booking.status = "BOOKED";
      booking.preferredAt = scheduledAt;
      booking.updatedAt = now();
      notify(db, booking.customerId, "BOOKING_ACCEPTED", "Technician accepted", `Your repair request was accepted for ${new Date(scheduledAt).toLocaleString()}.`);
      saveDb(db);
      return send(res, 200, { booking });
    }

    if (req.method === "POST" && action === "quote") {
      if (user.id !== booking.technicianId) return error(res, 403, "Only the technician can quote this booking.");
      const service = db.services.find((item) => item.id === booking.serviceId);
      const profile = db.technicianProfiles.find((item) => item.userId === user.id);
      const amountCents = Number(body.amountCents || profile?.defaultFlatRateCents || service.basePriceCents);
      const quote = { id: id("quo"), bookingId: booking.id, technicianId: user.id, pricingModel: body.pricingModel || service.pricingModel, laborMinutes: Number(body.laborMinutes || service.estimatedMinutes), amountCents, status: "PENDING", customerApprovedAt: null, createdAt: now() };
      db.quotes = db.quotes.filter((item) => item.bookingId !== booking.id);
      db.quotes.push(quote);
      booking.status = "AWAITING_CUSTOMER_APPROVAL";
      booking.updatedAt = now();
      notify(db, booking.customerId, "QUOTE_READY", "Quote ready", `Your quote is ${money(amountCents)}. Flat-rate jobs pay for the agreed repair scope, not speed.`);
      saveDb(db);
      return send(res, 201, { quote, booking });
    }

    if (req.method === "POST" && action === "approve-quote") {
      if (user.id !== booking.customerId) return error(res, 403, "Only the customer can approve this quote.");
      const quote = db.quotes.find((item) => item.bookingId === booking.id);
      if (!quote) return error(res, 404, "Quote not found.");
      quote.status = "APPROVED";
      quote.customerApprovedAt = now();
      booking.status = "BOOKED";
      booking.updatedAt = now();
      const payment = { id: id("pay"), bookingId: booking.id, processor: process.env.STRIPE_SECRET_KEY ? "STRIPE" : "LOCAL_SIMULATED_STRIPE", processorPaymentId: process.env.STRIPE_SECRET_KEY ? "" : `sim_${id("pi")}`, amountCents: quote.amountCents, status: "AUTHORIZED", createdAt: now() };
      db.payments.push(payment);
      notify(db, booking.technicianId, "QUOTE_APPROVED", "Quote approved", "The customer approved your quote and payment authorization is recorded.");
      saveDb(db);
      return send(res, 200, { booking, quote, payment, stripeRequiredForProduction: !process.env.STRIPE_SECRET_KEY });
    }

    if (req.method === "POST" && action === "status") {
      const nextStatus = body.status;
      if (!jobStatuses.includes(nextStatus)) return error(res, 400, "Unknown job status.");
      if (user.role !== roles.ADMIN && user.id !== booking.technicianId) return error(res, 403, "Only the technician or admin can update job status.");
      if (!canTransition(booking.status, nextStatus)) return error(res, 409, `Cannot move from ${booking.status} to ${nextStatus}.`);
      booking.status = nextStatus;
      booking.updatedAt = now();
      notify(db, booking.customerId, `JOB_${nextStatus}`, "Job update", `Your job is now ${nextStatus.replaceAll("_", " ").toLowerCase()}.`);
      if (nextStatus === "COMPLETED") {
        const invoiceMath = invoiceForBooking(db, booking);
        const invoice = { id: id("inv"), bookingId: booking.id, customerId: booking.customerId, technicianId: booking.technicianId, ...invoiceMath, status: "ISSUED", createdAt: now() };
        const payout = { id: id("out"), technicianId: booking.technicianId, invoiceId: invoice.id, amountCents: invoice.technicianEarningsCents, status: process.env.STRIPE_CONNECT_CLIENT_ID ? "PENDING_STRIPE_CONNECT" : "LOCAL_SIMULATED", createdAt: now() };
        db.invoices.push(invoice);
        db.payouts.push(payout);
      }
      saveDb(db);
      return send(res, 200, { booking });
    }

    if (req.method === "POST" && action === "additional-work") {
      if (user.id !== booking.technicianId) return error(res, 403, "Only the technician can request additional work.");
      const request = { id: id("awr"), bookingId: booking.id, customerId: booking.customerId, technicianId: user.id, description: sanitize(body.description), amountCents: Number(body.amountCents), status: "PENDING", decidedAt: null, createdAt: now() };
      if (!request.description || request.amountCents <= 0) return error(res, 400, "Description and amount are required.");
      db.additionalWorkRequests.push(request);
      booking.status = "ADDITIONAL_WORK_REQUESTED";
      booking.updatedAt = now();
      notify(db, booking.customerId, "ADDITIONAL_WORK_REQUESTED", "Additional work requested", `${request.description}: ${money(request.amountCents)}`);
      saveDb(db);
      return send(res, 201, { request, booking });
    }

    if (req.method === "POST" && action === "findings") {
      if (user.id !== booking.technicianId) return error(res, 403, "Only the technician can add inspection findings.");
      const finding = {
        id: id("fin"),
        bookingId: booking.id,
        technicianId: user.id,
        customerId: booking.customerId,
        title: sanitize(body.title || "Inspection finding"),
        notes: sanitize(body.notes),
        suggestedRepair: sanitize(body.suggestedRepair),
        estimatedAmountCents: Math.max(0, cents(body.estimatedAmount || 0)),
        photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls.slice(0, 4).map(String) : [],
        createdAt: now()
      };
      if (!finding.notes && !finding.suggestedRepair && !finding.photoUrls.length) return error(res, 400, "Add notes, a suggested repair, or at least one photo.");
      db.inspectionFindings.push(finding);
      notify(db, booking.customerId, "INSPECTION_FINDING_ADDED", "Technician added inspection findings", finding.suggestedRepair || finding.notes || finding.title);
      saveDb(db);
      return send(res, 201, { finding });
    }

    if (req.method === "POST" && action === "message") {
      const message = { id: id("msg"), bookingId: booking.id, senderId: user.id, body: sanitize(body.body), createdAt: now() };
      if (!message.body) return error(res, 400, "Message cannot be empty.");
      db.messages.push(message);
      notify(db, user.id === booking.customerId ? booking.technicianId : booking.customerId, "NEW_MESSAGE", "New job message", message.body);
      saveDb(db);
      return send(res, 201, { message });
    }

    if (req.method === "POST" && action === "review") {
      if (user.id !== booking.customerId) return error(res, 403, "Only the customer can review this job.");
      if (booking.status !== "COMPLETED") return error(res, 409, "Only completed jobs can be reviewed.");
      if (db.reviews.some((item) => item.bookingId === booking.id)) return error(res, 409, "This job already has a review.");
      const review = { id: id("rev"), bookingId: booking.id, customerId: user.id, technicianId: booking.technicianId, rating: Number(body.rating), body: sanitize(body.body), createdAt: now() };
      if (review.rating < 1 || review.rating > 5) return error(res, 400, "Rating must be 1 through 5.");
      db.reviews.push(review);
      const reviews = db.reviews.filter((item) => item.technicianId === booking.technicianId);
      const profile = db.technicianProfiles.find((item) => item.userId === booking.technicianId);
      profile.ratingAverage = Math.round((reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length) * 10) / 10;
      notify(db, booking.technicianId, "REVIEW_RECEIVED", "New review received", `${review.rating} stars`);
      saveDb(db);
      return send(res, 201, { review });
    }
  }

  const additionalDecision = url.pathname.match(/^\/api\/additional-work\/([^/]+)\/(approve|decline)$/);
  if (additionalDecision && req.method === "POST") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const request = db.additionalWorkRequests.find((item) => item.id === additionalDecision[1]);
    if (!request || request.customerId !== user.id) return error(res, 404, "Additional work request not found.");
    if (request.status !== "PENDING") return error(res, 409, "This request was already decided.");
    const booking = db.bookings.find((item) => item.id === request.bookingId);
    request.status = additionalDecision[2] === "approve" ? "APPROVED" : "DECLINED";
    request.decidedAt = now();
    booking.status = request.status === "APPROVED" ? "ADDITIONAL_WORK_APPROVED" : "ADDITIONAL_WORK_DECLINED";
    booking.updatedAt = now();
    addAudit(db, user.id, `ADDITIONAL_WORK_${request.status}`, "AdditionalWorkRequest", request.id, { amountCents: request.amountCents });
    notify(db, request.technicianId, `ADDITIONAL_WORK_${request.status}`, "Additional work decision", `Customer ${request.status.toLowerCase()} the request.`);
    saveDb(db);
    return send(res, 200, { request, booking });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/summary") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const revenue = db.invoices.reduce((sum, invoice) => sum + invoice.platformFeeCents, 0);
    return send(res, 200, {
      activeJobs: db.bookings.filter((booking) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(booking.status)).length,
      todaysBookings: db.bookings.length,
      totalCustomers: db.users.filter((item) => item.role === roles.CUSTOMER).length,
      totalTechnicians: db.users.filter((item) => item.role === roles.TECHNICIAN).length,
      pendingTechnicianApprovals: db.technicianProfiles.filter((item) => ["PENDING", "UNDER_REVIEW"].includes(item.verificationStatus)).length,
      todaysRevenueCents: revenue,
      technicianPayoutsCents: db.payouts.reduce((sum, payout) => sum + payout.amountCents, 0),
      openDisputes: db.disputes.filter((item) => item.status !== "CLOSED").length,
      commissionPercent: Number(setting(db, "platformCommissionPercent", "10"))
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/technicians/approve") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const profile = db.technicianProfiles.find((item) => item.userId === body.technicianId);
    if (!profile) return error(res, 404, "Technician not found.");
    profile.verificationStatus = body.status || "APPROVED";
    profile.updatedAt = now();
    addAudit(db, user.id, "TECHNICIAN_VERIFICATION_CHANGED", "TechnicianProfile", profile.id, { status: profile.verificationStatus });
    saveDb(db);
    return send(res, 200, { profile });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/settings") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const commission = Number(body.platformCommissionPercent);
    if (commission < 0 || commission > 40) return error(res, 400, "Commission must be between 0 and 40 percent.");
    const existing = db.platformSettings.find((item) => item.key === "platformCommissionPercent");
    existing.value = String(commission);
    existing.updatedAt = now();
    addAudit(db, user.id, "PLATFORM_COMMISSION_UPDATED", "PlatformSettings", existing.key, { commission });
    saveDb(db);
    return send(res, 200, { setting: existing });
  }

  return error(res, 404, "API route not found.");
}

function createApp(customDbFile) {
  if (customDbFile) process.env.DB_FILE = customDbFile;
  const db = loadDb();
  return async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) return await api(req, res, db);
      return serveStatic(req, res);
    } catch (err) {
      error(res, 500, err.message);
    }
  };
}

if (require.main === module) {
  const server = http.createServer(createApp());
  server.listen(PORT, HOST, () => {
    console.log(`WrenchLane is running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  });
}

module.exports = { createApp, hashPassword, verifyPassword, blankDb, seed, allowedTransitions };

