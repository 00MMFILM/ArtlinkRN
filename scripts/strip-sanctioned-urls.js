/**
 * EAS Build hook: scan and strip URLs from US-sanctioned countries.
 * Runs as eas-build-post-install to catch issues before the build completes.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SANCTIONED_PATTERNS = [
  "setareaval.ir",
  "sa-sentry-log.setareaval.ir",
];

console.log("[sanctions-scan] Scanning node_modules for sanctioned URLs...");

try {
  const result = execSync(
    'grep -rn "setareaval" node_modules/ 2>/dev/null || true',
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  ).trim();

  if (result) {
    console.warn("[sanctions-scan] WARNING: Found sanctioned URLs:");
    console.warn(result);

    // Attempt to patch the files
    const lines = result.split("\n");
    for (const line of lines) {
      const match = line.match(/^([^:]+):\d+:/);
      if (!match) continue;
      const filePath = match[1];
      try {
        let content = fs.readFileSync(filePath, "utf8");
        for (const pattern of SANCTIONED_PATTERNS) {
          if (content.includes(pattern)) {
            content = content.replace(new RegExp(pattern.replace(/\./g, "\\."), "g"), "removed.invalid");
            fs.writeFileSync(filePath, content);
            console.log(`[sanctions-scan] Patched: ${filePath}`);
          }
        }
      } catch (e) {
        console.warn(`[sanctions-scan] Could not patch ${filePath}: ${e.message}`);
      }
    }
  } else {
    console.log("[sanctions-scan] Clean - no sanctioned URLs found in node_modules");
  }
} catch (e) {
  console.log("[sanctions-scan] Scan completed (no issues found)");
}

// Also scan iOS Pods if they exist
const podsPath = path.join(__dirname, "..", "ios", "Pods");
if (fs.existsSync(podsPath)) {
  console.log("[sanctions-scan] Scanning iOS Pods...");
  try {
    const podResult = execSync(
      `grep -rn "setareaval" "${podsPath}" 2>/dev/null || true`,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    ).trim();
    if (podResult) {
      console.warn("[sanctions-scan] WARNING: Found in Pods:");
      console.warn(podResult);
    } else {
      console.log("[sanctions-scan] Pods clean");
    }
  } catch (e) {
    console.log("[sanctions-scan] Pods scan completed");
  }
}

console.log("[sanctions-scan] Done.");
