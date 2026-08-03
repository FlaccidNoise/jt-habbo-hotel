import type { FurniDef } from "./protocol.ts";

export const PROTOTYPE_CATALOG: FurniDef[] = [
  { id: "chair_basic", name: "Chair",  w: 1, l: 1, stackHeights: [1.0],  canWalk: false, canSit: true,  canStackOn: false, color: 0xb5651d },
  { id: "table_basic", name: "Table",  w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canSit: false, canStackOn: true,  color: 0x8b4513 },
  { id: "sofa_basic",  name: "Sofa",   w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canSit: true,  canStackOn: false, color: 0x7a3e9d },
  { id: "plant_basic", name: "Plant",  w: 1, l: 1, stackHeights: [2.0],  canWalk: false, canSit: false, canStackOn: false, color: 0x2e8b57 },
  { id: "rug_basic",   name: "Rug",    w: 3, l: 2, stackHeights: [0.05], canWalk: true,  canSit: false, canStackOn: true,  color: 0xaa3333 },
];
