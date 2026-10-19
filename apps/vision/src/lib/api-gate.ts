/**
 * Blanket `/api/*` rate-limit gate, called from the proxy so every route
 * is covered. The implementation lives in `@citizens/utils`. Limits and
 * keys are unchanged: GET and HEAD use `gate:<ip>:r` at 240 per minute,
 * every other method uses `gate:<ip>:w` at 60 per minute.
 */
export {
  clientIp,
  gateApiRequest,
  GATE_READ,
  GATE_WRITE,
  type GateResult,
} from "@citizens/utils";
