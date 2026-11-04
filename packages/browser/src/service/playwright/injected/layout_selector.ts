/** Embedded hF Zi/es/ts/rs/ns/is/fn/Fe and InjectedScript._queryLayoutSelector. */
export type Rectangle = Pick<DOMRect, "left" | "right" | "top" | "bottom">;
export type LayoutRelation =
  "left-of" | "right-of" | "above" | "below" | "near";
export const layoutRelations: LayoutRelation[] = [
  "left-of",
  "right-of",
  "above",
  "below",
  "near",
];
export function rightOfScore(
  candidate: Rectangle,
  anchor: Rectangle,
  maximum?: number,
) {
  const gap = candidate.left - anchor.right;
  if (!(gap < 0 || (maximum !== undefined && gap > maximum)))
    return (
      gap +
      Math.max(anchor.bottom - candidate.bottom, 0) +
      Math.max(candidate.top - anchor.top, 0)
    );
}
export function leftOfScore(
  candidate: Rectangle,
  anchor: Rectangle,
  maximum?: number,
) {
  const gap = anchor.left - candidate.right;
  if (!(gap < 0 || (maximum !== undefined && gap > maximum)))
    return (
      gap +
      Math.max(anchor.bottom - candidate.bottom, 0) +
      Math.max(candidate.top - anchor.top, 0)
    );
}
export function aboveScore(
  candidate: Rectangle,
  anchor: Rectangle,
  maximum?: number,
) {
  const gap = anchor.top - candidate.bottom;
  if (!(gap < 0 || (maximum !== undefined && gap > maximum)))
    return (
      gap +
      Math.max(candidate.left - anchor.left, 0) +
      Math.max(anchor.right - candidate.right, 0)
    );
}
export function belowScore(
  candidate: Rectangle,
  anchor: Rectangle,
  maximum?: number,
) {
  const gap = candidate.top - anchor.bottom;
  if (!(gap < 0 || (maximum !== undefined && gap > maximum)))
    return (
      gap +
      Math.max(candidate.left - anchor.left, 0) +
      Math.max(anchor.right - candidate.right, 0)
    );
}
export function nearScore(
  candidate: Rectangle,
  anchor: Rectangle,
  maximum?: number,
) {
  const limit = maximum === undefined ? 50 : maximum;
  let score = 0;
  if (candidate.left - anchor.right >= 0)
    score += candidate.left - anchor.right;
  if (anchor.left - candidate.right >= 0)
    score += anchor.left - candidate.right;
  if (anchor.top - candidate.bottom >= 0)
    score += anchor.top - candidate.bottom;
  if (candidate.top - anchor.bottom >= 0)
    score += candidate.top - anchor.bottom;
  return score > limit ? undefined : score;
}
export function layoutSelectorScore(
  relation: LayoutRelation,
  candidate: Element,
  anchors: Element[],
  maximum?: number,
) {
  const rectangle = candidate.getBoundingClientRect();
  const scorer = {
    "left-of": leftOfScore,
    "right-of": rightOfScore,
    above: aboveScore,
    below: belowScore,
    near: nearScore,
  }[relation];
  let best: number | undefined;
  for (const anchor of anchors) {
    if (anchor === candidate) continue;
    const score = scorer(rectangle, anchor.getBoundingClientRect(), maximum);
    if (score !== undefined && (best === undefined || score < best))
      best = score;
  }
  return best;
}
export interface LayoutEvaluator<Context> {
  query(context: Context, selectors: unknown[]): Element[];
  _markScore(element: Element, score: number): void;
}
export function createLayoutEngine(relation: LayoutRelation) {
  return {
    matches<Context>(
      element: Element,
      args: unknown[],
      context: Context,
      evaluator: LayoutEvaluator<Context>,
    ) {
      const maximum =
        args.length && typeof args[args.length - 1] === "number"
          ? (args[args.length - 1] as number)
          : undefined;
      const selectors =
        maximum === undefined ? args : args.slice(0, args.length - 1);
      if (args.length < 1 + (maximum === undefined ? 0 : 1))
        throw new Error(
          `"${relation}" engine expects a selector list and optional maximum distance in pixels`,
        );
      const anchors = evaluator.query(context, selectors);
      const score = layoutSelectorScore(relation, element, anchors, maximum);
      if (score === undefined) return false;
      evaluator._markScore(element, score);
      return true;
    },
  };
}
export interface LayoutSelectorPart<Selector> {
  name: LayoutRelation;
  body: { parsed: Selector; distance?: number };
}
/** Original method with querySelectorAll supplied by the enclosing InjectedScript. */
export function queryLayoutSelector<Selector, Root>(
  owner: { querySelectorAll(selector: Selector, root: Root): Element[] },
  candidates: Iterable<Element>,
  part: LayoutSelectorPart<Selector>,
  root: Root,
) {
  const relation = part.name,
    body = part.body;
  const matches: { element: Element; score: number }[] = [];
  const anchors = owner.querySelectorAll(body.parsed, root);
  for (const element of candidates) {
    const score = layoutSelectorScore(
      relation,
      element,
      anchors,
      body.distance,
    );
    if (score !== undefined) matches.push({ element, score });
  }
  matches.sort((first, second) => first.score - second.score);
  return new Set(matches.map((match) => match.element));
}
