use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::types::PoolId;

pub fn compound(_env: &Env, _user: &Address, _pool_ids: &Vec<PoolId>) -> Result<(), Error> {
    todo!()
}