import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

/* ============================================================
   VIDHWAAN AIVidhya
   PRODUCTION LESSON DATA PROTECTION
   ============================================================ */

const ROOT = process.cwd();

const SOURCE_DIR = path.join(
  ROOT,
  "data"
);

const OUTPUT_DIR = path.join(
  ROOT,
  "dist",
  "data"
);

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;


/* ============================================================
   ERROR
   ============================================================ */

function fail(message) {
  console.error("");
  console.error("==============================================");
  console.error(" VIDHWAAN AIVidhya — DATA PROTECTION FAILED");
  console.error("==============================================");
  console.error(message);
  console.error("==============================================");
  console.error("");

  process.exit(1);
}


/* ============================================================
   ENCRYPTION KEY
   ============================================================ */

function getEncryptionKey() {
  const value =
    process.env.AIVIDHYA_DATA_KEY;

  if (!value) {
    fail(
      "AIVIDHYA_DATA_KEY environment variable is not set."
    );
  }

  let key;

  try {
    key = Buffer.from(
      value,
      "base64"
    );
  } catch {
    fail(
      "AIVIDHYA_DATA_KEY is not valid Base64."
    );
  }

  if (key.length !== 32) {
    fail(
      "AIVIDHYA_DATA_KEY must decode to exactly 32 bytes (256 bits)."
    );
  }

  return key;
}


/* ============================================================
   PROTECT ONE JSON FILE
   ============================================================ */

function protectFile(
  sourceFile,
  outputFile,
  key
) {
  let jsonText;

  try {
    jsonText =
      fs.readFileSync(
        sourceFile,
        "utf8"
      );
  } catch (error) {
    throw new Error(
      `Unable to read ${sourceFile}: ${error.message}`
    );
  }


  /* ----------------------------------------------------------
     Confirm source is valid JSON
     ---------------------------------------------------------- */

  try {
    JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path.basename(sourceFile)}: ${error.message}`
    );
  }


  /* ----------------------------------------------------------
     UTF-8
     ---------------------------------------------------------- */

  const input =
    Buffer.from(
      jsonText,
      "utf8"
    );


  /* ----------------------------------------------------------
     GZIP
     ---------------------------------------------------------- */

  const compressed =
    zlib.gzipSync(
      input,
      {
        level: 9
      }
    );


  /* ----------------------------------------------------------
     AES-256-GCM
     ---------------------------------------------------------- */

  const iv =
    crypto.randomBytes(
      IV_LENGTH
    );

  const cipher =
    crypto.createCipheriv(
      ALGORITHM,
      key,
      iv,
      {
        authTagLength:
          AUTH_TAG_LENGTH
      }
    );

  const encrypted =
    Buffer.concat([
      cipher.update(compressed),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();


  /* ----------------------------------------------------------
     FILE FORMAT
     
     Binary layout:

     [12-byte IV]
     [16-byte authentication tag]
     [encrypted payload]
     ---------------------------------------------------------- */

  const output =
    Buffer.concat([
      iv,
      authTag,
      encrypted
    ]);


  fs.writeFileSync(
    outputFile,
    output
  );


  return {
    sourceBytes:
      input.length,

    compressedBytes:
      compressed.length,

    protectedBytes:
      output.length
  };
}


/* ============================================================
   MAIN
   ============================================================ */

function main() {
  console.log("");
  console.log("==============================================");
  console.log(" VIDHWAAN AIVidhya — DATA PROTECTION");
  console.log("==============================================");
  console.log("");


  /* ----------------------------------------------------------
     Get encryption key
     ---------------------------------------------------------- */

  const key =
    getEncryptionKey();


  /* ----------------------------------------------------------
     Source directory
     ---------------------------------------------------------- */

  if (!fs.existsSync(SOURCE_DIR)) {
    fail(
      `Source data directory does not exist:\n${SOURCE_DIR}`
    );
  }


  /* ----------------------------------------------------------
     Prepare output directory
     ---------------------------------------------------------- */

  fs.rmSync(
    OUTPUT_DIR,
    {
      recursive: true,
      force: true
    }
  );

  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true
    }
  );


  /* ----------------------------------------------------------
     Find lesson JSON files
     ---------------------------------------------------------- */

  const files =
    fs
      .readdirSync(
        SOURCE_DIR
      )
      .filter(
        file =>
          /^day-\d{3}\.json$/.test(
            file
          )
      )
      .sort();


  if (files.length === 0) {
    fail(
      "No day-XXX.json lesson files were found in data/."
    );
  }


  console.log(
    `Source lessons: ${files.length}`
  );

  console.log("");


  /* ----------------------------------------------------------
     Protect every lesson
     ---------------------------------------------------------- */

  let totalSourceBytes = 0;
  let totalProtectedBytes = 0;

  for (
    const file of files
  ) {
    const sourceFile =
      path.join(
        SOURCE_DIR,
        file
      );

    const outputFile =
      path.join(
        OUTPUT_DIR,
        file.replace(
          /\.json$/i,
          ".dat"
        )
      );

    const result =
      protectFile(
        sourceFile,
        outputFile,
        key
      );

    totalSourceBytes +=
      result.sourceBytes;

    totalProtectedBytes +=
      result.protectedBytes;

    console.log(
      `✓ ${file} → ${path.basename(outputFile)}`
    );

    console.log(
      `  source: ${result.sourceBytes} bytes`
    );

    console.log(
      `  gzip+encrypted: ${result.protectedBytes} bytes`
    );

    console.log("");
  }


  /* ----------------------------------------------------------
     Security verification
     ---------------------------------------------------------- */

  const outputFiles =
    fs
      .readdirSync(
        OUTPUT_DIR
      )
      .filter(
        file =>
          /^day-\d{3}\.dat$/.test(
            file
          )
      );


  if (
    outputFiles.length !==
    files.length
  ) {
    fail(
      `Protection count mismatch. Source: ${files.length}, protected: ${outputFiles.length}.`
    );
  }


  const leakedJsonFiles =
    fs
      .readdirSync(
        OUTPUT_DIR
      )
      .filter(
        file =>
          /\.json$/i.test(
            file
          )
      );


  if (
    leakedJsonFiles.length > 0
  ) {
    fail(
      `Security failure: JSON files were found inside dist/data:\n${leakedJsonFiles.join("\n")}`
    );
  }


  /* ----------------------------------------------------------
     Summary
     ---------------------------------------------------------- */

  const compressionRatio =
    totalSourceBytes > 0
      ? (
          totalProtectedBytes /
          totalSourceBytes
        ) *
        100
      : 0;


  console.log("==============================================");
  console.log(" DATA PROTECTION COMPLETE");
  console.log("==============================================");

  console.log(
    `Lessons protected : ${outputFiles.length}`
  );

  console.log(
    `Source size       : ${totalSourceBytes} bytes`
  );

  console.log(
    `Protected size    : ${totalProtectedBytes} bytes`
  );

  console.log(
    `Output directory  : dist/data`
  );

  console.log(
    `JSON files in CDN : 0`
  );

  console.log(
    `Output format     : .dat`
  );

  console.log(
    `Encryption        : AES-256-GCM`
  );

  console.log(
    `Compression       : GZIP`
  );

  console.log(
    `Protected/source  : ${compressionRatio.toFixed(2)}%`
  );

  console.log(
    "=============================================="
  );

  console.log("");
}


main();
