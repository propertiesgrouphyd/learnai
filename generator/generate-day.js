import "../scripts/load-env.js";
import fs from "node:fs";
import path from "node:path";

import { buildPrompt } from "./prompt.js";
import {
  generateLessonWithGroq,
  generateMCQsWithGroq
} from "./groq.js";
import { validateDayContent } from "./validate-day.js";


const ROOT = process.cwd();

const SYLLABUS_FILE =
  path.join(
    ROOT,
    "syllabus.json"
  );

const CONFIG_FILE =
  path.join(
    ROOT,
    "config",
    "app-config.json"
  );

const DATA_DIR =
  path.join(
    ROOT,
    "data"
  );


/* ============================================================
   ERROR HANDLING
============================================================ */

function fail(message) {
  console.error("");
  console.error("==============================================");
  console.error(" VIDHWAAN AIVidhya — GENERATION FAILED");
  console.error("==============================================");
  console.error(message);
  console.error("==============================================");
  console.error("");
  process.exit(1);
}


/* ============================================================
   JSON READER
============================================================ */

function readJson(file) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    fail(
      `Invalid JSON file:\n${file}\n${error.message}`
    );
  }
}


/* ============================================================
   SYLLABUS
============================================================ */

function getDays(syllabusRoot) {
  if (Array.isArray(syllabusRoot)) {
    return syllabusRoot;
  }

  if (Array.isArray(syllabusRoot?.days)) {
    return syllabusRoot.days;
  }

  fail(
    "syllabus.json does not contain a valid days array."
  );
}


/* ============================================================
   FIND LAST GENERATED DAY
============================================================ */

function findLastGeneratedDay() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );

    return 0;
  }

  const files =
    fs
      .readdirSync(DATA_DIR)
      .filter(
        (file) =>
          /^day-\d{3}\.json$/.test(file)
      );

  let highest = 0;

  for (const file of files) {
    const match =
      file.match(
        /^day-(\d{3})\.json$/
      );

    if (!match) {
      continue;
    }

    const day =
      Number(match[1]);

    if (day > highest) {
      highest = day;
    }
  }

  return highest;
}


/* ============================================================
   COURSE DATE
============================================================ */

function calculateCourseDate(
  startDate,
  dayNumber
) {
  const [year, month, day] =
    startDate
      .split("-")
      .map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    fail(
      `Invalid courseStartDate: ${startDate}`
    );
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
      dayNumber -
      1
  );

  const resultYear =
    date
      .getUTCFullYear()
      .toString()
      .padStart(4, "0");

  const resultMonth =
    String(
      date.getUTCMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const resultDay =
    String(
      date.getUTCDate()
    ).padStart(
      2,
      "0"
    );

  return `${resultYear}-${resultMonth}-${resultDay}`;
}


/* ============================================================
   PUBLISH TIME
============================================================ */

function createPublishAt(
  courseDate,
  publishTime
) {
  return `${courseDate}T${publishTime}:00+05:30`;
}


/* ============================================================
   EXTRACT JSON
============================================================ */

function extractJson(text) {
  let cleaned =
    text.trim();

  /*
   * Some models may still return JSON
   * inside markdown fences despite instructions.
   * Remove ONLY those fences.
   */

  if (
    cleaned.startsWith("```")
  ) {
    cleaned =
      cleaned
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();
  }

  try {
    return JSON.parse(
      cleaned
    );
  } catch (error) {
    throw new Error(
      `Groq did not return valid JSON.\n${error.message}\n\nRAW RESPONSE:\n${text}`
    );
  }
}


/* ============================================================
   BUILD MCQ PROMPT
============================================================ */

function buildMCQPrompt(
  generatedLesson
) {
  return `
You are generating the final examination questions for
VIDHWAAN AIVidhya.

Create EXACTLY 5 high-quality MCQs based ONLY on the lesson
provided below.

LANGUAGE:

- Write questions in natural, simple Telugu.
- Use English technical terms in parentheses where useful.
- Keep explanations in natural Telugu.

MCQ REQUIREMENTS:

- Create EXACTLY 5 MCQs.
- Every MCQ MUST have exactly 4 options.
- Exactly one option must be correct.
- The answer field MUST be the zero-based option index:
  0, 1, 2, or 3.
- Every MCQ MUST contain:
  - question
  - options
  - answer
  - explanation
- Every option must be non-empty.
- Every explanation must be non-empty.
- Questions must test understanding, not just memorization.
- Use a mixture of conceptual and practical questions.
- Do not make all correct answers the same option.
- Distribute correct answers naturally.
- Do not reveal the answer inside the question.
- Do not create ambiguous questions.
- Do not create two options that could both reasonably be correct.
- Do not create duplicate questions.
- Questions must be directly related to the supplied lesson.
- Do not introduce concepts that were not taught in the lesson.

IMPORTANT:

Return ONLY this JSON structure:

{
  "mcqs": [
    {
      "question": "Telugu question",
      "options": [
        "Telugu option A",
        "Telugu option B",
        "Telugu option C",
        "Telugu option D"
      ],
      "answer": 0,
      "explanation": "Short Telugu explanation"
    }
  ]
}

Return exactly 5 MCQs.

Return ONLY valid JSON.

LESSON:

${JSON.stringify(
  generatedLesson,
  null,
  2
)}
`;
}


/* ============================================================
   MAIN
============================================================ */

async function main() {
  const syllabusRoot =
    readJson(
      SYLLABUS_FILE
    );

  const config =
    readJson(
      CONFIG_FILE
    );

  const days =
    getDays(
      syllabusRoot
    );

  const totalDays =
    Number(
      config.totalDays
    );

  if (
    days.length !==
    totalDays
  ) {
    fail(
      `Syllabus contains ${days.length} days but config requires ${totalDays}.`
    );
  }

  const lastGeneratedDay =
    findLastGeneratedDay();

  const nextDay =
    lastGeneratedDay + 1;

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " VIDHWAAN AIVidhya — DAILY AI GENERATOR"
  );
  console.log(
    "=============================================="
  );

  console.log(
    `Last generated day : ${lastGeneratedDay}`
  );

  console.log(
    `Next day           : ${nextDay}`
  );

  console.log(
    `Course total       : ${totalDays}`
  );

  console.log(
    "=============================================="
  );


  /* ==========================================================
     COURSE COMPLETE
  ========================================================== */

  if (
    nextDay >
    totalDays
  ) {
    console.log("");

    console.log(
      "🎓 All 365 lessons are already generated."
    );

    console.log(
      "Nothing to generate."
    );

    console.log("");

    return;
  }


  /* ==========================================================
     OUTPUT FILE
  ========================================================== */

  const outputFile =
    path.join(
      DATA_DIR,
      `day-${String(nextDay).padStart(3, "0")}.json`
    );


  /*
   * Absolute safety:
   * never overwrite an existing lesson.
   */

  if (
    fs.existsSync(
      outputFile
    )
  ) {
    fail(
      `Safety stop: ${path.basename(outputFile)} already exists.`
    );
  }


  /* ==========================================================
     SELECT SYLLABUS
  ========================================================== */

  const daySyllabus =
    days.find(
      (item) =>
        Number(item.day) ===
        nextDay
    );

  if (!daySyllabus) {
    fail(
      `Day ${nextDay} was not found in syllabus.json.`
    );
  }


  /* ==========================================================
     COURSE METADATA
  ========================================================== */

  const courseDate =
    calculateCourseDate(
      config.courseStartDate,
      nextDay
    );

  const publishAt =
    createPublishAt(
      courseDate,
      config.publishTime
    );


  console.log("");

  console.log(
    `📚 Selected syllabus: Day ${nextDay}`
  );

  console.log(
    `📖 Title: ${daySyllabus.title}`
  );

  console.log(
    `📅 Course date: ${courseDate}`
  );

  console.log(
    `⏰ Publish: ${publishAt}`
  );

  console.log("");


  /* ==========================================================
     STAGE 1 — LESSON GENERATION
  ========================================================== */

  console.log(
    "=============================================="
  );

  console.log(
    "📚 STAGE 1 — GENERATING LESSON"
  );

  console.log(
    "=============================================="
  );

  console.log(
    "Sending ONLY this day's syllabus to Groq..."
  );

  console.log("");


  const lessonPrompt =
    buildPrompt(
      daySyllabus
    );

  let rawLessonResponse;

  try {
    rawLessonResponse =
      await generateLessonWithGroq(
        lessonPrompt
      );
  } catch (error) {
    fail(
      `Groq lesson generation failed:\n${error.message}`
    );
  }


  let generatedLesson;

  try {
    generatedLesson =
      extractJson(
        rawLessonResponse
      );
  } catch (error) {
    fail(
      `Lesson JSON parsing failed:\n${error.message}`
    );
  }


  /* ==========================================================
     BASIC LESSON SAFETY CHECK
  ========================================================== */

  if (
    !generatedLesson ||
    typeof generatedLesson !==
      "object" ||
    Array.isArray(
      generatedLesson
    )
  ) {
    fail(
      "Groq lesson response was not a valid JSON object."
    );
  }

  console.log("");

  console.log(
    "✅ Lesson generation completed."
  );

  console.log(
    `Sections generated: ${
      Array.isArray(
        generatedLesson.sections
      )
        ? generatedLesson.sections.length
        : 0
    }`
  );

  console.log("");


  /* ==========================================================
     STAGE 2 — MCQ GENERATION
  ========================================================== */

  console.log(
    "=============================================="
  );

  console.log(
    "📝 STAGE 2 — GENERATING 5 MCQs"
  );

  console.log(
    "=============================================="
  );

  console.log(
    "Sending the completed lesson to Groq..."
  );

  console.log("");


  const mcqPrompt =
    buildMCQPrompt(
      generatedLesson
    );

  let rawMCQResponse;

  try {
    rawMCQResponse =
      await generateMCQsWithGroq(
        mcqPrompt
      );
  } catch (error) {
    fail(
      `Groq MCQ generation failed:\n${error.message}`
    );
  }


  let generatedMCQs;

  try {
    generatedMCQs =
      extractJson(
        rawMCQResponse
      );
  } catch (error) {
    fail(
      `MCQ JSON parsing failed:\n${error.message}`
    );
  }


  /* ==========================================================
     MCQ SAFETY CHECK
  ========================================================== */

  if (
    !generatedMCQs ||
    typeof generatedMCQs !==
      "object" ||
    Array.isArray(
      generatedMCQs
    )
  ) {
    fail(
      "Groq MCQ response was not a valid JSON object."
    );
  }

  if (
    !Array.isArray(
      generatedMCQs.mcqs
    )
  ) {
    fail(
      "Groq MCQ response does not contain an mcqs array."
    );
  }

  if (
    generatedMCQs.mcqs.length !==
    5
  ) {
    fail(
      `Groq returned ${generatedMCQs.mcqs.length} MCQs instead of exactly 5.`
    );
  }

  for (
    let i = 0;
    i <
    generatedMCQs.mcqs.length;
    i++
  ) {
    const mcq =
      generatedMCQs.mcqs[i];

    if (
      !mcq ||
      typeof mcq !==
        "object"
    ) {
      fail(
        `MCQ ${i + 1} is invalid.`
      );
    }

    if (
      !Array.isArray(
        mcq.options
      ) ||
      mcq.options.length !==
        4
    ) {
      fail(
        `MCQ ${i + 1} does not contain exactly 4 options.`
      );
    }

    if (
      !Number.isInteger(
        mcq.answer
      ) ||
      mcq.answer < 0 ||
      mcq.answer > 3
    ) {
      fail(
        `MCQ ${i + 1} has an invalid answer index.`
      );
    }
  }

  console.log(
    "✅ Exactly 5 MCQs generated."
  );

  console.log("");


  /* ==========================================================
     BUILD FINAL LESSON OBJECT
  ========================================================== */

  /*
   * The AI generates educational content.
   *
   * The application controls:
   * - day
   * - courseDate
   * - publishAt
   * - mcqs
   * - aiUpdate
   */

  const generated = {
    day: nextDay,

    courseDate,

    publishAt,

    title:
      generatedLesson.title,

    introduction:
      generatedLesson.introduction,

    sections:
      generatedLesson.sections,

    practice:
      generatedLesson.practice,

    keyTakeaways:
      generatedLesson.keyTakeaways,

    mcqs:
      generatedMCQs.mcqs,

    aiUpdate: {
      enabled: false,
      title: "AI Update",
      items: []
    }
  };


  /* ==========================================================
     FINAL VALIDATION
  ========================================================== */

  console.log(
    "=============================================="
  );

  console.log(
    "🔍 FINAL VALIDATION"
  );

  console.log(
    "=============================================="
  );

  try {
    validateDayContent(
      generated,
      nextDay
    );
  } catch (error) {
    fail(
      error.message
    );
  }


  /* ==========================================================
     WRITE FINAL JSON
  ========================================================== */

  /*
   * Pretty JSON for long-term readability.
   */

  fs.writeFileSync(
    outputFile,

    `${JSON.stringify(
      generated,
      null,
      2
    )}\n`,

    "utf8"
  );


  /* ==========================================================
     SUCCESS
  ========================================================== */

  console.log("");

  console.log(
    "=============================================="
  );

  console.log(
    " ✅ DAILY LESSON GENERATED"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Day       : ${nextDay}`
  );

  console.log(
    `Date      : ${courseDate}`
  );

  console.log(
    `Output    : ${path.relative(
      ROOT,
      outputFile
    )}`
  );

  console.log(
    `Sections  : ${generated.sections.length}`
  );

  console.log(
    `MCQs      : ${generated.mcqs.length}`
  );

  console.log(
    "AI Update : disabled"
  );

  console.log(
    "Validation: PASSED"
  );

  console.log(
    "=============================================="
  );

  console.log("");
}


/* ============================================================
   START
============================================================ */

main().catch(
  (error) => {
    fail(
      error?.stack ||
      error?.message ||
      String(error)
    );
  }
);
