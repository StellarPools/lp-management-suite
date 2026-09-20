use soroban_sdk::{contracttype, String, Vec};

pub type PoolId = String;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Allocation {
    pub pool_id: PoolId,
    pub amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Position {
    pub pool_id: PoolId,
    pub shares: i128,
    pub cost_basis: i128,
    pub last_compound_ts: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct YieldInfo {
    pub pool_id: PoolId,
    pub apy: i128,
    pub tvl: i128,
    pub reward_token: String,
    pub fee_tier_bps: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct HealthInfo {
    pub pool_id: PoolId,
    pub impermanent_loss_pct: i128,
    pub utilization: i128,
    pub concentration_pct: i128,
    pub alerts: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct HealthThresholds {
    pub il_limit: i128,
    pub utilization_limit: i128,
    pub concentration_limit: i128,
}
