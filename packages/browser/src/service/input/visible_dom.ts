import { visibleDomExpression } from "./visible_dom_page";
import { createVisibleDomFrameReader } from "./visible_dom_frame";
import { createVisibleDomCapture } from "./visible_dom_capture";
/** Complete original SD/xD/ED/cY/_Y path over shared DOM input state. */
export const visibleDomFrameReader =
  createVisibleDomFrameReader(visibleDomExpression);
export const visibleDom = createVisibleDomCapture(visibleDomFrameReader);
export const DomCuaGetVisibleDomCommand = visibleDom.command;
export const captureReviewerVisibleDom = visibleDom.review;
