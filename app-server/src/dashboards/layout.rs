//! Chart placement on the 12-column dashboard grid. react-grid-layout compacts gaps upward on
//! render and persists the result, so the server only has to keep stored layouts overlap-free;
//! gaps it leaves are fine.

use serde::{Deserialize, Serialize};

pub const GRID_COLS: i64 = 12;

const AUTO_WIDTH: i64 = 4;
const AUTO_HEIGHT: i64 = 6;
const AUTO_SLOT_XS: [i64; 3] = [0, 4, 8];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layout {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
}

impl Layout {
    pub fn validate(&self) -> Result<(), String> {
        if self.w < 1 || self.h < 1 {
            return Err(format!(
                "w and h must be at least 1, got w={} h={}",
                self.w, self.h
            ));
        }
        if self.x < 0 || self.y < 0 {
            return Err(format!(
                "x and y must be non-negative, got x={} y={}",
                self.x, self.y
            ));
        }
        if self.x + self.w > GRID_COLS {
            return Err(format!(
                "x + w must be at most {GRID_COLS}, got x={} w={}",
                self.x, self.w
            ));
        }
        Ok(())
    }

    pub fn overlaps(&self, other: &Layout) -> bool {
        self.x < other.x + other.w
            && self.x + self.w > other.x
            && self.y < other.y + other.h
            && self.y + self.h > other.y
    }

    fn shares_columns(&self, x: i64, w: i64) -> bool {
        self.x < x + w && self.x + self.w > x
    }
}

/// Moves each of `others` straight down until it clears `fixed` and every chart settled before
/// it. Top-down order keeps the vertical order of the moved charts.
pub fn settle<K>(fixed: &[Layout], others: Vec<(K, Layout)>) -> Vec<(K, Layout)> {
    let mut others = others;
    others.sort_by_key(|(_, layout)| (layout.y, layout.x));

    let mut placed = fixed.to_vec();
    for (_, layout) in others.iter_mut() {
        while let Some(blocker) = placed.iter().find(|p| p.overlaps(layout)) {
            layout.y = blocker.y + blocker.h;
        }
        placed.push(*layout);
    }
    others
}

/// The lowest-reaching of three 4-wide columns, under everything already in it.
pub fn auto_place(placed: &[Layout]) -> Layout {
    let (x, y) = AUTO_SLOT_XS
        .iter()
        .map(|&x| {
            let bottom = placed
                .iter()
                .filter(|p| p.shares_columns(x, AUTO_WIDTH))
                .map(|p| p.y + p.h)
                .max()
                .unwrap_or(0);
            (x, bottom)
        })
        .min_by_key(|&(_, bottom)| bottom)
        .expect("AUTO_SLOT_XS is non-empty");

    Layout {
        x,
        y,
        w: AUTO_WIDTH,
        h: AUTO_HEIGHT,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn l(x: i64, y: i64, w: i64, h: i64) -> Layout {
        Layout { x, y, w, h }
    }

    #[test]
    fn auto_place_uses_shortest_column() {
        let placed = [l(0, 0, 4, 12), l(4, 0, 4, 6), l(8, 0, 4, 9)];
        assert_eq!(auto_place(&placed), l(4, 6, 4, 6));
    }

    #[test]
    fn auto_place_accounts_for_wide_charts() {
        assert_eq!(auto_place(&[l(0, 2, 8, 6)]), l(8, 0, 4, 6));
    }

    #[test]
    fn settle_pushes_overlapping_chart_below_fixed() {
        let settled = settle(&[l(0, 0, 6, 4)], vec![("a", l(0, 2, 4, 4))]);
        assert_eq!(settled, vec![("a", l(0, 4, 4, 4))]);
    }

    #[test]
    fn settle_leaves_clear_charts_alone() {
        let settled = settle(&[l(0, 0, 6, 4)], vec![("a", l(6, 0, 6, 4))]);
        assert_eq!(settled, vec![("a", l(6, 0, 6, 4))]);
    }

    #[test]
    fn settle_cascades_and_keeps_order() {
        // `a` is pushed onto `b`, which then moves below `a`.
        let settled = settle(
            &[l(0, 0, 12, 6)],
            vec![("b", l(0, 6, 4, 6)), ("a", l(0, 3, 4, 4))],
        );
        assert_eq!(settled, vec![("a", l(0, 6, 4, 4)), ("b", l(0, 10, 4, 6))]);
    }

    #[test]
    fn settle_result_has_no_overlaps() {
        let fixed = [l(2, 1, 5, 3), l(8, 0, 4, 2)];
        let others = vec![
            (0, l(0, 0, 4, 2)),
            (1, l(3, 2, 6, 5)),
            (2, l(0, 3, 12, 1)),
            (3, l(9, 1, 3, 4)),
        ];
        let settled = settle(&fixed, others);
        let all: Vec<Layout> = fixed
            .iter()
            .copied()
            .chain(settled.iter().map(|(_, l)| *l))
            .collect();
        for (i, a) in all.iter().enumerate() {
            for b in &all[i + 1..] {
                assert!(!a.overlaps(b), "{a:?} overlaps {b:?}");
            }
        }
    }

    #[test]
    fn validate_rejects_out_of_grid() {
        assert!(l(10, 0, 4, 2).validate().is_err());
        assert!(l(0, 0, 0, 2).validate().is_err());
        assert!(l(-1, 0, 2, 2).validate().is_err());
        assert!(l(8, 0, 4, 2).validate().is_ok());
    }
}
