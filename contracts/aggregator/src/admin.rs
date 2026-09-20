use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::types::{HealthThresholds, PoolId};

pub fn register_pool(
    _env: &Env,
    _admin: &Address,
    _pool_id: &PoolId,
    _adapter_address: &Address,
) -> Result<(), Error> {
    todo!()
}

pub fn deregister_pool(_env: &Env, _admin: &Address, _pool_id: &PoolId) -> Result<(), Error> {
    todo!()
}

pub fn set_health_thresholds(
    _env: &Env,
    _admin: &Address,
    _thresholds: &HealthThresholds,
) -> Result<(), Error> {
    todo!()
}

pub fn pause(_env: &Env, _admin: &Address) -> Result<(), Error> {
    todo!()
}

pub fn unpause(_env: &Env, _admin: &Address) -> Result<(), Error> {
    todo!()
}

pub fn transfer_admin(_env: &Env, _admin: &Address, _new_admin: &Address) -> Result<(), Error> {
    todo!()
}