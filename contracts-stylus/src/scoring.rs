//! Pure integer risk scoring — mirrors skill/detection/engine.ts exactly.
//!
//! The off-chain engine extracts a canonical 8-element feature vector from a
//! transaction (see skill/detection/features.ts). This module reproduces the
//! same indicator weights, thresholds, and rounding in integer arithmetic so
//! the on-chain score is bit-for-bit identical to the TypeScript scorer.
//!
//! Feature vector layout:
//!   [0] flash loan detected            (0 or 1)
//!   [1] spot price, fixed-point 1e6
//!   [2] TWAP price, fixed-point 1e6
//!   [3] sandwich pattern detected      (0 or 1)
//!   [4] max call depth
//!   [5] repeated deep target detected  (0 or 1)
//!   [6] liquidation event present      (0 or 1)
//!   [7] oracle update in same block    (0 or 1)

pub const FEATURE_LEN: usize = 8;

pub const THRESHOLD_FLAG: u64 = 31;
pub const THRESHOLD_BLOCK: u64 = 61;

#[derive(Clone, Copy, Debug)]
pub struct Features {
    pub flash: bool,
    pub spot_e6: u64,
    pub twap_e6: u64,
    pub sandwich: bool,
    pub max_depth: u64,
    pub repeated_deep: bool,
    pub has_liquidation: bool,
    pub has_oracle_same_block: bool,
}

impl Features {
    pub fn from_array(f: &[u64; FEATURE_LEN]) -> Self {
        Features {
            flash: f[0] != 0,
            spot_e6: f[1],
            twap_e6: f[2],
            sandwich: f[3] != 0,
            max_depth: f[4],
            repeated_deep: f[5] != 0,
            has_liquidation: f[6] != 0,
            has_oracle_same_block: f[7] != 0,
        }
    }
}

/// Price deviation indicator (weight 25).
/// TS: sigmaMultiple = |spot - twap| / (0.02 * twap); detected iff > 3;
///     score = min(25, Math.round(sigmaMultiple * 5)).
/// Integer form: detected iff 50*dev > 3*twap;
///     score = min(25, round_half_up(250*dev / twap)).
pub fn price_deviation_score(spot_e6: u64, twap_e6: u64) -> u64 {
    if twap_e6 == 0 {
        return 0;
    }
    let dev = spot_e6.abs_diff(twap_e6) as u128;
    let twap = twap_e6 as u128;
    if 50 * dev <= 3 * twap {
        return 0;
    }
    let num = 250 * dev;
    let rounded = (2 * num + twap) / (2 * twap);
    if rounded > 25 {
        25
    } else {
        rounded as u64
    }
}

/// Per-indicator scores: [flash(30), price(25), sandwich(20), reentrancy(15), liquidation(10)]
pub fn indicator_scores(f: &Features) -> [u64; 5] {
    let flash = if f.flash { 30 } else { 0 };
    let price = price_deviation_score(f.spot_e6, f.twap_e6);
    let sandwich = if f.sandwich { 20 } else { 0 };
    let reentrancy = if f.max_depth > 3 {
        if f.repeated_deep {
            15
        } else {
            8
        }
    } else {
        0
    };
    let liquidation = if f.has_liquidation && f.has_oracle_same_block {
        10
    } else {
        0
    };
    [flash, price, sandwich, reentrancy, liquidation]
}

pub fn total_score(f: &Features) -> u64 {
    indicator_scores(f).iter().sum()
}

/// 0 = allow, 1 = flag, 2 = block — same zones as the TS engine.
pub fn recommendation(total: u64) -> u64 {
    if total >= THRESHOLD_BLOCK {
        2
    } else if total >= THRESHOLD_FLAG {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    include!("../tests/parity_cases.rs");

    fn score_case(features: &[u64; FEATURE_LEN]) -> (u64, u64) {
        let f = Features::from_array(features);
        let total = total_score(&f);
        (total, recommendation(total))
    }

    #[test]
    fn matches_typescript_scorer_on_all_replays() {
        for (id, features, expected_total, expected_rec) in CASES {
            let (total, rec) = score_case(features);
            println!("{id}: score={total} recommendation={rec} (expected {expected_total}/{expected_rec})");
            assert_eq!(total, *expected_total, "total mismatch for {id}");
            assert_eq!(rec, *expected_rec, "recommendation mismatch for {id}");
        }
    }

    #[test]
    fn clean_transaction_scores_zero() {
        let f = Features::from_array(&[0, 1_000_000, 1_000_000, 0, 1, 0, 0, 0]);
        assert_eq!(total_score(&f), 0);
        assert_eq!(recommendation(0), 0);
    }

    #[test]
    fn price_deviation_rounding_matches_js_math_round() {
        // spot 2.41 / twap 1.87 → sigma multiple 14.4385.. → raw 72.19 → capped 25
        assert_eq!(price_deviation_score(2_410_000, 1_870_000), 25);
        // spot 1.52 / twap 1.48 → sigma 1.35 → not detected
        assert_eq!(price_deviation_score(1_520_000, 1_480_000), 0);
        // sigma just over 3: dev/twap = 0.0612 → sigma 3.06 → round(15.3) = 15
        assert_eq!(price_deviation_score(1_061_200, 1_000_000), 15);
        // half-up rounding: 250*dev/twap = 16.5 → 17 (dev = 0.066)
        assert_eq!(price_deviation_score(1_066_000, 1_000_000), 17);
    }

    #[test]
    fn reentrancy_tiers() {
        let mut f = Features::from_array(&[0, 0, 0, 0, 4, 0, 0, 0]);
        assert_eq!(indicator_scores(&f)[3], 8); // deep but no repeated target
        f.repeated_deep = true;
        assert_eq!(indicator_scores(&f)[3], 15); // reentrancy pattern
        f.max_depth = 3;
        assert_eq!(indicator_scores(&f)[3], 0); // depth within range
    }

    #[test]
    fn liquidation_requires_oracle_correlation() {
        let f = Features::from_array(&[0, 0, 0, 0, 0, 0, 1, 0]);
        assert_eq!(indicator_scores(&f)[4], 0);
        let f = Features::from_array(&[0, 0, 0, 0, 0, 0, 1, 1]);
        assert_eq!(indicator_scores(&f)[4], 10);
    }

    #[test]
    fn recommendation_zones() {
        assert_eq!(recommendation(0), 0);
        assert_eq!(recommendation(30), 0);
        assert_eq!(recommendation(31), 1);
        assert_eq!(recommendation(60), 1);
        assert_eq!(recommendation(61), 2);
        assert_eq!(recommendation(100), 2);
    }
}
