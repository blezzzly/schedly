// Ambient module declarations for packages that don't ship their own types.
// These are real packages with no .d.ts — better-auth/next-js, @base-ui/react subpaths,
// firebase, html2canvas-pro. lucide-react ships broken types so we override.

declare module 'lucide-react';

declare module 'better-auth/next-js';

declare module 'firebase/app';
declare module 'firebase/messaging';

declare module '@base-ui/react/merge-props' {
  export function mergeProps<T extends object>(...sources: T[]): T;
}

declare module '@base-ui/react/use-render';
declare module '@base-ui/react/button';
declare module '@base-ui/react/checkbox';
declare module '@base-ui/react/dialog';
declare module '@base-ui/react/menu';
declare module '@base-ui/react/input';
declare module '@base-ui/react/separator';
declare module '@base-ui/react/tabs';

declare module 'html2canvas-pro' {
  export interface Html2CanvasOptions {
    allowTaint?: boolean;
    backgroundColor?: string | null;
    canvas?: HTMLCanvasElement;
    foreignObjectRendering?: boolean;
    imageTimeout?: number;
    logging?: boolean;
    onclone?: (clonedDoc: Document) => void;
    proxy?: string;
    removeContainer?: boolean;
    scale?: number;
    useCORS?: boolean;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
  }
  export function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
}
