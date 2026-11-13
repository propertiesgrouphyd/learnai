const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_ATTEMPTS = 3;

/* ============================================================
   CONTENT SCRIPT VALIDATION
============================================================ */

const ALLOWED_SCRIPT_TELUGU = /\p{Script=Telugu}/u;
const ALLOWED_SCRIPT_LATIN = /\p{Script=Latin}/u;
const ALLOWED_SCRIPT_COMMON = /\p{Script=Common}/u;
const ALLOWED_SCRIPT_INHERITED = /\p{Script=Inherited}/u;

function findUnsupportedScript(value, path = "content") {
  if (typeof value === "string") {
    for (const character of value) {
      if (
        !ALLOWED_SCRIPT_TELUGU.test(character) &&
        !ALLOWED_SCRIPT_LATIN.test(character) &&
        !ALLOWED_SCRIPT_COMMON.test(character) &&
        !ALLOWED_SCRIPT_INHERITED.test(character)
      ) {
        return {
          path,
          character,
          codePoint:
            `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
        };
      }
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const issue = findUnsupportedScript(
        value[index],
        `${path}[${index}]`
      );

      if (issue) return issue;
    }

    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const issue = findUnsupportedScript(
        child,
        `${path}.${key}`
      );

      if (issue) return issue;
    }
  }

  return null;
}

function validateContentLanguage(content, contentType) {
  const issue = findUnsupportedScript(content, contentType);

  if (!issue) return;

  const error = new Error(
    `Groq returned unsupported writing-system content at ${issue.path}: ${issue.character} (${issue.codePoint})`
  );

  error.isLanguageValidation = true;
  throw error;
}

/* ============================================================
   LITERAL NEWLINE-SEQUENCE VALIDATION
============================================================ */

function findLiteralBackslashN(value, path = "content") {
  if (typeof value === "string") {
    return value.includes("\\n") ? path : null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const issue = findLiteralBackslashN(
        value[index],
        `${path}[${index}]`
      );

      if (issue) return issue;
    }

    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const issue = findLiteralBackslashN(
        child,
        `${path}.${key}`
      );

      if (issue) return issue;
    }
  }

  return null;
}

function validateNoLiteralBackslashN(content, contentType) {
  const issue = findLiteralBackslashN(content, contentType);

  if (!issue) return;

  const error = new Error(
    `Groq returned a literal \\n sequence at ${issue}. Use normal sentence punctuation or a genuine line break instead.`
  );

  error.isFormattingValidation = true;
  throw error;
}

/* ============================================================
   LESSON SCHEMA
============================================================ */

const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    introduction: { type: "string" },
    sections: {
      type: "array",
      minItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          subheading: { type: "string" },
          paragraphs: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          example: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              content: { type: "string" }
            },
            required: ["title", "content"]
          }
        },
        required: [
          "heading",
          "subheading",
          "paragraphs",
          "example"
        ]
      }
    },
    practice: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        instruction: { type: "string" }
      },
      required: ["title", "instruction"]
    },
    keyTakeaways: {
      type: "array",
      minItems: 3,
      items: { type: "string" }
    }
  },
  required: [
    "title",
    "introduction",
    "sections",
    "practice",
    "keyTakeaways"
  ]
};

/* ============================================================
   MCQ SCHEMA
============================================================ */

const MCQ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mcqs: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" }
          },
          answer: {
            type: "integer",
            enum: [0, 1, 2, 3]
          },
          explanation: { type: "string" }
        },
        required: [
          "question",
          "options",
          "answer",
          "explanation"
        ]
      }
    }
  },
  required: ["mcqs"]
};

/* ============================================================
   LESSON RETRY PROMPT
============================================================ */

function buildLessonAttemptPrompt(prompt, attempt) {
  if (attempt === 1) return prompt;

  return `${prompt}

FINAL CORRECTION FOR THIS RETRY:

Use natural, standard Telugu for the lesson. English/Latin technical terms are allowed where appropriate. Do not use any other writing system.

The previous lesson generation did not pass automated validation.

Do not include the literal two-character sequence backslash+n (\\n) in any lesson text field. Use normal sentences instead. If a real newline is required in a JSON string, encode it once so JSON parsing produces an actual newline character.

Return exactly ONE JSON object.

Do NOT include:
- day
- courseDate
- publishAt
- mcqs
- aiUpdate

The application controls those fields separately.

The lesson MUST contain:
- title
- introduction
- sections
- practice
- keyTakeaways

REQUIRED LESSON STRUCTURE:
- sections MUST contain at least 4 sections.
- Every section MUST contain heading, subheading, paragraphs, and example.
- Every example MUST contain title and content.
- practice MUST contain title and instruction.
- keyTakeaways MUST contain at least 3 strings.

Do not add any properties that are not defined by the schema.
Do not return Markdown.
Return ONLY valid JSON.
`;
}

/* ============================================================
   MCQ RETRY PROMPT
============================================================ */

function buildMCQAttemptPrompt(prompt, attempt) {
  if (attempt === 1) return prompt;

  return `${prompt}

FINAL CORRECTION FOR THIS RETRY:

Use natural, standard Telugu for all MCQ text. English/Latin technical terms are allowed where appropriate. Do not use any other writing system.

The previous MCQ generation did not pass automated validation.

Do not include the literal two-character sequence backslash+n (\\n) in any question, option, or explanation. Use normal sentences instead.

Return exactly ONE JSON object containing mcqs.

MCQ REQUIREMENTS:
- mcqs MUST contain EXACTLY 5 questions.
- Every MCQ MUST contain exactly 4 options.
- Every MCQ MUST contain question, options, answer, and explanation.
- answer MUST be 0, 1, 2, or 3.
- Exactly one option must be correct.
- The explanation MUST match the correct answer.
- Questions must test understanding.
- Avoid ambiguous or duplicate questions.
- Distribute correct answers naturally.

Do NOT include:
- title
- introduction
- sections
- practice
- keyTakeaways
- day
- courseDate
- publishAt
- aiUpdate

Return ONLY valid JSON.
`;
}

/* ============================================================
   GROQ RATE-LIMIT RETRIES
============================================================ */

// If Groq supplies a reset duration, wait for that duration plus
// a small safety margin. Do not cap Groq's explicit duration.
// Without an explicit duration, use exponential backoff up to 60s.
const MAX_FALLBACK_RATE_LIMIT_WAIT_MS = 60000;
const RATE_LIMIT_SAFETY_MARGIN_MS = 500;
const INITIAL_RATE_LIMIT_WAIT_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRateLimitWaitMs(response, rawText, retryNumber) {
  const retryAfter = response.headers.get("retry-after");

  // Retry-After may be seconds or an HTTP date.
  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000) +
        RATE_LIMIT_SAFETY_MARGIN_MS;
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isFinite(retryDate)) {
      return Math.max(
        0,
        retryDate - Date.now()
      ) + RATE_LIMIT_SAFETY_MARGIN_MS;
    }
  }

  // Examples: "try again in 1.1775s" or "try again in 500ms".
  const retryMessage = rawText.match(
    /try again in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec(?:onds?)?|m|minutes?)?/i
  );

  if (retryMessage) {
    const amount = Number(retryMessage[1]);
    const unit = (retryMessage[2] || "s").toLowerCase();
    let waitMs;

    if (/^(ms|millisecond)/.test(unit)) {
      waitMs = amount;
    } else if (/^(m|min)/.test(unit)) {
      waitMs = amount * 60000;
    } else {
      waitMs = amount * 1000;
    }

    return Math.ceil(waitMs) + RATE_LIMIT_SAFETY_MARGIN_MS;
  }

  // No explicit reset time: use fallback exponential backoff.
  return Math.min(
    MAX_FALLBACK_RATE_LIMIT_WAIT_MS,
    INITIAL_RATE_LIMIT_WAIT_MS *
      (2 ** Math.min(retryNumber - 1, 10))
  );
}

/* ============================================================
   PERMANENT QUOTA CLASSIFICATION — CORRECTED
============================================================ */

function isPermanentQuotaLimit(rawText) {
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    // An unparseable 429 should not be labelled permanent
    // merely because its raw text contains a word like "billing".
    return false;
  }

  const apiError = parsed?.error || {};
  const code = String(apiError.code || "").toLowerCase();
  const type = String(apiError.type || "").toLowerCase();
  const message = String(apiError.message || "").toLowerCase();

  // Ordinary rate-limit errors are temporary. In particular,
  // Groq TPM/RPM errors commonly include a billing URL in the
  // message. A billing URL alone does NOT mean the account has
  // a permanent quota problem.
  if (
    code === "rate_limit_exceeded" ||
    type === "tokens" ||
    /tokens?\s+per\s+minute/.test(message) ||
    /requests?\s+per\s+minute/.test(message) ||
    /try again in\s+\d/.test(message)
  ) {
    return false;
  }

  // Stop only for explicit quota exhaustion or account restrictions.
  // Do not match the generic word "billing".
  return (
    code === "insufficient_quota" ||
    /tokens?\s+per\s+day/.test(message) ||
    /requests?\s+per\s+day/.test(message) ||
    /daily\s+(?:limit|quota)\s+(?:reached|exceeded|exhausted)/.test(message) ||
    /(?:daily|account)\s+quota\s+(?:reached|exceeded|exhausted)/.test(message) ||
    /quota exceeded/.test(message) ||
    /account suspended/.test(message) ||
    /billing limit reached/.test(message)
  );
}

/* ============================================================
   GENERIC GROQ REQUEST
============================================================ */

async function requestGroq(
  prompt,
  schema,
  schemaName,
  systemInstruction
) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const requestBody = JSON.stringify({
    model: MODEL,
    temperature: 0.2,
    reasoning_effort: "medium",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema
      }
    },
    messages: [
      {
        role: "system",
        content: systemInstruction
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  let rateLimitRetries = 0;
  let networkRetries = 0;

  while (true) {
    let response;
    let rawText;

    try {
      response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: requestBody
      });

      rawText = await response.text();
    } catch (error) {
      if (networkRetries >= 3) {
        throw new Error(
          `Groq network request failed after retries: ${error.message}`
        );
      }

      networkRetries++;

      const waitMs = Math.min(
        15000,
        2000 * (2 ** (networkRetries - 1))
      );

      console.warn(
        `⚠️ Groq network error. Waiting ${(waitMs / 1000).toFixed(1)}s before retry ${networkRetries}/3...`
      );

      await sleep(waitMs);
      continue;
    }

    if (response.status === 429) {
      if (isPermanentQuotaLimit(rawText)) {
        return {
          ok: response.ok,
          status: response.status,
          rawText
        };
      }

      // Retry the SAME request after the rate-limit reset.
      // Do not stop after an arbitrary number of temporary 429s.
      rateLimitRetries++;

      const waitMs = getRateLimitWaitMs(
        response,
        rawText,
        rateLimitRetries
      );

      console.warn(
        `⏳ Groq rate limit reached (429). Waiting ${(waitMs / 1000).toFixed(2)}s before retry ${rateLimitRetries}...`
      );

      await sleep(waitMs);
      continue;
    }

    return {
      ok: response.ok,
      status: response.status,
      rawText
    };
  }
}

/* ============================================================
   PARSE GROQ RESPONSE
============================================================ */

function parseGroqResponse(result) {
  let parsedError = null;

  try {
    parsedError = JSON.parse(result.rawText);
  } catch {
    // Keep raw response below.
  }

  if (!result.ok) {
    const errorMessage =
      parsedError?.error?.message || result.rawText;

    const error = new Error(
      `Groq API error ${result.status}: ${result.rawText}`
    );

    error.isSchemaValidation =
      result.status === 400 &&
      (
        parsedError?.error?.code === "json_validate_failed" ||
        errorMessage.toLowerCase().includes("schema")
      );

    throw error;
  }

  let apiResponse;

  try {
    apiResponse = JSON.parse(result.rawText);
  } catch {
    throw new Error("Groq returned an invalid API response.");
  }

  const message = apiResponse?.choices?.[0]?.message;

  if (!message) {
    throw new Error("Groq response did not contain a message.");
  }

  if (
    typeof message.content !== "string" ||
    !message.content.trim()
  ) {
    throw new Error("Groq response did not contain JSON content.");
  }

  return message.content.trim();
}

/* ============================================================
   LESSON GENERATION
============================================================ */

export async function generateLessonWithGroq(prompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `🤖 Groq lesson generation attempt ${attempt}/${MAX_ATTEMPTS}`
    );

    const attemptPrompt = buildLessonAttemptPrompt(prompt, attempt);

    try {
      const result = await requestGroq(
        attemptPrompt,
        LESSON_SCHEMA,
        "vidhwaan_aividhya_lesson",
        "You are VIDHWAAN AIVidhya's professional Telugu educational lesson generator. Generate natural, standard Telugu. English/Latin technical terms are allowed where appropriate; do not use any other writing system. Follow the JSON schema exactly. Never add extra fields. Never omit required fields. Do not generate MCQs, aiUpdate, day, courseDate, or publishAt."
      );

      const content = parseGroqResponse(result);
      const parsedContent = JSON.parse(content);

      validateContentLanguage(parsedContent, "lesson");
      validateNoLiteralBackslashN(parsedContent, "lesson");

      console.log("✅ Groq lesson generation succeeded.");
      return content;
    } catch (error) {
      lastError = error;

      if (
        (
          error?.isSchemaValidation ||
          error?.isLanguageValidation ||
          error?.isFormattingValidation
        ) &&
        attempt < MAX_ATTEMPTS
      ) {
        console.log("⚠️ Lesson validation failed. Retrying...");
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Groq lesson generation failed after ${MAX_ATTEMPTS} attempts.\n${
      lastError?.message || ""
    }`
  );
}

/* ============================================================
   MCQ GENERATION
============================================================ */

export async function generateMCQsWithGroq(prompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `🤖 Groq MCQ generation attempt ${attempt}/${MAX_ATTEMPTS}`
    );

    const attemptPrompt = buildMCQAttemptPrompt(prompt, attempt);

    try {
      const result = await requestGroq(
        attemptPrompt,
        MCQ_SCHEMA,
        "vidhwaan_aividhya_mcqs",
        "You are VIDHWAAN AIVidhya's professional Telugu examination-question generator. Generate exactly five high-quality MCQs in natural, standard Telugu based only on the supplied lesson. English/Latin technical terms are allowed where appropriate; do not use any other writing system. Follow the JSON schema exactly. Every MCQ must have exactly four options and exactly one correct answer. Never add extra fields."
      );

      const content = parseGroqResponse(result);
      const parsedContent = JSON.parse(content);

      validateContentLanguage(parsedContent, "mcqs");
      validateNoLiteralBackslashN(parsedContent, "mcqs");

      console.log("✅ Groq MCQ generation succeeded.");
      return content;
    } catch (error) {
      lastError = error;

      if (
        (
          error?.isSchemaValidation ||
          error?.isLanguageValidation ||
          error?.isFormattingValidation
        ) &&
        attempt < MAX_ATTEMPTS
      ) {
        console.log("⚠️ MCQ validation failed. Retrying...");
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Groq MCQ generation failed after ${MAX_ATTEMPTS} attempts.\n${
      lastError?.message || ""
    }`
  );
}

/* ============================================================
   BACKWARD-COMPATIBILITY EXPORT
============================================================ */

/*
 * This export is intentionally retained temporarily so that
 * any external code importing generateWithGroq does not fail
 * immediately.
 *
 * New generation flow should use:
 * generateLessonWithGroq()
 * generateMCQsWithGroq()
 */

export async function generateWithGroq(prompt) {
  return generateLessonWithGroq(prompt);
}
