import Svg, { Circle, Path } from "react-native-svg";

type PatchMapIconProps = {
  color: string;
  size?: number;
  active?: boolean;
};

/** A folded travel map with a small route and destination marker. */
export function PatchMapIcon({
  color,
  size = 24,
  active = false,
}: PatchMapIconProps) {
  const outline = color;
  return (
    <Svg
      accessibilityElementsHidden
      pointerEvents="none"
      width={size}
      height={size}
      viewBox="0 0 28 28"
    >
      <Path
        d="M3.5 6.7 9.7 4l8.1 2.7 6.7-2.8v17.4l-6.7 2.8-8.1-2.7-6.2 2.7Z"
        fill={active ? color : "transparent"}
        fillOpacity={active ? 0.18 : 0}
        stroke={outline}
        strokeWidth={1.55}
        strokeLinejoin="round"
      />
      <Path
        d="M9.7 4v17.4M17.8 6.7v17.4"
        stroke={outline}
        strokeOpacity={0.72}
        strokeWidth={1.15}
      />
      <Path
        d="M6.2 17.6c2.7-3 4.8 1.1 7.2-1.7 1.3-1.5 2.1-3.6 4.6-3.8"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.45}
        strokeDasharray="1.2 2.2"
      />
      <Path
        d="M22.1 8.1c0 2.5-3.1 5.5-3.1 5.5s-3.1-3-3.1-5.5a3.1 3.1 0 1 1 6.2 0Z"
        fill={color}
        stroke={color}
        strokeWidth={0.65}
      />
      <Circle
        cx={19}
        cy={8.1}
        r={1.05}
        fill={active ? "rgba(0,0,0,0.5)" : "transparent"}
      />
    </Svg>
  );
}
