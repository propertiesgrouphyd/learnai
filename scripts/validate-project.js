import fs from "node:fs";

const ROOT = process.cwd();
const SYLLABUS_FILE = `${ROOT}/syllabus.json`;
const CONFIG_FILE = `${ROOT}/config/app-config.json`;

function fail(message) {
  console.error(`\n❌ VALIDATION FAILED`);
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(SYLLABUS_FILE)) {
  fail("syllabus.json not found.");
}

if (!fs.existsSync(CONFIG_FILE)) {
  fail("config/app-config.json not found.");
}

let syllabus;
let config;

try {
  syllabus = JSON.parse(fs.readFileSync(SYLLABUS_FILE, "utf8"));
} catch (error) {
  fail(`syllabus.json contains invalid JSON: ${error.message}`);
}

try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
} catch (error) {
  fail(`app-config.json contains invalid JSON: ${error.message}`);
}

const days = Array.isArray(syllabus)
  ? syllabus
  : syllabus?.days;

if (!Array.isArray(days)) {
  fail(
    'syllabus.json must contain a "days" array or itself be an array.'
  );
}

if (days.length !== 365) {
  fail(
    `Expected exactly 365 days, but found ${days.length}.`
  );
}

if (config.totalDays !== 365) {
  fail(
    `app-config.json totalDays must be 365. Found ${config.totalDays}.`
  );
}

const requiredFields = [
  "day",
  "title",
  "syllabus"
];

const seenDays = new Set();

for (let index = 0; index < days.length; index++) {
  const item = days[index];

  if (!item || typeof item !== "object") {
    fail(`Entry ${index + 1} is not a valid object.`);
  }

  for (const field of requiredFields) {
    if (
      item[field] === undefined ||
      item[field] === null ||
      String(item[field]).trim() === ""
    ) {
      fail(
        `Day entry ${index + 1} is missing required field: ${field}`
      );
    }
  }

  const expectedDay = index + 1;

  if (Number(item.day) !== expectedDay) {
    fail(
      `Day sequence error. Expected Day ${expectedDay}, found Day ${item.day}.`
    );
  }

  if (seenDays.has(Number(item.day))) {
    fail(`Duplicate Day ${item.day}.`);
  }

  seenDays.add(Number(item.day));
}

if (seenDays.size !== 365) {
  fail(`Expected 365 unique days, found ${seenDays.size}.`);
}

console.log("");
console.log("==============================================");
console.log(" VIDHWAAN AIVidhya — SYLLABUS VALIDATION");
console.log("==============================================");
console.log(`Syllabus file : ${SYLLABUS_FILE}`);
console.log(`Total days    : ${days.length}`);
console.log(`First day     : Day ${days[0].day}`);
console.log(`First title   : ${days[0].title}`);
console.log(`Last day      : Day ${days[364].day}`);
console.log(`Last title    : ${days[364].title}`);
console.log("Sequence      : Day 1 → Day 365");
console.log("Duplicates    : None");
console.log("JSON          : Valid");
console.log("STATUS        : ✅ PASSED");
console.log("==============================================");
console.log("");
