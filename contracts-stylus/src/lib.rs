//! ArbiGuard RiskEngine — Stylus contract exposing the canonical risk scorer.
//!
//! score(features) returns the same total as the off-chain TypeScript engine
//! (skill/detection/engine.ts) for the canonical 8-element feature vector.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

pub mod scoring;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

use scoring::{recommendation, total_score, Features, FEATURE_LEN};

fn to_features(raw: &[U256]) -> Features {
    let mut f = [0u64; FEATURE_LEN];
    for (i, slot) in f.iter_mut().enumerate() {
        if let Some(v) = raw.get(i) {
            *slot = v.as_limbs()[0];
        }
    }
    Features::from_array(&f)
}

#[storage]
#[entrypoint]
pub struct RiskEngine;

#[public]
impl RiskEngine {
    /// Total risk score (0-100) for the canonical feature vector.
    pub fn score(&self, features: Vec<U256>) -> U256 {
        let f = to_features(&features);
        U256::from(total_score(&f))
    }

    /// 0 = allow, 1 = flag, 2 = block.
    pub fn recommendation(&self, features: Vec<U256>) -> U256 {
        let f = to_features(&features);
        U256::from(recommendation(total_score(&f)))
    }

    /// Per-indicator breakdown: [flash, price, sandwich, reentrancy, liquidation].
    pub fn indicator_scores(&self, features: Vec<U256>) -> Vec<U256> {
        let f = to_features(&features);
        scoring::indicator_scores(&f)
            .iter()
            .map(|s| U256::from(*s))
            .collect()
    }

    /// Scoring thresholds (flag, block) — mirrors the off-chain engine.
    pub fn thresholds(&self) -> (U256, U256) {
        (
            U256::from(scoring::THRESHOLD_FLAG),
            U256::from(scoring::THRESHOLD_BLOCK),
        )
    }
}
