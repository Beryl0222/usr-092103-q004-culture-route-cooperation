# 文化探访线路联营

本仓库保存文化探访线路联营的领域词汇、交换事件与中文联调样例，供后续服务在统一身份和版本语义下协作。

## 资料结构

- `contracts/domain.schema.json`：领域事件的公共信封、事件-聚合配对与按事件类型的载荷约定。
- `data/sample.json`：一条最小业务事件样例（迟到闭店通知）。
- `data/samples/2026-10-03-route-story.json`：一条完整联调故事线（点位维护 → 线路发布 → 场馆确认 → 在途闭店改线 → 打卡 → 争议暂缓 → 按合同结算）。
- `src/validator.js`：公共字段、编号规则、事件配对与事件流版本顺序校验。
- `tests/`：验证样例与领域不变量。

## 聚合与事件

四个聚合：`route_release`（按日期冻结的主题线路发布版）、`partner_venue`（胡同讲解点、老字号、剧场、户外演出等合作点位）、`visitor_itinerary`（游客行程与改线记录）、`visit_evidence`（打卡凭证与分账状态）。

| 事件类型 | 聚合 | 含义 |
| --- | --- | --- |
| `VENUE_PROFILE_PUBLISHED` | partner_venue | 点位自行维护资料、内容版本、无障碍信息、预约条件 |
| `VENUE_CALENDAR_PUBLISHED` | partner_venue | 点位发布开放日历与接待容量 |
| `VENUE_AVAILABILITY_CHANGED` | partner_venue | 闭店、满额、降容或重开；`late_notice=true` 表示迟到通知 |
| `ROUTE_RELEASED` | route_release | 主题线路按日期形成稳定发布版，固定各点位内容版本 |
| `BOOKING_REQUESTED` / `BOOKING_CONFIRMED` / `BOOKING_DECLINED` | visitor_itinerary | 预约请求与结果；受限场馆必须由场馆确认 |
| `ITINERARY_REVISED` | visitor_itinerary | 运营一次改线：移除点位、替代点位与游客可见说明 |
| `VISITOR_NOTIFIED` | visitor_itinerary | 向受影响在途游客发出通知 |
| `VISIT_EVIDENCE_RECORDED` | visit_evidence | 打卡凭证，固定当时内容版本与内容快照引用 |
| `SETTLEMENT_DISPUTED` / `SETTLEMENT_HELD` | visit_evidence | 凭证争议与分账暂缓 |
| `VISIT_SETTLED` | visit_evidence | 按合同结算；争议未解除前不得结算为 SETTLED |

## 编号与版本

- 事件编号：`MMDDYY-线路或活动序号-事件类别缩写-当日序号`，例如 `100326-004-VAC-004`。
- `version` 是同一 `aggregate_id` 内的事件序号，严格单调递增；校验器同时拒绝重复编号与乱序版本。

## 关键领域规则

- **今天仍能到访**：游客打开已购行程时，读模型依据各点位最新日历、容量与可用性事件呈现当日可到访点位及替代方案，静态发布版不作为最终接待状态。
- **点位自助维护、最小暴露**：合作点位自行维护开放日历、接待容量、无障碍信息、内容版本与预约条件，只通过 `exposed_fields` 暴露完成编排所需字段；联营关系不构成读取其他商户经营明细的授权。
- **稳定发布版**：不同主题线路按日期冻结为 `ROUTE_RELEASED`；建议可基于语言、时长与游客已同意的偏好（`agreed_tags`）生成，但受限场馆的 `confirmed_by_venue` 必须由场馆自行置真。
- **迟到闭店**：`late_notice=true` 的可用性变更须定位在途行程，产生 `ITINERARY_REVISED`（以 `trigger_event_id` 回溯）并随后 `VISITOR_NOTIFIED`，载荷中带可行替代点位。
- **历史不可变**：内容改版只产生新版本；发布版与已完成打卡仍指向旧的 `content_version` 与 `content_snapshot_ref`，改线不删除已完成凭证。
- **争议暂缓分账**：凭证发生争议时 `SETTLEMENT_DISPUTED` → `SETTLEMENT_HELD`；运营核对确认后才允许 `VISIT_SETTLED` 以 `SETTLED` 按合同结算，并以 `resolves_dispute_event_id` 关联原争议。
- **访问边界**：运营可解释一次改线（`visitor_facing_explanation`）；合作方只查看本点位客流与履约数据，任何一方不得借联营关系读取其他商户经营明细（该边界在接入层强制执行，事件载荷本身不含他方经营字段）。

## 本地检查

```bash
npm test
```
