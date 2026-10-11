import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

test("faithful-mode-routes-before-creative-rules", () => {
  const skill = read("SKILL.md");
  const router = skill.indexOf("## Choose the mode first");
  assert.ok(router >= 0, "Missing explicit early mode router");
  assert.ok(router < skill.indexOf("This skill makes figures"), "Mode choice must precede the creative instructions");
  const branch = skill.slice(router, skill.indexOf("This skill makes figures"));
  assert.match(branch, /creative/i);
  assert.match(branch, /faithful/i);
  assert.match(branch, /references\/fidelity\.md/);
  assert.match(branch, /invention, ornament density and minimum-part rules/);
  assert.match(branch, /opt-in/);
});

test("faithful-workflow-keeps-evidence-gaps-and-deferred-work-explicit", () => {
  assert.ok(existsSync(new URL("references/fidelity.md", ROOT)), "Missing faithful workflow reference");
  const reference = read("references/fidelity.md");
  assert.match(reference, /E0 cannot support F1 dimensions/);
  assert.match(reference, /manufacturer, model, manual, CAD or measured real-machine evidence/);
  assert.match(reference, /not-evaluated/);
  assert.match(reference, /no domain recipe is implemented/i);
  for (const capability of ["offline high-quality rendering", "native STEP/CAD conversion", "DEM/FEA", "generic constraint solvers", "calibrated discharge", "WebGPU"]) {
    assert.ok(reference.includes(capability), `Deferred capability must be named: ${capability}`);
  }
  assert.match(read("README.md"), /npm --prefix fidelity ci/);
  assert.match(read("README.md"), /node --test tests\/upstream\/legacy\.test\.mjs/);
});

test("normalized-spec-preserves-conventions-without-private-project-references", () => {
  assert.ok(existsSync(new URL("docs/specs/machine-fidelity.md", ROOT)), "Missing normalized machine fidelity specification");
  const specification = read("docs/specs/machine-fidelity.md");
  assert.match(specification, /dbf697a527bbf7d358668e1557cb1e35ff725d46/);
  assert.match(specification, /T_WC = T_WP × T_PJ × M\(q\) × (inverse|inversa)\(T_CJ\)/);
  assert.match(specification, /metersPerLegacyUnit/);
  assert.match(specification, /1\.8716814692820414/);
  assert.match(specification, /"schemaVersion": "0\.1\.0"/);
  assert.doesNotMatch(specification, /fluxo[-_ ]vivo|gbbragadev|Library|sediment:|file-service:|chatgpt\.com\/c\/|\/workspace\/|tilápia|classificador espiral|\[D1\]/i);
});
