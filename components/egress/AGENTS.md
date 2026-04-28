# egress — Sandbox Network Egress Control

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Go daemon running as a sidecar inside sandbox containers; enforces per-sandbox outbound network policy via nftables/iptables, DNS proxy, and a mitmproxy transparent HTTP proxy. Implements `specs/egress-api.yaml`.

## STRUCTURE
```
components/egress/
├── main.go                    # Entry: flag parse, policy server + DNS proxy startup
├── policy_server.go           # HTTP API: GET/PATCH /policy (runtime policy mutation)
├── policy_utils.go            # Policy evaluation helpers
├── nameserver.go              # DNS proxy (blocks/allows by FQDN policy)
├── nft.go                     # nftables rule management
├── mitmproxy_transparent.go   # Transparent proxy integration
├── mitmscripts/
│   └── add_header.py          # mitmproxy Python addon (runtime artifact, not test)
├── pkg/
│   ├── policy/                # Policy types and merge semantics (sidecar merge)
│   ├── dnsproxy/              # DNS proxy implementation
│   ├── nftables/              # nftables rule builder
│   ├── iptables/              # iptables fallback
│   ├── mitmproxy/             # mitmproxy process management
│   ├── telemetry/             # OpenTelemetry spans
│   ├── events/                # Policy change event bus
│   ├── startup/               # Startup sequencing and health checks
│   ├── log/                   # Structured logging
│   └── constants/             # Port/path constants
├── hooks/                     # Container lifecycle hooks
├── docs/                      # Design documents
└── tests/                     # Integration tests (9 files)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Egress policy types/merge | `pkg/policy/` |
| DNS-based allow/block | `pkg/dnsproxy/` + `nameserver.go` |
| nftables rule changes | `pkg/nftables/` + `nft.go` |
| HTTP policy API | `policy_server.go` |
| mitmproxy integration | `mitmproxy_transparent.go`, `pkg/mitmproxy/`, `mitmscripts/add_header.py` |
| Startup sequencing | `pkg/startup/` |

## CONVENTIONS
- Policy mutations use **sidecar merge semantics** (`PATCH /policy`) — not replace; see `pkg/policy/`
- `mitmscripts/add_header.py` is a **runtime artifact** deployed inside containers, not a test helper
- Shared Go utilities from `components/internal` (`github.com/alibaba/opensandbox/internal`) for logging/telemetry
- `hooks/` scripts run at container lifecycle events (not Kubernetes hooks)
- `nameserver_test.go` and `policy_server_test.go` are at root level (atypical — rest of tests in `tests/`)

## ANTI-PATTERNS
- Never replace the full policy on `PATCH`; always merge using sidecar merge semantics
- `nftables` and `iptables` are mutually exclusive per host; check startup detection before adding rules to both
- Do not edit `mitmscripts/add_header.py` as a Go file — it is Python and deployed separately
- Do not cross-import between egress, ingress, and execd pkg trees

## COMMANDS
```bash
cd components/egress
go build ./...
go test ./...
./build.sh
```

## NOTES
- `OSEP-0001` covers FQDN-based egress control design
- Hidden coupling: `server/opensandbox_server/integrations/renew_intent/` and `components/ingress/pkg/renewintent/` share a Redis pub/sub protocol for auto-renew-on-access; egress is not part of this flow
