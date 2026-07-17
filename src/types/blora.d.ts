export {};

type BloraConfigureOptions = {
  autoInit?: boolean;
  portalRoot?: string | Element | null;
  colorModeStorageKey?: string;
  /** @deprecated alias for colorModeStorageKey */
  storageKey?: string;
  paletteStorageKey?: string;
};

declare global {
  interface Window {
    BloraConfig?: BloraConfigureOptions;
    Blora?: {
      version?: string;
      init: (root?: ParentNode) => void;
      configure?: (opts: BloraConfigureOptions) => Record<string, unknown>;
      setOptions?: (opts: BloraConfigureOptions) => Record<string, unknown>;
      applyPalette?: (
        palette: string,
        target?: Element,
        options?: { persist?: boolean; emit?: boolean },
      ) => boolean | void;
      getPalette?: (target?: Element) => string;
      palettes?: Readonly<
        Record<string, { name: string; description: string; colors: readonly string[] }>
      >;
      toast?: (opts: string | { type?: string; message?: string; duration?: number }) => void;
      openModal?: (id: string) => void;
      closeModal?: (id: string) => void;
      openDrawer?: (id: string) => void;
      closeDrawer?: (id: string) => void;
    };
  }
}
