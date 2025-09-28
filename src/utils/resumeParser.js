// src/utils/resumeParser.js
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import { validateEmail, validatePhone, validateName } from "./validators";

// ---- pdf.js worker (CRA / Webpack 5 compatible) ----
const pdfjsWorker = new Worker(
  new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
  { type: "module" }
);
pdfjsLib.GlobalWorkerOptions.workerPort = pdfjsWorker;

// ---------------- FILE EXTRACTION ----------------
export async function extractTextFromFile(file) {
  if (!file) return "";
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return extractTextFromPdf(file);
  if (name.endsWith(".docx")) return extractTextFromDocx(file);
  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc files aren’t supported. Please upload a PDF or DOCX.");
  }
  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => (typeof it.str === "string" ? it.str : ""));
    text += strings.join("\n") + "\n\n";
  }
  return normalizeText(text);
}

async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return normalizeText(value);
}

// ---------------- NORMALIZATION ----------------
function normalizeText(raw) {
  const rawStr = String(raw || "");

  let t = rawStr.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2");
  t = t.replace(/\u00A0/g, " ");
  t = t
    .replace(/\s*@\s*/g, "@")
    .replace(/([A-Za-z0-9.-])\s*\.\s*([A-Za-z]{2,})/g, "$1.$2")
    .replace(/\(at\)|\[at\]|{at}| at /gi, "@")
    .replace(/\(dot\)|\[dot\]|{dot}| dot /gi, ".");
  t = t.replace(/[|•■▪]+/g, " ");
  t = t.replace(/(\d)\s+(?=\d)/g, "$1");
  t = t.replace(/\.\s*\n\s*/g, ".\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n");
  t = t
    .split("\n")
    .filter((l) => !/^[^\w\s]{1,3}$/.test(l.trim()))
    .join("\n");
  t = t.replace(/[ \t]{2,}/g, " ");

  // === CRITICAL FIXES ===
  // (1) Keep a space when a single uppercase "icon letter" precedes an email.
  t = t.replace(
    /(^|[\s:|,;()[\]{}'"<>-])[A-Z]\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi,
    "$1 $2"
  );
  // (2) If a long phone number is immediately followed by an email with no separator, insert a space.
  t = t.replace(
    /(\+?\d[\d() .-]{6,}\d)(?=[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1 "
  );

  return t.trim();
}

// ---------------- CORE PARSER ----------------
export function parseResumeFields(rawText, fileName = "") {
  const text = normalizeText(rawText || "");
  const lines = splitAndReflowLines(text);
  const headerLines = extractHeaderBlock(lines);

  const email = findBestEmail(lines, headerLines);
  const phone = findPhone(headerLines) || findPhone(lines);
  const name =
    findNameCandidate(headerLines, { email, phone }) ||
    findNameCandidate(lines.slice(0, Math.min(25, lines.length)), { email, phone }) ||
    guessNameFromFileName(fileName) ||
    "";

  return {
    name: name || "",
    email: email || "",
    phone: phone || "",
    debug: {
      headerPreview: headerLines.slice(0, 8),
      firstLinesPreview: lines.slice(0, 15),
    },
  };
}

// ---------------- LINE UTILITIES ----------------
function splitAndReflowLines(text) {
  let lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  lines = stitchBrokenEmails(lines);
  lines = stitchBrokenPhones(lines);
  lines = combineTopNameLines(lines);

  const deduped = [];
  for (const l of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== l) deduped.push(l);
  }
  return deduped;
}

function stitchBrokenEmails(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1] || "";
    if (
      /[A-Za-z0-9._%+-]$/.test(cur) &&
      /^(@|[A-Za-z0-9.-]+\.)/.test(next) &&
      (cur + next).length < 120
    ) {
      out.push((cur + next).replace(/\s+/g, ""));
      i++;
    } else {
      out.push(cur);
    }
  }
  return out;
}

function stitchBrokenPhones(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1] || "";
    if (/\d$/.test(cur) && /^\d/.test(next)) {
      const merged = cur + " " + next;
      const digits = (merged.match(/\d/g) || []).length;
      if (digits >= 10 && digits <= 15) {
        out.push(merged);
        i++;
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

function combineTopNameLines(lines) {
  const out = [...lines];
  const head = [];
  let consumed = 0;

  for (let i = 0; i < Math.min(6, out.length); i++) {
    let tok = out[i].trim();
    if (!tok) break;
    if (/^[^\w]{1,3}$/.test(tok)) {
      consumed++;
      continue;
    }
    if (/^[A-Za-z'’-]+$/.test(tok)) {
      head.push(tok);
      consumed++;
      continue;
    }
    break;
  }

  if (head.length >= 2 && head.length <= 4) {
    out.splice(0, consumed, head.join(" "));
  } else if (consumed > 0) {
    out.splice(
      0,
      consumed,
      ...out.slice(0, consumed).filter((l) => !/^[^\w]{1,3}$/.test(l))
    );
  }
  return out;
}

// ---------------- HEADER DETECTION ----------------
const SECTION_HEADINGS = [
  "summary",
  "objective",
  "skills",
  "technical skills",
  "key skills",
  "experience",
  "work experience",
  "professional experience",
  "projects",
  "education",
  "certifications",
  "achievements",
  "publications",
  "interests",
  "hobbies",
  "languages",
  "profile",
];

function extractHeaderBlock(lines) {
  const idx = lines.findIndex((l) => {
    const s = l.toLowerCase();
    return SECTION_HEADINGS.some(
      (h) =>
        s === h ||
        s.startsWith(h + ":") ||
        s.startsWith(h + " -") ||
        s === "section: " + h
    );
  });
  const end = idx > -1 ? idx : Math.min(10, lines.length);
  return lines.slice(0, Math.min(end, 12));
}

// ---------------- FIELD FINDERS ----------------
function findBestEmail(allLines, headerLines = []) {
  const EMAIL_RE =
    /([A-Za-z0-9._%+-]*[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const PHONE_EMAIL_GLUE =
    /(?:^|\s)(\+?\d[\d(). \-]{6,}\d)\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

  const headerSet = new Set(headerLines);
  const SEP_BEFORE = /[\s:|,;()\[\]{}'"<>-]/;
  const ICON_GLYPHS_IN_LEFT = /[•°·Ó®©™✓■▪]/;
  const COMMON_WORDS =
    /^(potential|regards|thanks|hello|dear|team|subject|from|to|resume|profile)$/i;

  const candidates = [];

  allLines.forEach((line, idx) => {
    let pm;
    while ((pm = PHONE_EMAIL_GLUE.exec(line)) !== null) {
      const candEmail = pm[2].trim();
      if (validateEmail(candEmail)) {
        candidates.push({ email: candEmail, score: 15, idx, startIdx: pm.index });
      }
    }

    let m;
    while ((m = EMAIL_RE.exec(line)) !== null) {
      const startIdx = m.index;
      const prevChar = startIdx > 0 ? line[startIdx - 1] : "";
      let cand = m[1].trim();
      let repaired = false;

      if (cand.length > 120) continue;

      const left = line.slice(0, startIdx);
      const hasCleanLeftBoundary = startIdx === 0 || SEP_BEFORE.test(prevChar);

      (function dropWordDotPrefix() {
        const at = cand.indexOf("@");
        if (at <= 0) return;
        const local = cand.slice(0, at);
        const domain = cand.slice(at + 1);
        const leftWordDot = left.match(/([A-Za-z]{3,})\.\s*$/);
        const firstChunk = local.split(".")[0];
        const shouldDrop =
          COMMON_WORDS.test(firstChunk) ||
          (!hasCleanLeftBoundary && /^[A-Za-z]{3,}\./.test(local)) ||
          (leftWordDot &&
            firstChunk.toLowerCase() === leftWordDot[1]?.toLowerCase());
        if (shouldDrop) {
          const trimmedLocal = local.replace(/^[^.]+\./, "");
          const repairedEmail = trimmedLocal + "@" + domain;
          if (validateEmail(repairedEmail)) {
            cand = repairedEmail;
            repaired = true;
          }
        }
      })();

      (function dropSingleIconLetter() {
        const at = cand.indexOf("@");
        if (at <= 1) return;
        const local = cand.slice(0, at);
        const domain = cand.slice(at + 1);
        if (/^[A-Z][a-z0-9._%+-]+$/.test(local)) {
          const suspiciousLeft = hasCleanLeftBoundary || ICON_GLYPHS_IN_LEFT.test(left);
          const alt = local.slice(1) + "@" + domain;
          if (suspiciousLeft && validateEmail(alt)) {
            cand = alt;
            repaired = true;
          }
        }
      })();

      (function dropLeadingPhoneDigits() {
        const at = cand.indexOf("@");
        if (at <= 0) return;
        const local = cand.slice(0, at);
        const domain = cand.slice(1 + at);
        if (/^\+?\d{10,}[A-Za-z0-9._%+-]*$/.test(local)) {
          const trimmedLocal = local.replace(/^\+?\d{10,}/, "");
          if (/[A-Za-z0-9]/.test(trimmedLocal)) {
            const repairedEmail = trimmedLocal + "@" + domain;
            if (validateEmail(repairedEmail)) {
              cand = repairedEmail;
              repaired = true;
            }
          }
        }
      })();

      let score = 0;
      if (/\b(email|e-mail)\b/i.test(line)) score += 7;
      if (/\be:\b/i.test(line)) score += 6;
      if (headerSet.has(line)) score += 3;
      if (idx < 12) score += 3;
      if (hasCleanLeftBoundary) score += 2;
      else score -= 6;
      if (/[A-Za-z]{3,}\.\s*$/.test(left)) score -= 8;

      const localPart = cand.split("@")[0];
      const firstLocal = localPart.split(".")[0];
      if (COMMON_WORDS.test(firstLocal)) score -= 6;
      if (repaired) score += 2;

      candidates.push({ email: cand, score, idx, startIdx });
    }
  });

  if (!candidates.length) return "";
  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx || a.startIdx - b.startIdx);

  const seen = new Set();
  for (const c of candidates) {
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (validateEmail(c.email)) return c.email;
  }
  return candidates[0].email;
}

function findPhone(lines) {
  const PHONE_HINT = /(phone|mobile|mob\.?|tel\.?|contact|e:|p:)/i;
  for (const l of lines) {
    if (PHONE_HINT.test(l)) {
      const ph = extractPhoneFromLine(l);
      if (ph) return ph;
    }
  }
  for (const l of lines) {
    const ph = extractPhoneFromLine(l);
    if (ph) return ph;
  }
  return "";
}

function extractPhoneFromLine(line) {
  const candidates = line.match(/(\+?\d[\d\s().-]{8,}\d)/g) || [];
  let best = "";
  for (const c of candidates) {
    const cleaned = c.replace(/[^\d+]/g, "");
    if (validatePhone(cleaned)) {
      if (cleaned.length > best.replace(/[^\d+]/g, "").length) best = cleaned;
    }
  }
  return best;
}

// ---------------- NAME ----------------
const BAD_NAME_WORDS = [
  "resume",
  "curriculum vitae",
  "cv",
  "contact",
  "email",
  "phone",
  "address",
  "github",
  "linkedin",
  "portfolio",
  "website",
  ...SECTION_HEADINGS,
];

function findNameCandidate(lines, ctx) {
  const { email = "", phone = "" } = ctx || {};
  const scored = [];

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const raw = lines[i].trim();
    const lower = raw.toLowerCase();
    if (BAD_NAME_WORDS.some((w) => lower.includes(w))) continue;
    if (/[,:;]$/.test(raw)) continue;

    let cand = raw
      .replace(/\b(email|e-mail|phone|mobile|tel|contact|e:|p:)\b.*$/i, "")
      .replace(email, "")
      .replace(phone, "")
      .replace(/[|•,;]+/g, " ")
      .trim();

    const splits = cand
      .split(/\s{2,}| \| | - /)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of (splits.length ? splits : [cand])) {
      if (!s) continue;
      const score = scoreAsName(s, i);
      if (score > 0) scored.push({ s, score, i });
    }
  }

  if (!scored.length) return "";
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const best = scored[0].s;

  if (validateName(best)) return best;
  const simplified = best.split(/[,-]/)[0].trim();
  if (validateName(simplified)) return simplified;
  return "";
}

function scoreAsName(s, lineIndex) {
  const tokens = s.split(/\s+/);
  let score = 0;
  if (tokens.length >= 2 && tokens.length <= 5) score += 3;
  const caps = tokens.filter((t) => /^[A-Z][a-zA-Z'’-]*$/.test(t)).length;
  score += caps;
  if (/[@\d]/.test(s)) score -= 5;
  if (/^[A-Z\s]+$/.test(s) && s.length > 6) score -= 2;
  if (/\b(Engineer|Developer|Manager|Student|Intern)\b$/i.test(s)) score -= 2;
  score += Math.max(0, 5 - lineIndex);
  return score;
}

function guessNameFromFileName(fileName = "") {
  const base = String(fileName).split(/[\\/]/).pop() || "";
  const namePart = base.replace(/\.(pdf|docx|doc)$/i, "");
  const cleaned = namePart.replace(/(resume|cv|curriculum|vitae|profile)/gi, "").trim();
  const candidate = cleaned.replace(/[_-]+/g, " ").trim();
  if (validateName(candidate)) return titleCase(candidate);
  return "";
}

function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
