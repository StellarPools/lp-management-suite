use soroban_sdk::{Address, Env, Map};

use crate::errors::Error;
use crate::types::PoolId;

pub fn rebalance(
    _env: &Env,
    _user: &Address,
    _target_weights: &Map<PoolId, i128>,
) -> Result<(), Error> {
    todo!()
}
