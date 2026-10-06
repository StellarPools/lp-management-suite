use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::storage::{get_admin, set_admin, get_pool_config, set_pool_config, is_paused, set_paused, set_health_thresholds as storage_set_health_thresholds};
use crate::types::{HealthThresholds, PoolId};

pub fn register_pool(
    env: &Env,
    admin: &Address,
    pool_id: &PoolId,
    adapter_address: &Address,
) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    if is_paused(env) {
        return Err(Error::Paused);
    }
    let config = crate::storage::PoolConfig {
        adapter_address: adapter_address.clone(),
        active: true,
    };
    set_pool_config(env, pool_id, &config);
    
    crate::events::PoolRegistered {
        pool_id: pool_id.clone(),
        adapter_address: adapter_address.clone(),
    }.publish(env);
    
    Ok(())
}

pub fn deregister_pool(env: &Env, admin: &Address, pool_id: &PoolId) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    if let Some(mut config) = get_pool_config(env, pool_id) {
        config.active = false;
        set_pool_config(env, pool_id, &config);
    }
    Ok(())
}

pub fn set_health_thresholds(
    env: &Env,
    admin: &Address,
    thresholds: &HealthThresholds,
) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    storage_set_health_thresholds(env, thresholds);
    Ok(())
}

pub fn pause(env: &Env, admin: &Address) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    set_paused(env, true);
    Ok(())
}

pub fn unpause(env: &Env, admin: &Address) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    set_paused(env, false);
    Ok(())
}

pub fn transfer_admin(env: &Env, admin: &Address, new_admin: &Address) -> Result<(), Error> {
    let stored_admin = get_admin(env).ok_or(Error::Unauthorized)?;
    if admin != &stored_admin {
        return Err(Error::Unauthorized);
    }
    set_admin(env, new_admin);
    Ok(())
}
