# Analytics

Interlock analytics are computed from real `ActionChecked` records indexed by the Recorder Service. The dashboard does not generate synthetic metrics when the Recorder is disabled or unavailable.

## Endpoints

```text
GET /analytics
GET /analytics/agents/:id
GET /analytics/policies/:id
```

Response shape:

```json
{
  "scope": "global",
  "totalActions": 0,
  "allowed": 0,
  "blocked": 0,
  "review": 0,
  "failedSimulations": 0,
  "blockRate": 0,
  "topReasons": [],
  "topTargets": [],
  "topSelectors": [],
  "latestActions": []
}
```

## Dashboard Behavior

The Analytics tab shows:

- total indexed actions;
- allowed, blocked, review, and failed simulation counts;
- block rate;
- selected-agent and selected-policy scoped totals;
- top reason codes;
- most common targets;
- most common selectors;
- latest indexed decisions with Mantlescan links.

If `NEXT_PUBLIC_INDEXER_URL=disabled`, the dashboard shows a clear "Analytics requires Recorder/Indexer" state. RPC fallback evidence is still allowed for Flight Recorder, but analytics are not fabricated.

## CLI

```bash
pnpm cli -- analytics --indexer-url <recorder_api_url>
pnpm cli -- analytics --agent-id <real_agent_id>
pnpm cli -- analytics --policy-id <real_policy_id>
```

## Notes

- Analytics are Dev Alpha observability metrics, not production risk ratings.
- Agent Safety Card counters remain simple indexed counters.
- Benchmark scores are separate from analytics and should be read as testnet scenario results.
