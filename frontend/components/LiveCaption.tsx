import React, { useEffect, useRef } from "react";
import { MEDICINES_LIST } from "@/lib/medicines";
import { Sparkles } from "lucide-react";

interface LiveCaptionProps {
  transcriptStream: {
    finalText: string;
    interimText: string;
  };
}

interface WordItem {
  text: string;
  isFinal: boolean;
  isCorrected?: boolean;
  originalText?: string;
}

// Common words in medical transcriptions to exclude from fuzzy correction
const SKIP_WORDS = new Set([
  "once", "twice", "three", "daily", "times", "after", "before", "food", "meals", "weeks",
  "days", "months", "take", "with", "water", "tablet", "tablets", "capsule", "capsules",
  "every", "hours", "milligrams", "mg", "ml", "grams", "and", "the", "for", "give", "need",
  "needs", "patient", "prescribe", "prescription", "morning", "afternoon", "night", "evening",
  "daily."
]);

// Helper for Levenshtein Distance
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

// Helper to calculate similarity ratio (0 to 1)
function getSimilarity(a: string, b: string): number {
  const distance = getLevenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
}

export default function LiveCaption({ transcriptStream }: LiveCaptionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { finalText, interimText } = transcriptStream;

  // Auto-scroll logic: keep the bottom content in view
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [finalText, interimText]);

  // Split and process finalized text
  const finalWords = finalText ? finalText.split(/\s+/) : [];
  const processedFinalWords: WordItem[] = finalWords.map((word) => {
    // Strip punctuation to check matching
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const wordLower = cleanWord.toLowerCase();

    // Check if it's already a perfect match or a skip-word
    const isKnownMedicine = MEDICINES_LIST.some((m) => m.toLowerCase() === wordLower);
    
    if (
      wordLower.length >= 4 &&
      !isKnownMedicine &&
      !SKIP_WORDS.has(wordLower)
    ) {
      // Find best match in MEDICINES_LIST
      let bestMatch = "";
      let maxScore = 0;
      for (const med of MEDICINES_LIST) {
        const score = getSimilarity(cleanWord, med);
        if (score > maxScore) {
          maxScore = score;
          bestMatch = med;
        }
      }

      // If similarity is high (> 80%), correct it
      if (maxScore > 0.8 && bestMatch) {
        // Keep the original punctuation if it was attached
        const originalPunctuation = word.slice(cleanWord.length);
        return {
          text: bestMatch + originalPunctuation,
          isFinal: true,
          isCorrected: true,
          originalText: word,
        };
      }
    }

    return {
      text: word,
      isFinal: true,
    };
  });

  // Split and process interim words
  const interimWords = interimText ? interimText.split(/\s+/) : [];
  const processedInterimWords: WordItem[] = interimWords.map((word) => ({
    text: word,
    isFinal: false,
  }));

  const allWords = [...processedFinalWords, ...processedInterimWords].filter((w) => w.text.trim() !== "");

  return (
    <div
      ref={containerRef}
      className="w-full max-h-64 overflow-y-auto text-center flex flex-col justify-center items-center transition-all scroll-smooth select-text py-2"
    >
      <div className="flex-1 w-full flex justify-center items-center">
        {allWords.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-3 justify-center items-center text-2xl md:text-3xl font-sans leading-relaxed text-slate-800 w-full max-w-xl">
            {allWords.map((wordObj, idx) => {
              const isLast = idx === allWords.length - 1;
              const isCurrent = !wordObj.isFinal && isLast;

              if (wordObj.isCorrected) {
                return (
                  <span
                    key={idx}
                    className="group relative inline-flex items-center gap-1 border-b-2 border-dashed border-blue-400 cursor-help text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-lg text-lg md:text-xl font-semibold transition-all duration-200 hover:bg-blue-100 animate-fade-in"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
                    {wordObj.text}
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 shadow-lg whitespace-nowrap">
                      corrected from: <span className="line-through text-slate-300 font-bold">{wordObj.originalText}</span>
                    </span>
                  </span>
                );
              }

              return (
                <span
                  key={idx}
                  className={`transition-all duration-200 transform ${
                    wordObj.isFinal
                      ? "text-slate-800 font-medium"
                      : isCurrent
                      ? "text-blue-600 scale-105 font-bold animate-pulse"
                      : "text-blue-500 font-semibold"
                  }`}
                  style={{
                    display: "inline-block",
                  }}
                >
                  {wordObj.text}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs italic text-[#6B7280] mt-1 select-none">
            No audio input. Click "Start Recording" and speak clearly to see realtime transcription...
          </p>
        )}
      </div>
    </div>
  );
}
