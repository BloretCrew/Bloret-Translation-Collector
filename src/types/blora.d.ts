export {};

declare global {
  interface Window {
    Blora?: {
      init: (root?: ParentNode) => void;
      configure?: (opts: Record<string, unknown>) => void;
      applyTheme?: (
        theme: string,
        target?: Element,
        options?: { applyDefaultPalette?: boolean; persist?: boolean },
      ) => boolean | void;
      applyPalette?: (
        palette: string,
        target?: Element,
        options?: { persist?: boolean },
      ) => boolean | void;
      toast?: (opts: { type: string; message: string; duration?: number }) => void;
      openModal?: (id: string) => void;
      closeModal?: (id: string) => void;
    };
  }
}
