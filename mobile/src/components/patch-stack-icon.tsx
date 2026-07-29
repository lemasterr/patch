import Svg, { Rect } from "react-native-svg";

type PatchStackIconProps = {
  color: string;
  size?: number;
  active?: boolean;
};

/** A compact fan of physical Patches, inspired by the product's fabric form. */
export function PatchStackIcon({
  color,
  size = 24,
  active = false,
}: PatchStackIconProps) {
  const patches = [-34, -23, -12, -1, 10, 21] as const;

  return (
    <Svg
      accessibilityElementsHidden
      pointerEvents="none"
      width={size}
      height={size}
      viewBox="0 0 28 28"
    >
      {patches.map((rotation, index) => (
        <Rect
          key={rotation}
          x={8.7}
          y={5.6}
          width={12.8}
          height={16.4}
          rx={2.25}
          fill={color}
          fillOpacity={(active ? 0.42 : 0.2) + index * 0.07}
          stroke={color}
          strokeOpacity={active ? 0.96 : 0.7}
          strokeWidth={0.58}
          transform={`rotate(${rotation} 10.2 21.1)`}
        />
      ))}
    </Svg>
  );
}
