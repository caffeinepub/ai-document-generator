import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActor } from "@/hooks/useActor";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FileImage,
  FileText,
  ImageDown,
  Italic,
  Underline,
  Wand2,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------
type PaperSize = "a4" | "letter" | "legal" | "a3";
const PAPER_SIZES: Record<PaperSize, { label: string; w: number; h: number }> =
  {
    a4: { label: "A4", w: 794, h: 1123 },
    letter: { label: "Letter", w: 816, h: 1056 },
    legal: { label: "Legal", w: 816, h: 1344 },
    a3: { label: "A3", w: 1123, h: 1587 },
  };

// ---------------------------------------------------------------------------
// Document structure detection
// ---------------------------------------------------------------------------
type LineKind =
  | "header"
  | "subheader"
  | "indent"
  | "body"
  | "empty"
  | "bullet"
  | "ordered"
  | "signature";

interface DocLine {
  id: string;
  text: string;
  kind: LineKind;
  raw: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right" | "justify";
}

const SIGNATURE_KEYWORDS = [
  "signed",
  "signature",
  "witness",
  "executor",
  "testator",
  "date",
  "print name",
  "printed name",
  "title",
  "position",
];

function isSignatureLine(trimmed: string): boolean {
  if (/_{3,}/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  for (const kw of SIGNATURE_KEYWORDS) {
    if (lower.startsWith(`${kw}:`)) return true;
  }
  return false;
}

function classifyLine(
  raw: string,
  lineNum: number,
  allRaw: string[],
  bold?: boolean,
  italic?: boolean,
  underline?: boolean,
  align?: "left" | "center" | "right" | "justify",
): DocLine {
  const id = `ln-${lineNum}`;
  if (raw.trim() === "") return { id, text: "", kind: "empty", raw };

  const trimmed = raw.trim();

  if (/^###\s+/.test(trimmed))
    return {
      id,
      text: trimmed.replace(/^###\s+/, ""),
      kind: "subheader",
      raw,
      bold,
      italic,
      underline,
      align,
    };
  if (/^##\s+/.test(trimmed))
    return {
      id,
      text: trimmed.replace(/^##\s+/, ""),
      kind: "subheader",
      raw,
      bold,
      italic,
      underline,
      align,
    };
  if (/^#\s+/.test(trimmed))
    return {
      id,
      text: trimmed.replace(/^#\s+/, ""),
      kind: "header",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (/^\d+\.\s+/.test(trimmed))
    return {
      id,
      text: trimmed.replace(/^\d+\.\s+/, ""),
      kind: "ordered",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (/^[*\-•]\s+/.test(trimmed))
    return {
      id,
      text: trimmed.replace(/^[*\-•]\s+/, ""),
      kind: "bullet",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (isSignatureLine(trimmed))
    return {
      id,
      text: trimmed,
      kind: "signature",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  const isAllCaps =
    trimmed.length >= 3 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed);

  if (isAllCaps && trimmed.length <= 80)
    return {
      id,
      text: trimmed,
      kind: "header",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (trimmed.endsWith(":"))
    return {
      id,
      text: trimmed,
      kind: "subheader",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (raw.startsWith("\t") || raw.startsWith("  "))
    return {
      id,
      text: trimmed,
      kind: "indent",
      raw,
      bold,
      italic,
      underline,
      align,
    };

  if (trimmed.length <= 40) {
    const prevBlank = lineNum === 0 || allRaw[lineNum - 1]?.trim() === "";
    const nextBlank =
      lineNum >= allRaw.length - 1 || allRaw[lineNum + 1]?.trim() === "";
    if (prevBlank && nextBlank)
      return {
        id,
        text: trimmed,
        kind: "subheader",
        raw,
        bold,
        italic,
        underline,
        align,
      };
  }

  return {
    id,
    text: trimmed,
    kind: "body",
    raw,
    bold,
    italic,
    underline,
    align,
  };
}

/** Extract bold/italic/underline from a line's HTML */
function extractInlineFormatting(html: string): {
  bold: boolean;
  italic: boolean;
  underline: boolean;
} {
  const lower = html.toLowerCase();
  return {
    bold: /<b[\s>]|<strong[\s>]/.test(lower),
    italic: /<i[\s>]|<em[\s>]/.test(lower),
    underline: /<u[\s>]/.test(lower),
  };
}

/** Extract text-align from a div's style or align attribute */
function extractAlign(
  el: Element,
): "left" | "center" | "right" | "justify" | undefined {
  const style = (el as HTMLElement).style?.textAlign;
  if (style === "center") return "center";
  if (style === "right") return "right";
  if (style === "justify") return "justify";
  const attr = el.getAttribute("align");
  if (attr === "center") return "center";
  if (attr === "right") return "right";
  if (attr === "justify") return "justify";
  return undefined;
}

function parseDocument(editorHtml: string): DocLine[] {
  if (!editorHtml || editorHtml.trim() === "") return [];

  // Parse the HTML into a temporary container
  const container = document.createElement("div");
  container.innerHTML = editorHtml;

  const rawLines: Array<{
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align?: "left" | "center" | "right" | "justify";
  }> = [];

  // contenteditable creates one <div> per line; fallback to <br> splits
  const children = Array.from(container.childNodes);

  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    // plain text, split by newlines
    const lines = (children[0].textContent || "").split("\n");
    for (const l of lines)
      rawLines.push({ text: l, bold: false, italic: false, underline: false });
  } else {
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || "";
        if (text)
          rawLines.push({ text, bold: false, italic: false, underline: false });
        continue;
      }
      const el = child as Element;
      if (el.tagName === "BR") {
        rawLines.push({
          text: "",
          bold: false,
          italic: false,
          underline: false,
        });
        continue;
      }
      // Could be a div or span
      const innerHtml = el.innerHTML || "";
      // Check if it's just a <br>
      if (innerHtml.trim() === "<br>" || innerHtml.trim() === "") {
        rawLines.push({
          text: "",
          bold: false,
          italic: false,
          underline: false,
        });
        continue;
      }
      const fmt = extractInlineFormatting(innerHtml);
      const align = extractAlign(el);
      const plain = ((el as HTMLElement).innerText ?? el.textContent) || "";
      // Split on newlines in case the div has sub-line breaks
      const subLines = plain.split("\n");
      for (let si = 0; si < subLines.length; si++) {
        rawLines.push({
          text: subLines[si],
          ...fmt,
          align: si === 0 ? align : undefined,
        });
      }
    }
  }

  const allRaw = rawLines.map((l) => l.text);
  return rawLines.map((l, i) =>
    classifyLine(l.text, i, allRaw, l.bold, l.italic, l.underline, l.align),
  );
}

// ---------------------------------------------------------------------------
// Smart document type detection
// ---------------------------------------------------------------------------
type DocType = "formal" | "list" | "letter" | "prose";

function detectDocumentType(lines: DocLine[]): DocType {
  const nonEmpty = lines.filter((l) => l.kind !== "empty");
  if (nonEmpty.length === 0) return "prose";

  const headers = lines.filter((l) => l.kind === "header").length;
  const bullets = lines.filter(
    (l) => l.kind === "bullet" || l.kind === "ordered",
  ).length;
  const total = nonEmpty.length;

  const firstText = nonEmpty[0]?.text ?? "";
  const datePattern =
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\w+ \d{1,2},?\s*\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December))/i;
  if (datePattern.test(firstText)) return "letter";

  if (headers / total > 0.15) return "formal";
  if (bullets / total > 0.3) return "list";
  return "prose";
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  formal: "Formal Document",
  list: "List / Notes",
  letter: "Letter",
  prose: "Prose",
};

// ---------------------------------------------------------------------------
// Canvas export — dynamic height, paper-size aware
// ---------------------------------------------------------------------------
const BODY_FONT = "14px Georgia, serif";
const HEADER_FONT = "bold 18px Georgia, serif";
const SUB_FONT = "bold 14px Georgia, serif";
const LINE_H = 22;
const HEADER_LINE_H = 28;
const TEXT_COLOR = "#1a1a1a";
const MUTED_COLOR = "#555555";

function buildFont(base: string, bold?: boolean, italic?: boolean): string {
  // base examples: "14px Georgia, serif" or "bold 18px Georgia, serif"
  // We need to inject bold/italic into the font string
  const parts = base.split(" ");
  // Find where size starts (contains 'px')
  const sizeIdx = parts.findIndex((p) => p.includes("px"));
  const stylePrefix: string[] = [];
  if (bold) stylePrefix.push("bold");
  if (italic) stylePrefix.push("italic");
  // Remove existing bold/italic from parts before sizeIdx
  const cleaned = parts.slice(sizeIdx);
  if (stylePrefix.length > 0) {
    return `${stylePrefix.join(" ")} ${cleaned.join(" ")}`;
  }
  return cleaned.join(" ");
}

function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Measure total canvas height needed (dry-run, no drawing) */
function measureCanvasHeight(
  ctx: CanvasRenderingContext2D,
  docLines: DocLine[],
  docType: DocType,
  canvasW: number,
): number {
  const margin = Math.round(canvasW * 0.08);
  const contentW = canvasW - margin * 2;
  let y = margin + 16;

  for (let i = 0; i < docLines.length; i++) {
    const line = docLines[i];
    if (line.kind === "empty") {
      y += LINE_H * 0.6;
      continue;
    }
    if (line.kind === "header") {
      y += 8;
      ctx.font = buildFont(HEADER_FONT, line.bold, line.italic);
      const wrapped = wrapWords(ctx, line.text, contentW);
      y += wrapped.length * HEADER_LINE_H + 4;
      continue;
    }
    if (line.kind === "subheader") {
      y += 4;
      ctx.font = buildFont(SUB_FONT, line.bold, line.italic);
      const wrapped = wrapWords(ctx, line.text, contentW);
      y += wrapped.length * (LINE_H + 2) + 2;
      continue;
    }
    if (line.kind === "indent") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      const wrapped = wrapWords(ctx, line.text, contentW - 24);
      y += wrapped.length * LINE_H;
      continue;
    }
    if (line.kind === "bullet" || line.kind === "ordered") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      const indent = docType === "list" ? 16 : 24;
      const wrapped = wrapWords(ctx, line.text, contentW - indent - 8);
      y += wrapped.length * LINE_H + 2;
      continue;
    }
    if (line.kind === "signature") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      const prevLine = docLines[i - 1];
      if (!prevLine || prevLine.kind !== "signature") y += 30;
      y += LINE_H;
      const wrapped = wrapWords(ctx, line.text, contentW);
      y += wrapped.length * LINE_H;
      y += 8;
      continue;
    }
    ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
    const lineSpacing = docType === "list" ? LINE_H - 2 : LINE_H;
    const wrapped = wrapWords(ctx, line.text, contentW);
    y += wrapped.length * lineSpacing;
  }

  return y + margin;
}

function drawTextWithAlign(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  contentW: number,
  margin: number,
  canvasW: number,
  align: "left" | "center" | "right" | "justify" | undefined,
  underline: boolean | undefined,
) {
  const effectiveAlign = align || "left";
  let drawX = x;
  if (effectiveAlign === "center") {
    ctx.textAlign = "center";
    drawX = canvasW / 2;
  } else if (effectiveAlign === "right") {
    ctx.textAlign = "right";
    drawX = margin + contentW;
  } else {
    ctx.textAlign = "left";
    drawX = x;
  }
  ctx.fillText(text, drawX, y);

  if (underline) {
    const metrics = ctx.measureText(text);
    let ulX = drawX;
    const ulWidth = metrics.width;
    if (effectiveAlign === "center") ulX = drawX - ulWidth / 2;
    else if (effectiveAlign === "right") ulX = drawX - ulWidth;
    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ulX, y + 2);
    ctx.lineTo(ulX + ulWidth, y + 2);
    ctx.stroke();
  }

  // Reset to left
  ctx.textAlign = "left";
}

function exportToCanvas(
  docLines: DocLine[],
  docType: DocType,
  paperSize: PaperSize,
): HTMLCanvasElement {
  const { w: canvasW, h: paperH } = PAPER_SIZES[paperSize];
  const margin = Math.round(canvasW * 0.08);
  const contentW = canvasW - margin * 2;

  // Dry-run measurement
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = canvasW;
  measureCanvas.height = 100;
  const mctx = measureCanvas.getContext("2d")!;
  const measuredHeight = measureCanvasHeight(mctx, docLines, docType, canvasW);

  const CANVAS_H = Math.max(paperH, measuredHeight);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, CANVAS_H);

  let y = docType === "formal" ? margin + 40 : margin + 16;
  const titleCentered = docType === "formal";
  let firstHeaderDone = false;

  for (let i = 0; i < docLines.length; i++) {
    const line = docLines[i];
    if (line.kind === "empty") {
      y += docType === "list" ? LINE_H * 0.4 : LINE_H * 0.6;
      continue;
    }

    if (line.kind === "header") {
      y += 8;
      ctx.font = buildFont(HEADER_FONT, line.bold, line.italic);
      ctx.fillStyle = TEXT_COLOR;
      const wrapped = wrapWords(ctx, line.text, contentW);
      for (const wl of wrapped) {
        if (titleCentered && !firstHeaderDone) {
          drawTextWithAlign(
            ctx,
            wl,
            margin,
            y,
            contentW,
            margin,
            canvasW,
            "center",
            line.underline,
          );
        } else {
          drawTextWithAlign(
            ctx,
            wl,
            margin,
            y,
            contentW,
            margin,
            canvasW,
            line.align,
            line.underline,
          );
        }
        y += HEADER_LINE_H;
      }
      firstHeaderDone = true;
      y += 4;
      continue;
    }

    if (line.kind === "subheader") {
      y += 4;
      ctx.font = buildFont(SUB_FONT, line.bold, line.italic);
      ctx.fillStyle = TEXT_COLOR;
      const wrapped = wrapWords(ctx, line.text, contentW);
      for (const wl of wrapped) {
        drawTextWithAlign(
          ctx,
          wl,
          margin,
          y,
          contentW,
          margin,
          canvasW,
          line.align,
          line.underline,
        );
        y += LINE_H + 2;
      }
      y += 2;
      continue;
    }

    if (line.kind === "indent") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      ctx.fillStyle = MUTED_COLOR;
      const wrapped = wrapWords(ctx, line.text, contentW - 24);
      for (const wl of wrapped) {
        drawTextWithAlign(
          ctx,
          wl,
          margin + 24,
          y,
          contentW - 24,
          margin + 24,
          canvasW,
          line.align,
          line.underline,
        );
        y += LINE_H;
      }
      continue;
    }

    if (line.kind === "bullet") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      ctx.fillStyle = TEXT_COLOR;
      const indent = docType === "list" ? margin + 8 : margin + 16;
      const wrapped = wrapWords(
        ctx,
        line.text,
        contentW - (indent - margin) - 8,
      );
      for (let wi = 0; wi < wrapped.length; wi++) {
        if (wi === 0) {
          ctx.fillText("•", margin, y);
          drawTextWithAlign(
            ctx,
            wrapped[wi],
            indent,
            y,
            contentW - (indent - margin),
            indent,
            canvasW,
            line.align,
            line.underline,
          );
        } else {
          drawTextWithAlign(
            ctx,
            wrapped[wi],
            indent,
            y,
            contentW - (indent - margin),
            indent,
            canvasW,
            line.align,
            line.underline,
          );
        }
        y += LINE_H;
      }
      y += 2;
      continue;
    }

    if (line.kind === "ordered") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      ctx.fillStyle = TEXT_COLOR;
      const indent = docType === "list" ? margin + 20 : margin + 24;
      const numMatch = line.raw.trim().match(/^(\d+)/);
      const num = numMatch ? numMatch[1] : "";
      const wrapped = wrapWords(
        ctx,
        line.text,
        contentW - (indent - margin) - 8,
      );
      for (let wi = 0; wi < wrapped.length; wi++) {
        if (wi === 0) {
          ctx.fillText(`${num}.`, margin, y);
          drawTextWithAlign(
            ctx,
            wrapped[wi],
            indent,
            y,
            contentW - (indent - margin),
            indent,
            canvasW,
            line.align,
            line.underline,
          );
        } else {
          drawTextWithAlign(
            ctx,
            wrapped[wi],
            indent,
            y,
            contentW - (indent - margin),
            indent,
            canvasW,
            line.align,
            line.underline,
          );
        }
        y += LINE_H;
      }
      y += 2;
      continue;
    }

    if (line.kind === "signature") {
      ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
      ctx.fillStyle = TEXT_COLOR;
      const prevLine = docLines[i - 1];
      if (!prevLine || prevLine.kind !== "signature") y += 30;
      ctx.strokeStyle = TEXT_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(margin + 220, y);
      ctx.stroke();
      y += LINE_H;
      const wrapped = wrapWords(ctx, line.text, contentW);
      for (const wl of wrapped) {
        drawTextWithAlign(
          ctx,
          wl,
          margin,
          y,
          contentW,
          margin,
          canvasW,
          line.align,
          line.underline,
        );
        y += LINE_H;
      }
      y += 8;
      continue;
    }

    ctx.font = buildFont(BODY_FONT, line.bold, line.italic);
    ctx.fillStyle = TEXT_COLOR;
    const lineSpacing = docType === "list" ? LINE_H - 2 : LINE_H;
    const leftMargin = docType === "letter" ? margin + 8 : margin;
    const wrapped = wrapWords(ctx, line.text, contentW - (leftMargin - margin));
    for (const wl of wrapped) {
      drawTextWithAlign(
        ctx,
        wl,
        leftMargin,
        y,
        contentW - (leftMargin - margin),
        leftMargin,
        canvasW,
        line.align,
        line.underline,
      );
      y += lineSpacing;
    }
  }

  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvasW - 1, CANVAS_H - 1);

  return canvas;
}

// ---------------------------------------------------------------------------
// Live preview renderer
// ---------------------------------------------------------------------------
function renderLineContent(line: DocLine): React.ReactNode {
  let content: React.ReactNode = line.text;
  if (line.underline) content = <u>{content}</u>;
  if (line.italic) content = <em>{content}</em>;
  if (line.bold) content = <strong>{content}</strong>;
  return content;
}

function DocumentPreview({
  lines,
  docType,
  paperSize,
}: { lines: DocLine[]; docType: DocType; paperSize: PaperSize }) {
  const isFormal = docType === "formal";
  const isList = docType === "list";
  const isLetter = docType === "letter";

  const paper = PAPER_SIZES[paperSize];
  const previewWidth = Math.round((680 * paper.w) / 794);
  const minHeight = Math.round((previewWidth * paper.h) / paper.w);

  return (
    <div style={{ position: "relative" }}>
      {/* Doc type badge */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
        <Badge
          variant="secondary"
          className="text-[10px] tracking-wide uppercase"
        >
          {DOC_TYPE_LABELS[docType]}
        </Badge>
      </div>

      <div
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: previewWidth,
          margin: "0 auto",
          padding: isFormal
            ? "56px 64px 48px"
            : isLetter
              ? "48px 64px"
              : "48px 56px",
          boxShadow:
            "0 2px 16px 0 rgba(0,0,0,0.10), 0 1px 4px 0 rgba(0,0,0,0.06)",
          borderRadius: 4,
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#1a1a1a",
          minHeight,
        }}
      >
        {lines.map((line, idx) => {
          if (line.kind === "empty") {
            return (
              <div
                key={line.id}
                style={{ height: isList ? "0.4em" : "0.7em" }}
              />
            );
          }
          if (line.kind === "header") {
            const isFirst = lines
              .slice(0, idx)
              .every((l) => l.kind === "empty");
            return (
              <h1
                key={line.id}
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.18rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  margin: "1em 0 0.3em",
                  color: "#111",
                  lineHeight: 1.4,
                  textAlign:
                    line.align || (isFormal && isFirst ? "center" : "left"),
                }}
              >
                {renderLineContent(line)}
              </h1>
            );
          }
          if (line.kind === "subheader") {
            return (
              <h2
                key={line.id}
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  margin: "0.7em 0 0.2em",
                  color: "#1a1a1a",
                  lineHeight: 1.5,
                  textAlign: line.align || "left",
                }}
              >
                {renderLineContent(line)}
              </h2>
            );
          }
          if (line.kind === "indent") {
            return (
              <p
                key={line.id}
                style={{
                  margin: "0 0 0.2em 1.5em",
                  fontSize: "0.92rem",
                  lineHeight: 1.75,
                  color: "#444",
                  textAlign: line.align || "left",
                }}
              >
                {renderLineContent(line)}
              </p>
            );
          }
          if (line.kind === "bullet") {
            return (
              <div
                key={line.id}
                style={{
                  display: "flex",
                  gap: "0.5em",
                  margin: isList ? "0.1em 0" : "0.15em 0",
                  paddingLeft: "0.5em",
                  fontSize: "0.92rem",
                  lineHeight: isList ? 1.5 : 1.75,
                  color: "#1a1a1a",
                  textAlign: line.align || "left",
                }}
              >
                <span style={{ flexShrink: 0, paddingTop: "0.1em" }}>•</span>
                <span>{renderLineContent(line)}</span>
              </div>
            );
          }
          if (line.kind === "ordered") {
            const numMatch = line.raw.trim().match(/^(\d+)/);
            const num = numMatch ? numMatch[1] : "";
            return (
              <div
                key={line.id}
                style={{
                  display: "flex",
                  gap: "0.5em",
                  margin: isList ? "0.1em 0" : "0.15em 0",
                  paddingLeft: "0.5em",
                  fontSize: "0.92rem",
                  lineHeight: isList ? 1.5 : 1.75,
                  color: "#1a1a1a",
                  textAlign: line.align || "left",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: "1.5em",
                    paddingTop: "0.1em",
                  }}
                >
                  {num}.
                </span>
                <span>{renderLineContent(line)}</span>
              </div>
            );
          }
          if (line.kind === "signature") {
            const prevNonEmpty = lines
              .slice(0, idx)
              .filter((l) => l.kind !== "empty")
              .at(-1);
            const isFirstInGroup = prevNonEmpty?.kind !== "signature";
            return (
              <div
                key={line.id}
                style={{
                  marginTop: isFirstInGroup ? "2.5em" : "0.5em",
                  marginBottom: "0.5em",
                  borderTop: "1px solid #1a1a1a",
                  paddingTop: "0.4em",
                  fontSize: "0.88rem",
                  color: "#1a1a1a",
                  minWidth: "220px",
                  maxWidth: "280px",
                  textAlign: line.align || "left",
                }}
              >
                {renderLineContent(line)}
              </div>
            );
          }
          return (
            <p
              key={line.id}
              style={{
                margin: isList ? "0 0 0.15em" : "0 0 0.35em",
                fontSize: "0.92rem",
                lineHeight: isList ? 1.5 : 1.75,
                color: "#1a1a1a",
                paddingLeft: isLetter ? "0.5em" : undefined,
                textAlign: line.align || "left",
              }}
            >
              {renderLineContent(line)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting Toolbar
// ---------------------------------------------------------------------------
interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
}

function FormattingToolbar({
  editorRef,
}: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const [fmt, setFmt] = useState<FormatState>({
    bold: false,
    italic: false,
    underline: false,
    alignLeft: true,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
  });

  useEffect(() => {
    const updateState = () => {
      setFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        alignLeft: document.queryCommandState("justifyLeft"),
        alignCenter: document.queryCommandState("justifyCenter"),
        alignRight: document.queryCommandState("justifyRight"),
        alignJustify: document.queryCommandState("justifyFull"),
      });
    };
    document.addEventListener("selectionchange", updateState);
    return () => document.removeEventListener("selectionchange", updateState);
  }, []);

  const exec = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd);
    // Update state immediately
    setFmt({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      alignLeft: document.queryCommandState("justifyLeft"),
      alignCenter: document.queryCommandState("justifyCenter"),
      alignRight: document.queryCommandState("justifyRight"),
      alignJustify: document.queryCommandState("justifyFull"),
    });
  };

  const btnClass = (active: boolean) =>
    `h-7 w-7 p-0 flex items-center justify-center rounded transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "hover:bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div
      data-ocid="doc.toolbar.panel"
      className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.bold.toggle"
            type="button"
            className={btnClass(fmt.bold)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("bold");
            }}
            aria-label="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Bold (Ctrl+B)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.italic.toggle"
            type="button"
            className={btnClass(fmt.italic)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("italic");
            }}
            aria-label="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Italic (Ctrl+I)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.underline.toggle"
            type="button"
            className={btnClass(fmt.underline)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("underline");
            }}
            aria-label="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Underline (Ctrl+U)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.align_left.toggle"
            type="button"
            className={btnClass(fmt.alignLeft)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyLeft");
            }}
            aria-label="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Align Left</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.align_center.toggle"
            type="button"
            className={btnClass(fmt.alignCenter)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyCenter");
            }}
            aria-label="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Align Center</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.align_right.toggle"
            type="button"
            className={btnClass(fmt.alignRight)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyRight");
            }}
            aria-label="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Align Right</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-ocid="doc.align_justify.toggle"
            type="button"
            className={btnClass(fmt.alignJustify)}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyFull");
            }}
            aria-label="Justify"
          >
            <AlignJustify className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Justify</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [editorHtml, setEditorHtml] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { actor } = useActor();

  // Native input listener for reliable contentEditable sync
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handler = () => setEditorHtml(el.innerHTML);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const docLines = useMemo(() => parseDocument(editorHtml), [editorHtml]);
  const docType = useMemo(() => detectDocumentType(docLines), [docLines]);
  const isEmpty = editorHtml.replace(/<[^>]*>/g, "").trim() === "";

  const getPlainText = useCallback(() => {
    return editorHtml.replace(/<[^>]*>/g, "");
  }, [editorHtml]);

  const handleSaveAsImage = useCallback(async () => {
    if (isEmpty) return;
    setIsSaving(true);
    try {
      const canvas = exportToCanvas(docLines, docType, paperSize);
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error("Failed to create image.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `document-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Image saved!");
      }, "image/png");
    } catch (_err) {
      toast.error("Failed to export image.");
    } finally {
      setIsSaving(false);
    }
  }, [docLines, docType, isEmpty, paperSize]);

  const handleAiStructure = useCallback(async () => {
    if (!actor || isEmpty || isStructuring) return;
    setIsStructuring(true);
    try {
      const plainText = getPlainText();
      const result = await (actor as any).generateDocument(
        "auto",
        "Detect the document type from the heading and content of the following text. Then restructure and rewrite it as a properly formatted professional document of that type, with all standard sections in the correct professional order, appropriate headings, and formal language as a human professional would type it. Output only the final structured document, no explanations or preamble.",
        plainText,
        "Formal / Structured",
      );
      let structured: string | null = null;
      if (typeof result === "string") {
        structured = result;
      } else if (Array.isArray(result) && result.length > 0) {
        structured = result[0] as string;
      } else if (result && typeof result === "object" && "ok" in result) {
        structured = (result as { ok: string }).ok;
      }
      if (structured && structured.trim().length > 0) {
        // Convert plain text to HTML
        const newHtml = structured
          .split("\n")
          .map((line) => `<div>${line || "<br>"}</div>`)
          .join("");
        if (editorRef.current) {
          editorRef.current.innerHTML = newHtml;
        }
        setEditorHtml(newHtml);
        toast.success("Document structured successfully!");
      } else {
        toast.error("AI returned an empty response. Please try again.");
      }
    } catch (_err) {
      toast.error("Failed to structure document. Please try again.");
    } finally {
      setIsStructuring(false);
    }
  }, [actor, isEmpty, isStructuring, getPlainText]);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col">
          <div className="px-5 py-5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <span className="font-semibold text-[15px] text-foreground tracking-tight">
                  DocGen AI
                </span>
                <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                  Document to Image
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                How it works
              </p>
              <ul className="space-y-3 text-[12px] text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  Paste your document text in the editor
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                    2
                  </span>
                  Use formatting toolbar to style text
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                    3
                  </span>
                  Use AI Structure to professionally format it
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                    4
                  </span>
                  Click{" "}
                  <strong className="text-foreground">Save as Image</strong> to
                  export as PNG
                </li>
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Formatting shortcuts
              </p>
              <ul className="space-y-2 text-[12px] text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">B</span>
                  <span>
                    <kbd className="text-[10px] bg-muted px-1 rounded">
                      Ctrl+B
                    </kbd>{" "}
                    Bold
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">I</span>
                  <span>
                    <kbd className="text-[10px] bg-muted px-1 rounded">
                      Ctrl+I
                    </kbd>{" "}
                    Italic
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">U</span>
                  <span>
                    <kbd className="text-[10px] bg-muted px-1 rounded">
                      Ctrl+U
                    </kbd>{" "}
                    Underline
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">#</span>
                  <code className="text-[11px]"># Heading</code> → bold heading
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">•</span>
                  <code className="text-[11px]">- item</code> → bullet
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary font-bold mt-px">✍</span>
                  <code className="text-[11px]">Signed:</code> → signature block
                </li>
              </ul>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-border">
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              © {new Date().getFullYear()} Built with ♥ using caffeine.ai
            </a>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-6 bg-card border-b border-border flex-shrink-0 gap-4">
            <h1 className="text-lg font-semibold text-foreground">
              Document Editor
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-ocid="doc.save_image.primary_button"
                    onClick={handleSaveAsImage}
                    disabled={isEmpty || isSaving}
                    className="h-9 gap-2"
                  >
                    <ImageDown className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save as Image"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export document as PNG image</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Input pane */}
            <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[13px] font-medium text-foreground">
                  Your Text
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Paste or type your document content
                </p>
              </div>

              {/* Formatting toolbar */}
              <FormattingToolbar editorRef={editorRef} />

              <ScrollArea className="flex-1">
                <div className="p-4">
                  <div
                    ref={editorRef}
                    data-ocid="doc.text.editor"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => {
                      if (editorRef.current) {
                        setEditorHtml(editorRef.current.innerHTML);
                      }
                    }}
                    onPaste={(_e) => {
                      // On paste, allow default but then sync
                      setTimeout(() => {
                        if (editorRef.current) {
                          setEditorHtml(editorRef.current.innerHTML);
                        }
                      }, 0);
                    }}
                    className="text-sm font-mono leading-relaxed w-full outline-none border border-input rounded-md px-3 py-2 bg-background text-foreground focus:ring-1 focus:ring-ring"
                    style={{
                      minHeight: "500px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                    data-placeholder="Paste your document text here...\n\nExample:\n\nCONTRACT AGREEMENT\n\nParties:\n  John Smith (Client)\n  Acme Corp (Service Provider)"
                  />
                </div>
              </ScrollArea>

              {/* Paper size selector */}
              <div className="px-4 pb-3">
                <Label
                  htmlFor="paper-size-select"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
                >
                  Paper Size
                </Label>
                <Select
                  value={paperSize}
                  onValueChange={(v) => setPaperSize(v as PaperSize)}
                >
                  <SelectTrigger
                    id="paper-size-select"
                    data-ocid="doc.paper_size.select"
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAPER_SIZES) as PaperSize[]).map((key) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {PAPER_SIZES[key].label} ({PAPER_SIZES[key].w} ×{" "}
                        {PAPER_SIZES[key].h}px)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Structure button */}
              <div className="px-4 pb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      data-ocid="doc.ai_structure.button"
                      variant="outline"
                      size="sm"
                      onClick={handleAiStructure}
                      disabled={isEmpty || isStructuring || !actor}
                      className="w-full gap-2"
                    >
                      <Wand2 className="w-4 h-4" />
                      {isStructuring ? "Structuring..." : "AI Structure"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Let AI professionally structure your document based on its
                    type
                  </TooltipContent>
                </Tooltip>
              </div>

              {!isEmpty && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 pb-4"
                >
                  <Button
                    data-ocid="doc.save_image.secondary_button"
                    onClick={handleSaveAsImage}
                    disabled={isSaving}
                    className="w-full gap-2"
                    size="sm"
                  >
                    <FileImage className="w-4 h-4" />
                    Save as Image
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Preview pane */}
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <div className="px-4 py-3 border-b border-border bg-card">
                <p className="text-[13px] font-medium text-foreground">
                  Document Preview
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Live formatted preview — what the image will look like
                </p>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-8" ref={previewRef}>
                  {isEmpty ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      data-ocid="doc.preview.empty_state"
                      className="flex flex-col items-center justify-center py-24 text-center"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                        <FileText className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <p className="text-[15px] font-medium text-foreground mb-1">
                        No content yet
                      </p>
                      <p className="text-[13px] text-muted-foreground max-w-xs">
                        Paste your document text on the left and watch it render
                        as a beautifully formatted document.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      data-ocid="doc.preview.panel"
                    >
                      <DocumentPreview
                        lines={docLines}
                        docType={docType}
                        paperSize={paperSize}
                      />
                    </motion.div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}
