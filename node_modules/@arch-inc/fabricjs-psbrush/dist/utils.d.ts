export declare type FabricPointerEvent = TouchEvent | MouseEvent | PointerEvent;
export interface FabricEvent {
    e: FabricPointerEvent;
    pointer: FabricPointer;
}
export interface FabricPointer {
    x: number;
    y: number;
}
export declare function getPressure(ev: FabricPointerEvent): number;
