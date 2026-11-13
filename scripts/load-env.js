import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), ".env");

/*
 * Local development:
 *   Load variables from .env when it exists.
 *
 * GitHub Actions / CI:
 *   .env normally does not exist.
 *   Environment variables are supplied directly by the CI system.
 *
 * Never require .env when the required environment variables
 * are already supplied by the operating system.
 */

if (!fs.existsSync(envFile)) {
  console.log("No .env file found.");
  console.log("Using existing environment variables.");
} else {
  const lines = fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed
      .slice(0, separator)
      .trim();

    let value = trimmed
      .slice(separator + 1)
      .trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!key) {
      continue;
    }

    /*
     * Never overwrite an environment variable supplied by
     * the operating system, CI/CD, or GitHub Actions.
     */
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  console.log(".env loaded.");
}
