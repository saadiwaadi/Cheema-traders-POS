const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HMAC_SALT = "cheema_traders_pos_secret_salt_2026";
const MASTER_KEY_HASH = "20b28f64e5fabb72c762c545d84c9c7bc875fdf6c3da5e5190ebf0854f0d2101";
const LICENSE_CONTROL_URL = "https://gist.githubusercontent.com/saadcheema/75df3890cf2c12ea8f1d82136e090cc1/raw/license_control.json";

function getUserDataPath() {
  if (process.env.DB_PATH) {
    return path.dirname(process.env.DB_PATH);
  }
  return path.resolve(__dirname, "..", "database");
}

/**
 * Confirming explicitly: We never read license_control.json from local disk.
 * We only fetch from LICENSE_CONTROL_URL or fall back to the cached copy in userData/license-cache.json.
 */
async function fetchRemoteControlFile() {
  const cachePath = path.join(getUserDataPath(), "license-cache.json");
  try {
    const response = await fetch(LICENSE_CONTROL_URL, { signal: AbortSignal.timeout(4000) });
    if (response.ok) {
      const data = await response.json();
      // Cache it for offline fallback
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
      return { data, fromCache: false };
    }
  } catch (err) {
    // Suppress verbose network warnings on developer console unless needed
  }

  // Fall back to reading from local cache only
  try {
    if (fs.existsSync(cachePath)) {
      const cacheContent = fs.readFileSync(cachePath, "utf8");
      return { data: JSON.parse(cacheContent), fromCache: true };
    }
  } catch (err) {
    // Cache does not exist or is malformed
  }

  return { data: null, fromCache: false };
}

function calculateChecksum(businessName, payload) {
  const normName = businessName.toLowerCase().replace(/\s+/g, "");
  return crypto.createHmac("sha256", HMAC_SALT)
    .update(normName + payload)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

function validateLicenseKey(bizName, licKey) {
  if (!bizName || !licKey) return { valid: false };

  // Check master key hash
  const keyHash = crypto.createHash("sha256").update(licKey).digest("hex");
  if (keyHash === MASTER_KEY_HASH) {
    return {
      valid: true,
      master: true,
      expired: false,
      daysRemaining: 26860,
      expiryDateStr: "2099-12-31",
      expiryDate: new Date(2099, 11, 31, 23, 59, 59)
    };
  }

  const parts = licKey.split("-");
  if (parts.length < 5 || parts[0] !== "CTPOS") return { valid: false };
  const checksum = parts[parts.length - 1];
  const payload = parts.slice(1, parts.length - 1).join("-");
  const expectedChecksum = calculateChecksum(bizName, payload);
  if (checksum !== expectedChecksum) return { valid: false };

  const expPart = parts.find(p => p.startsWith("EXP"));
  if (!expPart) return { valid: false };
  const expStr = expPart.replace("EXP", "");
  if (expStr.length !== 8) return { valid: false };

  const expYear = expStr.slice(0, 4);
  const expMonth = expStr.slice(4, 6);
  const expDay = expStr.slice(6, 8);
  const expiryString = `${expYear}-${expMonth}-${expDay}`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryString); expiry.setHours(0, 0, 0, 0);
  const expired = today > expiry;

  const timestampMs = expiry.getTime();
  const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
  const ageDays = ageHours / 24;

  const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`[Licensing] Expiry validation: today=${today.toISOString()}, expiry=${expiry.toISOString()}, expired=${expired}, ageHours=${ageHours.toFixed(2)}, ageDays=${ageDays.toFixed(2)}, daysRemaining=${daysRemaining}`);

  return {
    valid: true,
    master: false,
    expired: expired,
    daysRemaining: daysRemaining,
    expiryDateStr: expiryString,
    expiryDate: expiry
  };
}

async function verifyOnLaunch(bizName, licKey, firstLaunchDateStr) {
  // a) Check if key hash matches MASTER_KEY_HASH → if yes, allow immediately, skip all below
  if (licKey) {
    const keyHash = crypto.createHash("sha256").update(licKey).digest("hex");
    if (keyHash === MASTER_KEY_HASH) {
      return { allowed: true, master: true, status: "active" };
    }
  }

  // Fetch control file remote/cache
  const { data: controlData, fromCache } = await module.exports.fetchRemoteControlFile();

  // Cache age 72-hour warning/lock check if using fallback cache
  if (fromCache) {
    const cachePath = path.join(getUserDataPath(), "license-cache.json");
    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      const timestampMs = stats.mtimeMs;
      const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;
      console.log(`[Licensing] Cache check: ageHours=${ageHours.toFixed(2)}, ageDays=${ageDays.toFixed(2)}`);
      if (ageHours > 72) {
        console.error(`[Licensing] Blocked: Cache file is older than 72 hours (${ageHours.toFixed(2)} hours).`);
        return { allowed: false, status: "unlicensed_locked", reason: "cache_expired" };
      }
    }
  }

  // b) Check global_emergency_shutdown in control file → if true, hard lock
  if (controlData && controlData.global_emergency_shutdown === true) {
    return { allowed: false, status: "unlicensed_locked", reason: "global_shutdown" };
  }

  // c) Check key status in control file → revoked/suspended = hard lock
  if (licKey && controlData && controlData.keys && controlData.keys[licKey]) {
    const keyConfig = controlData.keys[licKey];
    if (keyConfig.status === "revoked" || keyConfig.status === "suspended") {
      return { allowed: false, status: "unlicensed_locked", reason: "revoked" };
    }
  }

  // d) Check expiry date from key payload → expired + grace 0 = hard lock
  if (!licKey) {
    // Grace check for trial/unlicensed
    if (firstLaunchDateStr) {
      const launchDate = new Date(firstLaunchDateStr);
      const timestampMs = launchDate.getTime();
      const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;
      console.log(`[Licensing] Unlicensed Grace Check: ageHours=${ageHours.toFixed(2)}, ageDays=${ageDays.toFixed(2)}`);
      if (ageDays > 7) {
        return { allowed: false, status: "unlicensed_locked", reason: "trial_expired" };
      }
      return { allowed: true, status: "unlicensed_grace" };
    }
    return { allowed: false, status: "unlicensed_locked", reason: "no_key" };
  }

  const validation = validateLicenseKey(bizName, licKey);
  if (!validation.valid) {
    // Check trial first launch grace period
    if (firstLaunchDateStr) {
      const launchDate = new Date(firstLaunchDateStr);
      const timestampMs = launchDate.getTime();
      const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;
      console.log(`[Licensing] Invalid key Grace Check: ageHours=${ageHours.toFixed(2)}, ageDays=${ageDays.toFixed(2)}`);
      if (ageDays > 7) {
        return { allowed: false, status: "unlicensed_locked", reason: "trial_expired" };
      }
      return { allowed: true, status: "unlicensed_grace" };
    }
    return { allowed: false, status: "unlicensed_locked", reason: "invalid_key" };
  }

  if (validation.expired) {
    const expiryDate = new Date(validation.expiryDateStr);
    const timestampMs = expiryDate.getTime();
    const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
    const ageDays = ageHours / 24;
    console.log(`[Licensing] Expiry grace check: ageHours=${ageHours.toFixed(2)}, ageDays=${ageDays.toFixed(2)}`);
    if (ageDays > 7) {
      return { allowed: false, status: "expired_locked", reason: "expired" };
    }
  }

  // e) Check emergency_shutdown for this key → if true, hard lock
  if (controlData && controlData.keys && controlData.keys[licKey]) {
    const keyConfig = controlData.keys[licKey];
    if (keyConfig.emergency_shutdown === true) {
      return { allowed: false, status: "unlicensed_locked", reason: "key_shutdown" };
    }
  }

  // f) All checks passed → allow, cache result
  const status = validation.expired ? "expired_grace" : "active";
  return { allowed: true, status: status, validation: validation };
}

module.exports = {
  HMAC_SALT,
  MASTER_KEY_HASH,
  validateLicenseKey,
  verifyOnLaunch,
  fetchRemoteControlFile
};
