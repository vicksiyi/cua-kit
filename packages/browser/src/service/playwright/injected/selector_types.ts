import type { TextCache } from "./dom_text";
export type QueryRoot = Element | Document | ShadowRoot;
export interface QueryContext {
  scope: QueryRoot;
  pierceShadow: boolean;
  originalScope?: QueryRoot;
}
export interface SimpleSelector {
  css?: string;
  functions: { name: string; args: SelectorArgument[] }[];
}
export interface ComplexSelector {
  simples: { selector: SimpleSelector; combinator: string }[];
}
export type SelectorArgument =
  ComplexSelector | SelectorArgument[] | string | number;
export interface SelectorEngine {
  matches?(
    element: Element,
    args: SelectorArgument[],
    context: QueryContext,
    evaluator: SelectorEvaluatorApi,
  ): boolean;
  query?(
    context: QueryContext,
    args: SelectorArgument[],
    evaluator: SelectorEvaluatorApi,
  ): Element[];
}
export interface SelectorEvaluatorApi {
  _cacheText: TextCache;
  matches(element: Element, selector: unknown, context: QueryContext): boolean;
  query(context: QueryContext, selector: unknown): Element[];
  _markScore(element: Element, score: number): void;
}
