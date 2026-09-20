use soroban_sdk::{contractevent, Address, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    #[topic]
    pub user: Address,
    pub pool_id: String,
    pub amount: i128,
    pub shares: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdraw {
    #[topic]
    pub user: Address,
    pub pool_id: String,
    pub amount: i128,
    pub shares: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rebalance {
    #[topic]
    pub user: Address,
    pub from_pool: String,
    pub to_pool: String,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Compound {
    #[topic]
    pub user: Address,
    pub pool_id: String,
    pub reward_amount: i128,
    pub reinvested_amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Alert {
    #[topic]
    pub user: Address,
    pub pool_id: String,
    pub alert_type: String,
    pub severity: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolRegistered {
    pub pool_id: String,
    pub adapter_address: Address,
}