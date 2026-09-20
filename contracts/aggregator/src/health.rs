use soroban_sdk::{Address, Env};

use crate::types::{HealthInfo, PoolId};

pub fn get_health(_env: &Env, _user: &Address, _pool_id: &PoolId) -> HealthInfo {
    todo!()
}