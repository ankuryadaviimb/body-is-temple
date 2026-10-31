#!/usr/bin/env node
/**
 * Seeds the coach's memory notes from private/memory/<slug>.md into your own Supabase project.
 * Safe to run more than once: a note that already exists is left alone, so edits made in the
 * app are never overwritten. Prints only note names and sizes, never content or email.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<personal access token> node scripts/seed-memory.mjs
 * Optional:
 *   SUPABASE_PROJECT_REF  (default: supabase/.temp/project-ref, written by `supabase link`)
 *   SEED_EMAIL            (default: the first ALLOWED_EMAILS entry in .env.local)
 *
 * Slugs: profile, gut, fitness, foods, experiments, questions, notes. Each note is at most
 * 4,000 characters. Keep private/ out of git (it is in .gitignore).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLUGS = ["profile", "gut", "fitness", "foods", "experiments", "questions", "notes"];
const MAX_CHARS = 4000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) fail("Set SUPABASE_ACCESS_TOKEN (Supabase dashboard, Account, Access Tokens).");

const refFile = path.join(root, "supabase/.temp/project-ref");
const ref = process.env.SUPABASE_PROJECT_REF ?? (existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "");
if (!/^[a-z0-9]{20}$/.test(ref)) fail("Set SUPABASE_PROJECT_REF.");

function emailFromEnvFile() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("ALLOWED_EMAILS="));
  if (!line) return null;
  return line.slice("ALLOWED_EMAILS=".length).replace(/^["']|["']$/g, "").split(",")[0]?.trim() || null;
}

const email = process.env.SEED_EMAIL ?? emailFromEnvFile();
if (!email || !/^[^@\s'"]+@[^@\s'"]+$/.test(email)) fail("Set SEED_EMAIL.");

const dir = path.join(root, "private/memory");
if (!existsSync(dir)) fail("No private/memory folder.");
const notes = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ slug: f.slice(0, -3), file: path.join(dir, f) }))
  .filter(({ slug }) => SLUGS.includes(slug));
if (notes.length === 0) fail("No memory notes found in private/memory.");

// Dollar quoting with a random tag, so note text can never end the SQL string early.
const tag = `m${randomBytes(6).toString("hex")}`;
function quote(text) {
  if (text.includes(`$${tag}$`)) fail("A note contains the quote tag. Run the script again.");
  return `$${tag}$${text}$${tag}$`;
}

const statements = notes.map(({ slug, file }) => {
  const content = readFileSync(file, "utf8").trim();
  if (content.length > MAX_CHARS) fail(`${slug}.md is over ${MAX_CHARS} characters.`);
  return `with u as (select id from auth.users where lower(email) = lower(${quote(email)})),
ins as (
  insert into public.memory_files (user_id, slug, content, version)
  select id, '${slug}', ${quote(content)}, 1 from u
  on conflict (user_id, slug) do nothing
  returning user_id, slug, content, version
)
insert into public.memory_versions (user_id, slug, version, content, source)
select user_id, slug, version, content, 'seed' from ins;`;
});
const summary = `select m.slug, m.version, char_length(m.content) as chars
from public.memory_files m join auth.users u on u.id = m.user_id
where lower(u.email) = lower(${quote(email)}) order by m.slug;`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query: [...statements, summary].join("\n") }),
});
const body = await res.json().catch(() => null);
if (!res.ok) fail(`Seeding failed (HTTP ${res.status}).`);
console.log("Memory notes in the database:");
for (const row of Array.isArray(body) ? body : []) console.log(`  ${row.slug}: version ${row.version}, ${row.chars} characters`);
