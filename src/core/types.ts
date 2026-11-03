export type Point = readonly [number, number];
export interface ElementRef { targetId: string; snapshotId: string; elementId: number }
export interface AXElement {
  id: number;
  role: string;
  name: string;
  value?: string;
  parentId?: number;
  properties: Record<string, string | number | boolean>;
}
export interface Screenshot {
  id: string;
  bytes: Uint8Array;
  mimeType: 'image/png';
  coordinateSpace: 'css-viewport';
  capturedAt: string;
}
export interface Observation {
  sessionId: string;
  targetId: string;
  snapshotId: string;
  epoch: number;
  capturedAt: string;
  url: string;
  text: string;
  elements: AXElement[];
  warnings: string[];
  screenshot?: Screenshot;
  diff?: { baseSnapshotId: string; removed: number[]; added: AXElement[]; changed: AXElement[] };
}
export interface StateOptions { disableDiffing?: boolean; screenshot?: boolean; signal?: AbortSignal }
export interface ActionOptions { signal?: AbortSignal }
export interface SelectTextOptions extends ActionOptions { prefix?: string; suffix?: string }
export interface DragOptions extends ActionOptions { steps?: number; durationMs?: number }
export interface PressKeyOptions extends ActionOptions { durationMs?: number }
export interface ClickOptions extends ActionOptions {
  key?: string;
  mouseButton?: 'left' | 'right' | 'middle';
  clickCount?: number;
  durationMs?: number;
}
export interface AuthorizationRequest {
  sessionId: string;
  targetId: string;
  url: string;
  operation: string;
  effect: 'read' | 'write';
}
export type Authorize = (request: AuthorizationRequest) => boolean | Promise<boolean>;
export interface AuditEvent extends AuthorizationRequest {
  requestId: string;
  status: 'completed' | 'failed';
  durationMs: number;
  errorCode?: string;
}
