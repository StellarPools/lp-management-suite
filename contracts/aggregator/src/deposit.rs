use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::types::Allocation;

pub fn deposit(_env: &Env, _user: &Address, _allocations: &Vec<Allocation>) -> Result<(), Error> {
    todo!()
}
