const required = ["event_id", "event_type", "aggregate_type", "aggregate_id", "occurred_at", "version", "summary", "payload"];

const eventIdPattern = /^[0-9]{6}-[0-9]{3}-[A-Za-z][A-Za-z0-9_]*-[0-9]{3}$/;

// 事件类型与聚合的合法配对
const eventAggregatePairs = {
  VENUE_PROFILE_PUBLISHED: "partner_venue",
  VENUE_CALENDAR_PUBLISHED: "partner_venue",
  VENUE_AVAILABILITY_CHANGED: "partner_venue",
  ROUTE_RELEASED: "route_release",
  BOOKING_REQUESTED: "visitor_itinerary",
  BOOKING_CONFIRMED: "visitor_itinerary",
  BOOKING_DECLINED: "visitor_itinerary",
  ITINERARY_REVISED: "visitor_itinerary",
  VISITOR_NOTIFIED: "visitor_itinerary",
  VISIT_EVIDENCE_RECORDED: "visit_evidence",
  SETTLEMENT_DISPUTED: "visit_evidence",
  SETTLEMENT_HELD: "visit_evidence",
  VISIT_SETTLED: "visit_evidence",
};

// 每种事件载荷中必须出现的字段
const payloadRequired = {
  VENUE_PROFILE_PUBLISHED: ["venue_name", "venue_category", "content_version", "accessibility", "booking_policy", "exposed_fields"],
  VENUE_CALENDAR_PUBLISHED: ["effective_from", "effective_to", "open_slots", "daily_capacity", "closed_dates"],
  VENUE_AVAILABILITY_CHANGED: ["change_type", "effective_from", "late_notice", "alternatives"],
  ROUTE_RELEASED: ["route_theme", "route_date", "language", "duration_minutes", "release_status", "stops"],
  BOOKING_REQUESTED: ["route_release_id", "venue_id", "visitor_preferences"],
  BOOKING_CONFIRMED: ["route_release_id", "venue_id", "confirmation_ref", "confirmed_by_venue"],
  BOOKING_DECLINED: ["route_release_id", "venue_id", "reason"],
  ITINERARY_REVISED: ["route_release_id", "revision_no", "trigger_event_id", "removed_stops", "replacement_stops", "visitor_facing_explanation"],
  VISITOR_NOTIFIED: ["channel", "message_text", "related_event_id"],
  VISIT_EVIDENCE_RECORDED: ["visitor_itinerary_id", "venue_id", "visited_at", "content_version", "content_snapshot_ref", "proof_type", "proof_ref"],
  SETTLEMENT_DISPUTED: ["evidence_id", "disputed_by", "reason", "hold_settlement"],
  SETTLEMENT_HELD: ["evidence_id", "dispute_event_id", "hold_state"],
  VISIT_SETTLED: ["evidence_id", "contract_id", "settlement_state", "payable_amount", "currency"],
};

export function validateEvent(record) {
  const errors = required
    .filter((name) => !(name in record))
    .map((name) => `缺少字段：${name}`);
  if (errors.length > 0) return errors;

  if (!eventIdPattern.test(record.event_id)) {
    errors.push("event_id 必须符合 MMDDYY-序号-类别-当日序号 的编号规则");
  }
  if (!Number.isInteger(record.version) || record.version < 1) {
    errors.push("version 必须是正整数");
  }
  if (!(record.event_type in eventAggregatePairs)) {
    errors.push(`未知事件类型：${record.event_type}`);
    return errors;
  }
  const expectedAggregate = eventAggregatePairs[record.event_type];
  if (record.aggregate_type !== expectedAggregate) {
    errors.push(`${record.event_type} 必须归属聚合 ${expectedAggregate}，实际为 ${record.aggregate_type}`);
  }

  const payload = record.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    errors.push("payload 必须是对象");
    return errors;
  }
  for (const field of payloadRequired[record.event_type] ?? []) {
    if (!(field in payload)) errors.push(`${record.event_type} 载荷缺少字段：${field}`);
  }
  return errors;
}

// 跨事件校验：同一聚合版本单调、事件编号唯一。返回错误字符串数组。
export function validateEventStream(events) {
  const errors = [];
  const seenIds = new Set();
  const versionsByAggregate = new Map();

  for (const event of events) {
    const idErrors = validateEvent(event);
    if (idErrors.length > 0) errors.push(`${event.event_id ?? "未知事件"}：${idErrors.join("；")}`);

    if (seenIds.has(event.event_id)) errors.push(`事件编号重复：${event.event_id}`);
    seenIds.add(event.event_id);

    const seen = versionsByAggregate.get(event.aggregate_id) ?? [];
    if (seen.includes(event.version)) {
      errors.push(`聚合 ${event.aggregate_id} 的版本 ${event.version} 重复`);
    }
    seen.push(event.version);
    versionsByAggregate.set(event.aggregate_id, seen);
  }

  for (const [aggregateId, versions] of versionsByAggregate) {
    const sorted = [...versions].sort((a, b) => a - b);
    if (JSON.stringify(sorted) !== JSON.stringify(versions)) {
      errors.push(`聚合 ${aggregateId} 的版本未按顺序递增：${versions.join(" → ")}`);
    }
  }
  return errors;
}
