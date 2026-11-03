import {
  validPreferenceSession,
  type PermissionResource,
} from "./persisted_permissions";
import type { PreferenceTurn } from "./request_context";
export interface CachedPermissionRequest {
  resource: PermissionResource;
  turn?: PreferenceTurn;
  preferenceSessionId?: string;
  guardianMode?: string;
}
/** Original Sg/Yc and Joe/Zoe/sie/aie/uie. Maps are shared by the assembled singleton, not per request. */
export function createPreferenceTurnCaches() {
  const turnApprovals = new Map<
    string,
    { origins: Set<string>; turnId: string }
  >();
  const guardianApprovals = new Map<
    string,
    { expiresAt: number; origin: string; turnId: string }
  >();
  function hasTurnApproval(request: CachedPermissionRequest) {
    const turn = request.turn;
    if (
      request.resource.kind !== "origin" ||
      turn == null ||
      turn.sessionId !== request.preferenceSessionId ||
      turn.turnId.trim().length === 0
    )
      return false;
    const cached = turnApprovals.get(turn.sessionId);
    if (cached == null) return false;
    if (cached.turnId !== turn.turnId) {
      turnApprovals.delete(turn.sessionId);
      return false;
    }
    return cached.origins.has(request.resource.origin);
  }
  function recordTurnApproval(
    origin: string,
    turn: PreferenceTurn | undefined,
  ) {
    if (
      turn == null ||
      !validPreferenceSession(turn.sessionId) ||
      turn.turnId.trim().length === 0
    )
      return;
    const cached = turnApprovals.get(turn.sessionId);
    if (cached?.turnId === turn.turnId) {
      cached.origins.add(origin);
      return;
    }
    turnApprovals.set(turn.sessionId, {
      origins: new Set([origin]),
      turnId: turn.turnId,
    });
  }
  function invalidateGuardianApproval(request: CachedPermissionRequest) {
    const turn = request.turn;
    if (
      request.guardianMode !== "v1" ||
      turn == null ||
      request.resource.kind !== "origin"
    )
      return;
    const cached = guardianApprovals.get(turn.sessionId);
    if (
      cached != null &&
      (cached.expiresAt <= Date.now() ||
        cached.turnId !== turn.turnId ||
        cached.origin !== request.resource.origin)
    )
      guardianApprovals.delete(turn.sessionId);
  }
  function hasGuardianApproval(request: CachedPermissionRequest) {
    const turn = request.turn;
    if (
      request.guardianMode !== "v1" ||
      turn == null ||
      request.resource.kind !== "origin"
    )
      return false;
    const cached = guardianApprovals.get(turn.sessionId);
    if (cached == null) return false;
    if (cached.expiresAt <= Date.now()) {
      guardianApprovals.delete(turn.sessionId);
      return false;
    }
    return (
      cached.turnId === turn.turnId && cached.origin === request.resource.origin
    );
  }
  function recordGuardianApproval(request: CachedPermissionRequest) {
    const turn = request.turn;
    if (turn == null || request.resource.kind !== "origin") return;
    guardianApprovals.set(turn.sessionId, {
      expiresAt: Date.now() + 300000,
      origin: request.resource.origin,
      turnId: turn.turnId,
    });
  }
  return {
    hasTurnApproval,
    recordTurnApproval,
    invalidateGuardianApproval,
    hasGuardianApproval,
    recordGuardianApproval,
  };
}
export const preferenceTurnCaches = createPreferenceTurnCaches();
