import type React from "react";

// Tipagem mínima do web component <model-viewer> (@google/model-viewer) para JSX (React 19).
interface ModelViewerAttributes extends React.HTMLAttributes<HTMLElement>, React.Attributes {
  src?: string;
  "ios-src"?: string;
  poster?: string;
  alt?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: "auto" | "fixed";
  "ar-placement"?: "floor" | "wall";
  "camera-controls"?: boolean;
  "touch-action"?: string;
  "auto-rotate"?: boolean;
  "shadow-intensity"?: string;
  "shadow-softness"?: string;
  exposure?: string;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "manual";
  scale?: string;
  "interaction-prompt"?: "auto" | "none";
  "camera-orbit"?: string;
  "min-camera-orbit"?: string;
  "max-camera-orbit"?: string;
  "xr-environment"?: boolean;
  ref?: React.Ref<HTMLElement>;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}

export interface ModelViewerElement extends HTMLElement {
  canActivateAR: boolean;
  scale: string;
  activateAR(): Promise<void>;
  getDimensions(): { x: number; y: number; z: number };
  updateFraming(): Promise<void>;
}
