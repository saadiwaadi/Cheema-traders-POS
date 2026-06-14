const verifier = require("./backend/licenseVerifier");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

async function runTests() {
  console.log("Running licensing priority checks in isolation...");

  const masterKey = "CTPOS-2026-MASTER-EXP20991231-87EF762DF24B0351";
  const normalKey = "CTPOS-2026-UNLIMITED-EXP20261231-D5DD2BF8D3D37FF1";
  const expiredKey = "CTPOS-2026-UNLIMITED-EXP20260601-C751FBC242C3E1AF"; // Expired June 1, 2026

  // Helper to mock remote control responses
  let mockControl = null;
  let mockFromCache = false;
  verifier.fetchRemoteControlFile = async () => {
    return { data: mockControl, fromCache: mockFromCache };
  };

  // --- Test Case A: Master Key Bypass ---
  // Master key should be allowed even if global emergency shutdown is true and key is revoked
  mockControl = {
    global_emergency_shutdown: true,
    keys: {
      [masterKey]: { status: "revoked", emergency_shutdown: true }
    }
  };
  mockFromCache = false;
  let res = await verifier.verifyOnLaunch("Saad", masterKey);
  assert.strictEqual(res.allowed, true, "Master key must bypass global shutdown and key status checks");
  assert.strictEqual(res.master, true, "Master key must be identified as master");
  console.log("✅ Check (a) Master key bypass passed.");

  // --- Test Case B: Global Emergency Shutdown ---
  mockControl = {
    global_emergency_shutdown: true,
    keys: {}
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, false, "Normal key must be blocked by global shutdown");
  assert.strictEqual(res.reason, "global_shutdown", "Reason must be global_shutdown");
  console.log("✅ Check (b) Global emergency shutdown passed.");

  // --- Test Case C: Key Status Revoked/Suspended ---
  mockControl = {
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "revoked" }
    }
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, false, "Revoked key must be blocked");
  assert.strictEqual(res.reason, "revoked", "Reason must be revoked");

  mockControl = {
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "suspended" }
    }
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, false, "Suspended key must be blocked");
  assert.strictEqual(res.reason, "revoked", "Reason must be revoked (matches revoked/suspended check)");
  console.log("✅ Check (c) Key status revocation passed.");

  // --- Test Case D: Key Expiry + Grace ---
  mockControl = {
    global_emergency_shutdown: false,
    keys: {}
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", expiredKey);
  assert.strictEqual(res.allowed, false, "Expired key past grace period must be blocked");
  assert.strictEqual(res.status, "expired_locked", "Status must be expired_locked");
  console.log("✅ Check (d) Expiry + Grace passed.");

  // --- Test Case E: Emergency Shutdown for this Key ---
  mockControl = {
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "active", emergency_shutdown: true }
    }
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, false, "Key emergency shutdown must block");
  assert.strictEqual(res.reason, "key_shutdown", "Reason must be key_shutdown");
  console.log("✅ Check (e) Key-specific emergency shutdown passed.");

  // --- Test Case F: All Checks Passed ---
  mockControl = {
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "active", emergency_shutdown: false }
    }
  };
  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, true, "Valid active key should pass all checks");
  assert.strictEqual(res.status, "active", "Status should be active");
  console.log("✅ Check (f) All checks passed (allow + cache) passed.");

  // --- Test Case G: 2-hour-old cache does NOT lock ---
  const cacheDir = path.resolve(__dirname, "database");
  const cachePath = path.resolve(cacheDir, "license-cache.json");

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "active", emergency_shutdown: false }
    }
  }), "utf8");

  // Set mtime to 2 hours ago
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  fs.utimesSync(cachePath, new Date(twoHoursAgo), new Date(twoHoursAgo));

  mockControl = {
    global_emergency_shutdown: false,
    keys: {
      [normalKey]: { status: "active", emergency_shutdown: false }
    }
  };
  mockFromCache = true;

  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, true, "2-hour-old cache must not trigger the 72-hour warning/lock");
  console.log("✅ Check (g) 2-hour-old cache check passed.");

  // --- Test Case H: 73-hour-old cache DOES lock ---
  // Set mtime to 73 hours ago
  const seventyThreeHoursAgo = Date.now() - (73 * 60 * 60 * 1000);
  fs.utimesSync(cachePath, new Date(seventyThreeHoursAgo), new Date(seventyThreeHoursAgo));

  res = await verifier.verifyOnLaunch("Cheema Traders", normalKey);
  assert.strictEqual(res.allowed, false, "73-hour-old cache must trigger the 72-hour warning/lock");
  assert.strictEqual(res.reason, "cache_expired", "Reason must be cache_expired");
  console.log("✅ Check (h) 73-hour-old cache check passed.");

  // Cleanup cache after test
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  console.log("\n🎉 ALL 5 VERIFICATION PRIORITY STEPS + CACHE AGE TESTS PASSED!");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
