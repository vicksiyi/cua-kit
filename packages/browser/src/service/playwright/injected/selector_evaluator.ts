import { parentElementOrShadowHost } from "./dom_visibility";
import { createLayoutEngine } from "./layout_selector";
import {
  isEngine,
  hasEngine,
  scopeEngine,
  notEngine,
  lightEngine,
  visibleEngine,
  textEngine,
  textIsEngine,
  textMatchesEngine,
  hasTextEngine,
  nthMatchEngine,
  selectorParent,
  selectorPreviousSibling,
} from "./selector_engines";
import type {
  QueryContext,
  QueryRoot,
  SimpleSelector,
  ComplexSelector,
  SelectorArgument,
  SelectorEngine,
} from "./selector_types";
import type { TextCache } from "./dom_text";
type Cache = Map<unknown, { rest: unknown[]; result: any }[]>;
export const customCSSNames = new Set([
  "not",
  "is",
  "where",
  "has",
  "scope",
  "light",
  "visible",
  "text",
  "text-matches",
  "text-is",
  "has-text",
  "above",
  "below",
  "right-of",
  "left-of",
  "near",
  "nth-match",
]);
/** Readable reconstruction of the complete embedded hF ls evaluator class. */
export class SelectorEvaluator {
  _retainCacheCounter = 0;
  _cacheText: TextCache = new Map();
  _cacheQueryCSS: Cache = new Map();
  _cacheMatches: Cache = new Map();
  _cacheQuery: Cache = new Map();
  _cacheMatchesSimple: Cache = new Map();
  _cacheMatchesParents: Cache = new Map();
  _cacheCallMatches: Cache = new Map();
  _cacheCallQuery: Cache = new Map();
  _cacheQuerySimple: Cache = new Map();
  _engines = new Map<string, SelectorEngine>();
  declare _scoreMap: Map<Element, number> | undefined;
  constructor() {
    this._engines.set("not", notEngine);
    this._engines.set("is", isEngine);
    this._engines.set("where", isEngine);
    this._engines.set("has", hasEngine);
    this._engines.set("scope", scopeEngine);
    this._engines.set("light", lightEngine);
    this._engines.set("visible", visibleEngine);
    this._engines.set("text", textEngine);
    this._engines.set("text-is", textIsEngine);
    this._engines.set("text-matches", textMatchesEngine);
    this._engines.set("has-text", hasTextEngine);
    this._engines.set("right-of", createLayoutEngine("right-of"));
    this._engines.set("left-of", createLayoutEngine("left-of"));
    this._engines.set("above", createLayoutEngine("above"));
    this._engines.set("below", createLayoutEngine("below"));
    this._engines.set("near", createLayoutEngine("near"));
    this._engines.set("nth-match", nthMatchEngine);
    const engines = [...this._engines.keys()];
    engines.sort();
    const names = [...customCSSNames];
    names.sort();
    if (engines.join("|") !== names.join("|"))
      throw new Error(
        `Please keep customCSSNames in sync with evaluator engines: ${engines.join("|")} vs ${names.join("|")}`,
      );
  }
  begin() {
    ++this._retainCacheCounter;
  }
  end() {
    --this._retainCacheCounter;
    if (!this._retainCacheCounter) {
      this._cacheQueryCSS.clear();
      this._cacheMatches.clear();
      this._cacheQuery.clear();
      this._cacheMatchesSimple.clear();
      this._cacheMatchesParents.clear();
      this._cacheCallMatches.clear();
      this._cacheCallQuery.clear();
      this._cacheQuerySimple.clear();
      this._cacheText.clear();
    }
  }
  _cached<T>(cache: Cache, key: unknown, rest: unknown[], compute: () => T): T {
    if (!cache.has(key)) cache.set(key, []);
    const entries = cache.get(key)!;
    const hit = entries.find((entry) =>
      rest.every((value, index) => entry.rest[index] === value),
    );
    if (hit) return hit.result;
    const result = compute();
    entries.push({ rest, result });
    return result;
  }
  _checkSelector(input: unknown): ComplexSelector | SelectorArgument[] {
    if (!(
      typeof input === "object" &&
      input &&
      (Array.isArray(input) ||
        ("simples" in input && (input as ComplexSelector).simples.length))
    ))
      throw new Error(`Malformed selector "${input}"`);
    return input as ComplexSelector | SelectorArgument[];
  }
  matches(element: Element, input: unknown, context: QueryContext): boolean {
    const selector = this._checkSelector(input);
    this.begin();
    try {
      return this._cached(
        this._cacheMatches,
        element,
        [selector, context.scope, context.pierceShadow, context.originalScope],
        () => {
          if (Array.isArray(selector))
            return this._matchesEngine(isEngine, element, selector, context);
          if (this._hasScopeClause(selector))
            context = this._expandContextForScopeMatching(context);
          return this._matchesSimple(
            element,
            selector.simples[selector.simples.length - 1].selector,
            context,
          )
            ? this._matchesParents(
                element,
                selector,
                selector.simples.length - 2,
                context,
              )
            : false;
        },
      );
    } finally {
      this.end();
    }
  }
  query(context: QueryContext, input: unknown): Element[] {
    const selector = this._checkSelector(input);
    this.begin();
    try {
      return this._cached(
        this._cacheQuery,
        selector,
        [context.scope, context.pierceShadow, context.originalScope],
        () => {
          if (Array.isArray(selector))
            return this._queryEngine(isEngine, context, selector);
          if (this._hasScopeClause(selector))
            context = this._expandContextForScopeMatching(context);
          const previousScores = this._scoreMap;
          this._scoreMap = new Map();
          let result = this._querySimple(
            context,
            selector.simples[selector.simples.length - 1].selector,
          );
          result = result.filter((element) =>
            this._matchesParents(
              element,
              selector,
              selector.simples.length - 2,
              context,
            ),
          );
          if (this._scoreMap.size)
            result.sort((first, second) => {
              const a = this._scoreMap!.get(first),
                b = this._scoreMap!.get(second);
              return a === b
                ? 0
                : a === undefined
                  ? 1
                  : b === undefined
                    ? -1
                    : a - b;
            });
          this._scoreMap = previousScores;
          return result;
        },
      );
    } finally {
      this.end();
    }
  }
  _markScore(element: Element, score: number) {
    if (this._scoreMap) this._scoreMap.set(element, score);
  }
  _hasScopeClause(selector: ComplexSelector) {
    return selector.simples.some((simple) =>
      simple.selector.functions.some((fn) => fn.name === "scope"),
    );
  }
  _expandContextForScopeMatching(context: QueryContext): QueryContext {
    if (context.scope.nodeType !== 1) return context;
    const parent = parentElementOrShadowHost(context.scope as Element);
    return parent
      ? {
          ...context,
          scope: parent,
          originalScope: context.originalScope || context.scope,
        }
      : context;
  }
  _matchesSimple(
    element: Element,
    selector: SimpleSelector,
    context: QueryContext,
  ): boolean {
    return this._cached(
      this._cacheMatchesSimple,
      element,
      [selector, context.scope, context.pierceShadow, context.originalScope],
      () => {
        if (
          element === context.scope ||
          (selector.css && !this._matchesCSS(element, selector.css))
        )
          return false;
        for (const fn of selector.functions)
          if (
            !this._matchesEngine(
              this._getEngine(fn.name),
              element,
              fn.args,
              context,
            )
          )
            return false;
        return true;
      },
    );
  }
  _querySimple(context: QueryContext, selector: SimpleSelector): Element[] {
    if (!selector.functions.length)
      return this._queryCSS(context, selector.css || "*");
    return this._cached(
      this._cacheQuerySimple,
      selector,
      [context.scope, context.pierceShadow, context.originalScope],
      () => {
        let css = selector.css;
        const functions = selector.functions;
        if (css === "*" && functions.length) css = undefined;
        let result: Element[],
          seed = -1;
        if (css !== undefined) result = this._queryCSS(context, css);
        else {
          seed = functions.findIndex(
            (fn) => this._getEngine(fn.name).query !== undefined,
          );
          if (seed === -1) seed = 0;
          result = this._queryEngine(
            this._getEngine(functions[seed].name),
            context,
            functions[seed].args,
          );
        }
        for (let index = 0; index < functions.length; index++) {
          if (index === seed) continue;
          const engine = this._getEngine(functions[index].name);
          if (engine.matches !== undefined)
            result = result.filter((element) =>
              this._matchesEngine(
                engine,
                element,
                functions[index].args,
                context,
              ),
            );
        }
        for (let index = 0; index < functions.length; index++) {
          if (index === seed) continue;
          const engine = this._getEngine(functions[index].name);
          if (engine.matches === undefined)
            result = result.filter((element) =>
              this._matchesEngine(
                engine,
                element,
                functions[index].args,
                context,
              ),
            );
        }
        return result;
      },
    );
  }
  _matchesParents(
    element: Element,
    selector: ComplexSelector,
    index: number,
    context: QueryContext,
  ): boolean {
    if (index < 0) return true;
    return this._cached(
      this._cacheMatchesParents,
      element,
      [
        selector,
        index,
        context.scope,
        context.pierceShadow,
        context.originalScope,
      ],
      () => {
        const { selector: simple, combinator } = selector.simples[index];
        if (combinator === ">") {
          const parent = selectorParent(element, context);
          return !parent || !this._matchesSimple(parent, simple, context)
            ? false
            : this._matchesParents(parent, selector, index - 1, context);
        }
        if (combinator === "+") {
          const sibling = selectorPreviousSibling(element, context);
          return !sibling || !this._matchesSimple(sibling, simple, context)
            ? false
            : this._matchesParents(sibling, selector, index - 1, context);
        }
        if (combinator === "") {
          let parent = selectorParent(element, context);
          while (parent) {
            if (this._matchesSimple(parent, simple, context)) {
              if (this._matchesParents(parent, selector, index - 1, context))
                return true;
              if (selector.simples[index - 1].combinator === "") break;
            }
            parent = selectorParent(parent, context);
          }
          return false;
        }
        if (combinator === "~") {
          let sibling = selectorPreviousSibling(element, context);
          while (sibling) {
            if (this._matchesSimple(sibling, simple, context)) {
              if (this._matchesParents(sibling, selector, index - 1, context))
                return true;
              if (selector.simples[index - 1].combinator === "~") break;
            }
            sibling = selectorPreviousSibling(sibling, context);
          }
          return false;
        }
        if (combinator === ">=") {
          let ancestor: Element | undefined = element;
          while (ancestor) {
            if (this._matchesSimple(ancestor, simple, context)) {
              if (this._matchesParents(ancestor, selector, index - 1, context))
                return true;
              if (selector.simples[index - 1].combinator === "") break;
            }
            ancestor = selectorParent(ancestor, context);
          }
          return false;
        }
        throw new Error(`Unsupported combinator "${combinator}"`);
      },
    );
  }
  _matchesEngine(
    engine: SelectorEngine,
    element: Element,
    args: SelectorArgument[],
    context: QueryContext,
  ): boolean {
    if (engine.matches)
      return this._callMatches(engine, element, args, context);
    if (engine.query)
      return this._callQuery(engine, args, context).includes(element);
    throw new Error('Selector engine should implement "matches" or "query"');
  }
  _queryEngine(
    engine: SelectorEngine,
    context: QueryContext,
    args: SelectorArgument[],
  ): Element[] {
    if (engine.query) return this._callQuery(engine, args, context);
    if (engine.matches)
      return this._queryCSS(context, "*").filter((element) =>
        this._callMatches(engine, element, args, context),
      );
    throw new Error('Selector engine should implement "matches" or "query"');
  }
  _callMatches(
    engine: SelectorEngine,
    element: Element,
    args: SelectorArgument[],
    context: QueryContext,
  ): boolean {
    return this._cached(
      this._cacheCallMatches,
      element,
      [
        engine,
        context.scope,
        context.pierceShadow,
        context.originalScope,
        ...args,
      ],
      () => engine.matches!(element, args, context, this),
    );
  }
  _callQuery(
    engine: SelectorEngine,
    args: SelectorArgument[],
    context: QueryContext,
  ): Element[] {
    return this._cached(
      this._cacheCallQuery,
      engine,
      [context.scope, context.pierceShadow, context.originalScope, ...args],
      () => engine.query!(context, args, this),
    );
  }
  _matchesCSS(element: Element, css: string) {
    return element.matches(css);
  }
  _queryCSS(context: QueryContext, css: string): Element[] {
    return this._cached(
      this._cacheQueryCSS,
      css,
      [context.scope, context.pierceShadow, context.originalScope],
      () => {
        let result: Element[] = [];
        function query(root: QueryRoot) {
          result = result.concat([...root.querySelectorAll(css)]);
          if (!context.pierceShadow) return;
          const shadow = (root as Element).shadowRoot;
          if (shadow) query(shadow);
          for (const element of root.querySelectorAll("*"))
            if (element.shadowRoot) query(element.shadowRoot);
        }
        query(context.scope);
        return result;
      },
    );
  }
  _getEngine(name: string) {
    const engine = this._engines.get(name);
    if (!engine) throw new Error(`Unknown selector engine "${name}"`);
    return engine;
  }
}
