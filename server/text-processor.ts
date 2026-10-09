/**
 * DEX//VOICE Script Preprocessing & Sentence-Aware Chunking Engine
 */

export interface ScriptChunk {
  index: number;
  text: string;
  wordCount: number;
  charCount: number;
}

export interface ScriptAnalysis {
  rawWordCount: number;
  spokenWordCount: number;
  estimatedDurationSec: number;
  removedDirections: string[];
  cleanText: string;
  chunks: ScriptChunk[];
  coverageVerified: boolean;
}

// Regex to identify stage/performance directions in square brackets [ ... ]
const SQUARE_BRACKET_DIRECTION_REGEX = /\[\s*([^\]]+?)\s*\]/g;

// Regex to identify standalone parenthetical performance directions (e.g. (pause), (beat), (sigh))
// We do NOT remove conversational parentheticals like "(as I mentioned previously)"
const PARENTHETICAL_DIRECTION_REGEX =
  /\(\s*(?:pause|beat|sigh|chuckle|laugh|cough|snort|silence|whisper|shout|music|sound(?: effect)?|applause|throat(?:\s+clearing)?|groan|gasp|inwardly)\s*\)/gi;

export function countWords(str: string): number {
  if (!str || !str.trim()) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strips non-spoken stage directions while strictly preserving ordinary prose parentheticals
 */
export function sanitizeScript(rawText: string): { cleanText: string; removedDirections: string[] } {
  if (!rawText) return { cleanText: "", removedDirections: [] };

  const removed: string[] = [];

  // 1. Extract and strip square brackets [ ... ]
  let text = rawText.replace(SQUARE_BRACKET_DIRECTION_REGEX, (match, inner) => {
    removed.push(match.trim());
    return " ";
  });

  // 2. Extract and strip known parenthetical stage directions
  text = text.replace(PARENTHETICAL_DIRECTION_REGEX, (match) => {
    removed.push(match.trim());
    return " ";
  });

  // 3. Clean up whitespace: normalize multiple spaces while preserving paragraph breaks
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => {
      // Allow single empty lines for paragraph separation, remove consecutive empty lines
      if (line === "" && arr[i - 1] === "") return false;
      return true;
    })
    .join("\n")
    .trim();

  return {
    cleanText: text,
    removedDirections: removed,
  };
}

/**
 * Splits sanitized text into sentence tokens, handling common abbreviations
 */
export function tokenizeSentences(text: string): string[] {
  // Common titles & abbreviations that should not trigger sentence splits
  const protectedAbbrs = [
    "Mr",
    "Mrs",
    "Ms",
    "Dr",
    "Prof",
    "Rev",
    "Lord",
    "Lady",
    "Sir",
    "Esq",
    "St",
    "vs",
    "etc",
    "i.e",
    "e.g",
    "approx",
    "dept",
  ];

  // Temporarily mask abbreviation periods
  let masked = text;
  protectedAbbrs.forEach((abbr, idx) => {
    const regex = new RegExp(`\\b${abbr}\\.`, "gi");
    masked = masked.replace(regex, `__ABBR_${idx}__`);
  });

  // Split on sentence boundaries: period, exclamation, question mark followed by whitespace or line break
  const rawSentences = masked.split(/(?<=[.?!])\s+(?=[A-Z0-9"“'‘\n])/);

  // Restore abbreviations
  const sentences: string[] = [];
  for (const s of rawSentences) {
    let unmasked = s;
    protectedAbbrs.forEach((abbr, idx) => {
      const token = `__ABBR_${idx}__`;
      unmasked = unmasked.split(token).join(`${abbr}.`);
    });
    const trimmed = unmasked.trim();
    if (trimmed) {
      sentences.push(trimmed);
    }
  }

  return sentences;
}

/**
 * If a single sentence exceeds the chunk word threshold, split it on semicolons, colons, or em-dashes
 */
function splitSubSentence(sentence: string, maxWords: number): string[] {
  const words = countWords(sentence);
  if (words <= maxWords) return [sentence];

  // Try splitting by semicolons, colons, or em-dashes
  const clauses = sentence.split(/(?<=[;:\u2014\u2013])\s+/);
  if (clauses.length > 1) {
    const result: string[] = [];
    let cur = "";
    for (const cl of clauses) {
      if (!cur) {
        cur = cl;
      } else if (countWords(cur + " " + cl) <= maxWords) {
        cur += " " + cl;
      } else {
        result.push(cur);
        cur = cl;
      }
    }
    if (cur) result.push(cur);
    return result;
  }

  // Fallback: split on commas if still too long
  const commaClauses = sentence.split(/(?<=,)\s+/);
  if (commaClauses.length > 1) {
    const result: string[] = [];
    let cur = "";
    for (const cl of commaClauses) {
      if (!cur) {
        cur = cl;
      } else if (countWords(cur + " " + cl) <= maxWords) {
        cur += " " + cl;
      } else {
        result.push(cur);
        cur = cl;
      }
    }
    if (cur) result.push(cur);
    return result;
  }

  return [sentence];
}

/**
 * Chunks a script into sentence-aware segments of approximately 150-250 words
 */
export function chunkScript(
  cleanText: string,
  targetWords = 200,
  maxWords = 250
): ScriptChunk[] {
  if (!cleanText || !cleanText.trim()) return [];

  const sentences = tokenizeSentences(cleanText);
  const chunks: ScriptChunk[] = [];

  let currentChunkSentences: string[] = [];
  let currentChunkWords = 0;

  for (const sentence of sentences) {
    const sWords = countWords(sentence);

    if (sWords > maxWords) {
      // Flush current chunk if any
      if (currentChunkSentences.length > 0) {
        const text = currentChunkSentences.join(" ");
        chunks.push({
          index: chunks.length,
          text,
          wordCount: countWords(text),
          charCount: text.length,
        });
        currentChunkSentences = [];
        currentChunkWords = 0;
      }

      // Split the oversized sentence into sub-clauses
      const subClauses = splitSubSentence(sentence, maxWords);
      for (const clause of subClauses) {
        const cWords = countWords(clause);
        if (currentChunkWords + cWords > maxWords && currentChunkSentences.length > 0) {
          const text = currentChunkSentences.join(" ");
          chunks.push({
            index: chunks.length,
            text,
            wordCount: countWords(text),
            charCount: text.length,
          });
          currentChunkSentences = [clause];
          currentChunkWords = cWords;
        } else {
          currentChunkSentences.push(clause);
          currentChunkWords += cWords;
        }
      }
      continue;
    }

    if (currentChunkWords + sWords > maxWords && currentChunkSentences.length > 0) {
      // Chunk reaches capacity
      const text = currentChunkSentences.join(" ");
      chunks.push({
        index: chunks.length,
        text,
        wordCount: countWords(text),
        charCount: text.length,
      });
      currentChunkSentences = [sentence];
      currentChunkWords = sWords;
    } else {
      currentChunkSentences.push(sentence);
      currentChunkWords += sWords;
    }
  }

  if (currentChunkSentences.length > 0) {
    const text = currentChunkSentences.join(" ");
    chunks.push({
      index: chunks.length,
      text,
      wordCount: countWords(text),
      charCount: text.length,
    });
  }

  return chunks;
}

/**
 * Complete analysis: clean, chunk, and verify 100% coverage
 */
export function analyzeScript(rawScript: string, targetWpm = 300): ScriptAnalysis {
  const rawWords = countWords(rawScript);
  const { cleanText, removedDirections } = sanitizeScript(rawScript);
  const spokenWords = countWords(cleanText);

  const chunks = chunkScript(cleanText);

  // Coverage verification:
  const chunkWordsSum = chunks.reduce((sum, c) => sum + c.wordCount, 0);
  const coverageVerified = spokenWords === chunkWordsSum;

  const estimatedDurationSec = spokenWords > 0 ? Math.round((spokenWords / targetWpm) * 60) : 0;

  return {
    rawWordCount: rawWords,
    spokenWordCount: spokenWords,
    estimatedDurationSec,
    removedDirections,
    cleanText,
    chunks,
    coverageVerified,
  };
}
