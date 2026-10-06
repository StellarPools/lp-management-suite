use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::types::Position;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum StorageKey {
    Admin,
    PositionKeys,
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

pub fn get_position(env: &Env, user: &Address) -> Vec<Position> {
    let mut positions = Vec::new(env);
    let position_keys: Vec<StorageKey> = env.storage().instance().get(&StorageKey::PositionKeys).unwrap_or(Vec::new(env));
    
    for key in position_keys.iter() {
        if let StorageKey::Position(ref addr, ref _pool_id) = key {
            if addr == user {
                if let Some(pos) = env.storage().instance().get::<StorageKey, Position>(&key) {
                    positions.push_back(pos);
                }
            }
        }
    }
    positions
}

pub fn set_position(env: &Env, user: &Address, pool_id: &String, position: &Position) {
    let key = StorageKey::Position(user.clone(), pool_id.clone());
    env.storage().instance().set(&key, position);
    
    let mut position_keys: Vec<StorageKey> = env.storage().instance().get(&StorageKey::PositionKeys).unwrap_or(Vec::new(env));
    if !position_keys.iter().any(|k| matches!(k, StorageKey::Position(addr, pid) if addr == *user && pid == *pool_id)) {
        position_keys.push_back(key);
        env.storage().instance().set(&StorageKey::PositionKeys, &position_keys);
    }
}

pub fn get_pool_config(env: &Env, pool_id: &String) -> Option<PoolConfig> {
    env.storage().instance().get(&StorageKey::PoolConfig(pool_id.clone()))
}

pub fn set_pool_config(env: &Env, pool_id: &String, config: &PoolConfig) {
    env.storage().instance().set(&StorageKey::PoolConfig(pool_id.clone()), config);
}

pub fn is_paused(env: &Env) -> bool {
    env.storage().instance().get(&StorageKey::Paused).unwrap_or(false)
}

pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&StorageKey::Paused, &paused);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&StorageKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, admin);
}

pub fn get_health_thresholds(env: &Env) -> Option<crate::types::HealthThresholds> {
    env.storage().instance().get(&StorageKey::HealthThresholds)
}

pub fn set_health_thresholds(env: &Env, thresholds: &crate::types::HealthThresholds) {
    env.storage().instance().set(&StorageKey::HealthThresholds, thresholds);
}
