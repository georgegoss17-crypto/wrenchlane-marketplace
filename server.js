const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const LOCAL_DATA_DIR = path.join(ROOT, "data");
const DEFAULT_DATA_DIR = process.env.RENDER || fs.existsSync("/var/data") ? "/var/data" : LOCAL_DATA_DIR;
const REQUESTED_DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
const DATA_DIR = resolveDataDir(REQUESTED_DATA_DIR);
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, "backups");
const SESSION_SECRET = process.env.SESSION_SECRET || "local-development-secret-change-before-production";
const MIN_FLAT_RATE_CENTS_PER_HOUR = 10000;
const OWNER_ADMIN_EMAIL = (process.env.OWNER_ADMIN_EMAIL || "georgegoss17@gmail.com").toLowerCase();
const OWNER_ADMIN_PASSWORD = process.env.OWNER_ADMIN_PASSWORD || "WynterChristopher0125!";
const OWNER_CUSTOMER_TECH_PASSWORD = process.env.OWNER_CUSTOMER_TECH_PASSWORD || "AvaLynnRiles0125!";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "2825966745370125";
const CUSTOMER_TERMS_VERSION = "customer-repair-authorization-v1";
const TECHNICIAN_TERMS_VERSION = "technician-service-standards-v1";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const SITE_NAME = "WrenchLane";

function resolveDataDir(requestedDir) {
  try {
    fs.mkdirSync(requestedDir, { recursive: true });
    fs.accessSync(requestedDir, fs.constants.W_OK);
    return requestedDir;
  } catch (err) {
    console.warn(`[storage] Could not write to ${requestedDir}: ${err.message}`);
    console.warn(`[storage] Falling back to ${LOCAL_DATA_DIR}. Add or repair the Render persistent disk at /var/data to preserve live data across deploys.`);
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    return LOCAL_DATA_DIR;
  }
}

const roles = {
  CUSTOMER: "CUSTOMER",
  TECHNICIAN: "TECHNICIAN",
  ADMIN: "ADMIN"
};

const DEFAULT_SERVICE_CATALOG = [
  {
    id: "cat_maintenance_preventive",
    name: "Maintenance & Preventive Service",
    specialty: "Diagnostics",
    services: ["Maintenance concern diagnosis", "Fluid leak diagnosis", "Warning/service reminder diagnosis"]
  },
  {
    id: "cat_brake_system",
    name: "Brake System",
    specialty: "Brakes",
    services: ["Brake system diagnosis", "Brake noise diagnosis", "Brake vibration/pulsation diagnosis", "ABS diagnosis", "Parking brake diagnosis"]
  },
  {
    id: "cat_steering_suspension",
    name: "Steering & Suspension",
    specialty: "Suspension",
    services: ["Steering system diagnosis", "Suspension system diagnosis", "Clunk/noise diagnosis", "Vehicle pulling diagnosis", "Steering vibration diagnosis", "Ride-height diagnosis"]
  },
  {
    id: "cat_cooling_system",
    name: "Cooling System",
    specialty: "Diagnostics",
    services: ["Cooling system diagnosis", "Overheating diagnosis", "Coolant leak diagnosis", "Cooling fan diagnosis", "Heater/coolant circulation diagnosis", "No-heat diagnosis"]
  },
  {
    id: "cat_ignition_engine_performance",
    name: "Ignition & Engine Performance",
    specialty: "Diagnostics",
    services: ["Engine performance diagnosis", "Misfire diagnosis", "Rough idle diagnosis", "Stalling diagnosis", "Loss-of-power diagnosis", "Poor acceleration diagnosis", "Spark/ignition system diagnosis", "Sensor performance diagnosis"]
  },
  {
    id: "cat_fuel_system",
    name: "Fuel System",
    specialty: "Diagnostics",
    services: ["Fuel system diagnosis", "Fuel pressure diagnosis", "Fuel injector diagnosis", "Fuel pump diagnosis", "Fuel leak diagnosis", "Rich/lean condition diagnosis", "High-pressure fuel system diagnosis"]
  },
  {
    id: "cat_intake_exhaust",
    name: "Intake & Exhaust",
    specialty: "Diagnostics",
    services: ["Intake system diagnosis", "Vacuum leak diagnosis", "Exhaust leak diagnosis", "Exhaust restriction diagnosis", "EGR system diagnosis", "Catalytic converter efficiency diagnosis", "Boost/charge-air leak diagnosis"]
  },
  {
    id: "cat_electrical_system",
    name: "Electrical System",
    specialty: "Diagnostics",
    services: ["Electrical system diagnosis", "Battery diagnosis", "Starting system diagnosis", "Charging system diagnosis", "Parasitic draw diagnosis", "Wiring/circuit diagnosis", "Ground circuit diagnosis", "Fuse/relay diagnosis", "CAN/network communication diagnosis", "Intermittent electrical diagnosis"]
  },
  {
    id: "cat_hvac_ac_heating",
    name: "HVAC / A/C & Heating",
    specialty: "Diagnostics",
    services: ["HVAC system diagnosis", "A/C performance diagnosis", "No A/C diagnosis", "No heat diagnosis", "Blower motor diagnosis", "HVAC actuator diagnosis", "Compressor diagnosis", "Refrigerant pressure diagnosis"]
  },
  {
    id: "cat_wheels_tires",
    name: "Wheels & Tires",
    specialty: "Diagnostics",
    services: ["Tire/wheel diagnosis", "Tire vibration diagnosis", "Tire pressure loss diagnosis", "TPMS diagnosis", "Uneven tire wear diagnosis", "Wheel bearing noise diagnosis"]
  },
  {
    id: "cat_drivetrain_axles_4wd",
    name: "Drivetrain / Axles / 4WD",
    specialty: "Diagnostics",
    services: ["Drivetrain diagnosis", "CV axle diagnosis", "Driveshaft diagnosis", "Differential diagnosis", "4WD/AWD system diagnosis", "Transfer case diagnosis", "Driveline vibration diagnosis", "Clunk/noise diagnosis"]
  },
  {
    id: "cat_transmission",
    name: "Transmission",
    specialty: "Diagnostics",
    services: ["Transmission performance diagnosis", "Transmission electrical diagnosis", "Shift concern diagnosis", "Transmission slipping diagnosis", "Delayed engagement diagnosis", "Harsh shift diagnosis", "Transmission fluid leak diagnosis", "Transmission overheating diagnosis", "Shifter/range sensor diagnosis"]
  },
  {
    id: "cat_engine_bolt_on_components",
    name: "Engine / Bolt-On Components",
    specialty: "Diagnostics",
    services: ["Engine mechanical diagnosis", "Engine oil leak diagnosis", "Engine noise diagnosis", "Low oil pressure diagnosis", "VVT system diagnosis", "Engine mount diagnosis", "Belt/pulley diagnosis", "Intake manifold diagnosis"]
  },
  {
    id: "cat_doors_windows_accessories",
    name: "Doors, Windows & Accessories",
    specialty: "Diagnostics",
    services: ["Power window diagnosis", "Power lock diagnosis", "Door electrical diagnosis", "Mirror diagnosis", "Power seat diagnosis", "Wiper system diagnosis", "Washer system diagnosis", "Liftgate diagnosis"]
  },
  {
    id: "cat_diesel",
    name: "Diesel",
    specialty: "Diesel",
    services: ["Diesel engine performance diagnosis", "Diesel no-start diagnosis", "Diesel fuel system diagnosis", "Injector diagnosis", "High-pressure oil/fuel diagnosis", "Turbo/boost diagnosis", "EGR diagnosis", "DPF/aftertreatment diagnosis", "DEF/SCR diagnosis", "Glow plug system diagnosis", "Diesel electrical diagnosis"]
  },
  {
    id: "cat_hybrid_ev",
    name: "Hybrid / EV - Qualified Techs Only",
    specialty: "Hybrid/EV",
    services: ["Hybrid system diagnosis", "EV system diagnosis", "High-voltage system diagnosis", "Charging system diagnosis", "Battery performance diagnosis", "Electric motor/inverter diagnosis", "Thermal-management diagnosis"]
  },
  {
    id: "cat_safety_warning_systems",
    name: "Safety / Warning Systems",
    specialty: "Diagnostics",
    services: ["ABS warning light diagnosis", "SRS/Airbag warning light diagnosis", "Traction-control diagnosis", "TPMS warning diagnosis", "Battery warning diagnosis", "Temperature warning diagnosis", "Other warning-light diagnosis"]
  }
];

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

function addDays(days) {
  return new Date(Date.now() + Number(days) * 86400 * 1000).toISOString();
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

function minimumFlatRateCents(laborMinutes) {
  return Math.ceil((Math.max(Number(laborMinutes || 60), 60) / 60) * MIN_FLAT_RATE_CENTS_PER_HOUR);
}

function normalizeLaborHours(body, fallbackMinutes) {
  if (body.laborHours !== undefined) return Number(body.laborHours);
  return Number(body.laborMinutes || fallbackMinutes || 60) / 60;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/a\/c/g, "ac")
    .replace(/4wd\/awd/g, "4wd_awd")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultServiceId(categoryId, serviceName) {
  return `svc_${categoryId.replace(/^cat_/, "")}_${slug(serviceName)}`;
}

function applyDefaultServiceCatalog(db) {
  const activeCategoryIds = new Set(DEFAULT_SERVICE_CATALOG.map((category) => category.id));
  const activeServiceIds = new Set();
  DEFAULT_SERVICE_CATALOG.forEach((category, categoryIndex) => {
    let existingCategory = db.serviceCategories.find((item) => item.id === category.id);
    if (!existingCategory) {
      existingCategory = { id: category.id };
      db.serviceCategories.push(existingCategory);
    }
    existingCategory.name = category.name;
    existingCategory.active = true;
    existingCategory.sortOrder = categoryIndex;

    category.services.forEach((serviceName, serviceIndex) => {
      const serviceId = defaultServiceId(category.id, serviceName);
      activeServiceIds.add(serviceId);
      let service = db.services.find((item) => item.id === serviceId);
      if (!service) {
        service = { id: serviceId };
        db.services.push(service);
      }
      service.categoryId = category.id;
      service.name = serviceName;
      service.description = `${serviceName}.`;
      service.pricingModel = "FLAT_RATE";
      service.basePriceCents = minimumFlatRateCents(60);
      service.estimatedMinutes = 60;
      service.requiredSpecialty = category.specialty;
      service.active = true;
      service.sortOrder = serviceIndex;
    });
  });

  for (const category of db.serviceCategories) {
    if (!activeCategoryIds.has(category.id)) category.active = false;
  }
  for (const service of db.services) {
    if (!activeServiceIds.has(service.id)) service.active = false;
  }
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
    technicianProfileComments: [],
    messages: [],
    reviews: [],
    notifications: [],
    disputes: [],
    locations: [],
    availability: [],
    adminUsers: [],
    agreementAcceptances: [],
    passwordResetTokens: [],
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

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendPasswordResetEmail(user, resetUrl) {
  const roleLabel = user.role === roles.TECHNICIAN ? "technician" : user.role === roles.ADMIN ? "owner/admin" : "customer";
  const subject = `Reset your ${SITE_NAME} ${roleLabel} password`;
  const text = `Site: ${SITE_NAME}\nAccount type: ${roleLabel}\n\nUse this secure link to reset your ${SITE_NAME} ${roleLabel} password. This link expires in 1 hour.\n\n${resetUrl}`;
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[password-reset] Email provider not configured. Reset link for ${user.email}: ${resetUrl}`);
    return { sent: false, provider: "LOCAL_LOG" };
  }
  const from = process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject,
      text
    })
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`[password-reset] Email provider rejected the reset email for ${user.email}: ${details}`);
    return { sent: false, provider: "RESEND_ERROR", details };
  }
  return { sent: true, provider: "RESEND" };
}

async function sendNotificationEmail(user, title, body) {
  if (!user?.email) return { sent: false, provider: "NO_EMAIL" };
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[notification-email] Email provider not configured. ${user.email}: ${title} - ${body}`);
    return { sent: false, provider: "LOCAL_LOG" };
  }
  const from = process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: `${SITE_NAME}: ${title}`,
      text: `${body}\n\nOpen ${SITE_NAME} to view the latest details.`
    })
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`[notification-email] Email provider rejected the notification email for ${user.email}: ${details}`);
    return { sent: false, provider: "RESEND_ERROR", details };
  }
  return { sent: true, provider: "RESEND" };
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
  const admin = { id: id("usr"), email: OWNER_ADMIN_EMAIL, passwordHash: hashPassword(OWNER_ADMIN_PASSWORD), role: roles.ADMIN, status: "ACTIVE", createdAt, updatedAt: createdAt };
  db.users.push(admin);
  applyDefaultServiceCatalog(db);
  db.platformSettings.push({ key: "platformCommissionPercent", value: "10", updatedAt: createdAt });
  db.platformSettings.push({ key: "adminAccessCodeConfigured", value: "true", updatedAt: createdAt });
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
    if (typeof profile.defaultFlatRateCents !== "number") profile.defaultFlatRateCents = MIN_FLAT_RATE_CENTS_PER_HOUR;
    profile.defaultFlatRateCents = Math.max(profile.defaultFlatRateCents, MIN_FLAT_RATE_CENTS_PER_HOUR);
    if (!profile.applicationAnswers) profile.applicationAnswers = {};
  }
  applyDefaultServiceCatalog(db);
  purgeDemoAccounts(db);
  syncOwnerAdmin(db);
  syncOwnerCustomerAndTechnician(db);
  return db;
}

function purgeDemoAccounts(db) {
  const demoUserIds = new Set(db.users.filter((user) => ["customer@demo.com", "tech@demo.com"].includes(user.email)).map((user) => user.id));
  if (!demoUserIds.size) return;
  const demoBookingIds = new Set(db.bookings.filter((booking) => demoUserIds.has(booking.customerId) || demoUserIds.has(booking.technicianId)).map((booking) => booking.id));
  const demoProfileIds = new Set(db.technicianProfiles.filter((profile) => demoUserIds.has(profile.userId)).map((profile) => profile.id));
  db.users = db.users.filter((user) => !demoUserIds.has(user.id));
  db.customerProfiles = db.customerProfiles.filter((profile) => !demoUserIds.has(profile.userId));
  db.technicianProfiles = db.technicianProfiles.filter((profile) => !demoUserIds.has(profile.userId));
  db.technicianCertifications = db.technicianCertifications.filter((cert) => !demoProfileIds.has(cert.technicianProfileId));
  db.vehicles = db.vehicles.filter((vehicle) => !demoUserIds.has(vehicle.customerId));
  db.locations = db.locations.filter((location) => !demoUserIds.has(location.userId));
  db.bookings = db.bookings.filter((booking) => !demoBookingIds.has(booking.id));
  db.quotes = db.quotes.filter((quote) => !demoBookingIds.has(quote.bookingId));
  db.invoices = db.invoices.filter((invoice) => !demoBookingIds.has(invoice.bookingId));
  db.payments = db.payments.filter((payment) => !demoBookingIds.has(payment.bookingId));
  db.payouts = db.payouts.filter((payout) => !demoUserIds.has(payout.technicianId));
  db.additionalWorkRequests = db.additionalWorkRequests.filter((request) => !demoBookingIds.has(request.bookingId));
  db.inspectionFindings = db.inspectionFindings.filter((finding) => !demoBookingIds.has(finding.bookingId));
  db.technicianProfileComments = db.technicianProfileComments.filter((comment) => !demoUserIds.has(comment.technicianId) && !demoUserIds.has(comment.customerId));
  db.messages = db.messages.filter((message) => !demoBookingIds.has(message.bookingId));
  db.reviews = db.reviews.filter((review) => !demoBookingIds.has(review.bookingId));
  db.notifications = db.notifications.filter((notification) => !demoUserIds.has(notification.userId));
  db.disputes = db.disputes.filter((dispute) => !demoBookingIds.has(dispute.bookingId));
  db.sessions = db.sessions.filter((session) => !demoUserIds.has(session.userId));
}

function syncOwnerAdmin(db) {
  const timestamp = now();
  let admin = db.users.find((user) => user.role === roles.ADMIN);
  if (!admin) {
    admin = { id: id("usr"), email: OWNER_ADMIN_EMAIL, passwordHash: hashPassword(OWNER_ADMIN_PASSWORD), role: roles.ADMIN, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
    db.users.push(admin);
  }
  if (admin.email !== OWNER_ADMIN_EMAIL) admin.email = OWNER_ADMIN_EMAIL;
  admin.status = "ACTIVE";
  admin.updatedAt = timestamp;
  if (!db.adminUsers.some((item) => item.userId === admin.id)) db.adminUsers.push({ id: id("adm"), userId: admin.id, createdAt: timestamp });
}

function syncOwnerCustomerAndTechnician(db) {
  const timestamp = now();
  let customer = db.users.find((user) => user.email === OWNER_ADMIN_EMAIL && user.role === roles.CUSTOMER);
  if (!customer) {
    customer = { id: id("usr"), email: OWNER_ADMIN_EMAIL, passwordHash: hashPassword(OWNER_CUSTOMER_TECH_PASSWORD), role: roles.CUSTOMER, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
    db.users.push(customer);
  }
  if (!customer.status) customer.status = "ACTIVE";
  customer.updatedAt = timestamp;
  if (!db.customerProfiles.some((profile) => profile.userId === customer.id)) {
    db.customerProfiles.push({ id: id("cus"), userId: customer.id, fullName: "George Goss", phone: "", createdAt: timestamp, updatedAt: timestamp });
  }

  let tech = db.users.find((user) => user.email === OWNER_ADMIN_EMAIL && user.role === roles.TECHNICIAN);
  if (!tech) {
    tech = { id: id("usr"), email: OWNER_ADMIN_EMAIL, passwordHash: hashPassword(OWNER_CUSTOMER_TECH_PASSWORD), role: roles.TECHNICIAN, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
    db.users.push(tech);
  }
  if (!tech.status) tech.status = "ACTIVE";
  tech.updatedAt = timestamp;
  let profile = db.technicianProfiles.find((item) => item.userId === tech.id);
  if (!profile) {
    profile = {
      id: id("tec"),
      userId: tech.id,
      fullName: "George Goss",
      profilePhotoUrl: "",
      bio: "Owner technician profile.",
      yearsExperience: 0,
      specialties: ["Diagnostics"],
      certifications: [],
      applicationAnswers: {
        yearsInField: 0,
        legalName: "George Goss",
        businessName: "",
        hasTravelVehicle: true,
        partsPreference: "Either technician or customer supplied parts",
        honestRepairs: true,
        complaintResolution: true,
        electronicSignature: "George Goss",
        agreementVersion: TECHNICIAN_TERMS_VERSION
      },
      serviceRadiusMiles: 35,
      mobileServiceAvailable: true,
      shopServiceAvailable: false,
      hourlyRateCents: MIN_FLAT_RATE_CENTS_PER_HOUR,
      defaultFlatRateCents: MIN_FLAT_RATE_CENTS_PER_HOUR,
      verificationStatus: "APPROVED",
      ratingAverage: "New",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.technicianProfiles.push(profile);
  }
  profile.verificationStatus = "APPROVED";
  profile.defaultFlatRateCents = Math.max(profile.defaultFlatRateCents || 0, MIN_FLAT_RATE_CENTS_PER_HOUR);
  profile.hourlyRateCents = Math.max(profile.hourlyRateCents || 0, MIN_FLAT_RATE_CENTS_PER_HOUR);
  profile.updatedAt = timestamp;
}

function databaseFilePath() {
  return process.env.DB_FILE || path.join(DATA_DIR, "database.json");
}

function backupDatabaseFile(dbFile) {
  if (!fs.existsSync(dbFile)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `database-${stamp}-${crypto.randomBytes(3).toString("hex")}.json`);
  fs.copyFileSync(dbFile, backupFile);
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("database-") && name.endsWith(".json"))
    .map((name) => ({ name, fullPath: path.join(BACKUP_DIR, name), mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const backup of backups.slice(50)) fs.unlinkSync(backup.fullPath);
}

function writeJsonSafely(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  backupDatabaseFile(filePath);
  const tempFile = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, filePath);
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbFile = databaseFilePath();
  if (!fs.existsSync(dbFile)) {
    const seeded = normalizeDb(seed(blankDb()));
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    writeJsonSafely(dbFile, seeded);
    return seeded;
  }
  return normalizeDb(seed(JSON.parse(fs.readFileSync(dbFile, "utf8"))));
}

function saveDb(db) {
  writeJsonSafely(databaseFilePath(), db);
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role, status: user.status };
}

function privateUser(user) {
  if (!user) return null;
  return { id: user.id, role: user.role, status: user.status };
}

function privateCustomerProfile(profile) {
  if (!profile) return null;
  return { id: profile.id, userId: profile.userId, fullName: "Booked customer" };
}

function privateVehicle(vehicle) {
  if (!vehicle) return null;
  return {
    id: vehicle.id,
    customerId: vehicle.customerId,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
    mileage: vehicle.mileage,
    color: vehicle.color,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt
  };
}

function privateLocation(location) {
  if (!location) return null;
  return {
    id: location.id,
    userId: location.userId,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    privacyLabel: "PRIVATE_UNTIL_BOOKED",
    createdAt: location.createdAt
  };
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

function isAccountActive(user) {
  if (!user) return false;
  if (user.status === "ACTIVE") return true;
  if (user.status === "SUSPENDED" && user.suspendedUntil && user.suspendedUntil <= now()) {
    user.status = "ACTIVE";
    user.suspendedUntil = null;
    user.suspensionReason = "";
    user.updatedAt = now();
    return true;
  }
  return false;
}

function accountStatusText(user) {
  if (user?.status === "SUSPENDED" && user.suspendedUntil) return `SUSPENDED until ${new Date(user.suspendedUntil).toLocaleDateString()}`;
  return user?.status || "UNKNOWN";
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

function requestBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

function error(res, status, message) {
  send(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25_000_000) reject(new Error("Request body too large"));
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
  const user = session ? db.users.find((item) => item.id === session.userId) : null;
  return isAccountActive(user) ? user : null;
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

function accountTypeLabel(user) {
  if (user?.role === roles.TECHNICIAN) return "Technician";
  if (user?.role === roles.ADMIN) return "Owner/Admin";
  return "Customer";
}

function displayNameForUser(db, userId) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return "WrenchLane";
  const profile = user.role === roles.TECHNICIAN
    ? db.technicianProfiles.find((item) => item.userId === user.id)
    : user.role === roles.CUSTOMER
      ? db.customerProfiles.find((item) => item.userId === user.id)
      : db.adminUsers.find((item) => item.userId === user.id);
  return profile?.fullName || user.email || accountTypeLabel(user);
}

function vehicleLabelForBooking(db, bookingId) {
  const booking = db.bookings.find((item) => item.id === bookingId);
  const vehicle = booking ? db.vehicles.find((item) => item.id === booking.vehicleId) : null;
  return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "";
}

function notificationEmailBody(db, recipient, body, details = {}) {
  const lines = [
    `Site: ${SITE_NAME}`,
    `Account type: ${accountTypeLabel(recipient)}`
  ];
  if (details.senderUserId) lines.push(`Sender name: ${displayNameForUser(db, details.senderUserId)}`);
  else if (details.senderName) lines.push(`Sender name: ${details.senderName}`);
  const vehicle = details.vehicle || (details.bookingId ? vehicleLabelForBooking(db, details.bookingId) : "");
  if (vehicle) lines.push(`Vehicle: ${vehicle}`);
  lines.push("", body);
  return lines.join("\n");
}

function notify(db, userId, type, title, body, details = {}) {
  const user = db.users.find((item) => item.id === userId);
  const emailBody = notificationEmailBody(db, user, body, details);
  db.notifications.push({ id: id("not"), userId, type, title, body, emailBody, readAt: null, createdAt: now() });
  sendNotificationEmail(user, title, emailBody).catch((err) => console.error(`[notification-email] ${err.message}`));
}

function visibleReviews(db, technicianId) {
  return db.reviews.filter((review) => review.technicianId === technicianId && review.status !== "REMOVED");
}

function updateTechnicianRating(db, technicianId) {
  const reviews = visibleReviews(db, technicianId);
  const profile = db.technicianProfiles.find((item) => item.userId === technicianId);
  if (!profile) return;
  profile.ratingAverage = reviews.length ? Math.round((reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length) * 10) / 10 : "New";
  profile.updatedAt = now();
}

function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to);
}

function ownedBooking(user, booking) {
  return booking.customerId === user.id || booking.technicianId === user.id || user.role === roles.ADMIN;
}

function customerContactAllowed(user, booking) {
  if (!user || !booking) return false;
  if (user.role === roles.ADMIN || user.id === booking.customerId) return true;
  if (user.id !== booking.technicianId) return false;
  return !["REQUESTED", "QUOTED", "AWAITING_CUSTOMER_APPROVAL", "CANCELLED"].includes(booking.status);
}

function serializeBooking(db, booking, user) {
  const canSeeCustomerContact = customerContactAllowed(user, booking);
  const customer = db.users.find((item) => item.id === booking.customerId);
  const customerProfile = db.customerProfiles.find((item) => item.userId === booking.customerId);
  const vehicle = db.vehicles.find((item) => item.id === booking.vehicleId);
  const location = db.locations.find((item) => item.id === booking.locationId);
  return {
    ...booking,
    customer: canSeeCustomerContact ? publicUser(customer) : privateUser(customer),
    customerProfile: canSeeCustomerContact ? customerProfile : privateCustomerProfile(customerProfile),
    vehicle: canSeeCustomerContact ? vehicle : privateVehicle(vehicle),
    service: db.services.find((item) => item.id === booking.serviceId),
    location: canSeeCustomerContact ? location : privateLocation(location),
    technicianProfile: db.technicianProfiles.find((item) => item.userId === booking.technicianId),
    quote: db.quotes.find((item) => item.bookingId === booking.id),
    invoice: db.invoices.find((item) => item.bookingId === booking.id),
    review: db.reviews.find((item) => item.bookingId === booking.id && item.status !== "REMOVED") || null,
    additionalWorkRequests: db.additionalWorkRequests.filter((item) => item.bookingId === booking.id),
    inspectionFindings: db.inspectionFindings.filter((item) => item.bookingId === booking.id),
    messages: db.messages.filter((item) => item.bookingId === booking.id),
    customerContactAvailable: canSeeCustomerContact
  };
}

function technicianMatches(db, technicianUserId, service, location) {
  const user = db.users.find((item) => item.id === technicianUserId && item.role === roles.TECHNICIAN);
  if (!isAccountActive(user)) return false;
  const profile = db.technicianProfiles.find((item) => item.userId === technicianUserId);
  if (!profile || profile.verificationStatus !== "APPROVED") return false;
  const specialties = profile.specialties || [];
  if (service.requiredSpecialty && !specialties.includes(service.requiredSpecialty) && !specialties.includes("Diagnostics")) return false;
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
    if (role === roles.CUSTOMER && body.customerTermsAccepted !== true) return error(res, 400, "Customer repair authorization and payment terms must be accepted.");
    if (role === roles.TECHNICIAN) {
      if (body.technicianTermsAccepted !== true) return error(res, 400, "Technician service standards must be accepted.");
      if (body.honestRepairs !== true || body.complaintResolution !== true) return error(res, 400, "Technicians must agree to honest repair recommendations and complaint resolution standards.");
      if (!sanitize(body.legalName) || !sanitize(body.electronicSignature)) return error(res, 400, "Technician legal name and electronic signature are required.");
    }
    if (db.users.some((user) => user.email === email && user.role === role)) return error(res, 409, `That email is already registered as a ${role.toLowerCase()}.`);
    const user = { id: id("usr"), email, passwordHash: hashPassword(password), role, status: "ACTIVE", createdAt: now(), updatedAt: now() };
    db.users.push(user);
    if (role === roles.CUSTOMER) {
      db.customerProfiles.push({ id: id("cus"), userId: user.id, fullName: sanitize(body.fullName || "New Customer"), phone: "", createdAt: now(), updatedAt: now() });
      db.agreementAcceptances.push({ id: id("agr"), userId: user.id, role, version: CUSTOMER_TERMS_VERSION, acceptedAt: now(), ipAddress: req.socket.remoteAddress || "" });
    }
    if (role === roles.TECHNICIAN) {
      const yearsInField = Number(body.yearsInField || 0);
      db.technicianProfiles.push({
        id: id("tec"),
        userId: user.id,
        fullName: sanitize(body.fullName || "New Technician"),
        profilePhotoUrl: "",
        bio: "",
        yearsExperience: yearsInField,
        specialties: [],
        certifications: [],
        applicationAnswers: {
          yearsInField,
          legalName: sanitize(body.legalName),
          businessName: sanitize(body.businessName),
          hasTravelVehicle: body.hasTravelVehicle === true,
          partsPreference: sanitize(body.partsPreference || ""),
          honestRepairs: body.honestRepairs === true,
          complaintResolution: body.complaintResolution === true,
          electronicSignature: sanitize(body.electronicSignature),
          agreementVersion: TECHNICIAN_TERMS_VERSION
        },
        serviceRadiusMiles: 20,
        mobileServiceAvailable: true,
        shopServiceAvailable: false,
        hourlyRateCents: 10000,
        defaultFlatRateCents: MIN_FLAT_RATE_CENTS_PER_HOUR,
        verificationStatus: "PENDING",
        ratingAverage: 0,
        createdAt: now(),
        updatedAt: now()
      });
      db.agreementAcceptances.push({ id: id("agr"), userId: user.id, role, version: TECHNICIAN_TERMS_VERSION, acceptedAt: now(), ipAddress: req.socket.remoteAddress || "", legalName: sanitize(body.legalName), businessName: sanitize(body.businessName), electronicSignature: sanitize(body.electronicSignature) });
    }
    addAudit(db, user.id, "REGISTER", "User", user.id);
    saveDb(db);
    return send(res, 201, { user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const email = sanitize(body.email).toLowerCase();
    const requestedRole = sanitize(body.role).toUpperCase();
    const role = [roles.CUSTOMER, roles.TECHNICIAN, roles.ADMIN].includes(requestedRole) ? requestedRole : sanitize(body.adminAccessCode) ? roles.ADMIN : "";
    const user = role
      ? db.users.find((item) => item.email === email && item.role === role)
      : db.users.find((item) => item.email === email && item.status === "ACTIVE" && item.role !== roles.ADMIN);
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) return error(res, 401, "Invalid email or password.");
    if (!isAccountActive(user)) return error(res, 403, `This account is ${accountStatusText(user)}. Contact support for help.`);
    if (user.role === roles.ADMIN && sanitize(body.adminAccessCode) !== ADMIN_ACCESS_CODE) return error(res, 403, "Owner access code is required for admin login.");
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
    const email = sanitize(body.email).toLowerCase();
    const requestedRole = sanitize(body.role).toUpperCase();
    const role = [roles.CUSTOMER, roles.TECHNICIAN, roles.ADMIN].includes(requestedRole) ? requestedRole : "";
    const matches = db.users.filter((item) => item.email === email && isAccountActive(item));
    const user = role ? matches.find((item) => item.role === role) : matches.find((item) => item.role !== roles.ADMIN) || matches[0];
    if (!user) return send(res, 200, { ok: true, message: "If that account exists, a password reset email will be sent." });
    const token = crypto.randomBytes(32).toString("hex");
    const resetUrl = `${requestBaseUrl(req)}/?resetToken=${token}`;
    db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.userId !== user.id || item.usedAt);
    db.passwordResetTokens.push({
      id: id("prt"),
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: now(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      usedAt: null
    });
    const emailResult = await sendPasswordResetEmail(user, resetUrl);
    addAudit(db, user.id, "PASSWORD_RESET_REQUESTED", "User", user.id, { provider: emailResult.provider });
    saveDb(db);
    return send(res, 200, {
      ok: true,
      message: emailResult.sent ? "Password reset email sent." : "Password reset link created, but email sending is not working yet. Check Render email environment variables and logs.",
      resetUrl: emailResult.sent ? undefined : resetUrl
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password.length < 8) return error(res, 400, "New password must be at least 8 characters.");
    const tokenHash = hashToken(token);
    const reset = db.passwordResetTokens.find((item) => item.tokenHash === tokenHash && !item.usedAt && item.expiresAt > now());
    if (!reset) return error(res, 400, "Reset link is invalid or expired.");
    const user = db.users.find((item) => item.id === reset.userId && item.status === "ACTIVE");
    if (!user) return error(res, 400, "Reset link is invalid or expired.");
    user.passwordHash = hashPassword(password);
    user.updatedAt = now();
    reset.usedAt = now();
    db.sessions = db.sessions.filter((session) => session.userId !== user.id);
    addAudit(db, user.id, "PASSWORD_RESET_COMPLETED", "User", user.id);
    saveDb(db);
    return send(res, 200, { ok: true, message: "Password updated. You can log in with your new password." });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(req, db);
    if (!user) return send(res, 200, { user: null });
    const profile = user.role === roles.CUSTOMER ? db.customerProfiles.find((item) => item.userId === user.id) : user.role === roles.TECHNICIAN ? db.technicianProfiles.find((item) => item.userId === user.id) : db.adminUsers.find((item) => item.userId === user.id);
    return send(res, 200, { user: publicUser(user), profile });
  }

  if (req.method === "GET" && url.pathname === "/api/services") {
    const services = db.services.filter((service) => service.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const activeCategoryIds = new Set(services.map((service) => service.categoryId));
    const categories = db.serviceCategories.filter((category) => category.active !== false && activeCategoryIds.has(category.id)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return send(res, 200, { categories, services });
  }

  if (req.method === "GET" && url.pathname === "/api/technicians") {
    return send(res, 200, {
      technicians: db.technicianProfiles.filter((profile) => {
        const techUser = db.users.find((user) => user.id === profile.userId);
        return profile.verificationStatus === "APPROVED" && isAccountActive(techUser);
      }).map((profile) => ({
        ...profile,
        user: publicUser(db.users.find((user) => user.id === profile.userId)),
        reviews: visibleReviews(db, profile.userId),
        comments: db.technicianProfileComments.filter((comment) => comment.technicianId === profile.userId)
      }))
    });
  }

  const technicianComment = url.pathname.match(/^\/api\/technicians\/([^/]+)\/comments$/);
  if (technicianComment && req.method === "POST") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const technician = db.technicianProfiles.find((profile) => profile.userId === technicianComment[1] && profile.verificationStatus === "APPROVED");
    if (!technician) return error(res, 404, "Technician not found.");
    const comment = {
      id: id("tpc"),
      technicianId: technician.userId,
      customerId: user.id,
      body: sanitize(body.body),
      createdAt: now()
    };
    if (!comment.body) return error(res, 400, "Comment cannot be empty.");
    db.technicianProfileComments.push(comment);
    notify(db, technician.userId, "PROFILE_COMMENT", "New profile comment", comment.body, { senderUserId: user.id });
    saveDb(db);
    return send(res, 201, { comment });
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
    profile.hourlyRateCents = Math.max(MIN_FLAT_RATE_CENTS_PER_HOUR, cents(body.hourlyRate || 0));
    profile.defaultFlatRateCents = Math.max(MIN_FLAT_RATE_CENTS_PER_HOUR, cents(body.defaultFlatRate || 0));
    profile.updatedAt = now();
    saveDb(db);
    return send(res, 200, { profile });
  }

  if (req.method === "POST" && url.pathname === "/api/vehicles") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const vehicle = { id: id("veh"), customerId: user.id, year: Number(body.year), make: sanitize(body.make), model: sanitize(body.model), engine: sanitize(body.engine), mileage: Number(body.mileage || 0), vin: sanitize(body.vin), plate: sanitize(body.plate), color: sanitize(body.color), createdAt: now(), updatedAt: now() };
    if (!vehicle.year || !vehicle.make || !vehicle.model) return error(res, 400, "Vehicle year, make, and model are required.");
    db.vehicles.push(vehicle);
    saveDb(db);
    return send(res, 201, { vehicle });
  }

  if (req.method === "PUT" && url.pathname === "/api/customer/profile") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    let profile = db.customerProfiles.find((item) => item.userId === user.id);
    if (!profile) {
      profile = { id: id("cus"), userId: user.id, createdAt: now() };
      db.customerProfiles.push(profile);
    }
    profile.fullName = sanitize(body.fullName || profile.fullName || "New Customer");
    profile.phone = sanitize(body.phone || "");
    profile.updatedAt = now();
    saveDb(db);
    return send(res, 200, { profile });
  }

  const vehicleUpdate = url.pathname.match(/^\/api\/vehicles\/([^/]+)$/);
  if (vehicleUpdate && req.method === "PUT") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const vehicle = db.vehicles.find((item) => item.id === vehicleUpdate[1] && item.customerId === user.id);
    if (!vehicle) return error(res, 404, "Vehicle not found.");
    vehicle.year = Number(body.year || vehicle.year);
    vehicle.make = sanitize(body.make || vehicle.make);
    vehicle.model = sanitize(body.model || vehicle.model);
    vehicle.engine = sanitize(body.engine || "");
    vehicle.mileage = Number(body.mileage || 0);
    vehicle.vin = sanitize(body.vin || "");
    vehicle.plate = sanitize(body.plate || "");
    vehicle.color = sanitize(body.color || "");
    vehicle.updatedAt = now();
    if (!vehicle.year || !vehicle.make || !vehicle.model) return error(res, 400, "Vehicle year, make, and model are required.");
    saveDb(db);
    return send(res, 200, { vehicle });
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
    const service = db.services.find((item) => item.id === body.serviceId && item.active !== false);
    const technician = db.users.find((item) => item.id === body.technicianId && item.role === roles.TECHNICIAN);
    if (!vehicle || !service || !technician) return error(res, 400, "Choose a valid vehicle, service, and technician.");
    const location = { id: id("loc"), userId: user.id, address: sanitize(body.address), city: sanitize(body.city), region: sanitize(body.region), postalCode: sanitize(body.postalCode), latitude: Number(body.latitude || 0), longitude: Number(body.longitude || 0), privacyLabel: "APPROXIMATE_UNTIL_BOOKED", createdAt: now() };
    if (!location.address) return error(res, 400, "Enter the service address.");
    if (!technicianMatches(db, technician.id, service, location)) return error(res, 400, "That technician is not approved or does not match this service.");
    if (isDoubleBooked(db, technician.id, body.preferredAt)) return error(res, 409, "That technician is already booked near that time.");
    const booking = { id: id("bok"), customerId: user.id, technicianId: technician.id, vehicleId: vehicle.id, serviceId: service.id, locationId: location.id, status: "REQUESTED", serviceMode: body.serviceMode === "SHOP" ? "SHOP" : "MOBILE", preferredAt: body.preferredAt, symptoms: sanitize(body.symptoms), dtcs: sanitize(body.dtcs), mediaUrls: [], createdAt: now(), updatedAt: now() };
    db.locations.push(location);
    db.bookings.push(booking);
    notify(db, technician.id, "NEW_BOOKING_REQUEST", "New customer request", `${service.name} requested for ${vehicle.year} ${vehicle.make} ${vehicle.model}. Customer note: ${booking.symptoms || "No description provided."}`, { senderUserId: user.id, bookingId: booking.id });
    saveDb(db);
    return send(res, 201, { booking });
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    const user = requireUser(req, res, db);
    if (!user) return;
    const bookings = db.bookings.filter((booking) => ownedBooking(user, booking)).map((booking) => serializeBooking(db, booking, user));
    return send(res, 200, { bookings });
  }

  const bookingUpdate = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookingUpdate && req.method === "PUT") {
    const user = requireUser(req, res, db, [roles.CUSTOMER]);
    if (!user) return;
    const booking = db.bookings.find((item) => item.id === bookingUpdate[1] && item.customerId === user.id);
    if (!booking) return error(res, 404, "Booking not found.");
    if (!["REQUESTED", "BOOKED", "QUOTED", "AWAITING_CUSTOMER_APPROVAL"].includes(booking.status)) return error(res, 409, "This booking can no longer be edited.");
    const quote = db.quotes.find((item) => item.bookingId === booking.id && item.status === "APPROVED");
    if (quote) return error(res, 409, "This booking has an approved quote and can no longer be edited.");

    const vehicle = db.vehicles.find((item) => item.id === body.vehicleId && item.customerId === user.id);
    const service = db.services.find((item) => item.id === body.serviceId && item.active !== false);
    const technician = db.users.find((item) => item.id === body.technicianId && item.role === roles.TECHNICIAN && item.status === "ACTIVE");
    const location = db.locations.find((item) => item.id === booking.locationId);
    if (!vehicle || !service || !technician || !location) return error(res, 400, "Choose a valid vehicle, service, and technician.");
    const updatedLocation = {
      ...location,
      address: sanitize(body.address),
      city: sanitize(body.city),
      region: sanitize(body.region),
      postalCode: sanitize(body.postalCode)
    };
    if (!updatedLocation.address) return error(res, 400, "Enter the service address.");
    if (!technicianMatches(db, technician.id, service, updatedLocation)) return error(res, 400, "That technician is not approved or does not match this service.");
    if (isDoubleBooked(db, technician.id, body.preferredAt, booking.id)) return error(res, 409, "That technician is already booked near that time.");

    const previousTechnicianId = booking.technicianId;
    Object.assign(location, updatedLocation);
    booking.vehicleId = vehicle.id;
    booking.serviceId = service.id;
    booking.technicianId = technician.id;
    booking.serviceMode = body.serviceMode === "SHOP" ? "SHOP" : "MOBILE";
    booking.preferredAt = body.preferredAt;
    booking.symptoms = sanitize(body.symptoms);
    booking.dtcs = sanitize(body.dtcs);
    booking.updatedAt = now();
    if (["QUOTED", "AWAITING_CUSTOMER_APPROVAL"].includes(booking.status)) {
      db.quotes = db.quotes.filter((item) => item.bookingId !== booking.id);
      booking.status = "REQUESTED";
    }
    notify(db, technician.id, "BOOKING_UPDATED", "Customer updated booking", `${service.name} for ${vehicle.year} ${vehicle.make} ${vehicle.model}.`, { senderUserId: user.id, bookingId: booking.id });
    if (previousTechnicianId !== technician.id) notify(db, previousTechnicianId, "BOOKING_REASSIGNED", "Customer selected another technician", "A customer changed the technician on a booking.", { senderUserId: user.id, bookingId: booking.id });
    saveDb(db);
    return send(res, 200, { booking, location });
  }

  if (req.method === "GET" && url.pathname === "/api/jobs/opportunities") {
    const user = requireUser(req, res, db, [roles.TECHNICIAN]);
    if (!user) return;
    const jobs = db.bookings.filter((booking) => booking.technicianId === user.id && booking.status === "REQUESTED").map((booking) => serializeBooking(db, booking, user));
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
      notify(db, booking.customerId, "BOOKING_ACCEPTED", "Technician accepted", `Your repair request was accepted for ${new Date(scheduledAt).toLocaleString()}.`, { senderUserId: user.id, bookingId: booking.id });
      saveDb(db);
      return send(res, 200, { booking });
    }

    if (req.method === "POST" && action === "quote") {
      if (user.id !== booking.technicianId) return error(res, 403, "Only the technician can quote this booking.");
      const service = db.services.find((item) => item.id === booking.serviceId);
      const profile = db.technicianProfiles.find((item) => item.userId === user.id);
      const laborHours = normalizeLaborHours(body, service.estimatedMinutes);
      if (laborHours < 0.5 || !Number.isFinite(laborHours) || Math.round(laborHours * 2) !== laborHours * 2) {
        return error(res, 400, "Labor hours must be 0.5 or higher and entered in half-hour increments.");
      }
      const laborMinutes = Math.round(laborHours * 60);
      const amountCents = Number(body.amountCents || profile?.defaultFlatRateCents || service.basePriceCents);
      const minAmountCents = minimumFlatRateCents(laborMinutes);
      if (amountCents < MIN_FLAT_RATE_CENTS_PER_HOUR) return error(res, 400, "Flat rate value must be greater than or equal to $100.00.");
      if ((body.pricingModel || service.pricingModel) === "FLAT_RATE" && amountCents < minAmountCents) {
        return error(res, 400, `Flat-rate quotes must be at least ${money(minAmountCents)} for ${laborHours.toFixed(1)} hours of work.`);
      }
      const quote = { id: id("quo"), bookingId: booking.id, technicianId: user.id, pricingModel: body.pricingModel || service.pricingModel, laborHours, laborMinutes, amountCents, status: "PENDING", customerApprovedAt: null, createdAt: now() };
      db.quotes = db.quotes.filter((item) => item.bookingId !== booking.id);
      db.quotes.push(quote);
      booking.status = "AWAITING_CUSTOMER_APPROVAL";
      booking.updatedAt = now();
      const quoteVehicle = db.vehicles.find((item) => item.id === booking.vehicleId);
      notify(db, booking.customerId, "QUOTE_READY", "Your quote is ready", `The technician sent a quote for ${service?.name || "your repair"} on your ${quoteVehicle ? `${quoteVehicle.year} ${quoteVehicle.make} ${quoteVehicle.model}` : "vehicle"}. Quote amount: ${money(amountCents)}. Log in to approve or review it.`, { senderUserId: user.id, bookingId: booking.id });
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
      notify(db, booking.technicianId, "QUOTE_APPROVED", "Quote approved", "The customer approved your quote and payment authorization is recorded.", { senderUserId: user.id, bookingId: booking.id });
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
      notify(db, booking.customerId, `JOB_${nextStatus}`, "Job update", `Your job is now ${nextStatus.replaceAll("_", " ").toLowerCase()}.`, { senderUserId: user.id, bookingId: booking.id });
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
      notify(db, booking.customerId, "ADDITIONAL_WORK_REQUESTED", "Additional work requested", `${request.description}: ${money(request.amountCents)}`, { senderUserId: user.id, bookingId: booking.id });
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
      notify(db, booking.customerId, "INSPECTION_FINDING_ADDED", "Technician added inspection findings", finding.suggestedRepair || finding.notes || finding.title, { senderUserId: user.id, bookingId: booking.id });
      saveDb(db);
      return send(res, 201, { finding });
    }

    if (req.method === "POST" && action === "message") {
      const message = { id: id("msg"), bookingId: booking.id, senderId: user.id, body: sanitize(body.body), createdAt: now() };
      if (!message.body) return error(res, 400, "Message cannot be empty.");
      db.messages.push(message);
      const recipientId = user.id === booking.customerId ? booking.technicianId : booking.customerId;
      const senderLabel = user.id === booking.customerId ? "customer" : "technician";
      notify(db, recipientId, "NEW_MESSAGE", "You got a response", `Your ${senderLabel} sent a new message: ${message.body}`, { senderUserId: user.id, bookingId: booking.id });
      saveDb(db);
      return send(res, 201, { message });
    }

    if (req.method === "POST" && action === "review") {
      if (user.id !== booking.customerId) return error(res, 403, "Only the customer can review this job.");
      if (booking.status !== "COMPLETED") return error(res, 409, "Only completed jobs can be reviewed.");
      if (db.reviews.some((item) => item.bookingId === booking.id)) return error(res, 409, "This job already has a review.");
      const review = { id: id("rev"), bookingId: booking.id, customerId: user.id, technicianId: booking.technicianId, rating: Number(body.rating), body: sanitize(body.body), createdAt: now() };
      if (review.rating < 1 || review.rating > 5) return error(res, 400, "Rating must be 1 through 5.");
      review.status = "ACTIVE";
      db.reviews.push(review);
      updateTechnicianRating(db, booking.technicianId);
      notify(db, booking.technicianId, "REVIEW_RECEIVED", "New review received", `${review.rating} stars`, { senderUserId: user.id, bookingId: booking.id });
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
    notify(db, request.technicianId, `ADDITIONAL_WORK_${request.status}`, "Additional work decision", `Customer ${request.status.toLowerCase()} the request.`, { senderUserId: user.id, bookingId: booking.id });
    saveDb(db);
    return send(res, 200, { request, booking });
  }

  if (req.method === "GET" && url.pathname === "/api/technician/reviews") {
    const user = requireUser(req, res, db, [roles.TECHNICIAN]);
    if (!user) return;
    const reviews = visibleReviews(db, user.id).map((review) => ({
      ...review,
      booking: db.bookings.find((booking) => booking.id === review.bookingId),
      dispute: db.disputes.find((dispute) => dispute.reviewId === review.id && dispute.status !== "CLOSED")
    }));
    return send(res, 200, { reviews });
  }

  const reviewDispute = url.pathname.match(/^\/api\/reviews\/([^/]+)\/dispute$/);
  if (reviewDispute && req.method === "POST") {
    const user = requireUser(req, res, db, [roles.TECHNICIAN]);
    if (!user) return;
    const review = visibleReviews(db, user.id).find((item) => item.id === reviewDispute[1]);
    if (!review) return error(res, 404, "Review not found.");
    if (db.disputes.some((item) => item.reviewId === review.id && item.status !== "CLOSED")) return error(res, 409, "This review already has an open dispute.");
    const dispute = {
      id: id("dsp"),
      type: "REVIEW_DISPUTE",
      reviewId: review.id,
      bookingId: review.bookingId,
      technicianId: user.id,
      customerId: review.customerId,
      reason: sanitize(body.reason),
      status: "OPEN",
      decision: null,
      adminNotes: "",
      createdAt: now(),
      updatedAt: now()
    };
    if (!dispute.reason) return error(res, 400, "Tell the owner/admin why this review should be checked.");
    db.disputes.push(dispute);
    review.status = "DISPUTED";
    notify(db, user.id, "REVIEW_DISPUTE_CREATED", "Review dispute sent to owner/admin", dispute.reason, { senderUserId: user.id, bookingId: dispute.bookingId });
    saveDb(db);
    return send(res, 201, { dispute });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/summary") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const revenue = db.invoices.reduce((sum, invoice) => sum + invoice.platformFeeCents, 0);
    const customers = db.users.filter((item) => item.role === roles.CUSTOMER).map((customer) => ({
      ...publicUser(customer),
      statusLabel: accountStatusText(customer),
      suspendedUntil: customer.suspendedUntil || null,
      suspensionReason: customer.suspensionReason || "",
      profile: db.customerProfiles.find((profile) => profile.userId === customer.id),
      vehicleCount: db.vehicles.filter((vehicle) => vehicle.customerId === customer.id).length,
      bookingCount: db.bookings.filter((booking) => booking.customerId === customer.id).length,
      lastBookingAt: db.bookings.filter((booking) => booking.customerId === customer.id).map((booking) => booking.createdAt).sort().at(-1) || null
    }));
    const technicians = db.users.filter((item) => item.role === roles.TECHNICIAN).map((technician) => ({
      ...publicUser(technician),
      statusLabel: accountStatusText(technician),
      suspendedUntil: technician.suspendedUntil || null,
      suspensionReason: technician.suspensionReason || "",
      profile: db.technicianProfiles.find((profile) => profile.userId === technician.id),
      bookingCount: db.bookings.filter((booking) => booking.technicianId === technician.id).length,
      activeBookingCount: db.bookings.filter((booking) => booking.technicianId === technician.id && !["COMPLETED", "CANCELLED", "REFUNDED"].includes(booking.status)).length,
      lastBookingAt: db.bookings.filter((booking) => booking.technicianId === technician.id).map((booking) => booking.createdAt).sort().at(-1) || null
    }));
    const pendingTechnicians = db.technicianProfiles.filter((item) => ["PENDING", "UNDER_REVIEW"].includes(item.verificationStatus)).map((profile) => ({
      ...profile,
      user: publicUser(db.users.find((item) => item.id === profile.userId))
    }));
    const reviewDisputes = db.disputes.filter((item) => item.type === "REVIEW_DISPUTE" && item.status !== "CLOSED").map((dispute) => ({
      ...dispute,
      review: db.reviews.find((review) => review.id === dispute.reviewId),
      technicianProfile: db.technicianProfiles.find((profile) => profile.userId === dispute.technicianId),
      customer: publicUser(db.users.find((item) => item.id === dispute.customerId))
    }));
    return send(res, 200, {
      activeJobs: db.bookings.filter((booking) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(booking.status)).length,
      todaysBookings: db.bookings.length,
      totalCustomers: db.users.filter((item) => item.role === roles.CUSTOMER).length,
      totalTechnicians: db.users.filter((item) => item.role === roles.TECHNICIAN).length,
      pendingTechnicianApprovals: pendingTechnicians.length,
      pendingTechnicians,
      todaysRevenueCents: revenue,
      technicianPayoutsCents: db.payouts.reduce((sum, payout) => sum + payout.amountCents, 0),
      openDisputes: db.disputes.filter((item) => item.status !== "CLOSED").length,
      commissionPercent: Number(setting(db, "platformCommissionPercent", "10")),
      reviewDisputes,
      storage: {
        dataDir: DATA_DIR,
        databaseFile: databaseFilePath(),
        backupDir: BACKUP_DIR,
        backupCount: fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((name) => name.endsWith(".json")).length : 0,
        persistentDiskExpected: DATA_DIR.replace(/\\/g, "/").startsWith("/var/data")
      },
      recentLogs: db.auditLogs.slice(-25).reverse(),
      recentNotifications: db.notifications.slice(-25).reverse(),
      customers,
      technicians
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/database-export") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    addAudit(db, user.id, "DATABASE_EXPORTED", "Database", "database", { requestedAt: now() });
    saveDb(db);
    return send(res, 200, {
      exportedAt: now(),
      version: 1,
      database: db
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/database-import") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const incoming = body.database && typeof body.database === "object" ? body.database : body;
    if (!incoming || !Array.isArray(incoming.users)) return error(res, 400, "Choose a valid WrenchLane database backup file.");
    const restored = normalizeDb(incoming);
    const restoredAdmin = restored.users.find((item) => item.email === OWNER_ADMIN_EMAIL && item.role === roles.ADMIN);
    const sessionId = readSessionValue(parseCookies(req).session);
    restored.sessions = sessionId && restoredAdmin ? [{ id: sessionId, userId: restoredAdmin.id, createdAt: now(), expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString() }] : [];
    addAudit(restored, restoredAdmin?.id || user.id, "DATABASE_IMPORTED", "Database", "database", {
      importedAt: now(),
      users: restored.users.length,
      bookings: restored.bookings.length,
      sourceExportedAt: body.exportedAt || null
    });
    for (const key of Object.keys(db)) delete db[key];
    Object.assign(db, restored);
    saveDb(db);
    return send(res, 200, {
      ok: true,
      users: db.users.length,
      customers: db.users.filter((item) => item.role === roles.CUSTOMER).length,
      technicians: db.users.filter((item) => item.role === roles.TECHNICIAN).length,
      bookings: db.bookings.length
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/customers/status") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const customer = db.users.find((item) => item.id === body.customerId && item.role === roles.CUSTOMER);
    if (!customer) return error(res, 404, "Customer not found.");
    const action = sanitize(body.action).toUpperCase();
    const reason = sanitize(body.reason);
    if (action === "SUSPEND") {
      const days = Number(body.days);
      if (![5, 15, 30].includes(days)) return error(res, 400, "Suspension must be 5, 15, or 30 days.");
      customer.status = "SUSPENDED";
      customer.suspendedUntil = addDays(days);
      customer.suspensionReason = reason || `${days} day service suspension`;
    } else if (action === "BLOCK") {
      customer.status = "BLOCKED";
      customer.suspendedUntil = null;
      customer.suspensionReason = reason || "Blocked by owner/admin";
    } else if (action === "DELETE") {
      customer.status = "DELETED";
      customer.suspendedUntil = null;
      customer.suspensionReason = reason || "Deleted by owner/admin";
    } else if (action === "ACTIVATE") {
      customer.status = "ACTIVE";
      customer.suspendedUntil = null;
      customer.suspensionReason = "";
    } else {
      return error(res, 400, "Choose delete, block, suspend, or activate.");
    }
    customer.updatedAt = now();
    db.sessions = db.sessions.filter((session) => session.userId !== customer.id);
    addAudit(db, user.id, `CUSTOMER_${action}`, "User", customer.id, { days: body.days || null, reason });
    notify(db, customer.id, `CUSTOMER_${action}`, "Account status updated", `Your ${SITE_NAME} customer account is now ${accountStatusText(customer)}.`, { senderUserId: user.id });
    saveDb(db);
    return send(res, 200, { customer: publicUser(customer), statusLabel: accountStatusText(customer) });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/technicians/status") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const technician = db.users.find((item) => item.id === body.technicianId && item.role === roles.TECHNICIAN);
    if (!technician) return error(res, 404, "Technician not found.");
    const action = sanitize(body.action).toUpperCase();
    const reason = sanitize(body.reason);
    const profile = db.technicianProfiles.find((item) => item.userId === technician.id);
    if (action === "SUSPEND") {
      const days = Number(body.days);
      if (![5, 15, 30].includes(days)) return error(res, 400, "Suspension must be 5, 15, or 30 days.");
      technician.status = "SUSPENDED";
      technician.suspendedUntil = addDays(days);
      technician.suspensionReason = reason || `${days} day service suspension`;
      if (profile) profile.verificationStatus = "SUSPENDED";
    } else if (action === "BLOCK") {
      technician.status = "BLOCKED";
      technician.suspendedUntil = null;
      technician.suspensionReason = reason || "Blocked by owner/admin";
      if (profile) profile.verificationStatus = "BLOCKED";
    } else if (action === "DELETE") {
      technician.status = "DELETED";
      technician.suspendedUntil = null;
      technician.suspensionReason = reason || "Deleted by owner/admin";
      if (profile) profile.verificationStatus = "DELETED";
    } else if (action === "ACTIVATE") {
      technician.status = "ACTIVE";
      technician.suspendedUntil = null;
      technician.suspensionReason = "";
      if (profile && ["SUSPENDED", "BLOCKED", "DELETED"].includes(profile.verificationStatus)) profile.verificationStatus = "APPROVED";
    } else {
      return error(res, 400, "Choose delete, block, suspend, or activate.");
    }
    technician.updatedAt = now();
    if (profile) profile.updatedAt = now();
    db.sessions = db.sessions.filter((session) => session.userId !== technician.id);
    addAudit(db, user.id, `TECHNICIAN_${action}`, "User", technician.id, { days: body.days || null, reason });
    notify(db, technician.id, `TECHNICIAN_${action}`, "Account status updated", `Your ${SITE_NAME} technician account is now ${accountStatusText(technician)}.`, { senderUserId: user.id });
    saveDb(db);
    return send(res, 200, { technician: publicUser(technician), statusLabel: accountStatusText(technician), profile });
  }

  const adminReviewDispute = url.pathname.match(/^\/api\/admin\/review-disputes\/([^/]+)\/resolve$/);
  if (adminReviewDispute && req.method === "POST") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const dispute = db.disputes.find((item) => item.id === adminReviewDispute[1] && item.type === "REVIEW_DISPUTE");
    if (!dispute) return error(res, 404, "Review dispute not found.");
    if (dispute.status === "CLOSED") return error(res, 409, "This dispute is already closed.");
    const review = db.reviews.find((item) => item.id === dispute.reviewId);
    const decision = sanitize(body.decision).toUpperCase();
    if (!["KEEP", "REMOVE"].includes(decision)) return error(res, 400, "Decision must be KEEP or REMOVE.");
    if (review) {
      review.status = decision === "REMOVE" ? "REMOVED" : "ACTIVE";
      updateTechnicianRating(db, review.technicianId);
    }
    dispute.status = "CLOSED";
    dispute.decision = decision;
    dispute.adminNotes = sanitize(body.adminNotes);
    dispute.resolvedBy = user.id;
    dispute.updatedAt = now();
    addAudit(db, user.id, `REVIEW_DISPUTE_${decision}`, "Dispute", dispute.id, { reviewId: dispute.reviewId });
    saveDb(db);
    return send(res, 200, { dispute, review });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/technicians/approve") {
    const user = requireUser(req, res, db, [roles.ADMIN]);
    if (!user) return;
    const profile = db.technicianProfiles.find((item) => item.userId === body.technicianId);
    if (!profile) return error(res, 404, "Technician not found.");
    const nextStatus = sanitize(body.status || "APPROVED").toUpperCase();
    if (!["APPROVED", "DENIED", "UNDER_REVIEW", "PENDING"].includes(nextStatus)) return error(res, 400, "Unknown technician approval status.");
    profile.verificationStatus = nextStatus;
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
  let db = loadDb();
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

