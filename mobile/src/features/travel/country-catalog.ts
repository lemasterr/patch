import type { VisitStatus } from "@/features/travel/types";
export {
  focusByCountryCode,
  focusById,
  MAP_HEIGHT,
  MAP_WIDTH,
  mapFocuses,
} from "@/features/travel/map-geometry";
export const countableCountryCodes = new Set(
  [
    "AD AL AT BA BE BG BY CH CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA",
    "AE AF AM AZ BH BD BN BT CN CY GE ID IN IQ IR IL JP JO KG KH KP KR KW KZ LA LB LK MM MN MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR UZ VN YE",
    "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW",
    "AG AR BB BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN HT JM KN LC MX NI PA PE PY SR SV TT US UY VC VE",
    "AU FJ FM KI MH NR NZ PG PW SB TO TV VU WS",
  ]
    .join(" ")
    .split(" "),
);

// The country count is intentionally derived from the canonical set. Keeping a
// separate literal here made it too easy for the map, picker, and `/195` label
// to quietly disagree about what counts as a country.
export const WORLD_COUNTRY_TOTAL = countableCountryCodes.size;

export const countryPickerRegions = [
  {
    id: "europe",
    label: "Europe",
    codes:
      "AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK",
  },
  {
    id: "asia",
    label: "Asia",
    codes:
      "AE AF AM AZ BD BH BN BT CC CN CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
  },
  {
    id: "africa",
    label: "Africa",
    codes:
      "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GF GH GM GN GO GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
  },
  {
    id: "americas",
    label: "Americas",
    codes:
      "AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GL GP GS GT GU GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI",
  },
  {
    id: "oceania",
    label: "Oceania",
    codes:
      "AS AU CK FJ FM HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TF TK TO TV UM VU WF WS",
  },
] as const;

const explicitFlags: Record<string, string> = {
  // @svg-maps includes these two French-administered islands with historic
  // shorthand IDs that Unicode does not assign a regional-indicator flag.
  GO: "🇫🇷",
  JU: "🇫🇷",
};

export const statusMeta: Record<
  VisitStatus,
  {
    label: string;
    color: string;
    icon: "check" | "home-outline" | "bookmark-outline";
  }
> = {
  visited: { label: "Visited", color: "#4A7DB7", icon: "check" },
  lived: { label: "Lived", color: "#4A8F82", icon: "home-outline" },
  wishlist: {
    label: "Wishlist",
    color: "#826FB6",
    icon: "bookmark-outline",
  },
};

export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function countryFlag(code: string) {
  const normalized = code.toUpperCase();
  if (explicitFlags[normalized]) return explicitFlags[normalized];
  return String.fromCodePoint(
    ...normalized.split("").map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

export function isExplored(status: VisitStatus) {
  return status === "visited" || status === "lived";
}
