import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync(new URL("machine.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const machineValidator = ajv.compile(schema);
const quantityValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/quantity` });
const pointer = (key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

function diagnosticsFor(errors, quantity = false) {
  return (errors ?? []).map((error) => {
    let path = error.instancePath;
    let code = "SCHEMA_VALIDATION";
    if (error.keyword === "required") { path += `/${pointer(error.params.missingProperty)}`; code = "MISSING_FIELD"; }
    if (error.keyword === "additionalProperties") { path += `/${pointer(error.params.additionalProperty)}`; code = "UNKNOWN_FIELD"; }
    if (error.keyword === "minLength" && path.endsWith("/locator")) code = "INVALID_LOCATOR";
    if (quantity && ["type", "pattern"].includes(error.keyword) && /^\/sourceIds(?:\/|$)/.test(path)) code = "INVALID_SOURCE_IDS";
    if (quantity && ["type", "minimum"].includes(error.keyword) && /^\/(uncertainty|manufacturingTolerance|proposedTolerance|numericAcceptance)$/.test(path)) code = "INVALID_TOLERANCE";
    return { code, severity: "error", path, sourceIds: [], message: error.message };
  });
}

export function validateMachineShape(value) {
  return machineValidator(value) ? [] : diagnosticsFor(machineValidator.errors);
}

export function validateQuantityShape(value) {
  return quantityValidator(value) ? [] : diagnosticsFor(quantityValidator.errors, true);
}
