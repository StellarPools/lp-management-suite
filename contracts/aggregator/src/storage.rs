use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::types::Position;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum StorageKey {
    Admin,
    Paused,
    Position(Address, String),
    PoolConfig(String),
    HealthThresholds,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct PoolConfig {
    pub adapter_address: Address,
    pub active: bool,
}

pub fn get_position(_env: &Env, _user: &Address) -> Vec<Position> {
    todo!()
}
