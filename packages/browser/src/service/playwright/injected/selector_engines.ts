import { parentElementOrShadowHost, isElementVisible } from "./dom_visibility";
import { normalizeWhitespace } from "./text_matcher";
import {
  elementText,
  elementMatchesText,
  shouldSkipForTextMatching,
} from "./dom_text";
import type { QueryContext, SelectorEngine } from "./selector_types";
/** Original ot/Dt/mn. Document order visits light children before shadow children. */
export function selectorParent(element: Element, context: QueryContext) {
  if (element !== context.scope)
    return context.pierceShadow
      ? parentElementOrShadowHost(element)
      : element.parentElement || undefined;
}
export function selectorPreviousSibling(
  element: Element,
  context: QueryContext,
) {
  if (element !== context.scope)
    return element.previousElementSibling || undefined;
}
export function sortInDOMOrder(elements: Element[]) {
  const entries = new Map<Element, { children: Element[]; taken: boolean }>(),
    roots: Element[] = [],
    result: Element[] = [];
  function entry(element: Element): { children: Element[]; taken: boolean } {
    let value = entries.get(element);
    if (value) return value;
    const parent = parentElementOrShadowHost(element);
    if (parent) entry(parent).children.push(element);
    else roots.push(element);
    value = { children: [], taken: false };
    entries.set(element, value);
    return value;
  }
  for (const element of elements) entry(element).taken = true;
  function visit(element: Element) {
    const value = entries.get(element)!;
    if (value.taken) result.push(element);
    if (value.children.length > 1) {
      const wanted = new Set(value.children);
      value.children = [];
      let child = element.firstElementChild;
      while (child && value.children.length < wanted.size) {
        if (wanted.has(child)) value.children.push(child);
        child = child.nextElementSibling;
      }
      child = element.shadowRoot ? element.shadowRoot.firstElementChild : null;
      while (child && value.children.length < wanted.size) {
        if (wanted.has(child)) value.children.push(child);
        child = child.nextElementSibling;
      }
    }
    value.children.forEach(visit);
  }
  roots.forEach(visit);
  return result;
}
export const isEngine: SelectorEngine = {
  matches(element, args, context, evaluator) {
    if (args.length === 0)
      throw new Error('"is" engine expects non-empty selector list');
    return args.some((selector) =>
      evaluator.matches(element, selector, context),
    );
  },
  query(context, args, evaluator) {
    if (args.length === 0)
      throw new Error('"is" engine expects non-empty selector list');
    let result: Element[] = [];
    for (const selector of args)
      result = result.concat(evaluator.query(context, selector));
    return args.length === 1 ? result : sortInDOMOrder(result);
  },
};
export const hasEngine: SelectorEngine = {
  matches(element, args, context, evaluator) {
    if (args.length === 0)
      throw new Error('"has" engine expects non-empty selector list');
    return evaluator.query({ ...context, scope: element }, args).length > 0;
  },
};
export const scopeEngine: SelectorEngine = {
  matches(element, args, context, _evaluator) {
    if (args.length !== 0)
      throw new Error('"scope" engine expects no arguments');
    const scope = context.originalScope || context.scope;
    return scope.nodeType === 9
      ? element === (scope as Document).documentElement
      : element === scope;
  },
  query(context, args, _evaluator) {
    if (args.length !== 0)
      throw new Error('"scope" engine expects no arguments');
    const scope = context.originalScope || context.scope;
    if (scope.nodeType === 9) {
      const documentElement = (scope as Document).documentElement;
      return documentElement ? [documentElement] : [];
    }
    return scope.nodeType === 1 ? [scope as Element] : [];
  },
};
export const notEngine: SelectorEngine = {
  matches(element, args, context, evaluator) {
    if (args.length === 0)
      throw new Error('"not" engine expects non-empty selector list');
    return !evaluator.matches(element, args, context);
  },
};
export const lightEngine: SelectorEngine = {
  query(context, args, evaluator) {
    return evaluator.query({ ...context, pierceShadow: false }, args);
  },
  matches(element, args, context, evaluator) {
    return evaluator.matches(element, args, {
      ...context,
      pierceShadow: false,
    });
  },
};
export const visibleEngine: SelectorEngine = {
  matches(element, args, _context, _evaluator) {
    if (args.length) throw new Error('"visible" engine expects no arguments');
    return isElementVisible(element);
  },
};
export const textEngine: SelectorEngine = {
  matches(element, args, _context, evaluator) {
    if (args.length !== 1 || typeof args[0] !== "string")
      throw new Error('"text" engine expects a single string');
    const expected = normalizeWhitespace(args[0]).toLowerCase();
    return (
      elementMatchesText(evaluator._cacheText, element, (text) =>
        text.normalized.toLowerCase().includes(expected),
      ) === "self"
    );
  },
};
export const textIsEngine: SelectorEngine = {
  matches(element, args, _context, evaluator) {
    if (args.length !== 1 || typeof args[0] !== "string")
      throw new Error('"text-is" engine expects a single string');
    const expected = normalizeWhitespace(args[0]);
    return (
      elementMatchesText(evaluator._cacheText, element, (text) =>
        !expected && !text.immediate.length
          ? true
          : text.immediate.some(
              (part) => normalizeWhitespace(part) === expected,
            ),
      ) !== "none"
    );
  },
};
export const textMatchesEngine: SelectorEngine = {
  matches(element, args, _context, evaluator) {
    if (
      args.length === 0 ||
      typeof args[0] !== "string" ||
      args.length > 2 ||
      (args.length === 2 && typeof args[1] !== "string")
    )
      throw new Error(
        '"text-matches" engine expects a regexp body and optional regexp flags',
      );
    const regex = new RegExp(
      args[0],
      args.length === 2 ? (args[1] as string) : undefined,
    );
    return (
      elementMatchesText(evaluator._cacheText, element, (text) =>
        regex.test(text.full),
      ) === "self"
    );
  },
};
export const hasTextEngine: SelectorEngine = {
  matches(element, args, _context, evaluator) {
    if (args.length !== 1 || typeof args[0] !== "string")
      throw new Error('"has-text" engine expects a single string');
    if (shouldSkipForTextMatching(element)) return false;
    const expected = normalizeWhitespace(args[0]).toLowerCase();
    return elementText(evaluator._cacheText, element)
      .normalized.toLowerCase()
      .includes(expected);
  },
};
export const nthMatchEngine: SelectorEngine = {
  query(context, args, evaluator) {
    let index = args[args.length - 1];
    if (args.length < 2)
      throw new Error(
        '"nth-match" engine expects non-empty selector list and an index argument',
      );
    if (typeof index !== "number" || index < 1)
      throw new Error(
        '"nth-match" engine expects a one-based index as the last argument',
      );
    const elements = isEngine.query!(
      context,
      args.slice(0, args.length - 1),
      evaluator,
    );
    index--;
    return index < elements.length ? [elements[index]] : [];
  },
};
