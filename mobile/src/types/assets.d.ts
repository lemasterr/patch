declare module "*.png" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}

declare module "*.jpg" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}

declare module "*.webp" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}

declare module "svg-maps__common" {
  export type Location = { name: string; id: string; path: string };
  export type Map = {
    label: string;
    viewBox: string;
    locations: Location[];
  };
}
