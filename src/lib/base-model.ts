export interface BaseModel {
  revision?: number;
  id: string;
  category: string;
  name: string;
  material: string;
  sizes: string[];
  printArea: { widthCm: number; heightCm: number } | null;
  backPrintEnabled?: boolean;
  customEnabled?: boolean;
  basePriceToman?: number;
  capacityMl?: number;
  widthCm?: number;
  heightCm?: number;
  printMethod?: string;
  care?: string;
  cut?: string;
  sizeChart?: { size: string; chest: number; length: number; sleeve: number }[];
  model?: {
    kind: "procedural-v1" | "glb";
    url?: string;
    frontAnchor?: [number, number, number];
    backAnchor?: [number, number, number];
    sizeMorphs?: Record<string, Record<string, number>>;
  };
}
