// 已弃用：原先用于签名相似度比对的工具已移除。
// 如果需要签名轨迹类型，可在组件中定义。本文件保留仅作占位，避免引用缺失。

export type Point = { x: number; y: number; t?: number; p?: number };
export type Stroke = Point[];
export type Signature = Stroke[];
