# ingress — Sandbox Traffic Ingress Proxy

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Go reverse proxy routing external traffic to sandbox ports; supports multiple routing strategies and optional secure access. Also implements the `renew_intent` side-channel protocol (Redis pub/sub) shared with `server/`.

## STRUCTURE
```
components/ingress/
├── pkg/
│   ├── proxy/          # Core proxy logic (16 files — primary area)
│   ├── sandbox/        # Sandbox endpoint resolution
│   ├── signature/      # Request signing for secure access
│   ├── renewintent/    # Redis pub/sub: notify server when traffic observed
│   └── flag/           # CLI flags
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Traffic routing strategies | `pkg/proxy/` |
| Secure access enforcement | `pkg/signature/` |
| Sandbox endpoint lookup | `pkg/sandbox/` |
| Auto-renew-on-access protocol | `pkg/renewintent/` |

## CONVENTIONS
- `pkg/renewintent/` implements a Redis pub/sub **side-channel** shared with `server/opensandbox_server/integrations/renew_intent/` — changes to the protocol must be mirrored in both places
- Uses `components/internal` (`github.com/alibaba/opensandbox/internal`) for shared logging/telemetry; do not replicate those utilities locally

## ANTI-PATTERNS
- Do not modify the `renewintent` Redis message format without updating `server/integrations/renew_intent/` in the same change
- Do not cross-import between ingress, egress, and execd pkg trees

## COMMANDS
```bash
cd components/ingress
go build ./...
go test ./...
./build.sh
```

## NOTES
- `OSEP-0009` documents the auto-renew-on-ingress-access design (Redis protocol, TTL extension semantics)
- `secureAccess` applies only to Kubernetes sandboxes exposed through ingress gateway mode
