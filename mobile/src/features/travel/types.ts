export type VisitStatus = "visited" | "lived" | "wishlist";

export type TravelVisit = {
  country_code: string;
  country_name: string;
  visited_at: string;
  status: VisitStatus;
  visit_month: number | null;
  visit_year: number | null;
  note: string | null;
  updated_at: string;
};

export type MapFocusId =
  "world" | "europe" | "asia" | "africa" | "americas" | "oceania";

export type MapFocus = {
  id: string;
  label: string;
  zoom: number;
  centerX: number;
  centerY: number;
};
