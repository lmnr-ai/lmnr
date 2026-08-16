import { getClusterColorById } from "@/lib/clusters/colors";

// The one cluster the landing narrative follows end to end: the signal-event
// card's pill names it, and the clusters animation in has-this-issue slides
// that pill into this cluster's row.
//
// Both sides key off the same id so the pill's colour — a pure function of the
// id — is exactly the row's colour. The clusters mock reads the name from here,
// so a rename is this line alone; changing the ID re-rolls the colour.
export const SIGNAL_CLUSTER_ID = "df-tool";
export const SIGNAL_CLUSTER_NAME = "Reporting unverified results";
export const SIGNAL_CLUSTER_COLOR = getClusterColorById(SIGNAL_CLUSTER_ID);

/** Events grouped into this cluster. Shown on the pill, and it is also how many
 *  cards the signal stack builds — the pill's count has to be the number of
 *  cards the viewer just watched collapse into it. */
export const SIGNAL_CLUSTER_EVENT_COUNT = 5;
