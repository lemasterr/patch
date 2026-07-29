export type WorldRegion = {
  id: "world" | "europe" | "asia" | "africa" | "americas" | "oceania";
  label: string;
  codes?: ReadonlySet<string>;
};

const europe = new Set(
  "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK".split(
    " ",
  ),
);
const asia = new Set(
  "AE AF AM AZ BD BH BN BT CC CN CX GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE".split(
    " ",
  ),
);
const africa = new Set(
  "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW".split(
    " ",
  ),
);
const americas = new Set(
  "AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GS GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI".split(
    " ",
  ),
);
const oceania = new Set(
  "AS AU CK FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS".split(
    " ",
  ),
);

export const worldRegions: readonly WorldRegion[] = [
  {
    id: "world",
    label: "World",
  },
  {
    id: "europe",
    label: "Europe",
    codes: europe,
  },
  {
    id: "asia",
    label: "Asia",
    codes: asia,
  },
  {
    id: "africa",
    label: "Africa",
    codes: africa,
  },
  {
    id: "americas",
    label: "Americas",
    codes: americas,
  },
  {
    id: "oceania",
    label: "Oceania",
    codes: oceania,
  },
];
