import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "..");

const schemaPath = path.resolve(
  projectRoot,
  "contracts/operational-finding.schema.json"
);

const defaultFindingPath = path.resolve(
  projectRoot,
  "contracts/examples/platform-pilot-valid.json"
);

const findingPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : defaultFindingPath;

function readJson(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  return JSON.parse(contents);
}

try {
  const schema = readJson(schemaPath);
  const finding = readJson(findingPath);

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true
  });

  addFormats(ajv);

  const validateFinding = ajv.compile(schema);
  const isValid = validateFinding(finding);

  if (!isValid) {
  console.error("Operational finding is invalid:");

  for (const error of validateFinding.errors ?? []) {
    const location = error.instancePath || "/";

    const message =
      error.keyword === "additionalProperties"
        ? `${error.message}: ${error.params.additionalProperty}`
        : error.message;

    console.error(`- ${location}: ${message}`);
  }

  process.exit(1);
}

const displayedPath = path.relative(projectRoot, findingPath);

console.log(`Operational finding is valid: ${displayedPath}`);
} catch (error) {
  console.error("Validation could not be completed:");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}