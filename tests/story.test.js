import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEventStream } from "../src/validator.js";

const loadStory = async () =>
  JSON.parse(await readFile(new URL("../data/samples/2026-10-03-route-story.json", import.meta.url), "utf8")).events;

const byId = (events, id) => events.find((e) => e.event_id === id);
const byAggregate = (events, id) => events.filter((e) => e.aggregate_id === id);

test("整条故事线通过事件流校验", async () => {
  const events = await loadStory();
  assert.deepEqual(validateEventStream(events), []);
});

test("迟到闭店必须定位在途行程、触发改线并通知游客，且给出替代点位", async () => {
  const events = await loadStory();
  const closure = byId(events, "100326-004-VAC-004");
  assert.equal(closure.payload.late_notice, true);
  assert.ok(closure.payload.alternatives.length >= 1);

  const revision = byId(events, "100326-004-REV-005");
  assert.equal(revision.payload.trigger_event_id, closure.event_id);
  assert.deepEqual(revision.payload.removed_stops, ["venue-liuquanju"]);
  assert.equal(revision.payload.replacement_stops[0].venue_id, "venue-kaorouji");
  assert.match(revision.payload.visitor_facing_explanation, /烤肉季/);

  const notice = byId(events, "100326-004-NOT-006");
  assert.equal(notice.payload.related_event_id, revision.event_id);
  assert.deepEqual(notice.payload.affected_stop_ids, ["venue-liuquanju"]);
});

test("内容改版后，已完成打卡与发布版仍指向当时读到的内容版本", async () => {
  const events = await loadStory();
  const profileV4 = events.find(
    (e) => e.event_type === "VENUE_PROFILE_PUBLISHED" && e.aggregate_id === "venue-yaer-hutong" && e.payload.content_version === "v4",
  );
  assert.ok(profileV4, "鸦儿胡同内容已升级到 v4");

  const release = byId(events, "092826-004-REL-009");
  const releasedStop = release.payload.stops.find((s) => s.venue_id === "venue-yaer-hutong");
  assert.equal(releasedStop.content_version, "v3");

  const checkin = byAggregate(events, "ve-zhang-yaer-01").find((e) => e.event_type === "VISIT_EVIDENCE_RECORDED");
  assert.equal(checkin.payload.content_version, "v3");
  assert.match(checkin.payload.content_snapshot_ref, /\/v3\//);
});

test("受限场馆必须由场馆自行确认预约，平台不得代确认", async () => {
  const events = await loadStory();
  const confirmation = byId(events, "100326-004-BCONF-002");
  assert.equal(confirmation.payload.venue_id, "venue-guanghe-theater");
  assert.equal(confirmation.payload.confirmed_by_venue, true);
});

test("有争议的打卡凭证必须先暂缓分账，确认后才能按合同结算", async () => {
  const events = await loadStory();
  const evidenceEvents = byAggregate(events, "ve-zhang-kaorou-02");
  const dispute = evidenceEvents.find((e) => e.event_type === "SETTLEMENT_DISPUTED");
  const hold = evidenceEvents.find((e) => e.event_type === "SETTLEMENT_HELD");
  const settled = evidenceEvents.find((e) => e.event_type === "VISIT_SETTLED");

  assert.equal(dispute.payload.hold_settlement, true);
  assert.equal(hold.payload.hold_state, "HELD");
  assert.equal(hold.payload.dispute_event_id, dispute.event_id);
  assert.equal(settled.payload.settlement_state, "SETTLED");
  assert.equal(settled.payload.resolves_dispute_event_id, dispute.event_id);

  // 时间顺序：争议 → 暂缓 → 结算
  assert.ok(dispute.occurred_at < hold.occurred_at);
  assert.ok(hold.occurred_at < settled.occurred_at);
});

test("改线不得删除或改动已完成的打卡凭证", async () => {
  const events = await loadStory();
  const completed = byId(events, "100326-004-EV-003");
  const revision = byId(events, "100326-004-REV-005");
  assert.ok(!revision.payload.removed_stops.includes("venue-yaer-hutong"));
  assert.equal(completed.payload.venue_id, "venue-yaer-hutong");
  assert.equal(completed.payload.content_snapshot_ref, "snapshot://content/venue-yaer-hutong/v3/20260925");
});

test("点位只暴露完成编排所需的字段，不包含经营明细", async () => {
  const events = await loadStory();
  const profiles = events.filter((e) => e.event_type === "VENUE_PROFILE_PUBLISHED");
  const forbidden = ["revenue", "成本", "利润", "分账比例", "其他商户"];
  for (const profile of profiles) {
    const serialized = JSON.stringify(profile.payload);
    for (const word of forbidden) assert.ok(!serialized.includes(word), `${profile.payload.venue_name} 暴露了 ${word}`);
    assert.ok(profile.payload.exposed_fields.length >= 1);
  }
});
