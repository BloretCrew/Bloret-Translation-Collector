import type { FlatEntry } from "@/lib/json-i18n";

/** Serialization style detected from the original file text. */
export type FormatMeta = {
  /** JSON indent spaces, tab string, or 0 for minified. Properties may ignore. */
  indent?: number | string;
  trailingNewline?: boolean;
  newline?: "\n" | "\r\n";
  bom?: boolean;
  /** Format-specific extras (e.g. properties separator style). */
  extra?: Record<string, unknown>;
};

export type ParseSuccess = {
  /** Structural tree used for nested formats (JSON). Flat formats may use {}. */
  data: Record<string, unknown>;
  entries: FlatEntry[];
  formatMeta: FormatMeta;
  warnings: string[];
  error?: undefined;
};

export type ParseFailure = {
  data: Record<string, unknown>;
  entries: FlatEntry[];
  formatMeta: FormatMeta;
  warnings: string[];
  error: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

export type ExportOptions = {
  fallbackToSource?: boolean;
};

export type FormatHandler = {
  id: string;
  extensions: string[];
  contentType: string;
  /** Parse raw file text into structure + flat string entries. */
  parse(content: string): ParseResult;
  /**
   * Apply translations and serialize back to file text.
   * Prefer walking original structure / raw lines for fidelity.
   */
  export(
    rawContent: string | null,
    data: Record<string, unknown>,
    translations: Map<string, string>,
    formatMeta: FormatMeta | null,
    options?: ExportOptions,
  ): string;
};

export function defaultFormatMeta(): FormatMeta {
  return {
    indent: 2,
    trailingNewline: true,
    newline: "\n",
    bom: false,
  };
}
