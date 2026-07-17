export {};

declare global {
  interface Window {
    Blora?: {
      init: (root?: ParentNode) => void;
      configure?: (opts: Record<string, unknown>) => void;
      applyTheme?: (theme: string) => void;
      applyPalette?: (palette: string) => void;
      toast?: (opts: { type: string; message: string; duration?: number }) => void;
      openModal?: (id: string) => void;
      closeModal?: (id: string) => void;
    };
  }
}
