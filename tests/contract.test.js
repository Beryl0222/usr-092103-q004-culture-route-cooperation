import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent, validateEventStream } from "../src/validator.js";

test("样例符合领域约定", async () => {
  const sample = JSON.parse(await readFile(new URL("../data/sample.json", import.meta.url), "utf8"));
  assert.deepEqual(validateEvent(sample), []);
});

test("事件类型与聚合配对错误时能被识别", () => {
  const bad = {
    event_id: "100326-004-VAC-001",
    event_type: "ROUTE_RELEASED",
    aggregate_type: "partner_venue",
    aggregate_id: "x",
    occurred_at: "2026-10-03T10:00:00+08:00",
    version: 1,
    summary: "错误配对",
    payload: {},
  };
  const errors = validateEvent(bad);
  assert.ok(errors.some((e) => e.includes("必须归属聚合")));
});

test("同一聚合版本重复或乱序时事件流校验报错", () => {
  const make = (overrides) => ({
    event_id: overrides.event_id,
    event_type: "VISIT_SETTLED",
    aggregate_type: "visit_evidence",
    aggregate_id: overrides.aggregate_id,
    occurred_at: "2026-10-03T10:00:00+08:00",
    version: overrides.version,
    summary: "t",
    payload: {
      evidence_id: "e1",
      contract_id: "c1",
      settlement_state: "SETTLED",
      payable_amount: 1,
      currency: "CNY",
    },
  });
  const errors = validateEventStream([
    make({ event_id: "100326-004-SET-001", aggregate_id: "a", version: 2 }),
    make({ event_id: "100326-004-SET-002", aggregate_id: "a", version: 1 }),
  ]);
  assert.ok(errors.some((e) => e.includes("版本未按顺序递增")));
});
