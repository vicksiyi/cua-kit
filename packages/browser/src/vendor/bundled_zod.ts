// @ts-nocheck
// Exact bundled third-party dependency, formatted only; NOT counted as reconstructed application code.
var e = Object.defineProperty,
  t = (t, r) => {
    for (var a in r) e(t, a, { get: r[a], enumerable: !0 });
  };
var f,
  g,
  w,
  v = {};
(t(v, {
  BRAND: () => et,
  DIRTY: () => N,
  EMPTY_PATH: () => A,
  INVALID: () => Z,
  NEVER: () => Kt,
  OK: () => q,
  ParseStatus: () => $,
  Schema: () => K,
  ZodAny: () => Te,
  ZodArray: () => Re,
  ZodBigInt: () => ge,
  ZodBoolean: () => we,
  ZodBranded: () => tt,
  ZodCatch: () => Xe,
  ZodDate: () => ve,
  ZodDefault: () => Ye,
  ZodDiscriminatedUnion: () => Oe,
  ZodEffects: () => Je,
  ZodEnum: () => Ve,
  ZodError: () => j,
  ZodFirstPartyTypeKind: () => nt,
  ZodFunction: () => Be,
  ZodIntersection: () => Ze,
  ZodIssueCode: () => S,
  ZodLazy: () => Fe,
  ZodLiteral: () => Ue,
  ZodMap: () => De,
  ZodNaN: () => Qe,
  ZodNativeEnum: () => We,
  ZodNever: () => Ie,
  ZodNull: () => Se,
  ZodNullable: () => He,
  ZodNumber: () => fe,
  ZodObject: () => Ee,
  ZodOptional: () => Ge,
  ZodParsedType: () => x,
  ZodPipeline: () => rt,
  ZodPromise: () => Ke,
  ZodReadonly: () => at,
  ZodRecord: () => qe,
  ZodSchema: () => K,
  ZodSet: () => Le,
  ZodString: () => _e,
  ZodSymbol: () => xe,
  ZodTransformer: () => Je,
  ZodTuple: () => Ne,
  ZodType: () => K,
  ZodUndefined: () => ke,
  ZodUnion: () => Ae,
  ZodUnknown: () => je,
  ZodVoid: () => Ce,
  addIssueToContext: () => M,
  any: () => ft,
  array: () => xt,
  bigint: () => ht,
  boolean: () => mt,
  coerce: () => Wt,
  custom: () => st,
  date: () => pt,
  datetimeRegex: () => he,
  defaultErrorMap: () => I,
  discriminatedUnion: () => jt,
  effect: () => qt,
  enum: () => $t,
  function: () => At,
  getErrorMap: () => P,
  getParsedType: () => k,
  instanceof: () => ct,
  intersection: () => It,
  isAborted: () => D,
  isAsync: () => F,
  isDirty: () => L,
  isValid: () => B,
  late: () => ot,
  lazy: () => Mt,
  literal: () => Ot,
  makeIssue: () => E,
  map: () => Pt,
  nan: () => ut,
  nativeEnum: () => Zt,
  never: () => wt,
  null: () => yt,
  nullable: () => Lt,
  number: () => lt,
  object: () => kt,
  objectUtil: () => w,
  oboolean: () => Vt,
  onumber: () => zt,
  optional: () => Dt,
  ostring: () => Ut,
  pipeline: () => Ft,
  preprocess: () => Bt,
  promise: () => Nt,
  quotelessJson: () => T,
  record: () => Rt,
  set: () => Et,
  setErrorMap: () => R,
  strictObject: () => St,
  string: () => dt,
  symbol: () => bt,
  transformer: () => qt,
  tuple: () => Ct,
  undefined: () => _t,
  union: () => Tt,
  unknown: () => gt,
  util: () => f,
  void: () => vt,
}),
  ((g = f || (f = {})).assertEqual = (e) => {}),
  (g.assertIs = function (e) {}),
  (g.assertNever = function (e) {
    throw new Error();
  }),
  (g.arrayToEnum = (e) => {
    let t = {};
    for (let r of e) t[r] = r;
    return t;
  }),
  (g.getValidEnumValues = (e) => {
    let t = g.objectKeys(e).filter((t) => "number" != typeof e[e[t]]),
      r = {};
    for (let a of t) r[a] = e[a];
    return g.objectValues(r);
  }),
  (g.objectValues = (e) =>
    g.objectKeys(e).map(function (t) {
      return e[t];
    })),
  (g.objectKeys =
    "function" == typeof Object.keys
      ? (e) => Object.keys(e)
      : (e) => {
          let t = [];
          for (let r in e)
            Object.prototype.hasOwnProperty.call(e, r) && t.push(r);
          return t;
        }),
  (g.find = (e, t) => {
    for (let r of e) if (t(r)) return r;
  }),
  (g.isInteger =
    "function" == typeof Number.isInteger
      ? (e) => Number.isInteger(e)
      : (e) =>
          "number" == typeof e && Number.isFinite(e) && Math.floor(e) === e),
  (g.joinValues = function (e, t = " | ") {
    return e.map((e) => ("string" == typeof e ? `'${e}'` : e)).join(t);
  }),
  (g.jsonStringifyReplacer = (e, t) =>
    "bigint" == typeof t ? t.toString() : t),
  ((w || (w = {})).mergeShapes = (e, t) => ({ ...e, ...t })));
var x = f.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set",
  ]),
  k = (e) => {
    switch (typeof e) {
      case "undefined":
        return x.undefined;
      case "string":
        return x.string;
      case "number":
        return Number.isNaN(e) ? x.nan : x.number;
      case "boolean":
        return x.boolean;
      case "function":
        return x.function;
      case "bigint":
        return x.bigint;
      case "symbol":
        return x.symbol;
      case "object":
        return Array.isArray(e)
          ? x.array
          : null === e
            ? x.null
            : e.then &&
                "function" == typeof e.then &&
                e.catch &&
                "function" == typeof e.catch
              ? x.promise
              : typeof Map < "u" && e instanceof Map
                ? x.map
                : typeof Set < "u" && e instanceof Set
                  ? x.set
                  : typeof Date < "u" && e instanceof Date
                    ? x.date
                    : x.object;
      default:
        return x.unknown;
    }
  },
  S = f.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite",
  ]),
  T = (e) => JSON.stringify(e, null, 2).replace(/"([^"]+)":/g, "$1:"),
  j = class e extends Error {
    get errors() {
      return this.issues;
    }
    constructor(e) {
      (super(),
        (this.issues = []),
        (this.addIssue = (e) => {
          this.issues = [...this.issues, e];
        }),
        (this.addIssues = (e = []) => {
          this.issues = [...this.issues, ...e];
        }));
      let t = new.target.prototype;
      (Object.setPrototypeOf
        ? Object.setPrototypeOf(this, t)
        : (this.__proto__ = t),
        (this.name = "ZodError"),
        (this.issues = e));
    }
    format(e) {
      let t =
          e ||
          function (e) {
            return e.message;
          },
        r = { _errors: [] },
        a = (e) => {
          for (let i of e.issues)
            if ("invalid_union" === i.code) i.unionErrors.map(a);
            else if ("invalid_return_type" === i.code) a(i.returnTypeError);
            else if ("invalid_arguments" === i.code) a(i.argumentsError);
            else if (0 === i.path.length) r._errors.push(t(i));
            else {
              let e = r,
                a = 0;
              for (; a < i.path.length;) {
                let r = i.path[a];
                (a === i.path.length - 1
                  ? ((e[r] = e[r] || { _errors: [] }), e[r]._errors.push(t(i)))
                  : (e[r] = e[r] || { _errors: [] }),
                  (e = e[r]),
                  a++);
              }
            }
        };
      return (a(this), r);
    }
    static assert(t) {
      if (!(t instanceof e)) throw new Error(`Not a ZodError: ${t}`);
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, f.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return 0 === this.issues.length;
    }
    flatten(e = (e) => e.message) {
      let t = {},
        r = [];
      for (let a of this.issues)
        if (a.path.length > 0) {
          let r = a.path[0];
          ((t[r] = t[r] || []), t[r].push(e(a)));
        } else r.push(e(a));
      return { formErrors: r, fieldErrors: t };
    }
    get formErrors() {
      return this.flatten();
    }
  };
j.create = (e) => new j(e);
var I = (e, t) => {
    let r;
    switch (e.code) {
      case S.invalid_type:
        r =
          e.received === x.undefined
            ? "Required"
            : `Expected ${e.expected}, received ${e.received}`;
        break;
      case S.invalid_literal:
        r = `Invalid literal value, expected ${JSON.stringify(e.expected, f.jsonStringifyReplacer)}`;
        break;
      case S.unrecognized_keys:
        r = `Unrecognized key(s) in object: ${f.joinValues(e.keys, ", ")}`;
        break;
      case S.invalid_union:
        r = "Invalid input";
        break;
      case S.invalid_union_discriminator:
        r = `Invalid discriminator value. Expected ${f.joinValues(e.options)}`;
        break;
      case S.invalid_enum_value:
        r = `Invalid enum value. Expected ${f.joinValues(e.options)}, received '${e.received}'`;
        break;
      case S.invalid_arguments:
        r = "Invalid function arguments";
        break;
      case S.invalid_return_type:
        r = "Invalid function return type";
        break;
      case S.invalid_date:
        r = "Invalid date";
        break;
      case S.invalid_string:
        "object" == typeof e.validation
          ? "includes" in e.validation
            ? ((r = `Invalid input: must include "${e.validation.includes}"`),
              "number" == typeof e.validation.position &&
                (r = `${r} at one or more positions greater than or equal to ${e.validation.position}`))
            : "startsWith" in e.validation
              ? (r = `Invalid input: must start with "${e.validation.startsWith}"`)
              : "endsWith" in e.validation
                ? (r = `Invalid input: must end with "${e.validation.endsWith}"`)
                : f.assertNever(e.validation)
          : (r =
              "regex" !== e.validation ? `Invalid ${e.validation}` : "Invalid");
        break;
      case S.too_small:
        r =
          "array" === e.type
            ? `Array must contain ${e.exact ? "exactly" : e.inclusive ? "at least" : "more than"} ${e.minimum} element(s)`
            : "string" === e.type
              ? `String must contain ${e.exact ? "exactly" : e.inclusive ? "at least" : "over"} ${e.minimum} character(s)`
              : "number" === e.type || "bigint" === e.type
                ? `Number must be ${e.exact ? "exactly equal to " : e.inclusive ? "greater than or equal to " : "greater than "}${e.minimum}`
                : "date" === e.type
                  ? `Date must be ${e.exact ? "exactly equal to " : e.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(e.minimum))}`
                  : "Invalid input";
        break;
      case S.too_big:
        r =
          "array" === e.type
            ? `Array must contain ${e.exact ? "exactly" : e.inclusive ? "at most" : "less than"} ${e.maximum} element(s)`
            : "string" === e.type
              ? `String must contain ${e.exact ? "exactly" : e.inclusive ? "at most" : "under"} ${e.maximum} character(s)`
              : "number" === e.type
                ? `Number must be ${e.exact ? "exactly" : e.inclusive ? "less than or equal to" : "less than"} ${e.maximum}`
                : "bigint" === e.type
                  ? `BigInt must be ${e.exact ? "exactly" : e.inclusive ? "less than or equal to" : "less than"} ${e.maximum}`
                  : "date" === e.type
                    ? `Date must be ${e.exact ? "exactly" : e.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(e.maximum))}`
                    : "Invalid input";
        break;
      case S.custom:
        r = "Invalid input";
        break;
      case S.invalid_intersection_types:
        r = "Intersection results could not be merged";
        break;
      case S.not_multiple_of:
        r = `Number must be a multiple of ${e.multipleOf}`;
        break;
      case S.not_finite:
        r = "Number must be finite";
        break;
      default:
        ((r = t.defaultError), f.assertNever(e));
    }
    return { message: r };
  },
  C = I;
function R(e) {
  C = e;
}
function P() {
  return C;
}
var E = (e) => {
    let { data: t, path: r, errorMaps: a, issueData: i } = e,
      s = [...r, ...(i.path || [])],
      n = { ...i, path: s };
    if (void 0 !== i.message) return { ...i, path: s, message: i.message };
    let o = "",
      c = a
        .filter((e) => !!e)
        .slice()
        .reverse();
    for (let e of c) o = e(n, { data: t, defaultError: o }).message;
    return { ...i, path: s, message: o };
  },
  A = [];
function M(e, t) {
  let r = P(),
    a = E({
      issueData: t,
      data: e.data,
      path: e.path,
      errorMaps: [
        e.common.contextualErrorMap,
        e.schemaErrorMap,
        r,
        r === I ? void 0 : I,
      ].filter((e) => !!e),
    });
  e.common.issues.push(a);
}
var O,
  $ = class e {
    constructor() {
      this.value = "valid";
    }
    dirty() {
      "valid" === this.value && (this.value = "dirty");
    }
    abort() {
      "aborted" !== this.value && (this.value = "aborted");
    }
    static mergeArray(e, t) {
      let r = [];
      for (let a of t) {
        if ("aborted" === a.status) return Z;
        ("dirty" === a.status && e.dirty(), r.push(a.value));
      }
      return { status: e.value, value: r };
    }
    static async mergeObjectAsync(t, r) {
      let a = [];
      for (let e of r) {
        let t = await e.key,
          r = await e.value;
        a.push({ key: t, value: r });
      }
      return e.mergeObjectSync(t, a);
    }
    static mergeObjectSync(e, t) {
      let r = {};
      for (let a of t) {
        let { key: t, value: i } = a;
        if ("aborted" === t.status || "aborted" === i.status) return Z;
        ("dirty" === t.status && e.dirty(),
          "dirty" === i.status && e.dirty(),
          "__proto__" !== t.value &&
            (typeof i.value < "u" || a.alwaysSet) &&
            (r[t.value] = i.value));
      }
      return { status: e.value, value: r };
    }
  },
  Z = Object.freeze({ status: "aborted" }),
  N = (e) => ({ status: "dirty", value: e }),
  q = (e) => ({ status: "valid", value: e }),
  D = (e) => "aborted" === e.status,
  L = (e) => "dirty" === e.status,
  B = (e) => "valid" === e.status,
  F = (e) => typeof Promise < "u" && e instanceof Promise;
!(function (e) {
  ((e.errToObj = (e) => ("string" == typeof e ? { message: e } : e || {})),
    (e.toString = (e) => ("string" == typeof e ? e : e?.message)));
})(O || (O = {}));
var U = class {
    constructor(e, t, r, a) {
      ((this._cachedPath = []),
        (this.parent = e),
        (this.data = t),
        (this._path = r),
        (this._key = a));
    }
    get path() {
      return (
        this._cachedPath.length ||
          (Array.isArray(this._key)
            ? this._cachedPath.push(...this._path, ...this._key)
            : this._cachedPath.push(...this._path, this._key)),
        this._cachedPath
      );
    }
  },
  z = (e, t) => {
    if (B(t)) return { success: !0, data: t.value };
    if (!e.common.issues.length)
      throw new Error("Validation failed but no issues detected.");
    return {
      success: !1,
      get error() {
        if (this._error) return this._error;
        let t = new j(e.common.issues);
        return ((this._error = t), this._error);
      },
    };
  };
function V(e) {
  if (!e) return {};
  let {
    errorMap: t,
    invalid_type_error: r,
    required_error: a,
    description: i,
  } = e;
  if (t && (r || a))
    throw new Error(
      'Can\'t use "invalid_type_error" or "required_error" in conjunction with custom error map.',
    );
  return t
    ? { errorMap: t, description: i }
    : {
        errorMap: (t, i) => {
          let { message: s } = e;
          return "invalid_enum_value" === t.code
            ? { message: s ?? i.defaultError }
            : typeof i.data > "u"
              ? { message: s ?? a ?? i.defaultError }
              : "invalid_type" !== t.code
                ? { message: i.defaultError }
                : { message: s ?? r ?? i.defaultError };
        },
        description: i,
      };
}
var W,
  K = class {
    get description() {
      return this._def.description;
    }
    _getType(e) {
      return k(e.data);
    }
    _getOrReturnCtx(e, t) {
      return (
        t || {
          common: e.parent.common,
          data: e.data,
          parsedType: k(e.data),
          schemaErrorMap: this._def.errorMap,
          path: e.path,
          parent: e.parent,
        }
      );
    }
    _processInputParams(e) {
      return {
        status: new $(),
        ctx: {
          common: e.parent.common,
          data: e.data,
          parsedType: k(e.data),
          schemaErrorMap: this._def.errorMap,
          path: e.path,
          parent: e.parent,
        },
      };
    }
    _parseSync(e) {
      let t = this._parse(e);
      if (F(t)) throw new Error("Synchronous parse encountered promise.");
      return t;
    }
    _parseAsync(e) {
      let t = this._parse(e);
      return Promise.resolve(t);
    }
    parse(e, t) {
      let r = this.safeParse(e, t);
      if (r.success) return r.data;
      throw r.error;
    }
    safeParse(e, t) {
      let r = {
          common: {
            issues: [],
            async: t?.async ?? !1,
            contextualErrorMap: t?.errorMap,
          },
          path: t?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data: e,
          parsedType: k(e),
        },
        a = this._parseSync({ data: e, path: r.path, parent: r });
      return z(r, a);
    }
    "~validate"(e) {
      let t = {
        common: { issues: [], async: !!this["~standard"].async },
        path: [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data: e,
        parsedType: k(e),
      };
      if (!this["~standard"].async)
        try {
          let r = this._parseSync({ data: e, path: [], parent: t });
          return B(r) ? { value: r.value } : { issues: t.common.issues };
        } catch (e) {
          (e?.message?.toLowerCase()?.includes("encountered") &&
            (this["~standard"].async = !0),
            (t.common = { issues: [], async: !0 }));
        }
      return this._parseAsync({ data: e, path: [], parent: t }).then((e) =>
        B(e) ? { value: e.value } : { issues: t.common.issues },
      );
    }
    async parseAsync(e, t) {
      let r = await this.safeParseAsync(e, t);
      if (r.success) return r.data;
      throw r.error;
    }
    async safeParseAsync(e, t) {
      let r = {
          common: { issues: [], contextualErrorMap: t?.errorMap, async: !0 },
          path: t?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data: e,
          parsedType: k(e),
        },
        a = this._parse({ data: e, path: r.path, parent: r }),
        i = await (F(a) ? a : Promise.resolve(a));
      return z(r, i);
    }
    refine(e, t) {
      let r = (e) =>
        "string" == typeof t || typeof t > "u"
          ? { message: t }
          : "function" == typeof t
            ? t(e)
            : t;
      return this._refinement((t, a) => {
        let i = e(t),
          s = () => a.addIssue({ code: S.custom, ...r(t) });
        return typeof Promise < "u" && i instanceof Promise
          ? i.then((e) => !!e || (s(), !1))
          : !!i || (s(), !1);
      });
    }
    refinement(e, t) {
      return this._refinement(
        (r, a) =>
          !!e(r) || (a.addIssue("function" == typeof t ? t(r, a) : t), !1),
      );
    }
    _refinement(e) {
      return new Je({
        schema: this,
        typeName: nt.ZodEffects,
        effect: { type: "refinement", refinement: e },
      });
    }
    superRefine(e) {
      return this._refinement(e);
    }
    constructor(e) {
      ((this.spa = this.safeParseAsync),
        (this._def = e),
        (this.parse = this.parse.bind(this)),
        (this.safeParse = this.safeParse.bind(this)),
        (this.parseAsync = this.parseAsync.bind(this)),
        (this.safeParseAsync = this.safeParseAsync.bind(this)),
        (this.spa = this.spa.bind(this)),
        (this.refine = this.refine.bind(this)),
        (this.refinement = this.refinement.bind(this)),
        (this.superRefine = this.superRefine.bind(this)),
        (this.optional = this.optional.bind(this)),
        (this.nullable = this.nullable.bind(this)),
        (this.nullish = this.nullish.bind(this)),
        (this.array = this.array.bind(this)),
        (this.promise = this.promise.bind(this)),
        (this.or = this.or.bind(this)),
        (this.and = this.and.bind(this)),
        (this.transform = this.transform.bind(this)),
        (this.brand = this.brand.bind(this)),
        (this.default = this.default.bind(this)),
        (this.catch = this.catch.bind(this)),
        (this.describe = this.describe.bind(this)),
        (this.pipe = this.pipe.bind(this)),
        (this.readonly = this.readonly.bind(this)),
        (this.isNullable = this.isNullable.bind(this)),
        (this.isOptional = this.isOptional.bind(this)),
        (this["~standard"] = {
          version: 1,
          vendor: "zod",
          validate: (e) => this["~validate"](e),
        }));
    }
    optional() {
      return Ge.create(this, this._def);
    }
    nullable() {
      return He.create(this, this._def);
    }
    nullish() {
      return this.nullable().optional();
    }
    array() {
      return Re.create(this);
    }
    promise() {
      return Ke.create(this, this._def);
    }
    or(e) {
      return Ae.create([this, e], this._def);
    }
    and(e) {
      return Ze.create(this, e, this._def);
    }
    transform(e) {
      return new Je({
        ...V(this._def),
        schema: this,
        typeName: nt.ZodEffects,
        effect: { type: "transform", transform: e },
      });
    }
    default(e) {
      let t = "function" == typeof e ? e : () => e;
      return new Ye({
        ...V(this._def),
        innerType: this,
        defaultValue: t,
        typeName: nt.ZodDefault,
      });
    }
    brand() {
      return new tt({ typeName: nt.ZodBranded, type: this, ...V(this._def) });
    }
    catch(e) {
      let t = "function" == typeof e ? e : () => e;
      return new Xe({
        ...V(this._def),
        innerType: this,
        catchValue: t,
        typeName: nt.ZodCatch,
      });
    }
    describe(e) {
      return new (0, this.constructor)({ ...this._def, description: e });
    }
    pipe(e) {
      return rt.create(this, e);
    }
    readonly() {
      return at.create(this);
    }
    isOptional() {
      return this.safeParse(void 0).success;
    }
    isNullable() {
      return this.safeParse(null).success;
    }
  },
  J = /^c[^\s-]{8,}$/i,
  G = /^[0-9a-z]+$/,
  H = /^[0-9A-HJKMNP-TV-Z]{26}$/i,
  Y =
    /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,
  X = /^[a-z0-9_-]{21}$/i,
  Q = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
  ee =
    /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,
  te =
    /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,
  re =
    /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ae =
    /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  ie =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
  se =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  ne = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  oe = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  ce =
    "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",
  de = new RegExp(`^${ce}$`);
function le(e) {
  let t = "[0-5]\\d";
  return (
    e.precision
      ? (t = `${t}\\.\\d{${e.precision}}`)
      : null == e.precision && (t = `${t}(\\.\\d+)?`),
    `([01]\\d|2[0-3]):[0-5]\\d(:${t})${e.precision ? "+" : "?"}`
  );
}
function ue(e) {
  return new RegExp(`^${le(e)}$`);
}
function he(e) {
  let t = `${ce}T${le(e)}`,
    r = [];
  return (
    r.push(e.local ? "Z?" : "Z"),
    e.offset && r.push("([+-]\\d{2}:?\\d{2})"),
    (t = `${t}(${r.join("|")})`),
    new RegExp(`^${t}$`)
  );
}
function me(e, t) {
  return !(
    (("v4" !== t && t) || !re.test(e)) &&
    (("v6" !== t && t) || !ie.test(e))
  );
}
function pe(e, t) {
  if (!Q.test(e)) return !1;
  try {
    let [r] = e.split(".");
    if (!r) return !1;
    let a = r
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(r.length + ((4 - (r.length % 4)) % 4), "="),
      i = JSON.parse(atob(a));
    return !(
      "object" != typeof i ||
      null === i ||
      ("typ" in i && "JWT" !== i?.typ) ||
      !i.alg ||
      (t && i.alg !== t)
    );
  } catch {
    return !1;
  }
}
function be(e, t) {
  return !(
    (("v4" !== t && t) || !ae.test(e)) &&
    (("v6" !== t && t) || !se.test(e))
  );
}
var _e = class e extends K {
  _parse(e) {
    if (
      (this._def.coerce && (e.data = String(e.data)),
      this._getType(e) !== x.string)
    ) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.string,
          received: t.parsedType,
        }),
        Z
      );
    }
    let t,
      r = new $();
    for (let a of this._def.checks)
      if ("min" === a.kind)
        e.data.length < a.value &&
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            code: S.too_small,
            minimum: a.value,
            type: "string",
            inclusive: !0,
            exact: !1,
            message: a.message,
          }),
          r.dirty());
      else if ("max" === a.kind)
        e.data.length > a.value &&
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            code: S.too_big,
            maximum: a.value,
            type: "string",
            inclusive: !0,
            exact: !1,
            message: a.message,
          }),
          r.dirty());
      else if ("length" === a.kind) {
        let i = e.data.length > a.value,
          s = e.data.length < a.value;
        (i || s) &&
          ((t = this._getOrReturnCtx(e, t)),
          i
            ? M(t, {
                code: S.too_big,
                maximum: a.value,
                type: "string",
                inclusive: !0,
                exact: !0,
                message: a.message,
              })
            : s &&
              M(t, {
                code: S.too_small,
                minimum: a.value,
                type: "string",
                inclusive: !0,
                exact: !0,
                message: a.message,
              }),
          r.dirty());
      } else if ("email" === a.kind)
        te.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "email",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("emoji" === a.kind)
        (W ||
          (W = new RegExp(
            "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",
            "u",
          )),
          W.test(e.data) ||
            ((t = this._getOrReturnCtx(e, t)),
            M(t, {
              validation: "emoji",
              code: S.invalid_string,
              message: a.message,
            }),
            r.dirty()));
      else if ("uuid" === a.kind)
        Y.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "uuid",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("nanoid" === a.kind)
        X.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "nanoid",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("cuid" === a.kind)
        J.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "cuid",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("cuid2" === a.kind)
        G.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "cuid2",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("ulid" === a.kind)
        H.test(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            validation: "ulid",
            code: S.invalid_string,
            message: a.message,
          }),
          r.dirty());
      else if ("url" === a.kind)
        try {
          new URL(e.data);
        } catch {
          ((t = this._getOrReturnCtx(e, t)),
            M(t, {
              validation: "url",
              code: S.invalid_string,
              message: a.message,
            }),
            r.dirty());
        }
      else
        "regex" === a.kind
          ? ((a.regex.lastIndex = 0),
            a.regex.test(e.data) ||
              ((t = this._getOrReturnCtx(e, t)),
              M(t, {
                validation: "regex",
                code: S.invalid_string,
                message: a.message,
              }),
              r.dirty()))
          : "trim" === a.kind
            ? (e.data = e.data.trim())
            : "includes" === a.kind
              ? e.data.includes(a.value, a.position) ||
                ((t = this._getOrReturnCtx(e, t)),
                M(t, {
                  code: S.invalid_string,
                  validation: { includes: a.value, position: a.position },
                  message: a.message,
                }),
                r.dirty())
              : "toLowerCase" === a.kind
                ? (e.data = e.data.toLowerCase())
                : "toUpperCase" === a.kind
                  ? (e.data = e.data.toUpperCase())
                  : "startsWith" === a.kind
                    ? e.data.startsWith(a.value) ||
                      ((t = this._getOrReturnCtx(e, t)),
                      M(t, {
                        code: S.invalid_string,
                        validation: { startsWith: a.value },
                        message: a.message,
                      }),
                      r.dirty())
                    : "endsWith" === a.kind
                      ? e.data.endsWith(a.value) ||
                        ((t = this._getOrReturnCtx(e, t)),
                        M(t, {
                          code: S.invalid_string,
                          validation: { endsWith: a.value },
                          message: a.message,
                        }),
                        r.dirty())
                      : "datetime" === a.kind
                        ? he(a).test(e.data) ||
                          ((t = this._getOrReturnCtx(e, t)),
                          M(t, {
                            code: S.invalid_string,
                            validation: "datetime",
                            message: a.message,
                          }),
                          r.dirty())
                        : "date" === a.kind
                          ? de.test(e.data) ||
                            ((t = this._getOrReturnCtx(e, t)),
                            M(t, {
                              code: S.invalid_string,
                              validation: "date",
                              message: a.message,
                            }),
                            r.dirty())
                          : "time" === a.kind
                            ? ue(a).test(e.data) ||
                              ((t = this._getOrReturnCtx(e, t)),
                              M(t, {
                                code: S.invalid_string,
                                validation: "time",
                                message: a.message,
                              }),
                              r.dirty())
                            : "duration" === a.kind
                              ? ee.test(e.data) ||
                                ((t = this._getOrReturnCtx(e, t)),
                                M(t, {
                                  validation: "duration",
                                  code: S.invalid_string,
                                  message: a.message,
                                }),
                                r.dirty())
                              : "ip" === a.kind
                                ? me(e.data, a.version) ||
                                  ((t = this._getOrReturnCtx(e, t)),
                                  M(t, {
                                    validation: "ip",
                                    code: S.invalid_string,
                                    message: a.message,
                                  }),
                                  r.dirty())
                                : "jwt" === a.kind
                                  ? pe(e.data, a.alg) ||
                                    ((t = this._getOrReturnCtx(e, t)),
                                    M(t, {
                                      validation: "jwt",
                                      code: S.invalid_string,
                                      message: a.message,
                                    }),
                                    r.dirty())
                                  : "cidr" === a.kind
                                    ? be(e.data, a.version) ||
                                      ((t = this._getOrReturnCtx(e, t)),
                                      M(t, {
                                        validation: "cidr",
                                        code: S.invalid_string,
                                        message: a.message,
                                      }),
                                      r.dirty())
                                    : "base64" === a.kind
                                      ? ne.test(e.data) ||
                                        ((t = this._getOrReturnCtx(e, t)),
                                        M(t, {
                                          validation: "base64",
                                          code: S.invalid_string,
                                          message: a.message,
                                        }),
                                        r.dirty())
                                      : "base64url" === a.kind
                                        ? oe.test(e.data) ||
                                          ((t = this._getOrReturnCtx(e, t)),
                                          M(t, {
                                            validation: "base64url",
                                            code: S.invalid_string,
                                            message: a.message,
                                          }),
                                          r.dirty())
                                        : f.assertNever(a);
    return { status: r.value, value: e.data };
  }
  _regex(e, t, r) {
    return this.refinement((t) => e.test(t), {
      validation: t,
      code: S.invalid_string,
      ...O.errToObj(r),
    });
  }
  _addCheck(t) {
    return new e({ ...this._def, checks: [...this._def.checks, t] });
  }
  email(e) {
    return this._addCheck({ kind: "email", ...O.errToObj(e) });
  }
  url(e) {
    return this._addCheck({ kind: "url", ...O.errToObj(e) });
  }
  emoji(e) {
    return this._addCheck({ kind: "emoji", ...O.errToObj(e) });
  }
  uuid(e) {
    return this._addCheck({ kind: "uuid", ...O.errToObj(e) });
  }
  nanoid(e) {
    return this._addCheck({ kind: "nanoid", ...O.errToObj(e) });
  }
  cuid(e) {
    return this._addCheck({ kind: "cuid", ...O.errToObj(e) });
  }
  cuid2(e) {
    return this._addCheck({ kind: "cuid2", ...O.errToObj(e) });
  }
  ulid(e) {
    return this._addCheck({ kind: "ulid", ...O.errToObj(e) });
  }
  base64(e) {
    return this._addCheck({ kind: "base64", ...O.errToObj(e) });
  }
  base64url(e) {
    return this._addCheck({ kind: "base64url", ...O.errToObj(e) });
  }
  jwt(e) {
    return this._addCheck({ kind: "jwt", ...O.errToObj(e) });
  }
  ip(e) {
    return this._addCheck({ kind: "ip", ...O.errToObj(e) });
  }
  cidr(e) {
    return this._addCheck({ kind: "cidr", ...O.errToObj(e) });
  }
  datetime(e) {
    return "string" == typeof e
      ? this._addCheck({
          kind: "datetime",
          precision: null,
          offset: !1,
          local: !1,
          message: e,
        })
      : this._addCheck({
          kind: "datetime",
          precision: typeof e?.precision > "u" ? null : e?.precision,
          offset: e?.offset ?? !1,
          local: e?.local ?? !1,
          ...O.errToObj(e?.message),
        });
  }
  date(e) {
    return this._addCheck({ kind: "date", message: e });
  }
  time(e) {
    return "string" == typeof e
      ? this._addCheck({ kind: "time", precision: null, message: e })
      : this._addCheck({
          kind: "time",
          precision: typeof e?.precision > "u" ? null : e?.precision,
          ...O.errToObj(e?.message),
        });
  }
  duration(e) {
    return this._addCheck({ kind: "duration", ...O.errToObj(e) });
  }
  regex(e, t) {
    return this._addCheck({ kind: "regex", regex: e, ...O.errToObj(t) });
  }
  includes(e, t) {
    return this._addCheck({
      kind: "includes",
      value: e,
      position: t?.position,
      ...O.errToObj(t?.message),
    });
  }
  startsWith(e, t) {
    return this._addCheck({ kind: "startsWith", value: e, ...O.errToObj(t) });
  }
  endsWith(e, t) {
    return this._addCheck({ kind: "endsWith", value: e, ...O.errToObj(t) });
  }
  min(e, t) {
    return this._addCheck({ kind: "min", value: e, ...O.errToObj(t) });
  }
  max(e, t) {
    return this._addCheck({ kind: "max", value: e, ...O.errToObj(t) });
  }
  length(e, t) {
    return this._addCheck({ kind: "length", value: e, ...O.errToObj(t) });
  }
  nonempty(e) {
    return this.min(1, O.errToObj(e));
  }
  trim() {
    return new e({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }],
    });
  }
  toLowerCase() {
    return new e({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }],
    });
  }
  toUpperCase() {
    return new e({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }],
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((e) => "datetime" === e.kind);
  }
  get isDate() {
    return !!this._def.checks.find((e) => "date" === e.kind);
  }
  get isTime() {
    return !!this._def.checks.find((e) => "time" === e.kind);
  }
  get isDuration() {
    return !!this._def.checks.find((e) => "duration" === e.kind);
  }
  get isEmail() {
    return !!this._def.checks.find((e) => "email" === e.kind);
  }
  get isURL() {
    return !!this._def.checks.find((e) => "url" === e.kind);
  }
  get isEmoji() {
    return !!this._def.checks.find((e) => "emoji" === e.kind);
  }
  get isUUID() {
    return !!this._def.checks.find((e) => "uuid" === e.kind);
  }
  get isNANOID() {
    return !!this._def.checks.find((e) => "nanoid" === e.kind);
  }
  get isCUID() {
    return !!this._def.checks.find((e) => "cuid" === e.kind);
  }
  get isCUID2() {
    return !!this._def.checks.find((e) => "cuid2" === e.kind);
  }
  get isULID() {
    return !!this._def.checks.find((e) => "ulid" === e.kind);
  }
  get isIP() {
    return !!this._def.checks.find((e) => "ip" === e.kind);
  }
  get isCIDR() {
    return !!this._def.checks.find((e) => "cidr" === e.kind);
  }
  get isBase64() {
    return !!this._def.checks.find((e) => "base64" === e.kind);
  }
  get isBase64url() {
    return !!this._def.checks.find((e) => "base64url" === e.kind);
  }
  get minLength() {
    let e = null;
    for (let t of this._def.checks)
      "min" === t.kind && (null === e || t.value > e) && (e = t.value);
    return e;
  }
  get maxLength() {
    let e = null;
    for (let t of this._def.checks)
      "max" === t.kind && (null === e || t.value < e) && (e = t.value);
    return e;
  }
};
function ye(e, t) {
  let r = (e.toString().split(".")[1] || "").length,
    a = (t.toString().split(".")[1] || "").length,
    i = r > a ? r : a;
  return (
    (Number.parseInt(e.toFixed(i).replace(".", "")) %
      Number.parseInt(t.toFixed(i).replace(".", ""))) /
    10 ** i
  );
}
_e.create = (e) =>
  new _e({
    checks: [],
    typeName: nt.ZodString,
    coerce: e?.coerce ?? !1,
    ...V(e),
  });
var fe = class e extends K {
  constructor() {
    (super(...arguments),
      (this.min = this.gte),
      (this.max = this.lte),
      (this.step = this.multipleOf));
  }
  _parse(e) {
    if (
      (this._def.coerce && (e.data = Number(e.data)),
      this._getType(e) !== x.number)
    ) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.number,
          received: t.parsedType,
        }),
        Z
      );
    }
    let t,
      r = new $();
    for (let a of this._def.checks)
      "int" === a.kind
        ? f.isInteger(e.data) ||
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            code: S.invalid_type,
            expected: "integer",
            received: "float",
            message: a.message,
          }),
          r.dirty())
        : "min" === a.kind
          ? (a.inclusive ? e.data < a.value : e.data <= a.value) &&
            ((t = this._getOrReturnCtx(e, t)),
            M(t, {
              code: S.too_small,
              minimum: a.value,
              type: "number",
              inclusive: a.inclusive,
              exact: !1,
              message: a.message,
            }),
            r.dirty())
          : "max" === a.kind
            ? (a.inclusive ? e.data > a.value : e.data >= a.value) &&
              ((t = this._getOrReturnCtx(e, t)),
              M(t, {
                code: S.too_big,
                maximum: a.value,
                type: "number",
                inclusive: a.inclusive,
                exact: !1,
                message: a.message,
              }),
              r.dirty())
            : "multipleOf" === a.kind
              ? 0 !== ye(e.data, a.value) &&
                ((t = this._getOrReturnCtx(e, t)),
                M(t, {
                  code: S.not_multiple_of,
                  multipleOf: a.value,
                  message: a.message,
                }),
                r.dirty())
              : "finite" === a.kind
                ? Number.isFinite(e.data) ||
                  ((t = this._getOrReturnCtx(e, t)),
                  M(t, { code: S.not_finite, message: a.message }),
                  r.dirty())
                : f.assertNever(a);
    return { status: r.value, value: e.data };
  }
  gte(e, t) {
    return this.setLimit("min", e, !0, O.toString(t));
  }
  gt(e, t) {
    return this.setLimit("min", e, !1, O.toString(t));
  }
  lte(e, t) {
    return this.setLimit("max", e, !0, O.toString(t));
  }
  lt(e, t) {
    return this.setLimit("max", e, !1, O.toString(t));
  }
  setLimit(t, r, a, i) {
    return new e({
      ...this._def,
      checks: [
        ...this._def.checks,
        { kind: t, value: r, inclusive: a, message: O.toString(i) },
      ],
    });
  }
  _addCheck(t) {
    return new e({ ...this._def, checks: [...this._def.checks, t] });
  }
  int(e) {
    return this._addCheck({ kind: "int", message: O.toString(e) });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !1,
      message: O.toString(e),
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !1,
      message: O.toString(e),
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !0,
      message: O.toString(e),
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !0,
      message: O.toString(e),
    });
  }
  multipleOf(e, t) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: O.toString(t),
    });
  }
  finite(e) {
    return this._addCheck({ kind: "finite", message: O.toString(e) });
  }
  safe(e) {
    return this._addCheck({
      kind: "min",
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: O.toString(e),
    })._addCheck({
      kind: "max",
      inclusive: !0,
      value: Number.MAX_SAFE_INTEGER,
      message: O.toString(e),
    });
  }
  get minValue() {
    let e = null;
    for (let t of this._def.checks)
      "min" === t.kind && (null === e || t.value > e) && (e = t.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (let t of this._def.checks)
      "max" === t.kind && (null === e || t.value < e) && (e = t.value);
    return e;
  }
  get isInt() {
    return !!this._def.checks.find(
      (e) =>
        "int" === e.kind || ("multipleOf" === e.kind && f.isInteger(e.value)),
    );
  }
  get isFinite() {
    let e = null,
      t = null;
    for (let r of this._def.checks) {
      if ("finite" === r.kind || "int" === r.kind || "multipleOf" === r.kind)
        return !0;
      "min" === r.kind
        ? (null === t || r.value > t) && (t = r.value)
        : "max" === r.kind && (null === e || r.value < e) && (e = r.value);
    }
    return Number.isFinite(t) && Number.isFinite(e);
  }
};
fe.create = (e) =>
  new fe({
    checks: [],
    typeName: nt.ZodNumber,
    coerce: e?.coerce || !1,
    ...V(e),
  });
var ge = class e extends K {
  constructor() {
    (super(...arguments), (this.min = this.gte), (this.max = this.lte));
  }
  _parse(e) {
    if (this._def.coerce)
      try {
        e.data = BigInt(e.data);
      } catch {
        return this._getInvalidInput(e);
      }
    if (this._getType(e) !== x.bigint) return this._getInvalidInput(e);
    let t,
      r = new $();
    for (let a of this._def.checks)
      "min" === a.kind
        ? (a.inclusive ? e.data < a.value : e.data <= a.value) &&
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            code: S.too_small,
            type: "bigint",
            minimum: a.value,
            inclusive: a.inclusive,
            message: a.message,
          }),
          r.dirty())
        : "max" === a.kind
          ? (a.inclusive ? e.data > a.value : e.data >= a.value) &&
            ((t = this._getOrReturnCtx(e, t)),
            M(t, {
              code: S.too_big,
              type: "bigint",
              maximum: a.value,
              inclusive: a.inclusive,
              message: a.message,
            }),
            r.dirty())
          : "multipleOf" === a.kind
            ? e.data % a.value !== BigInt(0) &&
              ((t = this._getOrReturnCtx(e, t)),
              M(t, {
                code: S.not_multiple_of,
                multipleOf: a.value,
                message: a.message,
              }),
              r.dirty())
            : f.assertNever(a);
    return { status: r.value, value: e.data };
  }
  _getInvalidInput(e) {
    let t = this._getOrReturnCtx(e);
    return (
      M(t, {
        code: S.invalid_type,
        expected: x.bigint,
        received: t.parsedType,
      }),
      Z
    );
  }
  gte(e, t) {
    return this.setLimit("min", e, !0, O.toString(t));
  }
  gt(e, t) {
    return this.setLimit("min", e, !1, O.toString(t));
  }
  lte(e, t) {
    return this.setLimit("max", e, !0, O.toString(t));
  }
  lt(e, t) {
    return this.setLimit("max", e, !1, O.toString(t));
  }
  setLimit(t, r, a, i) {
    return new e({
      ...this._def,
      checks: [
        ...this._def.checks,
        { kind: t, value: r, inclusive: a, message: O.toString(i) },
      ],
    });
  }
  _addCheck(t) {
    return new e({ ...this._def, checks: [...this._def.checks, t] });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !1,
      message: O.toString(e),
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !1,
      message: O.toString(e),
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !0,
      message: O.toString(e),
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !0,
      message: O.toString(e),
    });
  }
  multipleOf(e, t) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: O.toString(t),
    });
  }
  get minValue() {
    let e = null;
    for (let t of this._def.checks)
      "min" === t.kind && (null === e || t.value > e) && (e = t.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (let t of this._def.checks)
      "max" === t.kind && (null === e || t.value < e) && (e = t.value);
    return e;
  }
};
ge.create = (e) =>
  new ge({
    checks: [],
    typeName: nt.ZodBigInt,
    coerce: e?.coerce ?? !1,
    ...V(e),
  });
var we = class extends K {
  _parse(e) {
    if (
      (this._def.coerce && (e.data = !!e.data), this._getType(e) !== x.boolean)
    ) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.boolean,
          received: t.parsedType,
        }),
        Z
      );
    }
    return q(e.data);
  }
};
we.create = (e) =>
  new we({ typeName: nt.ZodBoolean, coerce: e?.coerce || !1, ...V(e) });
var ve = class e extends K {
  _parse(e) {
    if (
      (this._def.coerce && (e.data = new Date(e.data)),
      this._getType(e) !== x.date)
    ) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.date,
          received: t.parsedType,
        }),
        Z
      );
    }
    if (Number.isNaN(e.data.getTime())) {
      return (M(this._getOrReturnCtx(e), { code: S.invalid_date }), Z);
    }
    let t,
      r = new $();
    for (let a of this._def.checks)
      "min" === a.kind
        ? e.data.getTime() < a.value &&
          ((t = this._getOrReturnCtx(e, t)),
          M(t, {
            code: S.too_small,
            message: a.message,
            inclusive: !0,
            exact: !1,
            minimum: a.value,
            type: "date",
          }),
          r.dirty())
        : "max" === a.kind
          ? e.data.getTime() > a.value &&
            ((t = this._getOrReturnCtx(e, t)),
            M(t, {
              code: S.too_big,
              message: a.message,
              inclusive: !0,
              exact: !1,
              maximum: a.value,
              type: "date",
            }),
            r.dirty())
          : f.assertNever(a);
    return { status: r.value, value: new Date(e.data.getTime()) };
  }
  _addCheck(t) {
    return new e({ ...this._def, checks: [...this._def.checks, t] });
  }
  min(e, t) {
    return this._addCheck({
      kind: "min",
      value: e.getTime(),
      message: O.toString(t),
    });
  }
  max(e, t) {
    return this._addCheck({
      kind: "max",
      value: e.getTime(),
      message: O.toString(t),
    });
  }
  get minDate() {
    let e = null;
    for (let t of this._def.checks)
      "min" === t.kind && (null === e || t.value > e) && (e = t.value);
    return null != e ? new Date(e) : null;
  }
  get maxDate() {
    let e = null;
    for (let t of this._def.checks)
      "max" === t.kind && (null === e || t.value < e) && (e = t.value);
    return null != e ? new Date(e) : null;
  }
};
ve.create = (e) =>
  new ve({
    checks: [],
    coerce: e?.coerce || !1,
    typeName: nt.ZodDate,
    ...V(e),
  });
var xe = class extends K {
  _parse(e) {
    if (this._getType(e) !== x.symbol) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.symbol,
          received: t.parsedType,
        }),
        Z
      );
    }
    return q(e.data);
  }
};
xe.create = (e) => new xe({ typeName: nt.ZodSymbol, ...V(e) });
var ke = class extends K {
  _parse(e) {
    if (this._getType(e) !== x.undefined) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.undefined,
          received: t.parsedType,
        }),
        Z
      );
    }
    return q(e.data);
  }
};
ke.create = (e) => new ke({ typeName: nt.ZodUndefined, ...V(e) });
var Se = class extends K {
  _parse(e) {
    if (this._getType(e) !== x.null) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.null,
          received: t.parsedType,
        }),
        Z
      );
    }
    return q(e.data);
  }
};
Se.create = (e) => new Se({ typeName: nt.ZodNull, ...V(e) });
var Te = class extends K {
  constructor() {
    (super(...arguments), (this._any = !0));
  }
  _parse(e) {
    return q(e.data);
  }
};
Te.create = (e) => new Te({ typeName: nt.ZodAny, ...V(e) });
var je = class extends K {
  constructor() {
    (super(...arguments), (this._unknown = !0));
  }
  _parse(e) {
    return q(e.data);
  }
};
je.create = (e) => new je({ typeName: nt.ZodUnknown, ...V(e) });
var Ie = class extends K {
  _parse(e) {
    let t = this._getOrReturnCtx(e);
    return (
      M(t, { code: S.invalid_type, expected: x.never, received: t.parsedType }),
      Z
    );
  }
};
Ie.create = (e) => new Ie({ typeName: nt.ZodNever, ...V(e) });
var Ce = class extends K {
  _parse(e) {
    if (this._getType(e) !== x.undefined) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.void,
          received: t.parsedType,
        }),
        Z
      );
    }
    return q(e.data);
  }
};
Ce.create = (e) => new Ce({ typeName: nt.ZodVoid, ...V(e) });
var Re = class e extends K {
  _parse(e) {
    let { ctx: t, status: r } = this._processInputParams(e),
      a = this._def;
    if (t.parsedType !== x.array)
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.array,
          received: t.parsedType,
        }),
        Z
      );
    if (null !== a.exactLength) {
      let e = t.data.length > a.exactLength.value,
        i = t.data.length < a.exactLength.value;
      (e || i) &&
        (M(t, {
          code: e ? S.too_big : S.too_small,
          minimum: i ? a.exactLength.value : void 0,
          maximum: e ? a.exactLength.value : void 0,
          type: "array",
          inclusive: !0,
          exact: !0,
          message: a.exactLength.message,
        }),
        r.dirty());
    }
    if (
      (null !== a.minLength &&
        t.data.length < a.minLength.value &&
        (M(t, {
          code: S.too_small,
          minimum: a.minLength.value,
          type: "array",
          inclusive: !0,
          exact: !1,
          message: a.minLength.message,
        }),
        r.dirty()),
      null !== a.maxLength &&
        t.data.length > a.maxLength.value &&
        (M(t, {
          code: S.too_big,
          maximum: a.maxLength.value,
          type: "array",
          inclusive: !0,
          exact: !1,
          message: a.maxLength.message,
        }),
        r.dirty()),
      t.common.async)
    )
      return Promise.all(
        [...t.data].map((e, r) => a.type._parseAsync(new U(t, e, t.path, r))),
      ).then((e) => $.mergeArray(r, e));
    let i = [...t.data].map((e, r) =>
      a.type._parseSync(new U(t, e, t.path, r)),
    );
    return $.mergeArray(r, i);
  }
  get element() {
    return this._def.type;
  }
  min(t, r) {
    return new e({
      ...this._def,
      minLength: { value: t, message: O.toString(r) },
    });
  }
  max(t, r) {
    return new e({
      ...this._def,
      maxLength: { value: t, message: O.toString(r) },
    });
  }
  length(t, r) {
    return new e({
      ...this._def,
      exactLength: { value: t, message: O.toString(r) },
    });
  }
  nonempty(e) {
    return this.min(1, e);
  }
};
function Pe(e) {
  if (e instanceof Ee) {
    let t = {};
    for (let r in e.shape) {
      let a = e.shape[r];
      t[r] = Ge.create(Pe(a));
    }
    return new Ee({ ...e._def, shape: () => t });
  }
  return e instanceof Re
    ? new Re({ ...e._def, type: Pe(e.element) })
    : e instanceof Ge
      ? Ge.create(Pe(e.unwrap()))
      : e instanceof He
        ? He.create(Pe(e.unwrap()))
        : e instanceof Ne
          ? Ne.create(e.items.map((e) => Pe(e)))
          : e;
}
Re.create = (e, t) =>
  new Re({
    type: e,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: nt.ZodArray,
    ...V(t),
  });
var Ee = class e extends K {
  constructor() {
    (super(...arguments),
      (this._cached = null),
      (this.nonstrict = this.passthrough),
      (this.augment = this.extend));
  }
  _getCached() {
    if (null !== this._cached) return this._cached;
    let e = this._def.shape(),
      t = f.objectKeys(e);
    return ((this._cached = { shape: e, keys: t }), this._cached);
  }
  _parse(e) {
    if (this._getType(e) !== x.object) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.object,
          received: t.parsedType,
        }),
        Z
      );
    }
    let { status: t, ctx: r } = this._processInputParams(e),
      { shape: a, keys: i } = this._getCached(),
      s = [];
    if (!(
      this._def.catchall instanceof Ie && "strip" === this._def.unknownKeys
    ))
      for (let e in r.data) i.includes(e) || s.push(e);
    let n = [];
    for (let e of i) {
      let t = a[e],
        i = r.data[e];
      n.push({
        key: { status: "valid", value: e },
        value: t._parse(new U(r, i, r.path, e)),
        alwaysSet: e in r.data,
      });
    }
    if (this._def.catchall instanceof Ie) {
      let e = this._def.unknownKeys;
      if ("passthrough" === e)
        for (let e of s)
          n.push({
            key: { status: "valid", value: e },
            value: { status: "valid", value: r.data[e] },
          });
      else if ("strict" === e)
        s.length > 0 &&
          (M(r, { code: S.unrecognized_keys, keys: s }), t.dirty());
      else if ("strip" !== e)
        throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      let e = this._def.catchall;
      for (let t of s) {
        let a = r.data[t];
        n.push({
          key: { status: "valid", value: t },
          value: e._parse(new U(r, a, r.path, t)),
          alwaysSet: t in r.data,
        });
      }
    }
    return r.common.async
      ? Promise.resolve()
          .then(async () => {
            let e = [];
            for (let t of n) {
              let r = await t.key,
                a = await t.value;
              e.push({ key: r, value: a, alwaysSet: t.alwaysSet });
            }
            return e;
          })
          .then((e) => $.mergeObjectSync(t, e))
      : $.mergeObjectSync(t, n);
  }
  get shape() {
    return this._def.shape();
  }
  strict(t) {
    return (
      O.errToObj,
      new e({
        ...this._def,
        unknownKeys: "strict",
        ...(void 0 !== t
          ? {
              errorMap: (e, r) => {
                let a = this._def.errorMap?.(e, r).message ?? r.defaultError;
                return "unrecognized_keys" === e.code
                  ? { message: O.errToObj(t).message ?? a }
                  : { message: a };
              },
            }
          : {}),
      })
    );
  }
  strip() {
    return new e({ ...this._def, unknownKeys: "strip" });
  }
  passthrough() {
    return new e({ ...this._def, unknownKeys: "passthrough" });
  }
  extend(t) {
    return new e({
      ...this._def,
      shape: () => ({ ...this._def.shape(), ...t }),
    });
  }
  merge(t) {
    return new e({
      unknownKeys: t._def.unknownKeys,
      catchall: t._def.catchall,
      shape: () => ({ ...this._def.shape(), ...t._def.shape() }),
      typeName: nt.ZodObject,
    });
  }
  setKey(e, t) {
    return this.augment({ [e]: t });
  }
  catchall(t) {
    return new e({ ...this._def, catchall: t });
  }
  pick(t) {
    let r = {};
    for (let e of f.objectKeys(t))
      t[e] && this.shape[e] && (r[e] = this.shape[e]);
    return new e({ ...this._def, shape: () => r });
  }
  omit(t) {
    let r = {};
    for (let e of f.objectKeys(this.shape)) t[e] || (r[e] = this.shape[e]);
    return new e({ ...this._def, shape: () => r });
  }
  deepPartial() {
    return Pe(this);
  }
  partial(t) {
    let r = {};
    for (let e of f.objectKeys(this.shape)) {
      let a = this.shape[e];
      t && !t[e] ? (r[e] = a) : (r[e] = a.optional());
    }
    return new e({ ...this._def, shape: () => r });
  }
  required(t) {
    let r = {};
    for (let e of f.objectKeys(this.shape))
      if (t && !t[e]) r[e] = this.shape[e];
      else {
        let t = this.shape[e];
        for (; t instanceof Ge;) t = t._def.innerType;
        r[e] = t;
      }
    return new e({ ...this._def, shape: () => r });
  }
  keyof() {
    return ze(f.objectKeys(this.shape));
  }
};
((Ee.create = (e, t) =>
  new Ee({
    shape: () => e,
    unknownKeys: "strip",
    catchall: Ie.create(),
    typeName: nt.ZodObject,
    ...V(t),
  })),
  (Ee.strictCreate = (e, t) =>
    new Ee({
      shape: () => e,
      unknownKeys: "strict",
      catchall: Ie.create(),
      typeName: nt.ZodObject,
      ...V(t),
    })),
  (Ee.lazycreate = (e, t) =>
    new Ee({
      shape: e,
      unknownKeys: "strip",
      catchall: Ie.create(),
      typeName: nt.ZodObject,
      ...V(t),
    })));
var Ae = class extends K {
  _parse(e) {
    let { ctx: t } = this._processInputParams(e),
      r = this._def.options;
    if (t.common.async)
      return Promise.all(
        r.map(async (e) => {
          let r = { ...t, common: { ...t.common, issues: [] }, parent: null };
          return {
            result: await e._parseAsync({
              data: t.data,
              path: t.path,
              parent: r,
            }),
            ctx: r,
          };
        }),
      ).then(function (e) {
        for (let t of e) if ("valid" === t.result.status) return t.result;
        for (let r of e)
          if ("dirty" === r.result.status)
            return (t.common.issues.push(...r.ctx.common.issues), r.result);
        let r = e.map((e) => new j(e.ctx.common.issues));
        return (M(t, { code: S.invalid_union, unionErrors: r }), Z);
      });
    {
      let e,
        a = [];
      for (let i of r) {
        let r = { ...t, common: { ...t.common, issues: [] }, parent: null },
          s = i._parseSync({ data: t.data, path: t.path, parent: r });
        if ("valid" === s.status) return s;
        ("dirty" === s.status && !e && (e = { result: s, ctx: r }),
          r.common.issues.length && a.push(r.common.issues));
      }
      if (e) return (t.common.issues.push(...e.ctx.common.issues), e.result);
      let i = a.map((e) => new j(e));
      return (M(t, { code: S.invalid_union, unionErrors: i }), Z);
    }
  }
  get options() {
    return this._def.options;
  }
};
Ae.create = (e, t) => new Ae({ options: e, typeName: nt.ZodUnion, ...V(t) });
var Me = (e) =>
    e instanceof Fe
      ? Me(e.schema)
      : e instanceof Je
        ? Me(e.innerType())
        : e instanceof Ue
          ? [e.value]
          : e instanceof Ve
            ? e.options
            : e instanceof We
              ? f.objectValues(e.enum)
              : e instanceof Ye
                ? Me(e._def.innerType)
                : e instanceof ke
                  ? [void 0]
                  : e instanceof Se
                    ? [null]
                    : e instanceof Ge
                      ? [void 0, ...Me(e.unwrap())]
                      : e instanceof He
                        ? [null, ...Me(e.unwrap())]
                        : e instanceof tt || e instanceof at
                          ? Me(e.unwrap())
                          : e instanceof Xe
                            ? Me(e._def.innerType)
                            : [],
  Oe = class e extends K {
    _parse(e) {
      let { ctx: t } = this._processInputParams(e);
      if (t.parsedType !== x.object)
        return (
          M(t, {
            code: S.invalid_type,
            expected: x.object,
            received: t.parsedType,
          }),
          Z
        );
      let r = this.discriminator,
        a = t.data[r],
        i = this.optionsMap.get(a);
      return i
        ? t.common.async
          ? i._parseAsync({ data: t.data, path: t.path, parent: t })
          : i._parseSync({ data: t.data, path: t.path, parent: t })
        : (M(t, {
            code: S.invalid_union_discriminator,
            options: Array.from(this.optionsMap.keys()),
            path: [r],
          }),
          Z);
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    static create(t, r, a) {
      let i = new Map();
      for (let e of r) {
        let r = Me(e.shape[t]);
        if (!r.length)
          throw new Error(
            `A discriminator value for key \`${t}\` could not be extracted from all schema options`,
          );
        for (let a of r) {
          if (i.has(a))
            throw new Error(
              `Discriminator property ${String(t)} has duplicate value ${String(a)}`,
            );
          i.set(a, e);
        }
      }
      return new e({
        typeName: nt.ZodDiscriminatedUnion,
        discriminator: t,
        options: r,
        optionsMap: i,
        ...V(a),
      });
    }
  };
function $e(e, t) {
  let r = k(e),
    a = k(t);
  if (e === t) return { valid: !0, data: e };
  if (r === x.object && a === x.object) {
    let r = f.objectKeys(t),
      a = f.objectKeys(e).filter((e) => -1 !== r.indexOf(e)),
      i = { ...e, ...t };
    for (let r of a) {
      let a = $e(e[r], t[r]);
      if (!a.valid) return { valid: !1 };
      i[r] = a.data;
    }
    return { valid: !0, data: i };
  }
  if (r === x.array && a === x.array) {
    if (e.length !== t.length) return { valid: !1 };
    let r = [];
    for (let a = 0; a < e.length; a++) {
      let i = $e(e[a], t[a]);
      if (!i.valid) return { valid: !1 };
      r.push(i.data);
    }
    return { valid: !0, data: r };
  }
  return r === x.date && a === x.date && +e == +t
    ? { valid: !0, data: e }
    : { valid: !1 };
}
var Ze = class extends K {
  _parse(e) {
    let { status: t, ctx: r } = this._processInputParams(e),
      a = (e, a) => {
        if (D(e) || D(a)) return Z;
        let i = $e(e.value, a.value);
        return i.valid
          ? ((L(e) || L(a)) && t.dirty(), { status: t.value, value: i.data })
          : (M(r, { code: S.invalid_intersection_types }), Z);
      };
    return r.common.async
      ? Promise.all([
          this._def.left._parseAsync({ data: r.data, path: r.path, parent: r }),
          this._def.right._parseAsync({
            data: r.data,
            path: r.path,
            parent: r,
          }),
        ]).then(([e, t]) => a(e, t))
      : a(
          this._def.left._parseSync({ data: r.data, path: r.path, parent: r }),
          this._def.right._parseSync({ data: r.data, path: r.path, parent: r }),
        );
  }
};
Ze.create = (e, t, r) =>
  new Ze({ left: e, right: t, typeName: nt.ZodIntersection, ...V(r) });
var Ne = class e extends K {
  _parse(e) {
    let { status: t, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== x.array)
      return (
        M(r, {
          code: S.invalid_type,
          expected: x.array,
          received: r.parsedType,
        }),
        Z
      );
    if (r.data.length < this._def.items.length)
      return (
        M(r, {
          code: S.too_small,
          minimum: this._def.items.length,
          inclusive: !0,
          exact: !1,
          type: "array",
        }),
        Z
      );
    !this._def.rest &&
      r.data.length > this._def.items.length &&
      (M(r, {
        code: S.too_big,
        maximum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array",
      }),
      t.dirty());
    let a = [...r.data]
      .map((e, t) => {
        let a = this._def.items[t] || this._def.rest;
        return a ? a._parse(new U(r, e, r.path, t)) : null;
      })
      .filter((e) => !!e);
    return r.common.async
      ? Promise.all(a).then((e) => $.mergeArray(t, e))
      : $.mergeArray(t, a);
  }
  get items() {
    return this._def.items;
  }
  rest(t) {
    return new e({ ...this._def, rest: t });
  }
};
Ne.create = (e, t) => {
  if (!Array.isArray(e))
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  return new Ne({ items: e, typeName: nt.ZodTuple, rest: null, ...V(t) });
};
var qe = class e extends K {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(e) {
      let { status: t, ctx: r } = this._processInputParams(e);
      if (r.parsedType !== x.object)
        return (
          M(r, {
            code: S.invalid_type,
            expected: x.object,
            received: r.parsedType,
          }),
          Z
        );
      let a = [],
        i = this._def.keyType,
        s = this._def.valueType;
      for (let e in r.data)
        a.push({
          key: i._parse(new U(r, e, r.path, e)),
          value: s._parse(new U(r, r.data[e], r.path, e)),
          alwaysSet: e in r.data,
        });
      return r.common.async
        ? $.mergeObjectAsync(t, a)
        : $.mergeObjectSync(t, a);
    }
    get element() {
      return this._def.valueType;
    }
    static create(t, r, a) {
      return new e(
        r instanceof K
          ? { keyType: t, valueType: r, typeName: nt.ZodRecord, ...V(a) }
          : {
              keyType: _e.create(),
              valueType: t,
              typeName: nt.ZodRecord,
              ...V(r),
            },
      );
    }
  },
  De = class extends K {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(e) {
      let { status: t, ctx: r } = this._processInputParams(e);
      if (r.parsedType !== x.map)
        return (
          M(r, {
            code: S.invalid_type,
            expected: x.map,
            received: r.parsedType,
          }),
          Z
        );
      let a = this._def.keyType,
        i = this._def.valueType,
        s = [...r.data.entries()].map(([e, t], s) => ({
          key: a._parse(new U(r, e, r.path, [s, "key"])),
          value: i._parse(new U(r, t, r.path, [s, "value"])),
        }));
      if (r.common.async) {
        let e = new Map();
        return Promise.resolve().then(async () => {
          for (let r of s) {
            let a = await r.key,
              i = await r.value;
            if ("aborted" === a.status || "aborted" === i.status) return Z;
            (("dirty" === a.status || "dirty" === i.status) && t.dirty(),
              e.set(a.value, i.value));
          }
          return { status: t.value, value: e };
        });
      }
      {
        let e = new Map();
        for (let r of s) {
          let a = r.key,
            i = r.value;
          if ("aborted" === a.status || "aborted" === i.status) return Z;
          (("dirty" === a.status || "dirty" === i.status) && t.dirty(),
            e.set(a.value, i.value));
        }
        return { status: t.value, value: e };
      }
    }
  };
De.create = (e, t, r) =>
  new De({ valueType: t, keyType: e, typeName: nt.ZodMap, ...V(r) });
var Le = class e extends K {
  _parse(e) {
    let { status: t, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== x.set)
      return (
        M(r, { code: S.invalid_type, expected: x.set, received: r.parsedType }),
        Z
      );
    let a = this._def;
    (null !== a.minSize &&
      r.data.size < a.minSize.value &&
      (M(r, {
        code: S.too_small,
        minimum: a.minSize.value,
        type: "set",
        inclusive: !0,
        exact: !1,
        message: a.minSize.message,
      }),
      t.dirty()),
      null !== a.maxSize &&
        r.data.size > a.maxSize.value &&
        (M(r, {
          code: S.too_big,
          maximum: a.maxSize.value,
          type: "set",
          inclusive: !0,
          exact: !1,
          message: a.maxSize.message,
        }),
        t.dirty()));
    let i = this._def.valueType;
    function s(e) {
      let r = new Set();
      for (let a of e) {
        if ("aborted" === a.status) return Z;
        ("dirty" === a.status && t.dirty(), r.add(a.value));
      }
      return { status: t.value, value: r };
    }
    let n = [...r.data.values()].map((e, t) =>
      i._parse(new U(r, e, r.path, t)),
    );
    return r.common.async ? Promise.all(n).then((e) => s(e)) : s(n);
  }
  min(t, r) {
    return new e({
      ...this._def,
      minSize: { value: t, message: O.toString(r) },
    });
  }
  max(t, r) {
    return new e({
      ...this._def,
      maxSize: { value: t, message: O.toString(r) },
    });
  }
  size(e, t) {
    return this.min(e, t).max(e, t);
  }
  nonempty(e) {
    return this.min(1, e);
  }
};
Le.create = (e, t) =>
  new Le({
    valueType: e,
    minSize: null,
    maxSize: null,
    typeName: nt.ZodSet,
    ...V(t),
  });
var Be = class e extends K {
    constructor() {
      (super(...arguments), (this.validate = this.implement));
    }
    _parse(e) {
      let { ctx: t } = this._processInputParams(e);
      if (t.parsedType !== x.function)
        return (
          M(t, {
            code: S.invalid_type,
            expected: x.function,
            received: t.parsedType,
          }),
          Z
        );
      function r(e, r) {
        return E({
          data: e,
          path: t.path,
          errorMaps: [
            t.common.contextualErrorMap,
            t.schemaErrorMap,
            P(),
            I,
          ].filter((e) => !!e),
          issueData: { code: S.invalid_arguments, argumentsError: r },
        });
      }
      function a(e, r) {
        return E({
          data: e,
          path: t.path,
          errorMaps: [
            t.common.contextualErrorMap,
            t.schemaErrorMap,
            P(),
            I,
          ].filter((e) => !!e),
          issueData: { code: S.invalid_return_type, returnTypeError: r },
        });
      }
      let i = { errorMap: t.common.contextualErrorMap },
        s = t.data;
      if (this._def.returns instanceof Ke) {
        let e = this;
        return q(async function (...t) {
          let n = new j([]),
            o = await e._def.args.parseAsync(t, i).catch((e) => {
              throw (n.addIssue(r(t, e)), n);
            }),
            c = await Reflect.apply(s, this, o);
          return await e._def.returns._def.type.parseAsync(c, i).catch((e) => {
            throw (n.addIssue(a(c, e)), n);
          });
        });
      }
      {
        let e = this;
        return q(function (...t) {
          let n = e._def.args.safeParse(t, i);
          if (!n.success) throw new j([r(t, n.error)]);
          let o = Reflect.apply(s, this, n.data),
            c = e._def.returns.safeParse(o, i);
          if (!c.success) throw new j([a(o, c.error)]);
          return c.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...t) {
      return new e({ ...this._def, args: Ne.create(t).rest(je.create()) });
    }
    returns(t) {
      return new e({ ...this._def, returns: t });
    }
    implement(e) {
      return this.parse(e);
    }
    strictImplement(e) {
      return this.parse(e);
    }
    static create(t, r, a) {
      return new e({
        args: t || Ne.create([]).rest(je.create()),
        returns: r || je.create(),
        typeName: nt.ZodFunction,
        ...V(a),
      });
    }
  },
  Fe = class extends K {
    get schema() {
      return this._def.getter();
    }
    _parse(e) {
      let { ctx: t } = this._processInputParams(e);
      return this._def
        .getter()
        ._parse({ data: t.data, path: t.path, parent: t });
    }
  };
Fe.create = (e, t) => new Fe({ getter: e, typeName: nt.ZodLazy, ...V(t) });
var Ue = class extends K {
  _parse(e) {
    if (e.data !== this._def.value) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, {
          received: t.data,
          code: S.invalid_literal,
          expected: this._def.value,
        }),
        Z
      );
    }
    return { status: "valid", value: e.data };
  }
  get value() {
    return this._def.value;
  }
};
function ze(e, t) {
  return new Ve({ values: e, typeName: nt.ZodEnum, ...V(t) });
}
Ue.create = (e, t) => new Ue({ value: e, typeName: nt.ZodLiteral, ...V(t) });
var Ve = class e extends K {
  _parse(e) {
    if ("string" != typeof e.data) {
      let t = this._getOrReturnCtx(e),
        r = this._def.values;
      return (
        M(t, {
          expected: f.joinValues(r),
          received: t.parsedType,
          code: S.invalid_type,
        }),
        Z
      );
    }
    if (
      (this._cache || (this._cache = new Set(this._def.values)),
      !this._cache.has(e.data))
    ) {
      let t = this._getOrReturnCtx(e),
        r = this._def.values;
      return (
        M(t, { received: t.data, code: S.invalid_enum_value, options: r }),
        Z
      );
    }
    return q(e.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    let e = {};
    for (let t of this._def.values) e[t] = t;
    return e;
  }
  get Values() {
    let e = {};
    for (let t of this._def.values) e[t] = t;
    return e;
  }
  get Enum() {
    let e = {};
    for (let t of this._def.values) e[t] = t;
    return e;
  }
  extract(t, r = this._def) {
    return e.create(t, { ...this._def, ...r });
  }
  exclude(t, r = this._def) {
    return e.create(
      this.options.filter((e) => !t.includes(e)),
      { ...this._def, ...r },
    );
  }
};
Ve.create = ze;
var We = class extends K {
  _parse(e) {
    let t = f.getValidEnumValues(this._def.values),
      r = this._getOrReturnCtx(e);
    if (r.parsedType !== x.string && r.parsedType !== x.number) {
      let e = f.objectValues(t);
      return (
        M(r, {
          expected: f.joinValues(e),
          received: r.parsedType,
          code: S.invalid_type,
        }),
        Z
      );
    }
    if (
      (this._cache ||
        (this._cache = new Set(f.getValidEnumValues(this._def.values))),
      !this._cache.has(e.data))
    ) {
      let e = f.objectValues(t);
      return (
        M(r, { received: r.data, code: S.invalid_enum_value, options: e }),
        Z
      );
    }
    return q(e.data);
  }
  get enum() {
    return this._def.values;
  }
};
We.create = (e, t) =>
  new We({ values: e, typeName: nt.ZodNativeEnum, ...V(t) });
var Ke = class extends K {
  unwrap() {
    return this._def.type;
  }
  _parse(e) {
    let { ctx: t } = this._processInputParams(e);
    if (t.parsedType !== x.promise && !1 === t.common.async)
      return (
        M(t, {
          code: S.invalid_type,
          expected: x.promise,
          received: t.parsedType,
        }),
        Z
      );
    let r = t.parsedType === x.promise ? t.data : Promise.resolve(t.data);
    return q(
      r.then((e) =>
        this._def.type.parseAsync(e, {
          path: t.path,
          errorMap: t.common.contextualErrorMap,
        }),
      ),
    );
  }
};
Ke.create = (e, t) => new Ke({ type: e, typeName: nt.ZodPromise, ...V(t) });
var Je = class extends K {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === nt.ZodEffects
      ? this._def.schema.sourceType()
      : this._def.schema;
  }
  _parse(e) {
    let { status: t, ctx: r } = this._processInputParams(e),
      a = this._def.effect || null,
      i = {
        addIssue: (e) => {
          (M(r, e), e.fatal ? t.abort() : t.dirty());
        },
        get path() {
          return r.path;
        },
      };
    if (((i.addIssue = i.addIssue.bind(i)), "preprocess" === a.type)) {
      let e = a.transform(r.data, i);
      if (r.common.async)
        return Promise.resolve(e).then(async (e) => {
          if ("aborted" === t.value) return Z;
          let a = await this._def.schema._parseAsync({
            data: e,
            path: r.path,
            parent: r,
          });
          return "aborted" === a.status
            ? Z
            : "dirty" === a.status || "dirty" === t.value
              ? N(a.value)
              : a;
        });
      {
        if ("aborted" === t.value) return Z;
        let a = this._def.schema._parseSync({
          data: e,
          path: r.path,
          parent: r,
        });
        return "aborted" === a.status
          ? Z
          : "dirty" === a.status || "dirty" === t.value
            ? N(a.value)
            : a;
      }
    }
    if ("refinement" === a.type) {
      let e = (e) => {
        let t = a.refinement(e, i);
        if (r.common.async) return Promise.resolve(t);
        if (t instanceof Promise)
          throw new Error(
            "Async refinement encountered during synchronous parse operation. Use .parseAsync instead.",
          );
        return e;
      };
      if (!1 === r.common.async) {
        let a = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r,
        });
        return "aborted" === a.status
          ? Z
          : ("dirty" === a.status && t.dirty(),
            e(a.value),
            { status: t.value, value: a.value });
      }
      return this._def.schema
        ._parseAsync({ data: r.data, path: r.path, parent: r })
        .then((r) =>
          "aborted" === r.status
            ? Z
            : ("dirty" === r.status && t.dirty(),
              e(r.value).then(() => ({ status: t.value, value: r.value }))),
        );
    }
    if ("transform" === a.type) {
      if (!1 === r.common.async) {
        let e = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r,
        });
        if (!B(e)) return Z;
        let s = a.transform(e.value, i);
        if (s instanceof Promise)
          throw new Error(
            "Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.",
          );
        return { status: t.value, value: s };
      }
      return this._def.schema
        ._parseAsync({ data: r.data, path: r.path, parent: r })
        .then((e) =>
          B(e)
            ? Promise.resolve(a.transform(e.value, i)).then((e) => ({
                status: t.value,
                value: e,
              }))
            : Z,
        );
    }
    f.assertNever(a);
  }
};
((Je.create = (e, t, r) =>
  new Je({ schema: e, typeName: nt.ZodEffects, effect: t, ...V(r) })),
  (Je.createWithPreprocess = (e, t, r) =>
    new Je({
      schema: t,
      effect: { type: "preprocess", transform: e },
      typeName: nt.ZodEffects,
      ...V(r),
    })));
var Ge = class extends K {
  _parse(e) {
    return this._getType(e) === x.undefined
      ? q(void 0)
      : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
};
Ge.create = (e, t) =>
  new Ge({ innerType: e, typeName: nt.ZodOptional, ...V(t) });
var He = class extends K {
  _parse(e) {
    return this._getType(e) === x.null
      ? q(null)
      : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
};
He.create = (e, t) =>
  new He({ innerType: e, typeName: nt.ZodNullable, ...V(t) });
var Ye = class extends K {
  _parse(e) {
    let { ctx: t } = this._processInputParams(e),
      r = t.data;
    return (
      t.parsedType === x.undefined && (r = this._def.defaultValue()),
      this._def.innerType._parse({ data: r, path: t.path, parent: t })
    );
  }
  removeDefault() {
    return this._def.innerType;
  }
};
Ye.create = (e, t) =>
  new Ye({
    innerType: e,
    typeName: nt.ZodDefault,
    defaultValue: "function" == typeof t.default ? t.default : () => t.default,
    ...V(t),
  });
var Xe = class extends K {
  _parse(e) {
    let { ctx: t } = this._processInputParams(e),
      r = { ...t, common: { ...t.common, issues: [] } },
      a = this._def.innerType._parse({
        data: r.data,
        path: r.path,
        parent: { ...r },
      });
    return F(a)
      ? a.then((e) => ({
          status: "valid",
          value:
            "valid" === e.status
              ? e.value
              : this._def.catchValue({
                  get error() {
                    return new j(r.common.issues);
                  },
                  input: r.data,
                }),
        }))
      : {
          status: "valid",
          value:
            "valid" === a.status
              ? a.value
              : this._def.catchValue({
                  get error() {
                    return new j(r.common.issues);
                  },
                  input: r.data,
                }),
        };
  }
  removeCatch() {
    return this._def.innerType;
  }
};
Xe.create = (e, t) =>
  new Xe({
    innerType: e,
    typeName: nt.ZodCatch,
    catchValue: "function" == typeof t.catch ? t.catch : () => t.catch,
    ...V(t),
  });
var Qe = class extends K {
  _parse(e) {
    if (this._getType(e) !== x.nan) {
      let t = this._getOrReturnCtx(e);
      return (
        M(t, { code: S.invalid_type, expected: x.nan, received: t.parsedType }),
        Z
      );
    }
    return { status: "valid", value: e.data };
  }
};
Qe.create = (e) => new Qe({ typeName: nt.ZodNaN, ...V(e) });
var et = Symbol("zod_brand"),
  tt = class extends K {
    _parse(e) {
      let { ctx: t } = this._processInputParams(e),
        r = t.data;
      return this._def.type._parse({ data: r, path: t.path, parent: t });
    }
    unwrap() {
      return this._def.type;
    }
  },
  rt = class e extends K {
    _parse(e) {
      let { status: t, ctx: r } = this._processInputParams(e);
      if (r.common.async)
        return (async () => {
          let e = await this._def.in._parseAsync({
            data: r.data,
            path: r.path,
            parent: r,
          });
          return "aborted" === e.status
            ? Z
            : "dirty" === e.status
              ? (t.dirty(), N(e.value))
              : this._def.out._parseAsync({
                  data: e.value,
                  path: r.path,
                  parent: r,
                });
        })();
      {
        let e = this._def.in._parseSync({
          data: r.data,
          path: r.path,
          parent: r,
        });
        return "aborted" === e.status
          ? Z
          : "dirty" === e.status
            ? (t.dirty(), { status: "dirty", value: e.value })
            : this._def.out._parseSync({
                data: e.value,
                path: r.path,
                parent: r,
              });
      }
    }
    static create(t, r) {
      return new e({ in: t, out: r, typeName: nt.ZodPipeline });
    }
  },
  at = class extends K {
    _parse(e) {
      let t = this._def.innerType._parse(e),
        r = (e) => (B(e) && (e.value = Object.freeze(e.value)), e);
      return F(t) ? t.then((e) => r(e)) : r(t);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
function it(e, t) {
  let r =
    "function" == typeof e ? e(t) : "string" == typeof e ? { message: e } : e;
  return "string" == typeof r ? { message: r } : r;
}
function st(e, t = {}, r) {
  return e
    ? Te.create().superRefine((a, i) => {
        let s = e(a);
        if (s instanceof Promise)
          return s.then((e) => {
            if (!e) {
              let e = it(t, a),
                s = e.fatal ?? r ?? !0;
              i.addIssue({ code: "custom", ...e, fatal: s });
            }
          });
        if (!s) {
          let e = it(t, a),
            s = e.fatal ?? r ?? !0;
          i.addIssue({ code: "custom", ...e, fatal: s });
        }
      })
    : Te.create();
}
at.create = (e, t) =>
  new at({ innerType: e, typeName: nt.ZodReadonly, ...V(t) });
var nt,
  ot = { object: Ee.lazycreate };
!(function (e) {
  ((e.ZodString = "ZodString"),
    (e.ZodNumber = "ZodNumber"),
    (e.ZodNaN = "ZodNaN"),
    (e.ZodBigInt = "ZodBigInt"),
    (e.ZodBoolean = "ZodBoolean"),
    (e.ZodDate = "ZodDate"),
    (e.ZodSymbol = "ZodSymbol"),
    (e.ZodUndefined = "ZodUndefined"),
    (e.ZodNull = "ZodNull"),
    (e.ZodAny = "ZodAny"),
    (e.ZodUnknown = "ZodUnknown"),
    (e.ZodNever = "ZodNever"),
    (e.ZodVoid = "ZodVoid"),
    (e.ZodArray = "ZodArray"),
    (e.ZodObject = "ZodObject"),
    (e.ZodUnion = "ZodUnion"),
    (e.ZodDiscriminatedUnion = "ZodDiscriminatedUnion"),
    (e.ZodIntersection = "ZodIntersection"),
    (e.ZodTuple = "ZodTuple"),
    (e.ZodRecord = "ZodRecord"),
    (e.ZodMap = "ZodMap"),
    (e.ZodSet = "ZodSet"),
    (e.ZodFunction = "ZodFunction"),
    (e.ZodLazy = "ZodLazy"),
    (e.ZodLiteral = "ZodLiteral"),
    (e.ZodEnum = "ZodEnum"),
    (e.ZodEffects = "ZodEffects"),
    (e.ZodNativeEnum = "ZodNativeEnum"),
    (e.ZodOptional = "ZodOptional"),
    (e.ZodNullable = "ZodNullable"),
    (e.ZodDefault = "ZodDefault"),
    (e.ZodCatch = "ZodCatch"),
    (e.ZodPromise = "ZodPromise"),
    (e.ZodBranded = "ZodBranded"),
    (e.ZodPipeline = "ZodPipeline"),
    (e.ZodReadonly = "ZodReadonly"));
})(nt || (nt = {}));
var ct = (e, t = { message: `Input not instance of ${e.name}` }) =>
    st((t) => t instanceof e, t),
  dt = _e.create,
  lt = fe.create,
  ut = Qe.create,
  ht = ge.create,
  mt = we.create,
  pt = ve.create,
  bt = xe.create,
  _t = ke.create,
  yt = Se.create,
  ft = Te.create,
  gt = je.create,
  wt = Ie.create,
  vt = Ce.create,
  xt = Re.create,
  kt = Ee.create,
  St = Ee.strictCreate,
  Tt = Ae.create,
  jt = Oe.create,
  It = Ze.create,
  Ct = Ne.create,
  Rt = qe.create,
  Pt = De.create,
  Et = Le.create,
  At = Be.create,
  Mt = Fe.create,
  Ot = Ue.create,
  $t = Ve.create,
  Zt = We.create,
  Nt = Ke.create,
  qt = Je.create,
  Dt = Ge.create,
  Lt = He.create,
  Bt = Je.createWithPreprocess,
  Ft = rt.create,
  Ut = () => dt().optional(),
  zt = () => lt().optional(),
  Vt = () => mt().optional(),
  Wt = {
    string: (e) => _e.create({ ...e, coerce: !0 }),
    number: (e) => fe.create({ ...e, coerce: !0 }),
    boolean: (e) => we.create({ ...e, coerce: !0 }),
    bigint: (e) => ge.create({ ...e, coerce: !0 }),
    date: (e) => ve.create({ ...e, coerce: !0 }),
  },
  Kt = Z;
const bundledZodNamespace: any = v;
export { bundledZodNamespace as z };
