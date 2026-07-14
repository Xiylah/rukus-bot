/**
 * TagScript: the little scripting language behind custom commands.
 *
 * Lives in @rukus/shared so the dashboard's "preview this command" box runs the
 * IDENTICAL interpreter the bot does. Pure logic: no discord.js, no network.
 *
 * Syntax is {block(parameter):payload}, where the parameter and the payload are
 * both optional, and blocks nest freely:
 *
 *   {if({args(1)}=={user(id)}):yes|no}
 *   Rolling: {math:{range:1-6}+{range:1-6}}
 *
 * Evaluation is inside-out, by recursive descent over the source text. There is
 * deliberately no eval() and no `new Function()` anywhere in this file: the
 * source is member-authored and must never be able to reach the host.
 *
 * The safety caps below are load-bearing, not decoration. A tag such as
 * {repeatish:{repeatish:{...}}} nested a hundred levels deep, or a huge
 * {math} expression, has to terminate quickly and cheaply on a shard that is
 * also serving every other guild.
 */

// ---------------- limits ----------------

const MAX_DEPTH = 20;
const MAX_BLOCKS = 500;
const MAX_OUTPUT = 2000;
const MAX_VARS = 50;
/** Discord's own embed description ceiling. */
const MAX_EMBED_DESC = 4000;

// ---------------- public types ----------------

export interface TagUser {
  id: string;
  /** Display name (nickname if set, else username). */
  name: string;
  avatar?: string;
  roleIds?: string[];
}

export interface TagServer {
  id: string;
  name: string;
  memberCount?: number;
  icon?: string;
}

export interface TagChannel {
  id: string;
  name: string;
}

export interface TagContext {
  user: TagUser;
  server: TagServer;
  channel: TagChannel;
  /** Everything the member typed after the command word, already split. */
  args: string[];
  /** How many times this command has been run. */
  uses: number;
}

export interface TagEmbed {
  title?: string;
  description?: string;
  color?: string;
}

export interface TagActions {
  delete?: boolean;
  silence?: boolean;
  react?: string[];
  dm?: boolean;
  redirectChannelId?: string;
  requireRoleIds?: string[];
  blockedRoleIds?: string[];
}

export interface TagResult {
  content: string;
  embed?: TagEmbed;
  actions: TagActions;
}

// ---------------- interpreter state ----------------

interface State {
  ctx: TagContext;
  vars: Map<string, string>;
  actions: TagActions;
  embed: TagEmbed | null;
  blocks: number;
  /** Set once a cap is hit; every further block resolves to nothing. */
  halted: boolean;
}

/** A parsed {block(param):payload}, with the raw text it came from. */
interface Block {
  name: string;
  /** Undefined when the block had no (parameter). */
  param?: string;
  /** Undefined when the block had no :payload. */
  payload?: string;
  raw: string;
  /** Index just past the closing brace. */
  end: number;
}

// ---------------- scanning ----------------

/**
 * Read the block that starts at `open` (which must point at a "{"), returning
 * its raw parts UNEVALUATED. Nested braces inside the parameter and payload are
 * counted so that {if({args(1)}==x):...} does not get cut short at the first
 * inner "}".
 *
 * Returns null for anything malformed (an unclosed brace, an empty name). The
 * caller then treats the "{" as ordinary text, which is what makes messages
 * that merely happen to contain braces survive intact.
 */
function scanBlock(src: string, open: number): Block | null {
  let i = open + 1;
  let name = "";

  // Name: runs until "(", ":" or "}".
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "(" || ch === ":" || ch === "}") break;
    // A bare "{" inside the name means the outer brace was never a block.
    if (ch === "{") return null;
    name += ch;
    i++;
  }
  if (i >= src.length) return null;

  let param: string | undefined;
  if (src[i] === "(") {
    i++;
    const start = i;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i]!;
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth > 0) i++;
    }
    if (depth > 0) return null;
    param = src.slice(start, i);
    i++; // past ")"
  }

  let payload: string | undefined;
  if (src[i] === ":") {
    i++;
    const start = i;
    let depth = 1; // we are inside the block's own braces
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    if (i >= src.length) return null;
    payload = src.slice(start, i);
  }

  if (src[i] !== "}") return null;

  const trimmedName = name.trim();
  if (!trimmedName) return null;

  return { name: trimmedName, param, payload, raw: src.slice(open, i + 1), end: i + 1 };
}

// ---------------- evaluation ----------------

/** Walk a string, replacing every well-formed block with its value. */
function evaluate(src: string, st: State, depth: number): string {
  if (depth > MAX_DEPTH || st.halted) return "";

  let out = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;
    if (ch !== "{") {
      out += ch;
      i++;
      if (out.length > MAX_OUTPUT * 2) {
        st.halted = true;
        break;
      }
      continue;
    }

    const block = scanBlock(src, i);
    if (!block) {
      // Not a block after all: emit the brace literally.
      out += ch;
      i++;
      continue;
    }

    if (++st.blocks > MAX_BLOCKS) {
      st.halted = true;
      break;
    }

    out += runBlock(block, st, depth);
    i = block.end;

    if (out.length > MAX_OUTPUT * 2) {
      st.halted = true;
      break;
    }
  }

  return out;
}

/**
 * Blocks whose payload must NOT be pre-evaluated, because the block decides
 * which parts of it ever run (or splits it on "|" first).
 */
const LAZY_PAYLOAD = new Set(["if", "5050", "random", "choose", "embed"]);

function runBlock(block: Block, st: State, depth: number): string {
  const name = block.name.toLowerCase();

  // Parameters always evaluate: {user({args(1)})} has to resolve inside-out.
  const param =
    block.param === undefined ? undefined : evaluate(block.param, st, depth + 1);
  const payload =
    block.payload === undefined || LAZY_PAYLOAD.has(name)
      ? block.payload
      : evaluate(block.payload, st, depth + 1);

  const value = dispatch(name, param, payload, block, st, depth);
  // Unknown block: pass the original text through untouched rather than
  // swallowing it, so a message about "{curly braces}" still reads correctly.
  return value === null ? block.raw : value;
}

function dispatch(
  name: string,
  param: string | undefined,
  payload: string | undefined,
  block: Block,
  st: State,
  depth: number,
): string | null {
  const ctx = st.ctx;

  switch (name) {
    // ---- variables ----
    case "user":
      return userField(ctx.user, param);
    case "server":
    case "guild":
      return serverField(ctx.server, param);
    case "channel":
      return channelField(ctx.channel, param);
    case "args":
      return argsField(ctx.args, param);
    case "uses":
      return String(ctx.uses);
    case "unix":
      return String(Math.floor(Date.now() / 1000));

    // ---- math ----
    case "math":
    case "m":
    case "+":
      return evalMath(payload ?? param ?? "");

    // ---- random ----
    case "random":
    case "choose": {
      const opts = splitPipes(payload ?? param ?? "");
      if (opts.length === 0) return "";
      const pick = opts[Math.floor(Math.random() * opts.length)]!;
      return evaluate(pick, st, depth + 1);
    }
    case "range":
    case "rangef": {
      const spec = payload ?? param ?? "";
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/.exec(spec);
      if (!m) return "";
      const lo = Number(m[1]);
      const hi = Number(m[2]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "";
      const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
      if (name === "rangef") return trimNumber(a + Math.random() * (b - a));
      return String(Math.floor(a + Math.random() * (b - a + 1)));
    }
    case "5050":
    case "50":
      return Math.random() < 0.5 ? evaluate(payload ?? "", st, depth + 1) : "";

    // ---- strings ----
    case "upper":
      return (payload ?? param ?? "").toUpperCase();
    case "lower":
      return (payload ?? param ?? "").toLowerCase();
    case "len":
    case "length":
      return String((payload ?? param ?? "").length);
    case "urlencode":
      return encodeURIComponent(payload ?? param ?? "");
    case "replace": {
      // {replace(find,with):text} - only the FIRST comma separates, so you can
      // still replace a comma with something.
      const p = param ?? "";
      const at = p.indexOf(",");
      if (at < 0) return payload ?? "";
      const find = p.slice(0, at);
      const to = p.slice(at + 1);
      if (!find) return payload ?? "";
      return (payload ?? "").split(find).join(to);
    }

    // ---- conditionals ----
    case "if":
      return runIf(param ?? "", payload ?? "", st, depth);
    case "any":
    case "or":
      return String(splitPipes(param ?? "").some((c) => testCondition(c)));
    case "all":
    case "and":
      return String(
        splitPipes(param ?? "").every((c) => testCondition(c)) &&
          splitPipes(param ?? "").length > 0,
      );
    case "not":
      return String(!testCondition(param ?? ""));

    // ---- assignment ----
    case "=":
    case "assign":
    case "let":
    case "var": {
      const key = (param ?? "").trim().toLowerCase();
      if (key && st.vars.size < MAX_VARS) st.vars.set(key, payload ?? "");
      return "";
    }

    // ---- actions ----
    case "delete":
    case "del":
      st.actions.delete = true;
      return "";
    case "silence":
    case "silent":
      st.actions.silence = true;
      return "";
    case "react": {
      const emojis = splitPipes(payload ?? param ?? "").filter(Boolean);
      if (emojis.length > 0) {
        st.actions.react = [...(st.actions.react ?? []), ...emojis].slice(0, 5);
      }
      return "";
    }
    case "dm":
      st.actions.dm = true;
      return "";
    case "redirect": {
      const id = snowflakeOf(payload ?? param ?? "");
      if (id) st.actions.redirectChannelId = id;
      return "";
    }
    case "require": {
      const ids = splitPipes(payload ?? param ?? "")
        .map(snowflakeOf)
        .filter((x): x is string => x !== null);
      if (ids.length > 0) {
        st.actions.requireRoleIds = [...(st.actions.requireRoleIds ?? []), ...ids];
      }
      return "";
    }
    case "blacklist": {
      const ids = splitPipes(payload ?? param ?? "")
        .map(snowflakeOf)
        .filter((x): x is string => x !== null);
      if (ids.length > 0) {
        st.actions.blockedRoleIds = [...(st.actions.blockedRoleIds ?? []), ...ids];
      }
      return "";
    }

    // ---- embed ----
    case "embed":
      return runEmbed(param ?? "", payload ?? "", st, depth);

    default: {
      // A user-assigned variable read as {name}, with neither param nor payload.
      const stored = st.vars.get(name);
      if (stored !== undefined && param === undefined && payload === undefined) {
        return evaluate(stored, st, depth + 1);
      }
      return null;
    }
  }
}

// ---------------- variable fields ----------------

function userField(user: TagUser, field?: string): string {
  switch ((field ?? "").trim().toLowerCase()) {
    case "":
    case "mention":
      return `<@${user.id}>`;
    case "id":
      return user.id;
    case "name":
    case "username":
    case "nick":
      return user.name;
    case "avatar":
      return user.avatar ?? "";
    default:
      return `<@${user.id}>`;
  }
}

function serverField(server: TagServer, field?: string): string {
  switch ((field ?? "").trim().toLowerCase()) {
    case "":
    case "name":
      return server.name;
    case "id":
      return server.id;
    case "members":
    case "membercount":
      return String(server.memberCount ?? 0);
    case "icon":
      return server.icon ?? "";
    default:
      return server.name;
  }
}

function channelField(channel: TagChannel, field?: string): string {
  switch ((field ?? "").trim().toLowerCase()) {
    case "":
    case "mention":
      return `<#${channel.id}>`;
    case "id":
      return channel.id;
    case "name":
      return channel.name;
    default:
      return `<#${channel.id}>`;
  }
}

/**
 * {args} = everything, {args(2)} = the 2nd word, {args(-1)} = the last,
 * {args(2+)} = the 2nd word and everything after it.
 */
function argsField(args: string[], field?: string): string {
  const spec = (field ?? "").trim();
  if (!spec) return args.join(" ");

  const slice = /^(-?\d+)\+$/.exec(spec);
  if (slice) {
    const idx = resolveIndex(args, Number(slice[1]));
    if (idx === null) return "";
    return args.slice(idx).join(" ");
  }

  if (!/^-?\d+$/.test(spec)) return "";
  const idx = resolveIndex(args, Number(spec));
  if (idx === null) return "";
  return args[idx] ?? "";
}

/** 1-indexed, negatives counting from the end. Null when out of range. */
function resolveIndex(args: string[], n: number): number | null {
  if (n === 0) return null;
  const idx = n > 0 ? n - 1 : args.length + n;
  if (idx < 0 || idx >= args.length) return null;
  return idx;
}

// ---------------- conditionals ----------------

const COMPARATORS = [">=", "<=", "!=", "==", ">", "<"] as const;

/**
 * Evaluate one comparison, e.g. "3>=2" or "{args(1)}==hello" (already
 * substituted by the time we get here). Both sides are compared numerically
 * when both parse as numbers, and as strings otherwise, so "10>9" is true but
 * "b>a" also works.
 */
function testCondition(expr: string): boolean {
  const text = expr.trim();
  if (!text) return false;

  for (const op of COMPARATORS) {
    const at = text.indexOf(op);
    if (at < 0) continue;
    // ">=" must win over ">" at the same position; the ordering of COMPARATORS
    // guarantees we see the two-character forms first.
    const left = text.slice(0, at).trim();
    const right = text.slice(at + op.length).trim();

    const ln = Number(left);
    const rn = Number(right);
    const numeric =
      left !== "" && right !== "" && Number.isFinite(ln) && Number.isFinite(rn);

    switch (op) {
      case "==":
        return numeric ? ln === rn : left === right;
      case "!=":
        return numeric ? ln !== rn : left !== right;
      case ">=":
        return numeric ? ln >= rn : left >= right;
      case "<=":
        return numeric ? ln <= rn : left <= right;
      case ">":
        return numeric ? ln > rn : left > right;
      case "<":
        return numeric ? ln < rn : left < right;
    }
  }

  // No operator: truthiness, the way Carl-bot treats a bare {if(true):...}.
  const lowered = text.toLowerCase();
  return lowered !== "false" && lowered !== "0" && lowered !== "";
}

function runIf(param: string, payload: string, st: State, depth: number): string {
  const branches = splitPipes(payload);
  const chosen = testCondition(param) ? branches[0] : branches[1];
  return chosen === undefined ? "" : evaluate(chosen, st, depth + 1);
}

// ---------------- embed ----------------

/**
 * {embed(title|description|color):...} - the payload, when present, wins as the
 * description, so {embed(Codes):{args}} reads naturally.
 */
function runEmbed(param: string, payload: string, st: State, depth: number): string {
  const parts = splitPipes(param).map((p) => evaluate(p, st, depth + 1).trim());
  const body = payload ? evaluate(payload, st, depth + 1).trim() : "";

  const title = parts[0] ?? "";
  const description = body || (parts[1] ?? "");
  const color = parts[2] ?? "";

  const embed: TagEmbed = { ...(st.embed ?? {}) };
  if (title) embed.title = title.slice(0, 256);
  if (description) embed.description = description.slice(0, MAX_EMBED_DESC);
  if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
    embed.color = color.startsWith("#") ? color : `#${color}`;
  }
  st.embed = embed;
  return "";
}

// ---------------- math ----------------

/**
 * Recursive-descent arithmetic over + - * / % ^ and parentheses. Hand-written
 * on purpose: eval() and new Function() are off the table when the expression
 * comes from whatever a member typed.
 */
function evalMath(expr: string): string {
  const tokens = expr.match(/\d+(?:\.\d+)?|[-+*/%^()]/g);
  if (!tokens) return "";

  let pos = 0;
  let bad = false;

  const peek = (): string | undefined => tokens[pos];
  const eat = (): string | undefined => tokens[pos++];

  // expr := term (('+'|'-') term)*
  function parseExpr(): number {
    let left = parseTerm();
    for (;;) {
      const op = peek();
      if (op !== "+" && op !== "-") return left;
      eat();
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
  }

  // term := unary (('*'|'/'|'%') unary)*
  function parseTerm(): number {
    let left = parseUnary();
    for (;;) {
      const op = peek();
      if (op !== "*" && op !== "/" && op !== "%") return left;
      eat();
      const right = parseUnary();
      if ((op === "/" || op === "%") && right === 0) {
        bad = true;
        return 0;
      }
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
  }

  // unary := '-' unary | power
  function parseUnary(): number {
    if (peek() === "-") {
      eat();
      return -parseUnary();
    }
    if (peek() === "+") {
      eat();
      return parseUnary();
    }
    return parsePower();
  }

  // power := atom ('^' unary)?   right-associative
  function parsePower(): number {
    const base = parseAtom();
    if (peek() !== "^") return base;
    eat();
    const exp = parseUnary();
    const result = Math.pow(base, exp);
    if (!Number.isFinite(result)) bad = true;
    return Number.isFinite(result) ? result : 0;
  }

  function parseAtom(): number {
    const tok = eat();
    if (tok === undefined) {
      bad = true;
      return 0;
    }
    if (tok === "(") {
      const inner = parseExpr();
      if (eat() !== ")") bad = true;
      return inner;
    }
    const n = Number(tok);
    if (!Number.isFinite(n)) {
      bad = true;
      return 0;
    }
    return n;
  }

  const value = parseExpr();
  // Trailing junk means we did not understand the whole expression; better to
  // say nothing than to print a number the author did not intend.
  if (bad || pos !== tokens.length || !Number.isFinite(value)) return "";
  return trimNumber(value);
}

/** 3 -> "3", 3.5 -> "3.5", 0.1+0.2 -> "0.3" (not 0.30000000000000004). */
function trimNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(6)));
}

// ---------------- small helpers ----------------

/** Split on "|", but never inside nested {braces}. */
function splitPipes(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Accept a raw id, a <@&role> mention, or a <#channel> mention. */
function snowflakeOf(text: string): string | null {
  const m = /(\d{17,20})/.exec(text.trim());
  return m ? m[1]! : null;
}

// ---------------- entry point ----------------

/**
 * Run a TagScript source against a context. Never throws: malformed input
 * degrades to literal text, and every cap failure ends with whatever output was
 * produced up to that point.
 */
export function runTagScript(source: string, ctx: TagContext): TagResult {
  const st: State = {
    ctx,
    vars: new Map(),
    actions: {},
    embed: null,
    blocks: 0,
    halted: false,
  };

  let content = "";
  try {
    content = evaluate(source, st, 0);
  } catch {
    // A bug in here must not take a message handler down with it: fall back to
    // the raw source, which is at worst ugly.
    content = source;
  }

  content = content.slice(0, MAX_OUTPUT).trim();

  const result: TagResult = { content, actions: st.actions };
  if (st.embed && (st.embed.title || st.embed.description)) {
    result.embed = st.embed;
  }
  return result;
}
