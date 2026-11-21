export type CardPosition = 'left' | 'middle' | 'right' | 'none';
export interface Point { x: number; y: number }
export function roundedSkewedCardPathUniform(options: { width: number; height: number; skewDeg: number; position: CardPosition; radius?: number; angleComp?: number }): string;
export function cardCorners(width: number, height: number, skewDeg: number, position: CardPosition): Point[];
