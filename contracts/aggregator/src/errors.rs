use soroban_sdk::contracterror;

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[contracterror]
#[repr(u32)]
pub enum Error {
    PoolNotRegistered = 1,
    InvalidWeights = 2,
    InsufficientBalance = 3,
    AdapterCallFailed = 4,
    Paused = 5,
    Unauthorized = 6,
}
