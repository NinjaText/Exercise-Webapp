import 'dotenv/config';
import mammoth from 'mammoth';
import fs from 'fs';
import { register } from 'tsx/esm/api';
register();

const svc = await import('/Users/yahyashah/Dev/Excercise-Webapp/lib/services/.tmp-program-brief-repro.service.ts');

function tableRowToLine(rowHtml) {
  const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cellHtml]) =>
    cellHtml.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  return cells.filter(Boolean).join(" | ");
}
function isWeekOverviewGrid(headerRowHtml) {
  const headerText = tableRowToLine(headerRowHtml);
  const weekMatches = headerText.match(/\bweek\s+\d+\b/gi) ?? [];
  return new Set(weekMatches.map((m) => m.toLowerCase())).size >= 2;
}
function flattenTables(html) {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, inner) => {
    const rowMatches = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length && isWeekOverviewGrid(rowMatches[0][1])) return "\n\n";
    const rows = rowMatches.map(([, r]) => tableRowToLine(r)).filter(Boolean);
    return `\n\n${rows.join("\n")}\n\n`;
  });
}
function htmlToPlainText(html) {
  return flattenTables(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
}

const buffer = fs.readFileSync('/Users/yahyashah/Downloads/4_Week_Marathon_Strength_Mobility_Running_Plan.docx');
const converted = await mammoth.convertToHtml({ buffer });
const plainText = htmlToPlainText(converted.value || "");

for (let i = 0; i < 5; i++) {
  console.log(`\n===== RUN ${i + 1} =====`);
  const result = await svc.parseProgramBrief(plainText);
  if (!result.ok) { console.log('FAILED', result.errors); continue; }
  const weekCounts = new Map();
  for (const s of result.data.sessionBlueprint) {
    weekCounts.set(s.weekIndex, (weekCounts.get(s.weekIndex) ?? 0) + 1);
  }
  console.log('per-week:', Array.from(weekCounts.entries()).sort((a,b)=>a[0]-b[0]).map(([w,c]) => `week${w+1}=${c}`).join(', '));
  for (const s of result.data.sessionBlueprint) {
    console.log(`  week ${s.weekIndex} day ${s.dayIndex} (${s.dayLabel ?? 'no label'}): "${s.title}"`);
  }
}
